import sanitizeHtml from 'sanitize-html';

/**
 * Làm sạch HTML của một tin tuyển dụng trước khi ghi.
 *
 * `description`, `requirements` và `benefits` là rich text do recruiter nhập, và frontend render
 * chúng bằng `dangerouslySetInnerHTML` trên **trang công khai** (`job-detail-page.tsx`). Hàm
 * `getCleanHtml` phía frontend chỉ bóc `<details>`/`<summary>` và xoá heading trùng — thuần mỹ
 * quan, không phải sanitizer. Trước thay đổi này không có tầng nào lọc, nên một recruiter có thể
 * POST thẳng `<img src=x onerror=...>` và nó chạy trên trình duyệt của mọi khách xem tin.
 *
 * `job-post-ai/rich-text.ts` đã có `sanitizeRichText` cho nội dung **AI sinh ra**, nhưng nó xoá
 * hẳn thẻ `<a>`. Dùng lại nó ở đây sẽ âm thầm nuốt mọi liên kết recruiter đặt trong JD, nên
 * đường recruiter cần allowlist riêng — rộng đúng bằng những gì trình soạn thảo tạo ra.
 */

/**
 * Bám sát cấu hình TipTap ở `upnext-frontend/src/shared/ui/rich-text-editor.tsx`:
 * StarterKit (heading giới hạn h2–h4) + Underline + Link. Không có nút chèn ảnh nên `img` không
 * nằm trong danh sách; thêm nó vào chỉ mở rộng bề mặt tấn công mà không phục vụ tính năng nào.
 */
const ALLOWED_TAGS = [
  'p',
  'h2',
  'h3',
  'h4',
  'strong',
  'em',
  'u',
  's',
  'code',
  'pre',
  'ul',
  'ol',
  'li',
  'blockquote',
  'hr',
  'br',
  'a',
];

/**
 * Lớp `LinkExtension` gắn vào mỗi liên kết. Khai báo tường minh thay vì cho phép `class` tuỳ ý:
 * một `class` bất kỳ không chạy được mã, nhưng vẫn đủ để dựng lớp phủ hoặc ẩn nội dung bằng
 * utility class của Tailwind. Nếu frontend đổi lớp, liên kết mất định dạng — một lỗi nhìn thấy
 * được, tốt hơn là một lỗ hổng im lặng.
 */
const ALLOWED_LINK_CLASSES = [
  'text-emerald-600',
  'underline',
  'underline-offset-4',
  'cursor-pointer',
];

export function sanitizeJobPostHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      a: ['href', 'target', 'rel'],
    },
    allowedClasses: {
      a: ALLOWED_LINK_CLASSES,
    },
    // Chặn `javascript:` và `data:` ở tầng scheme thay vì cố lọc bằng biểu thức chính quy.
    allowedSchemes: ['http', 'https', 'mailto'],
    allowProtocolRelative: false,
    transformTags: {
      a: (tagName, attributes) => {
        const opensInNewTab = attributes.target?.toLowerCase() === '_blank';

        return {
          tagName,
          attribs: opensInNewTab
            ? { ...attributes, target: '_blank', rel: 'noopener noreferrer' }
            : attributes,
        };
      },
    },
  });
}

/**
 * Áp `sanitizeJobPostHtml` cho đúng ba trường rich text, giữ nguyên phần còn lại của DTO.
 *
 * Chỉ đụng tới khoá thực sự có mặt: `update` nhận DTO một phần, và biến `benefits` chưa gửi
 * thành `''` sẽ xoá dữ liệu người dùng không hề định sửa.
 */
type JobPostRichText = {
  description?: string | null;
  requirements?: string | null;
  benefits?: string | null;
};

export function sanitizeJobPostContent<T extends JobPostRichText>(dto: T): T {
  return {
    ...dto,
    ...(typeof dto.description === 'string'
      ? { description: sanitizeJobPostHtml(dto.description) }
      : {}),
    ...(typeof dto.requirements === 'string'
      ? { requirements: sanitizeJobPostHtml(dto.requirements) }
      : {}),
    ...(typeof dto.benefits === 'string' ? { benefits: sanitizeJobPostHtml(dto.benefits) } : {}),
  };
}
