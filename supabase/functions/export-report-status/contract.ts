export const DASHBOARD_EXPORT_STATUSES = [
  'PENDING', 'SUBMITTED', 'NEEDS_SUPPLEMENT', 'RESUBMITTED', 'COMPLETED', 'OVERDUE', 'LATE_SUBMITTED', 'EXEMPTED'
] as const;

export function normalizeExportStatus(value: unknown): string | null {
  const status = String(value ?? '').trim().toUpperCase();
  if (!status || status === 'ALL') return null;
  if (!DASHBOARD_EXPORT_STATUSES.includes(status as typeof DASHBOARD_EXPORT_STATUSES[number])) {
    throw new Error('INVALID_DASHBOARD_FILTER');
  }
  return status;
}

export function escapeCsvCell(value: unknown): string {
  let text = String(value ?? '');
  if (/^\s*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function getExportHttpStatus(message: string): number {
  if (message.includes('UNAUTHENTICATED')) return 401;
  if (['ACCOUNT_NOT_ACTIVE', 'REPORT_CAMPAIGN_SCOPE_DENIED', 'REPORT_DASHBOARD_NOT_FOUND_OR_FORBIDDEN'].some(code => message.includes(code))) return 403;
  if (message.includes('INVALID_DASHBOARD_FILTER')) return 400;
  return 400;
}

