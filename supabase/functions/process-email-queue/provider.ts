export type TransactionalEmail = {
  to: string;
  from: string;
  subject: string;
  text: string;
  html: string;
  idempotencyKey: string;
};

export type ProviderResult = {
  provider: string;
  providerMessageId: string;
  providerCode: string;
};

export class ProviderError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly status: number | null;

  constructor(code: string, retryable: boolean, status: number | null = null, message = code) {
    super(message);
    this.name = 'ProviderError';
    this.code = code;
    this.retryable = retryable;
    this.status = status;
  }
}

export type ResendProviderOptions = {
  apiKey: string;
  fromAddress: string;
  fromName?: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

type ProviderErrorBody = { code?: string; message?: string; error?: { code?: string; message?: string } };

function boundedProviderText(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  if (/(authorization|api[ _-]?key|bearer|secret|token)/i.test(value)) return 'REDACTED_ERROR';
  return value.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500) || fallback;
}

function providerCode(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  return value.replace(/[^A-Za-z0-9_.-]/g, '_').toUpperCase().slice(0, 64) || fallback;
}

function parseErrorBody(value: unknown): { code: string; message: string } {
  const body = value as ProviderErrorBody | null;
  const nested = body?.error;
  return {
    code: providerCode(nested?.code ?? body?.code, 'PROVIDER_ERROR'),
    message: boundedProviderText(nested?.message ?? body?.message, 'Provider request failed')
  };
}

export function classifyProviderFailure(status: number, code?: string): { code: string; retryable: boolean } {
  const normalized = providerCode(code, 'PROVIDER_ERROR');
  if (status === 408 || status === 425 || status === 429) {
    return { code: status === 429 ? 'RATE_LIMITED' : 'PROVIDER_TIMEOUT', retryable: true };
  }
  if (status >= 500) return { code: 'PROVIDER_5XX', retryable: true };
  if (status === 409 && normalized === 'CONCURRENT_IDEMPOTENT_REQUESTS') {
    return { code: normalized, retryable: true };
  }
  if (status >= 400 && status < 500) return { code: normalized, retryable: false };
  return { code: 'PROVIDER_UNKNOWN_RESPONSE', retryable: true };
}

function validateConfig(options: ResendProviderOptions): Required<Pick<ResendProviderOptions, 'baseUrl' | 'timeoutMs'>> {
  if (!options.apiKey || !/^re_[A-Za-z0-9_-]+$/.test(options.apiKey)) {
    throw new ProviderError('PROVIDER_NOT_CONFIGURED', false, null);
  }
  if (!options.fromAddress || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(options.fromAddress)) {
    throw new ProviderError('SENDER_NOT_CONFIGURED', false, null);
  }
  const baseUrl = options.baseUrl ?? 'https://api.resend.com';
  if (!/^https:\/\/[^\s/]+(?:\/[^\s]*)?$/.test(baseUrl)
    && !/^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?(?:\/[^\s]*)?$/.test(baseUrl)) {
    throw new ProviderError('PROVIDER_BASE_URL_INVALID', false, null);
  }
  const timeoutMs = Math.min(Math.max(options.timeoutMs ?? 10000, 1000), 30000);
  return { baseUrl: baseUrl.replace(/\/$/, ''), timeoutMs };
}

export function createResendProvider(options: ResendProviderOptions) {
  const config = validateConfig(options);
  const fetchImpl = options.fetchImpl ?? fetch;
  const fromName = (options.fromName ?? '').replace(/[\r\n\u0000-\u001F\u007F]/g, ' ').trim().slice(0, 100);
  const from = fromName ? `${fromName} <${options.fromAddress}>` : options.fromAddress;

  return {
    async send(email: TransactionalEmail): Promise<ProviderResult> {
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.to)) {
        throw new ProviderError('INVALID_RECIPIENT', false, 422);
      }
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
      let response: Response;
      try {
        response = await fetchImpl(`${config.baseUrl}/emails`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${options.apiKey}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'Idempotency-Key': email.idempotencyKey,
            'User-Agent': 'so-tay-doan-vien-so/phase-3'
          },
          body: JSON.stringify({
            from,
            to: [email.to],
            subject: email.subject,
            text: email.text,
            html: email.html
          }),
          signal: controller.signal
        });
      } catch (error) {
        clearTimeout(timeout);
        if (error instanceof DOMException && error.name === 'AbortError') {
          throw new ProviderError('PROVIDER_TIMEOUT', true, null);
        }
        throw new ProviderError('PROVIDER_NETWORK_ERROR', true, null);
      }
      clearTimeout(timeout);

      let body: unknown = null;
      try {
        body = await response.json();
      } catch {
        body = null;
      }

      if (!response.ok) {
        const parsed = parseErrorBody(body);
        const classification = classifyProviderFailure(response.status, parsed.code);
        throw new ProviderError(classification.code, classification.retryable, response.status, parsed.message);
      }

      const messageId = (body as { id?: unknown } | null)?.id;
      if (typeof messageId !== 'string' || !messageId || messageId.length > 255) {
        throw new ProviderError('MALFORMED_PROVIDER_RESPONSE', true, response.status);
      }
      return {
        provider: 'RESEND',
        providerMessageId: messageId,
        providerCode: `HTTP_${response.status}`
      };
    }
  };
}
