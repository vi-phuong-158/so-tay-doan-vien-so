import { clients, optionalPublicFirstUser } from '../_shared/auth.ts';
import { corsHeaders, errorResponse, json, readJson } from '../_shared/http.ts';
import { assertUuid, safeText } from '../_shared/validation.ts';
import {
  GeminiGroundedAnswerGenerator,
  NO_EVIDENCE_ANSWER,
  type RetrievedKnowledgeSource,
  RagError,
} from '../_shared/knowledge/rag.ts';
import { getGeminiGenerationRuntimeConfig } from '../_shared/knowledge/geminiRuntime.ts';

type Payload = { question: string; mode?: string; conversation_id?: string };

type RetrievalRow = {
  article_id: string;
  evidence_id: string;
  document_id: string;
  document_version_id: string;
  title: string;
  evidence_text: string;
  locator: Record<string, unknown>;
  rank: number;
};

async function requestKey(request: Request): Promise<string> {
  // The platform-provided address is used only to rate-limit. Persist the SHA-256 digest, never
  // the address or question itself; a missing proxy header shares the conservative fallback key.
  const clientAddress = request.headers.get('cf-connecting-ip')
    || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || 'unknown';
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`public-ai:${clientAddress}`));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function errorCode(error: unknown): string {
  if (error instanceof RagError) return error.code;
  const message = error instanceof Error ? error.message : String(error);
  return message.match(/[A-Z][A-Z0-9_]{2,63}/)?.[0] ?? 'ASK_AI_FAILED';
}

function statusFor(code: string): number {
  if (code === 'UNAUTHENTICATED' || code === 'ACCOUNT_NOT_ACTIVE') return 401;
  if (code.includes('FORBIDDEN') || code.includes('SCOPE_DENIED')) return 403;
  if (code === 'CONVERSATION_NOT_FOUND') return 404;
  if (code === 'MODEL_RATE_LIMITED') return 429;
  if (code === 'PROVIDER_UNAVAILABLE') return 503;
  if (code === 'MODEL_TIMEOUT') return 504;
  return 400;
}

function mapSource(row: RetrievalRow): RetrievedKnowledgeSource {
  return {
    articleId: row.article_id,
    evidenceId: row.evidence_id,
    documentId: row.document_id,
    documentVersionId: row.document_version_id,
    title: row.title,
    evidenceText: row.evidence_text,
    locator: row.locator ?? {},
    rank: Number(row.rank ?? 0),
  };
}

function citation(source: RetrievedKnowledgeSource, rank: number) {
  return {
    rank,
    title: source.title,
    document_id: source.documentId,
    document_version_id: source.documentVersionId,
    article_id: source.articleId,
    evidence_id: source.evidenceId,
    locator: source.locator,
    citation_path: `/tri-thuc/van-ban/${source.documentId}`,
  };
}

