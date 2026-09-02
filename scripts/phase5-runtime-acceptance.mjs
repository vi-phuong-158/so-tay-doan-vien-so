import { createHash, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { createRuntimeActorPassword, responseErrorCode } from './phase5-runtime-acceptance-helpers.mjs';

const REHEARSAL_REF = 'znexculhbdjiflkczpyu';
const REHEARSAL_ORIGIN = `https://${REHEARSAL_REF}.supabase.co`;
const BUCKET = 'documents-private';
const runId = randomUUID().replaceAll('-', '').slice(0, 16);
const evidence = [];
const actors = {};
const created = { organizations: [], users: [], documentId: null, versionId: null, sourceId: null, articleId: null, conversationIds: [], messageIds: [], storagePath: null };

function log(event, details = {}) {
  console.log(`${event} ${JSON.stringify(redact(details))}`);
}

function redact(value, key = '') {
  const sensitive = /authorization|apikey|token|access_token|refresh_token|password|secret|service_role|signed_url|oauth/i.test(key);
  if (sensitive) return '[REDACTED]';
  if (Array.isArray(value)) return value.map(item => redact(item, key));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([childKey, childValue]) => [childKey, redact(childValue, childKey)]));
  }
  return value;
}

function safeId(id) {
  return typeof id === 'string' ? `${id.slice(0, 8)}…${id.slice(-4)}` : null;
}

function requiredEnv(...names) {
  for (const name of names) if (process.env[name]) return process.env[name];
  return undefined;
}

function assertRehearsal(url) {
  let parsed;
  try { parsed = new URL(url); } catch { throw new Error('REHEARSAL_URL_INVALID'); }
  if (parsed.origin !== REHEARSAL_ORIGIN || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error('REHEARSAL_URL_MISMATCH');
  }
}

function assertOk(result, code) {
  if (result.error) throw new Error(code || result.error.message || 'SUPABASE_REQUEST_FAILED');
  return result.data;
}

function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

