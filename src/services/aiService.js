const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class AskAiError extends Error {
  constructor(code, message, cause) {
    super(message);
    this.name = 'AskAiError';
    this.code = code;
    this.cause = cause;
  }
}

function assertQuestion(value) {
  const question = String(value ?? '').trim();
  if (question.length < 3) throw new AskAiError('QUESTION_REQUIRED', 'Hãy nhập câu hỏi rõ ràng hơn.', undefined);
  if (question.length > 2000) throw new AskAiError('TEXT_TOO_LONG', 'Câu hỏi tối đa 2.000 ký tự.', undefined);
  return question;
}

function assertConversationId(value) {
  if (value != null && !UUID_PATTERN.test(String(value))) {
    throw new AskAiError('INVALID_CONVERSATION_ID', 'Phiên hỏi đáp không hợp lệ.', undefined);
  }
}

function messageFor(code) {
  if (code === 'QUESTION_REQUIRED') return 'Hãy nhập câu hỏi rõ ràng hơn.';
  if (code === 'GEMINI_NOT_CONFIGURED') return 'Trợ lý AI chưa được cấu hình cho môi trường này.';
  if (code === 'MODEL_RATE_LIMITED') return 'Trợ lý AI đang bận. Vui lòng thử lại sau ít phút.';
  if (code === 'MODEL_TIMEOUT') return 'Trợ lý AI phản hồi quá chậm. Vui lòng thử lại.';
  if (code === 'UNAUTHENTICATED') return 'Phiên đăng nhập đã hết hạn.';
  return 'Không thể xử lý câu hỏi lúc này. Vui lòng thử lại.';
}

function errorCode(error, data) {
  const values = [data?.error, error?.code, error?.message, error?.context?.error];
  return values.find(value => typeof value === 'string' && /^[A-Z][A-Z0-9_]{2,63}$/.test(value)) ?? 'REQUEST_FAILED';
}

export function normalizeAskAiError(error, data) {
  if (error instanceof AskAiError) return error;
  const code = errorCode(error, data);
  return new AskAiError(code, messageFor(code), error);
}

export function mapAskAiCitation(row) {
  if (!row?.document_id || !row?.evidence_id || !row?.citation_path) return null;
  return {
    rank: Number(row.rank) || 0,
    title: String(row.title || 'Nguồn đã duyệt'),
    documentId: row.document_id,
    documentVersionId: row.document_version_id || null,
    articleId: row.article_id || null,
    evidenceId: row.evidence_id,
    locator: row.locator && typeof row.locator === 'object' ? row.locator : {},
    citationPath: row.citation_path
  };
}

export function createAskAiService(client) {
  return {
    async ask({ question, conversationId } = {}) {
      const normalizedQuestion = assertQuestion(question);
      assertConversationId(conversationId);
      try {
        const { data, error } = await client.functions.invoke('ask-ai', {
          body: {
            question: normalizedQuestion,
            ...(conversationId ? { conversation_id: conversationId } : {})
          }
        });
        if (error || !data?.success) throw normalizeAskAiError(error, data);
        return {
          conversationId: data.conversation_id,
          messageId: data.message_id,
          answer: String(data.answer || ''),
          citations: (data.citations || []).map(mapAskAiCitation).filter(Boolean)
        };
      } catch (error) {
        throw normalizeAskAiError(error);
      }
    }
  };
}
