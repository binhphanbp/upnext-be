/**
 * Nội dung HTML do AI sinh ra được ghi thẳng vào job_posts.description/requirements/benefits,
 * và frontend render bằng dangerouslySetInnerHTML trên cả trang công khai. Vì vậy chỉ giữ lại
 * đúng các thẻ định dạng mà RichTextEditor hỗ trợ, loại bỏ mọi thuộc tính và thẻ khác.
 */
const ALLOWED_TAGS = ['p', 'br', 'ul', 'ol', 'li', 'strong', 'b', 'em', 'i', 'u', 'h3', 'h4'];
const MAX_RICH_TEXT_LENGTH = 12000;

export function sanitizeRichText(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length < 1) {
    return '';
  }

  const withoutRawBlocks = value
    // Bỏ toàn bộ nội dung của các thẻ có thể thực thi mã trước khi lọc thẻ.
    .replace(/<(script|style|iframe|object|embed|template)\b[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');

  const tagOnly = withoutRawBlocks.replace(
    /<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g,
    (_match, closing: string, tagName: string) => {
      const tag = tagName.toLowerCase();
      if (!ALLOWED_TAGS.includes(tag)) {
        return '';
      }

      // Bỏ mọi thuộc tính (style, on*, href...) để loại bỏ hoàn toàn bề mặt XSS.
      return closing === '/' ? `</${tag}>` : tag === 'br' ? '<br/>' : `<${tag}>`;
    },
  );

  const collapsed = tagOnly
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return collapsed.length > MAX_RICH_TEXT_LENGTH
    ? collapsed.slice(0, MAX_RICH_TEXT_LENGTH)
    : collapsed;
}

/** Chuyển văn bản thuần (JD dán vào hoặc trích từ file) thành HTML danh sách/đoạn đơn giản. */
export function plainTextToRichText(value: string): string {
  const lines = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length < 1) {
    return '';
  }

  const blocks: string[] = [];
  let bulletBuffer: string[] = [];

  const flushBullets = () => {
    if (bulletBuffer.length > 0) {
      blocks.push(`<ul>${bulletBuffer.map((item) => `<li>${item}</li>`).join('')}</ul>`);
      bulletBuffer = [];
    }
  };

  for (const line of lines) {
    const bullet = /^[-*•+•]\s*(.+)$/.exec(line);
    if (bullet) {
      bulletBuffer.push(escapeHtml(bullet[1]));
      continue;
    }

    flushBullets();
    blocks.push(`<p>${escapeHtml(line)}</p>`);
  }

  flushBullets();

  return blocks.join('');
}

/** Rút văn bản thuần từ HTML của một trang tuyển dụng để đưa vào prompt. */
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg|head)\b[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<\/(p|div|li|tr|h[1-6]|section|article|br)\s*>/gi, '\n')
    .replace(/<br\b[^>]*>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .trim();
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