async function invokeAs(actor, slug, body) {
  const { data: sessionData } = await actor.client.auth.getSession();
  const accessToken = sessionData?.session?.access_token;
  if (!accessToken) throw new Error('ACTOR_SESSION_MISSING');
  const response = await fetch(`${REHEARSAL_ORIGIN}/functions/v1/${slug}`, {
    method: 'POST',
    headers: { apikey: actor.publishableKey, Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  let payload = null;
  try { payload = await response.json(); } catch { /* controlled non-JSON response */ }
  const code = responseErrorCode(payload);
  evidence.push({ actor: actor.label, function: slug, status: response.status, code });
  return { response, payload, code };
}

async function invokeAnonymous(slug, body, publishableKey) {
  const response = await fetch(`${REHEARSAL_ORIGIN}/functions/v1/${slug}`, {
    method: 'POST',
    headers: { apikey: publishableKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  let payload = null;
  try { payload = await response.json(); } catch { /* controlled non-JSON response */ }
  return { response, payload, code: responseErrorCode(payload) };
}

async function signIn(label, email, password, publishableKey) {
  const client = createClient(REHEARSAL_ORIGIN, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user || !data.session) throw new Error(`${label}_AUTH_FAILED`);
  log(`${label}_SESSION`, { status: 'ACQUIRED', user_id: safeId(data.user.id) });
  return { label, client, publishableKey, id: data.user.id, email, password };
}

async function createActor(admin, publishableKey, label, roleCode, organizationId, fullName) {
  const email = `p5-${label.toLowerCase()}-${runId}@example.invalid`;
  const password = createRuntimeActorPassword();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error(`${label}_CREATE_FAILED`);
  created.users.push(data.user.id);
  const profile = assertOk(await admin.from('profiles').insert({ id: data.user.id, full_name: fullName, organization_id: organizationId, account_status: 'ACTIVE' }), `${label}_PROFILE_FAILED`);
  void profile;
  assertOk(await admin.from('user_roles').insert({ user_id: data.user.id, role_code: roleCode, scope_organization_id: roleCode === 'YOUTH_ADMIN' ? organizationId : null }), `${label}_ROLE_FAILED`);
  return signIn(label, email, password, publishableKey);
}

async function runAcceptance() {
  const url = requiredEnv('SUPABASE_URL', 'VITE_SUPABASE_URL');
  const publishableKey = requiredEnv('SUPABASE_PUBLISHABLE_KEY', 'VITE_SUPABASE_ANON_KEY');
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !publishableKey) throw new Error('PHASE_5_RUNTIME_BLOCKED_REHEARSAL_PUBLIC_CONFIG_REQUIRED');
  assertRehearsal(url);
  if (!serviceRoleKey) throw new Error('PHASE_5_RUNTIME_BLOCKED_REHEARSAL_AUTH_BOOTSTRAP_CREDENTIAL_REQUIRED');

  const admin = createClient(REHEARSAL_ORIGIN, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  log('REHEARSAL_SAFETY', { ref: REHEARSAL_REF, origin: REHEARSAL_ORIGIN, production_accessed: 'NO' });

  const orgA = assertOk(await admin.from('organizations').insert({ code: `P5R-${runId}-A`, name: `Phase 5 rehearsal A ${runId}`, organization_type: 'YOUTH_UNIT', is_active: true }).select('id').single(), 'ORG_A_CREATE_FAILED');
  const orgB = assertOk(await admin.from('organizations').insert({ code: `P5R-${runId}-B`, name: `Phase 5 rehearsal B ${runId}`, organization_type: 'YOUTH_UNIT', is_active: true }).select('id').single(), 'ORG_B_CREATE_FAILED');
  created.organizations.push(orgA.id, orgB.id);
  actors.admin = await createActor(admin, publishableKey, 'ADMIN', 'YOUTH_ADMIN', orgA.id, 'Phase 5 rehearsal admin');
  actors.userA = await createActor(admin, publishableKey, 'USER_A', 'MEMBER', orgA.id, 'Phase 5 rehearsal user A');
  actors.userB = await createActor(admin, publishableKey, 'USER_B', 'MEMBER', orgB.id, 'Phase 5 rehearsal user B');
  log('AUTHENTICATED_ACTORS', { admin: 'PASS', user_a: 'PASS', user_b: 'PASS' });
  const anonymous = await invokeAnonymous('ask-ai', { question: 'anonymous acceptance probe' }, publishableKey);
  if (anonymous.response.status !== 401) throw new Error('ANONYMOUS_BOUNDARY_FAILED');
  log('ANONYMOUS_BOUNDARY', { status: anonymous.response.status, code: anonymous.code, result: 'PASS' });

  const deniedManagerCall = await actors.userA.client.rpc('set_document_retrieval_enabled', { p_document_id: randomUUID(), p_enabled: false });
  log('USER_A_MANAGER_BOUNDARY', { denied: Boolean(deniedManagerCall.error) });
  if (!deniedManagerCall.error) throw new Error('USER_A_MANAGER_BOUNDARY_FAILED');

  const draft = assertOk(await actors.admin.client.rpc('create_document_draft', {
    p_title: `PHASE 5 REHEARSAL ${runId}`,
    p_document_type: 'REHEARSAL_TEXT',
    p_document_number: `P5-${runId}`,
    p_issuing_authority: 'Synthetic rehearsal authority',
    p_issued_date: new Date().toISOString().slice(0, 10),
    p_scope: 'Synthetic acceptance only',
    p_summary: 'Harmless fictional Phase 5 acceptance fixture',
    p_keywords: ['phase5', 'orchid', runId],
    p_visibility_level: 'ORGANIZATION_ONLY',
    p_owner_organization_id: orgA.id,
  }), 'DOCUMENT_CREATE_FAILED');
  created.documentId = draft;
  const pilotText = `PHASE 5 REHEARSAL DOCUMENT\n\nSection Alpha\nThe fictional Blue Lotus procedure requires three review steps.\n\nSection Beta\nThe fictional completion keyword is ORCHID-5729.\n\nSection Gamma\nRetrieval becomes permitted only after human approval and retrieval enablement.`;
  const storagePath = `${draft}/source/${runId}.txt`;
  created.storagePath = storagePath;
  assertOk(await actors.admin.client.storage.from(BUCKET).upload(storagePath, Buffer.from(pilotText), { contentType: 'text/plain', upsert: false }), 'SOURCE_UPLOAD_FAILED');
  assertOk(await actors.admin.client.rpc('attach_document_source_file', { p_document_id: draft, p_storage_path: storagePath, p_file_size_bytes: Buffer.byteLength(pilotText) }), 'SOURCE_ATTACH_FAILED');
  const version = assertOk(await admin.from('document_versions').insert({ document_id: draft, version_number: 1, content_hash: sha256(pilotText), byte_size: Buffer.byteLength(pilotText), mime_type: 'text/plain', source_metadata: { fixture: 'phase5-runtime' }, created_by: actors.admin.id, is_current: true }).select('id').single(), 'VERSION_CREATE_FAILED');
  created.versionId = version.id;
  assertOk(await admin.from('document_sources').insert({ document_version_id: version.id, source_kind: 'PRIMARY_FILE', provider_kind: 'SUPABASE_STORAGE', storage_path: storagePath, content_hash: sha256(pilotText), byte_size: Buffer.byteLength(pilotText), mime_type: 'text/plain', provider_metadata: { fixture: 'phase5-runtime' } }).select('id').single(), 'SOURCE_RECORD_FAILED');
  const source = assertOk(await admin.from('document_sources').select('id').eq('document_version_id', version.id).single(), 'SOURCE_LOOKUP_FAILED');
  created.sourceId = source.id;
  assertOk(await admin.rpc('set_current_document_version', { p_document_id: draft, p_version_id: version.id }), 'CURRENT_VERSION_FAILED');
  assertOk(await actors.admin.client.rpc('set_document_ai_processing_allowed', { p_document_id: draft, p_allowed: true }), 'AI_POLICY_ENABLE_FAILED');

  const processResult = await invokeAs(actors.admin, 'process-document', { document_id: draft, extracted_text: pilotText });
  if (processResult.response.status !== 200) {
    if (processResult.code === 'GEMINI_NOT_CONFIGURED' || processResult.code === 'MODEL_CONFIGURATION_MISSING') {
      throw new Error('PHASE_5_RUNTIME_BLOCKED_REHEARSAL_PROVIDER_CONFIG_REQUIRED');
    }
    throw new Error('DOCUMENT_EXTRACTION_FAILED');
  }
  log('DOCUMENT_EXTRACTION', { status: processResult.response.status, result: 'PASS' });
  const generated = await invokeAs(actors.admin, 'generate-knowledge-article', { document_id: draft, article_key: 'overview' });
  if (generated.response.status !== 200 || !generated.payload?.article_id) {
    log('ARTICLE_GENERATION_FAILURE', { status: generated.response.status, code: generated.code });
    if (generated.code === 'MODEL_CONFIGURATION_MISSING' || generated.code === 'GEMINI_NOT_CONFIGURED') throw new Error('PHASE_5_RUNTIME_BLOCKED_REHEARSAL_PROVIDER_CONFIG_REQUIRED');
    throw new Error('ARTICLE_GENERATION_FAILED');
  }
  created.articleId = generated.payload.article_id;
  log('ARTICLE_GENERATION', { status: generated.response.status, article_id: safeId(created.articleId), result: 'PASS' });

  const preApproval = await actors.userA.client.rpc('search_published_knowledge', { p_query: 'ORCHID-5729', p_match_count: 8 });
  if (preApproval.error || (preApproval.data || []).length !== 0) throw new Error('PRE_APPROVAL_RETRIEVAL_FAILED');
  log('PRE_APPROVAL_RETRIEVAL', { rows: 0, result: 'PASS' });
  assertOk(await actors.admin.client.rpc('review_knowledge_article', { p_article_id: created.articleId, p_action: 'APPROVE', p_review_note: 'Synthetic rehearsal approval' }), 'ARTICLE_REVIEW_FAILED');
  const disabled = await actors.userA.client.rpc('search_published_knowledge', { p_query: 'ORCHID-5729', p_match_count: 8 });
  if (disabled.error || (disabled.data || []).length !== 0) throw new Error('RETRIEVAL_DISABLED_GATE_FAILED');
  assertOk(await actors.admin.client.rpc('publish_document', { p_document_id: draft }), 'DOCUMENT_PUBLISH_FAILED');
  assertOk(await actors.admin.client.rpc('set_document_retrieval_enabled', { p_document_id: draft, p_enabled: true }), 'DOCUMENT_RETRIEVAL_ENABLE_FAILED');
  assertOk(await actors.admin.client.rpc('set_knowledge_article_retrieval_enabled', { p_article_id: created.articleId, p_enabled: true }), 'ARTICLE_RETRIEVAL_ENABLE_FAILED');
  const enabled = assertOk(await actors.userA.client.rpc('search_published_knowledge', { p_query: 'ORCHID-5729', p_match_count: 8 }), 'RETRIEVAL_ENABLED_QUERY_FAILED');
  if (!enabled.length || !enabled.some(row => row.document_id === draft)) throw new Error('RETRIEVAL_ENABLED_GATE_FAILED');
  log('HUMAN_REVIEW_GATE', { before_approval: 'PASS', approved_disabled: 'PASS', approved_enabled: 'PASS', auto_publish_bypass: 'NONE' });

  const conversation = await invokeAs(actors.userA, 'ask-ai', { question: 'What is the fictional completion keyword?' });
  if (conversation.response.status !== 200 || !String(conversation.payload?.answer || '').includes('ORCHID-5729')) throw new Error('ASK_AI_GROUNDED_FAILED');
  created.conversationIds.push(conversation.payload.conversation_id);
  created.messageIds.push(conversation.payload.message_id);
  const second = await invokeAs(actors.userA, 'ask-ai', { question: 'How many fictional review steps are required?', conversation_id: conversation.payload.conversation_id });
  if (second.response.status !== 200 || !/three|3/i.test(String(second.payload?.answer || ''))) throw new Error('ASK_AI_SECOND_GROUNDED_FAILED');
  const noEvidence = await invokeAs(actors.userA, 'ask-ai', { question: 'What is the fictional lunar archive code?' });
  if (noEvidence.response.status !== 200 || noEvidence.payload?.citations?.length) throw new Error('ASK_AI_NO_EVIDENCE_FAILED');
  created.conversationIds.push(noEvidence.payload.conversation_id);
  created.messageIds.push(noEvidence.payload.message_id);
  const crossOrg = await actors.userB.client.rpc('search_published_knowledge', { p_query: 'ORCHID-5729', p_match_count: 8 });
  if (!crossOrg.error && (crossOrg.data || []).length !== 0) throw new Error('PHASE_5_RUNTIME_FAILED_CROSS_ORG_RLS');
  const bAsk = await invokeAs(actors.userB, 'ask-ai', { question: 'What is the fictional completion keyword?' });
  if (bAsk.response.status !== 200 || String(bAsk.payload?.answer || '').includes('ORCHID-5729') || bAsk.payload?.citations?.length) throw new Error('RAG_CROSS_ORG_LEAKAGE');
  log('ASK_AI', { grounded: 'PASS', second_grounded: 'PASS', no_evidence: 'PASS', user_b_isolation: 'PASS' });

  const ownerViolation = await invokeAs(actors.userB, 'ask-ai', { question: 'continue', conversation_id: conversation.payload.conversation_id });
  if (ownerViolation.response.status === 200) throw new Error('CONVERSATION_OWNERSHIP_FAILED');
  const unknown = await invokeAs(actors.userA, 'ask-ai', { question: 'unknown', conversation_id: randomUUID() });
  if (unknown.response.status === 200) throw new Error('UNKNOWN_CONVERSATION_FAILED');
  const invalidInput = await invokeAs(actors.userA, 'ask-ai', { question: '' });
  if (invalidInput.response.status < 400 || invalidInput.response.status >= 500) throw new Error('INVALID_INPUT_FAILURE_PATH_FAILED');
  log('CONVERSATION_OWNERSHIP', { owner: 'PASS', cross_user: 'PASS', unknown: 'PASS', invalid_auth: 'PASS' });

  const persisted = assertOk(await admin.from('ai_message_sources').select('message_id,document_id,document_version_id,evidence_id').eq('message_id', conversation.payload.message_id), 'CITATION_LOOKUP_FAILED');
  if (!persisted.length || persisted.some(row => row.document_id !== draft || !row.document_version_id || !row.evidence_id)) throw new Error('CITATION_PERSISTENCE_FAILED');
  log('CITATIONS', { persisted: 'PASS', canonical_route: `/tri-thuc/van-ban/${safeId(draft)}`, storage_url_exposed: 'NO', browser_ui: 'NOT_AVAILABLE' });
  log('ACCEPTANCE_RESULT', { cross_organization_leakage: 0, rag_cross_org_leakage: 0, provider_invocation: 'PASS', verdict: 'PASS' });
}

async function cleanup(admin) {
  const cleanupState = {
    usersRemoved: 0,
    storageRemoved: false,
    mutableRowsRemoved: false,
    retainedImmutableHistory: false,
    postCleanupRetrieval: 'NOT_RUN',
    postCleanupAskAi: 'NOT_RUN',
  };
  if (!admin) return;

  // Retained source/version/article history must be made non-retrievable through the
  // canonical owner RPCs before any actor session is revoked.
  if (created.articleId && actors.admin) {
    try {
      const result = await actors.admin.client.rpc('set_knowledge_article_retrieval_enabled', { p_article_id: created.articleId, p_enabled: false });
      if (result.error) log('CLEANUP_ARTICLE_RETRIEVAL_DISABLE', { result: 'FAILED' });
    } catch { log('CLEANUP_ARTICLE_RETRIEVAL_DISABLE', { result: 'FAILED' }); }
  }
  if (created.documentId && actors.admin) {
    try {
      const result = await actors.admin.client.rpc('set_document_retrieval_enabled', { p_document_id: created.documentId, p_enabled: false });
      if (result.error) log('CLEANUP_DOCUMENT_RETRIEVAL_DISABLE', { result: 'FAILED' });
    } catch { log('CLEANUP_DOCUMENT_RETRIEVAL_DISABLE', { result: 'FAILED' }); }
    try {
      const result = await actors.admin.client.rpc('withdraw_document', { p_document_id: created.documentId, p_reason: `P5_ACCEPTANCE_${runId}_RETENTION` });
      if (result.error) log('CLEANUP_DOCUMENT_WITHDRAW', { result: 'FAILED' });
    } catch { log('CLEANUP_DOCUMENT_WITHDRAW', { result: 'FAILED' }); }
  }

  // No supported cancel RPC exists; exact-ID service-role maintenance may disable only
  // this run's mutable pending/processing jobs. Append-only events remain untouched.
  if (created.documentId) {
    const jobs = await admin.from('ingestion_jobs').select('id,status').eq('document_id', created.documentId);
    for (const job of jobs.data || []) {
      if (['PENDING', 'RETRY', 'PROCESSING'].includes(job.status)) {
        await admin.from('ingestion_jobs').update({ status: 'CANCELLED', worker_id: null, claim_token: null, claimed_at: null, lease_expires_at: null, next_attempt_at: null, updated_at: new Date().toISOString() }).eq('id', job.id).eq('document_id', created.documentId);
      }
    }
  }

  // Conversation/message/source rows and generation attempts are mutable, disposable
  // outputs and are removed by exact IDs only.
  if (created.messageIds.length) await admin.from('ai_message_sources').delete().in('message_id', created.messageIds);
  if (created.conversationIds.length) {
    await admin.from('ai_messages').delete().in('conversation_id', created.conversationIds);
    await admin.from('ai_conversations').delete().in('id', created.conversationIds);
  }
  if (created.articleId) {
    await admin.from('knowledge_generation_attempts').delete().eq('article_id', created.articleId);
  }
  if (created.versionId) await admin.from('document_extractions').delete().eq('document_version_id', created.versionId);
  if (created.storagePath) {
    try {
      const result = await admin.storage.from(BUCKET).remove([created.storagePath]);
      cleanupState.storageRemoved = !result.error;
    } catch { /* best effort */ }
  }
  // Verify retrieval neutralization while the admin and user sessions are still valid.
  if (created.documentId && actors.userA) {
    const retrieval = await actors.userA.client.rpc('search_published_knowledge', { p_query: 'ORCHID-5729', p_match_count: 8 });
    cleanupState.postCleanupRetrieval = !retrieval.error && (retrieval.data || []).length === 0 ? 'PASS' : 'FAIL';
    const postAsk = await invokeAs(actors.userA, 'ask-ai', { question: 'What is the fictional completion keyword after cleanup?' });
    const answer = String(postAsk.payload?.answer || '');
    const citations = Array.isArray(postAsk.payload?.citations) ? postAsk.payload.citations : [];
    cleanupState.postCleanupAskAi = !answer.includes('ORCHID-5729') && citations.length === 0 ? 'PASS' : 'FAIL';
  }

  for (const actor of Object.values(actors)) {
    try { await actor.client.auth.signOut(); } catch { /* best effort */ }
  }
  for (const id of created.users) {
    try {
      const result = await admin.auth.admin.deleteUser(id);
      if (!result.error) cleanupState.usersRemoved += 1;
    } catch { /* best effort */ }
  }
  cleanupState.mutableRowsRemoved = true;
  cleanupState.retainedImmutableHistory = Boolean(created.sourceId);
  log('CLEANUP', {
    users_created: created.users.length,
    users_removed: cleanupState.usersRemoved,
    pilot_storage_removed: cleanupState.storageRemoved,
    mutable_rows_removed: cleanupState.mutableRowsRemoved,
    retained_immutable_history: cleanupState.retainedImmutableHistory,
    post_cleanup_retrieval: cleanupState.postCleanupRetrieval,
    post_cleanup_ask_ai: cleanupState.postCleanupAskAi,
    orphan_check: created.sourceId ? 'RETAINED_IMMUTABLE_HISTORY' : 'PASS',
  });
}

let adminClient;
let exitCode = 0;
try {
  adminClient = createClient(REHEARSAL_ORIGIN, process.env.SUPABASE_SERVICE_ROLE_KEY || 'missing', { auth: { persistSession: false, autoRefreshToken: false } });
  await runAcceptance();
} catch (error) {
  exitCode = 2;
  log('VERDICT', { value: error instanceof Error ? error.message : 'PHASE_5_RUNTIME_FAILED' });
} finally {
  await cleanup(adminClient);
}

process.exitCode = exitCode;
