import { sha256Hex, type ExtractedPage, type StructuredExtraction } from './extraction.ts';

export type EvidenceSuggestion = {
  page?: number;
  excerpt_hint?: string;
  evidence_kind?: string;
  reason?: string;
};

export type ResolvedEvidence = {
  content: string;
  content_hash: string;
  locator: { page: number; paragraph?: number };
  evidence_kind: string;
  selected_by: 'AI_SUGGESTED';
  selected_reason: string;
};

const EVIDENCE_KINDS = new Set([
  'ARTICLE_CLAUSE', 'DEADLINE', 'PROCEDURE_STEP', 'FORM_FIELD', 'DEFINITION', 'TABLE_ROW', 'QUOTE',
]);

function normalizeEvidenceKind(value: unknown): string {
  const kind = typeof value === 'string' ? value.trim() : '';
  return EVIDENCE_KINDS.has(kind) ? kind : 'ARTICLE_CLAUSE';
}

function normalizeHint(value: string): string {
  return String(value ?? '').normalize('NFC').replace(/\s+/g, ' ').trim();
}

function findExcerpt(page: ExtractedPage, hint: string): string | null {
  const exact = page.text.indexOf(hint);
  if (exact >= 0) return page.text.slice(exact, exact + hint.length);
  const compactPage = normalizeHint(page.text);
  const compactHint = normalizeHint(hint);
  const compactIndex = compactPage.toLocaleLowerCase().indexOf(compactHint.toLocaleLowerCase());
  if (compactIndex < 0) return null;
  return compactPage.slice(compactIndex, compactIndex + compactHint.length);
}

export async function resolveEvidenceSuggestions(
  extraction: Pick<StructuredExtraction, 'pages'>,
  suggestions: EvidenceSuggestion[],
): Promise<ResolvedEvidence[]> {
  if (!Array.isArray(suggestions) || suggestions.length === 0) throw new Error('EVIDENCE_REQUIRED');
  const result: ResolvedEvidence[] = [];
  for (const suggestion of suggestions.slice(0, 12)) {
    const hint = normalizeHint(suggestion.excerpt_hint ?? '');
    if (!hint) throw new Error('EVIDENCE_NOT_FOUND');
    const candidates = suggestion.page ? extraction.pages.filter(page => page.page === suggestion.page) : extraction.pages;
    const page = candidates.map(candidate => ({ candidate, excerpt: findExcerpt(candidate, hint) }))
      .find(candidate => candidate.excerpt)?.candidate;
    const excerpt = candidates.map(candidate => findExcerpt(candidate, hint)).find(Boolean);
    if (!page || !excerpt) throw new Error('EVIDENCE_NOT_FOUND');
    result.push({
      content: excerpt,
      content_hash: await sha256Hex(new TextEncoder().encode(excerpt)),
      locator: { page: page.page },
      evidence_kind: normalizeEvidenceKind(suggestion.evidence_kind),
      selected_by: 'AI_SUGGESTED',
      selected_reason: String(suggestion.reason ?? 'AI selected; backend resolved exact source text').slice(0, 500),
    });
  }
  return result;
}

export function assertEvidenceIsSourceText(extraction: Pick<StructuredExtraction, 'pages'>, evidence: ResolvedEvidence[]): void {
  for (const item of evidence) {
    const source = extraction.pages.find(page => page.page === item.locator.page)?.text ?? '';
    if (!source.includes(item.content)) throw new Error('EVIDENCE_NOT_FOUND');
  }
}
