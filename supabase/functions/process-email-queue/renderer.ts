export type QueueTemplateRow = {
  id: string;
  template_code: string;
  recipient_email: string;
  recipient_name: string | null;
  payload: Record<string, unknown>;
};

export type RenderedEmail = {
  subject: string;
  text: string;
  html: string;
};

export class TemplateError extends Error {
  readonly code: string;
  readonly retryable = false;

  constructor(code: string) {
    super(code);
    this.name = 'TemplateError';
    this.code = code;
  }
}

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => HTML_ESCAPES[character]);
}

function boundedText(value: unknown, fallback: string, maxLength: number, code: string): string {
  if (value == null) return fallback;
  if (typeof value !== 'string') throw new TemplateError(code);
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ').slice(0, maxLength);
}

export function sanitizeSubject(value: unknown): string {
  const subject = boundedText(value, 'Thông báo từ Sổ tay Đoàn viên số', 150, 'TEMPLATE_SUBJECT_INVALID')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\b(?:bcc|cc|to|from|reply-to)\s*:/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!subject) throw new TemplateError('TEMPLATE_SUBJECT_EMPTY');
  return subject;
}

function buildActionUrl(appUrl: string | undefined, actionPath: unknown): string | null {
  if (actionPath == null) return null;
  if (typeof actionPath !== 'string' || actionPath.length > 500) {
    throw new TemplateError('TEMPLATE_ACTION_URL_INVALID');
  }
  if (!/^\/(?!\/)[^\s\\\u0000-\u001F\u007F]+$/.test(actionPath)
    || /^(?:https?:|javascript:|data:)/i.test(actionPath)) {
    throw new TemplateError('TEMPLATE_ACTION_URL_INVALID');
  }
  if (!appUrl) throw new TemplateError('APP_URL_NOT_CONFIGURED');
  if (!/^https:\/\/[^\s/]+(?:\/[^\s]*)?$/.test(appUrl)
    && !/^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?(?:\/[^\s]*)?$/.test(appUrl)) {
    throw new TemplateError('APP_URL_INVALID');
  }
  return `${appUrl.replace(/\/$/, '')}${actionPath}`;
}

export function renderSystemEmailTest(row: QueueTemplateRow, appUrl?: string): RenderedEmail {
  const payload = row.payload;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new TemplateError('TEMPLATE_PAYLOAD_INVALID');
  }

  const recipientName = boundedText(
    row.recipient_name ?? payload.recipientName,
    'đồng chí',
    200,
    'TEMPLATE_RECIPIENT_NAME_INVALID'
  );
  const title = sanitizeSubject(payload.title);
  const message = boundedText(
    payload.message,
    'Đây là email kiểm thử có kiểm soát của Sổ tay Đoàn viên số.',
    2000,
    'TEMPLATE_MESSAGE_INVALID'
  );
  const actionUrl = buildActionUrl(appUrl, payload.action_path);
  const safeName = escapeHtml(recipientName);
  const safeTitle = escapeHtml(title);
  const safeMessage = escapeHtml(message).replace(/\n/g, '<br>');
  const safeActionUrl = actionUrl ? escapeHtml(actionUrl) : null;
  const actionText = safeActionUrl
    ? `\nMở hệ thống: ${actionUrl}`
    : '';
  const actionHtml = safeActionUrl
    ? `<p><a href="${safeActionUrl}">Mở Sổ tay Đoàn viên số</a></p>`
    : '';

  return {
    subject: title,
    text: `Kính gửi ${recipientName},\n\n${message}${actionText}`,
    html: [
      '<!doctype html>',
      '<html lang="vi"><body>',
      `<p>Kính gửi ${safeName},</p>`,
      `<h1>${safeTitle}</h1>`,
      `<p>${safeMessage}</p>`,
      actionHtml,
      '</body></html>'
    ].join('')
  };
}

export function renderQueueEmail(row: QueueTemplateRow, appUrl?: string): RenderedEmail {
  if (row.template_code === 'SYSTEM_EMAIL_TEST') {
    return renderSystemEmailTest(row, appUrl);
  }
  if (['REPORT_CAMPAIGN_PUBLISHED', 'REPORT_SUBMITTED', 'REPORT_RESUBMITTED', 'REPORT_NEEDS_SUPPLEMENT', 'REPORT_ACCEPTED'].includes(row.template_code)) {
    return renderReportEventEmail(row, appUrl);
  }
  throw new TemplateError('TEMPLATE_NOT_ALLOWLISTED');
}

