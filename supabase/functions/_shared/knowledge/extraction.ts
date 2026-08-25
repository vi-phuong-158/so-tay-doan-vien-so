import { unzlibSync, unzipSync } from 'npm:fflate@0.8.2';

export type ExtractedPage = { page: number; text: string };
export type StructuredParagraph = { page: number; paragraph: number; text: string };
export type StructuredSection = { page: number; title: string; paragraphs: StructuredParagraph[] };

export type StructuredExtraction = {
  documentVersionId: string;
  sourceByteHash: string;
  normalizedContentHash: string;
  pages: ExtractedPage[];
  sections: StructuredSection[];
  normalizedText: string;
  metadata: {
    pageCount: number;
    extractor: string;
    extractorVersion: string;
    sourceType: string;
  };
};

export type ExtractionErrorCode =
  | 'UNSUPPORTED_FILE_TYPE'
  | 'OCR_REQUIRED'
  | 'EXTRACTION_FAILED'
  | 'EXTRACTION_EMPTY'
  | 'SOURCE_TOO_LARGE';

export class ExtractionError extends Error {
  constructor(readonly code: ExtractionErrorCode, message: string = code) {
    super(message === code ? code : `${code}: ${message}`);
    this.name = 'ExtractionError';
  }
}

const EXTRACTOR_VERSION = 'p5-03-deterministic-v1';
const MAX_SOURCE_BYTES = 50 * 1024 * 1024;

export function normalizeExtractedText(value: string): string {
  return String(value ?? '')
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .split('\n')
    .map(line => line.trim())
    .join('\n')
    .replace(/-\n(?=\p{L})/gu, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

function decodeXml(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function pdfLiteral(value: string): string {
  return value
    .replace(/\\([\\()])/g, '$1')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\([0-7]{1,3})/g, (_, octal: string) => String.fromCharCode(parseInt(octal, 8)));
}

function pdfTextSources(bytes: Uint8Array): string[] {
  const raw = new TextDecoder('utf-8').decode(bytes);
  const sources = [raw];
  let cursor = 0;
  while (cursor < raw.length) {
    const streamStart = raw.indexOf('stream', cursor);
    if (streamStart < 0) break;
    const dataStart = raw[streamStart + 6] === '\r' && raw[streamStart + 7] === '\n'
      ? streamStart + 8
      : streamStart + 6 + (raw[streamStart + 6] === '\n' || raw[streamStart + 6] === '\r' ? 1 : 0);
    const streamEnd = raw.indexOf('endstream', dataStart);
    if (streamEnd < 0) break;
    const header = raw.slice(Math.max(0, streamStart - 160), streamStart);
    if (header.includes('/FlateDecode')) {
      let end = streamEnd;
      while (end > dataStart && (bytes[end - 1] === 10 || bytes[end - 1] === 13)) end -= 1;
      try { sources.push(new TextDecoder('utf-8').decode(unzlibSync(bytes.slice(dataStart, end)))); } catch { /* malformed stream is handled as no text */ }
    }
    cursor = streamEnd + 9;
  }
  return sources;
}

function extractPdfPages(bytes: Uint8Array): ExtractedPage[] {
  const source = pdfTextSources(bytes).join('\n');
  const rawPages = source.includes('\f') ? source.split('\f') : [source];
  const pages = rawPages.map((raw, index) => {
    const strings: string[] = [];
    for (const match of raw.matchAll(/\(([^()]*(?:\\.[^()]*)*)\)\s*Tj/g)) strings.push(pdfLiteral(match[1]));
    for (const match of raw.matchAll(/\[((?:[^\]]|\\\])*)\]\s*TJ/g)) {
      for (const literal of match[1].matchAll(/\(([^()]*(?:\\.[^()]*)*)\)/g)) strings.push(pdfLiteral(literal[1]));
    }
    const text = strings.length ? strings.join(' ').replace(/\s+/g, ' ') : '';
    return { page: index + 1, text: normalizeExtractedText(text) };
  }).filter(page => page.text.length > 0);
  if (!pages.length) throw new ExtractionError('OCR_REQUIRED', 'PDF has no usable text layer');
  return pages;
}