async function getConversationId(userClient: any, adminClient: any, userId: string, question: string, payload: Payload): Promise<string> {
  if (payload.conversation_id) {
    const conversationId = assertUuid(payload.conversation_id, 'INVALID_CONVERSATION_ID');
    const { data, error } = await userClient.from('ai_conversations').select('id').eq('id', conversationId).maybeSingle();
    if (error || !data) throw new Error('CONVERSATION_NOT_FOUND');
    return data.id;
  }

  const { data, error } = await adminClient.from('ai_conversations')
    .insert({ user_id: userId, title: question.slice(0, 80), mode: payload.mode || 'DOCUMENT_LOOKUP' })
    .select('id')
    .single();
  if (error || !data) throw new Error('CONVERSATION_CREATE_FAILED');
  return data.id;
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return errorResponse(new Error('METHOD_NOT_ALLOWED'), 405);

  try {
    const { userClient, adminClient } = clients(request);
    const payload = await readJson<Payload>(request);
    const question = safeText(payload.question, 2_000);
    if (!question || question.length < 3) throw new Error('QUESTION_REQUIRED');
    const user = await optionalPublicFirstUser(request, userClient);

    if (!user) {
      if (payload.conversation_id) throw new Error('PUBLIC_CONVERSATION_NOT_SUPPORTED');
      const { data: allowed, error: quotaError } = await adminClient.rpc('consume_public_ai_quota', {
        p_request_key: await requestKey(request),
        p_max_requests: 20,
      });
      if (quotaError || !allowed) throw new Error('MODEL_RATE_LIMITED');

      const { data, error: retrievalError } = await adminClient.rpc('search_public_knowledge', {
        p_query: question,
        p_match_count: 8,
      });
      if (retrievalError) throw new Error('RETRIEVAL_FAILED');
      const sources: RetrievedKnowledgeSource[] = ((data ?? []) as RetrievalRow[]).map(mapSource);
      if (sources.length === 0) {
        return json({ success: true, conversation_id: null, message_id: null, answer: NO_EVIDENCE_ANSWER, citations: [] });
      }

      const apiKey = Deno.env.get('GEMINI_API_KEY');
      const model = Deno.env.get('RAG_GENERATION_MODEL') || Deno.env.get('GEMINI_GENERATION_MODEL');
      if (!apiKey || !model) throw new Error('GEMINI_NOT_CONFIGURED');
      const runtime = getGeminiGenerationRuntimeConfig({ GEMINI_GENERATION_TIMEOUT_MS: Deno.env.get('GEMINI_GENERATION_TIMEOUT_MS') });
      const generatedAnswer = await new GeminiGroundedAnswerGenerator(model, apiKey, fetch, { maxAttempts: runtime.maxAttempts }, runtime.timeoutMs)
        .generate(question, sources);
      const citations = sources.map((source, index) => citation(source, index + 1));
      const answer = `${generatedAnswer}\n\nNguồn tra cứu:\n${citations.map(item => `[${item.rank}] ${item.title}`).join('\n')}`;
      return json({ success: true, conversation_id: null, message_id: null, answer, citations });
    }

    const conversationId = await getConversationId(userClient, adminClient, user.id, question, payload);
    const { error: userMessageError } = await adminClient.from('ai_messages')
      .insert({ conversation_id: conversationId, role: 'user', content: question, status: 'COMPLETED' });
    if (userMessageError) throw new Error('MESSAGE_PERSIST_FAILED');

    const { data, error: retrievalError } = await userClient.rpc('search_published_knowledge', {
      p_query: question,
      p_match_count: 8,
    });
    if (retrievalError) throw new Error('RETRIEVAL_FAILED');
    const sources: RetrievedKnowledgeSource[] = ((data ?? []) as RetrievalRow[]).map(mapSource);

    if (sources.length === 0) {
      const { data: message, error } = await adminClient.from('ai_messages')
        .insert({ conversation_id: conversationId, role: 'assistant', content: NO_EVIDENCE_ANSWER, status: 'COMPLETED' })
        .select('id')
        .single();
      if (error || !message) throw new Error('MESSAGE_PERSIST_FAILED');
      return json({ success: true, conversation_id: conversationId, message_id: message.id, answer: NO_EVIDENCE_ANSWER, citations: [] });
    }

    const apiKey = Deno.env.get('GEMINI_API_KEY');
    const model = Deno.env.get('RAG_GENERATION_MODEL') || Deno.env.get('GEMINI_GENERATION_MODEL');
    if (!apiKey || !model) throw new Error('GEMINI_NOT_CONFIGURED');

    const startedAt = Date.now();
    const runtime = getGeminiGenerationRuntimeConfig({ GEMINI_GENERATION_TIMEOUT_MS: Deno.env.get('GEMINI_GENERATION_TIMEOUT_MS') });
    const generatedAnswer = await new GeminiGroundedAnswerGenerator(model, apiKey, fetch, { maxAttempts: runtime.maxAttempts }, runtime.timeoutMs)
      .generate(question, sources);
    const citations = sources.map((source, index) => citation(source, index + 1));
    const answer = `${generatedAnswer}\n\nNguồn tra cứu:\n${citations.map(item => `[${item.rank}] ${item.title}`).join('\n')}`;
    const { data: message, error: messageError } = await adminClient.from('ai_messages')
      .insert({
        conversation_id: conversationId,
        role: 'assistant',
        content: answer,
        model,
        latency_ms: Date.now() - startedAt,
        token_usage: { provider: 'GEMINI', source_count: sources.length },
        status: 'COMPLETED',
      })
      .select('id')
      .single();
    if (messageError || !message) throw new Error('MESSAGE_PERSIST_FAILED');

    const { error: citationError } = await adminClient.from('ai_message_sources').insert(
      sources.map((source, index) => ({
        message_id: message.id,
        document_id: source.documentId,
        document_version_id: source.documentVersionId,
        evidence_id: source.evidenceId,
        source_kind: 'EVIDENCE',
        rank: index + 1,
        similarity: source.rank,
        quoted_excerpt: source.evidenceText.slice(0, 350),
      })),
    );
    if (citationError) throw new Error('CITATION_PERSIST_FAILED');

    return json({ success: true, conversation_id: conversationId, message_id: message.id, answer, citations });
  } catch (error) {
    const code = errorCode(error);
    return errorResponse(new Error(code), statusFor(code));
  }
});
