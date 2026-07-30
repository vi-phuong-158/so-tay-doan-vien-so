import DOMPurify from 'dompurify';

/**
 * Markdown renderer nhẹ, không phụ thuộc package ngoài.
 * Hỗ trợ: heading (#..###), đậm, nghiêng, code inline,
 * danh sách (-, *, 1.), blockquote (>), đoạn văn và xuống dòng.
 * Đầu ra được sanitize bằng dompurify trước khi trả về.
 */

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function renderInline(text) {
  let out = escapeHtml(text);
  // code inline
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  // đậm
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  // nghiêng
  out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  out = out.replace(/(^|[^_])_([^_\n]+)_/g, '$1<em>$2</em>');
  return out;
}

function flushList(html, listType, items) {
  if (!items.length) return html;
  const tag = listType === 'ol' ? 'ol' : 'ul';
  return `${html}<${tag}>${items.map(item => `<li>${renderInline(item)}</li>`).join('')}</${tag}>`;
}

export function markdownToHtml(markdown) {
  const text = (markdown || '').replace(/\r\n/g, '\n');
  const lines = text.split('\n');

  let html = '';
  let paragraph = [];
  let listItems = [];
  let listType = null;
  let quote = [];

  const flushParagraph = () => {
    if (paragraph.length) {
      html += `<p>${renderInline(paragraph.join(' '))}</p>`;
      paragraph = [];
    }
  };
  const flushQuote = () => {
    if (quote.length) {
      html += `<blockquote>${renderInline(quote.join(' '))}</blockquote>`;
      quote = [];
    }
  };
  const flushAllLists = () => {
    if (listItems.length) {
      html = flushList(html, listType, listItems);
      listItems = [];
      listType = null;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    if (!line.trim()) {
      flushParagraph();
      flushAllLists();
      flushQuote();
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      flushParagraph();
      flushAllLists();
      flushQuote();
      const level = heading[1].length + 2; // h3..h5 để hợp với cỡ chữ bong bóng chat
      html += `<h${level}>${renderInline(heading[2])}</h${level}>`;
      continue;
    }

    const ordered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    const unordered = line.match(/^\s*[-*•]\s+(.*)$/);
    if (ordered || unordered) {
      flushParagraph();
      flushQuote();
      const type = ordered ? 'ol' : 'ul';
      if (listType && listType !== type) flushAllLists();
      listType = type;
      listItems.push((ordered ? ordered[1] : unordered[1]).trim());
      continue;
    }

    const blockquote = line.match(/^\s*>\s?(.*)$/);
    if (blockquote) {
      flushParagraph();
      flushAllLists();
      quote.push(blockquote[1]);
      continue;
    }

    flushAllLists();
    flushQuote();
    paragraph.push(line.trim());
  }

  flushParagraph();
  flushAllLists();
  flushQuote();

  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['p', 'strong', 'em', 'code', 'ul', 'ol', 'li', 'blockquote', 'h3', 'h4', 'h5', 'br'],
    ALLOWED_ATTR: [],
  });
}