function extractDocxPages(bytes: Uint8Array): ExtractedPage[] {
  let archive: Record<string, Uint8Array>;
  try {
    archive = unzipSync(bytes);
  } catch {
    throw new ExtractionError('EXTRACTION_FAILED', 'DOCX archive could not be read');
  }
  const xmlBytes = archive['word/document.xml'];
  if (!xmlBytes) throw new ExtractionError('EXTRACTION_FAILED', 'DOCX document.xml is missing');
  const xml = new TextDecoder().decode(xmlBytes)
    .replace(/<w:lastRenderedPageBreak\s*\/?\s*>/g, '<w:pageBreak/>')
    .replace(/<w:br[^>]*w:type="page"[^>]*\/?\s*>/g, '<w:pageBreak/>')
    .replace(/<w:tab\s*\/?\s*>/g, '\t')
    .replace(/<w:pageBreak\s*\/?\s*>/g, '\f')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, '');
  const pages = decodeXml(xml).split('\f').map((text, index) => ({
    page: index + 1,
    text: normalizeExtractedText(text),
  })).filter(page => page.text.length > 0);
  if (!pages.length) throw new ExtractionError('EXTRACTION_EMPTY', 'DOCX contains no text');
  return pages;
}

function extractPlainPages(bytes: Uint8Array): ExtractedPage[] {
  const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  const pages = text.split('\f').map((page, index) => ({ page: index + 1, text: normalizeExtractedText(page) }))
    .filter(page => page.text.length > 0);
  if (!pages.length) throw new ExtractionError('EXTRACTION_EMPTY', 'Source contains no text');
  return pages;
}

function sourceType(fileName: string, mimeType: string): string {
  const extension = fileName.toLowerCase().split('.').pop() ?? '';
  if (extension === 'pdf' || mimeType === 'application/pdf') return 'PDF';
  if (extension === 'docx' || mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'DOCX';
  if (extension === 'txt' || extension === 'md' || mimeType.startsWith('text/')) return 'TEXT';
  throw new ExtractionError('UNSUPPORTED_FILE_TYPE', `Unsupported source type: ${extension || mimeType}`);
}

function looksLikeHeading(text: string): boolean {
  return /^(?:\d+(?:\.\d+)*[.)]?|[IVX]+[.)])\s+/.test(text)
    || (text.length <= 140 && /^[A-ZÀ-Ỹ0-9][A-ZÀ-Ỹ0-9\s:–—-]{4,}$/.test(text));
}

export function buildStructuredSections(pages: ExtractedPage[]): StructuredSection[] {
  const sections: StructuredSection[] = [];
  for (const page of pages) {
    const paragraphs = page.text.split(/\n{2,}/).map(text => text.trim()).filter(Boolean);
    let current: StructuredSection | null = null;
    paragraphs.forEach((text, index) => {
      if (looksLikeHeading(text)) {
        current = { page: page.page, title: text, paragraphs: [] };
        sections.push(current);
      } else {
        if (!current) {
          current = { page: page.page, title: `Trang ${page.page}`, paragraphs: [] };
          sections.push(current);
        }
        current.paragraphs.push({ page: page.page, paragraph: index + 1, text });
      }
    });
  }
  return sections;
}

export async function extractDeterministically(options: {
  documentVersionId: string;
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
}): Promise<StructuredExtraction> {
  if (options.bytes.byteLength === 0) throw new ExtractionError('EXTRACTION_EMPTY');
  if (options.bytes.byteLength > MAX_SOURCE_BYTES) throw new ExtractionError('SOURCE_TOO_LARGE');
  const type = sourceType(options.fileName, options.mimeType);
  const pages = type === 'PDF'
    ? extractPdfPages(options.bytes)
    : type === 'DOCX'
      ? extractDocxPages(options.bytes)
      : extractPlainPages(options.bytes);
  const normalizedPages = pages.map(page => ({ ...page, text: normalizeExtractedText(page.text) }));
  const normalizedText = normalizedPages.map(page => normalizedPages.length > 1 ? `[Trang ${page.page}]\n${page.text}` : page.text).join('\n\n');
  if (!normalizedText.trim()) throw new ExtractionError('EXTRACTION_EMPTY');
  return {
    documentVersionId: options.documentVersionId,
    sourceByteHash: await sha256Hex(options.bytes),
    normalizedContentHash: await sha256Hex(new TextEncoder().encode(normalizedText)),
    pages: normalizedPages,
    sections: buildStructuredSections(normalizedPages),
    normalizedText,
    metadata: {
      pageCount: normalizedPages.length,
      extractor: `deterministic-${type.toLowerCase()}`,
      extractorVersion: EXTRACTOR_VERSION,
      sourceType: type,
    },
  };
}

export { EXTRACTOR_VERSION, MAX_SOURCE_BYTES };