function reportPayload(row: QueueTemplateRow): {
  campaignTitle: string;
  unitName: string;
  actionPath: string;
  version?: string;
  submittedAt?: string;
  dueAt?: string;
  reviewReason?: string;
} {
  const payload = row.payload;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new TemplateError('TEMPLATE_PAYLOAD_INVALID');
  }
  const campaignTitle = boundedText(payload.campaign_title, '', 300, 'TEMPLATE_CAMPAIGN_TITLE_INVALID');
  const unitName = boundedText(payload.unit_name, '', 200, 'TEMPLATE_UNIT_INVALID');
  const actionPath = payload.action_path;
  if (!campaignTitle || !unitName || typeof actionPath !== 'string') {
    throw new TemplateError('TEMPLATE_PAYLOAD_INVALID');
  }
  return {
    campaignTitle,
    unitName,
    actionPath,
    version: payload.version == null ? undefined : boundedText(payload.version, '', 20, 'TEMPLATE_VERSION_INVALID'),
    submittedAt: payload.submitted_at == null ? undefined : boundedText(payload.submitted_at, '', 32, 'TEMPLATE_TIME_INVALID'),
    dueAt: payload.due_at == null ? undefined : boundedText(payload.due_at, '', 32, 'TEMPLATE_TIME_INVALID'),
    reviewReason: payload.review_reason == null ? undefined : boundedText(payload.review_reason, '', 1000, 'TEMPLATE_REVIEW_REASON_INVALID')
  };
}

export function renderReportEventEmail(row: QueueTemplateRow, appUrl?: string): RenderedEmail {
  const payload = reportPayload(row);
  const actionUrl = buildActionUrl(appUrl, payload.actionPath);
  const title = sanitizeSubject(payload.campaignTitle);
  const versionText = payload.version ? ` Phiên bản ${payload.version}.` : '';
  const submittedText = payload.submittedAt ? ` Thời điểm: ${payload.submittedAt}.` : '';
  const dueText = payload.dueAt ? ` Hạn nộp: ${payload.dueAt}.` : '';
  const reasonText = payload.reviewReason ? ` Lý do: ${payload.reviewReason}` : '';
  const content = {
    REPORT_CAMPAIGN_PUBLISHED: {
      subject: `Đợt báo cáo mới: ${title}`,
      message: `Đợt báo cáo “${payload.campaignTitle}” của ${payload.unitName} đã được phát hành.${dueText}`
    },
    REPORT_SUBMITTED: {
      subject: `Đã tiếp nhận báo cáo: ${title}`,
      message: `Báo cáo “${payload.campaignTitle}” của ${payload.unitName} đã được tiếp nhận.${versionText}${submittedText}`
    },
    REPORT_RESUBMITTED: {
      subject: `Đã tiếp nhận báo cáo bổ sung: ${title}`,
      message: `Báo cáo “${payload.campaignTitle}” của ${payload.unitName} đã được tiếp nhận lại.${versionText}${submittedText}`
    },
    REPORT_NEEDS_SUPPLEMENT: {
      subject: `Báo cáo cần bổ sung: ${title}`,
      message: `Báo cáo “${payload.campaignTitle}” của ${payload.unitName} cần được bổ sung.${reasonText}`
    },
    REPORT_ACCEPTED: {
      subject: `Báo cáo đã hoàn thành: ${title}`,
      message: `Báo cáo “${payload.campaignTitle}” của ${payload.unitName} đã được xác nhận hoàn thành.`
    }
  }[row.template_code as 'REPORT_CAMPAIGN_PUBLISHED' | 'REPORT_SUBMITTED' | 'REPORT_RESUBMITTED' | 'REPORT_NEEDS_SUPPLEMENT' | 'REPORT_ACCEPTED'];
  if (!content) throw new TemplateError('TEMPLATE_NOT_ALLOWLISTED');

  const safeMessage = escapeHtml(content.message).replace(/\n/g, '<br>');
  const safeTitle = escapeHtml(content.subject);
  const safeUnit = escapeHtml(payload.unitName);
  const safeActionUrl = escapeHtml(actionUrl);
  return {
    subject: sanitizeSubject(content.subject),
    text: `${content.message}\n\nMở nhiệm vụ: ${actionUrl}`,
    html: [
      '<!doctype html><html lang="vi"><body>',
      `<p>Đơn vị: ${safeUnit}</p>`,
      `<h1>${safeTitle}</h1>`,
      `<p>${safeMessage}</p>`,
      `<p><a href="${safeActionUrl}">Mở nhiệm vụ trong Sổ tay Đoàn viên số</a></p>`,
      '</body></html>'
    ].join('')
  };
}
