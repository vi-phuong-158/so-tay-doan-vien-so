export const MAX_BUNDLE_FILES = 100;
export const MAX_BUNDLE_BYTES = 50 * 1024 * 1024;
export const BUNDLE_TIMEOUT_MS = 30_000;

export function uniqueArchivePath(path: string, used: Set<string>): string {
  if (!used.has(path)) {
    used.add(path);
    return path;
  }
  const dot = path.lastIndexOf('.');
  const stem = dot > 0 ? path.slice(0, dot) : path;
  const extension = dot > 0 ? path.slice(dot) : '';
  let suffix = 2;
  let candidate = `${stem}-${suffix}${extension}`;
  while (used.has(candidate)) candidate = `${stem}-${++suffix}${extension}`;
  used.add(candidate);
  return candidate;
}

export function getBundleHttpStatus(message: string): number {
  if (message.includes('UNAUTHENTICATED')) return 401;
  if (['ACCOUNT_NOT_ACTIVE', 'REPORT_CAMPAIGN_SCOPE_DENIED', 'REPORT_DASHBOARD_NOT_FOUND_OR_FORBIDDEN'].some(code => message.includes(code))) return 403;
  if (message.includes('BUNDLE_TIMEOUT')) return 504;
  if (['BUNDLE_FILE_LIMIT_EXCEEDED', 'BUNDLE_SIZE_LIMIT_EXCEEDED', 'STORAGE_OBJECT_NOT_FOUND', 'BUNDLE_FILE_METADATA_MISMATCH'].some(code => message.includes(code))) return 409;
  return 400;
}
