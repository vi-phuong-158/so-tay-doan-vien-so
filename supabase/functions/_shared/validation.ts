export function safeText(value: unknown, max = 5000): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text) return null;
  if (text.length > max) throw new Error('TEXT_TOO_LONG');
  return text;
}
export function assertUuid(value: unknown, code = 'INVALID_ID'): string {
  const text = String(value || '');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)) throw new Error(code);
  return text;
}
export function fileExtension(name: string) { return name.toLowerCase().split('.').pop() || ''; }

// Backend-normalized, download-safe filename. Never trust a client-supplied safe_name.
export function safeFileName(name: string): string {
  const cleaned = String(name || 'tep')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-').replace(/^-|-$/g, '')
    .slice(0, 120);
  return cleaned || 'tep';
}
