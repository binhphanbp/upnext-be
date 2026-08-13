/**
 * Lọc dữ liệu cá nhân trước khi gửi cho LLM.
 *
 * KE-HOACH-AI-REVIEW.md §16.4 liệt kê những gì không được gửi tới model:
 * email, số điện thoại, địa chỉ chi tiết, URL file riêng tư. Module này là
 * **chỗ duy nhất** thực thi việc đó — mọi dữ liệu đi vào model đều phải qua
 * `redact()` trong context assembler.
 *
 * Vì sao lọc thay vì chỉ "không chọn cột": văn bản CV (`parsedText`) là một khối
 * tự do do người dùng tải lên. Email và số điện thoại nằm *trong* đó, không nằm
 * ở một cột riêng để bỏ qua. Không lọc nội dung nghĩa là gửi toàn bộ thông tin
 * liên hệ cho nhà cung cấp LLM ở mỗi lần phân tích CV.
 *
 * Ranh giới của cách làm này: lọc theo mẫu không bắt được 100%. Số điện thoại
 * viết bằng chữ ("không tám chín...") sẽ lọt. Đây là giảm thiểu, không phải bảo
 * đảm — và là lý do §16.5 vẫn đặt hạn lưu trữ cho raw LLM input.
 */

/** Ký tự chữ Unicode — `\w` của JS chỉ hiểu ASCII nên vô dụng với tiếng Việt. */
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/**
 * Số điện thoại Việt Nam: 0xxxxxxxxx / +84xxxxxxxxx, cho phép dấu cách, chấm,
 * gạch ngang, ngoặc giữa các nhóm. Yêu cầu ranh giới không-phải-chữ-số ở hai
 * đầu để không cắt giữa một dãy số dài (mã số thuế, số hợp đồng).
 */
const PHONE_VN = /(?<![\d])(?:\+?84|0)(?:[\s.\-()]?\d){8,10}(?![\d])/g;

/**
 * Số quốc tế ở định dạng E.164 (có thể được người dùng viết kèm khoảng trắng,
 * dấu chấm, gạch ngang hoặc ngoặc). Candidate profile đã hỗ trợ số quốc tế;
 * vì vậy chỉ lọc `PHONE_VN` sẽ làm lộ số như `+1 (415) 555-2671` trong CV.
 *
 * E.164 giới hạn tối đa 15 chữ số. Mẫu yêu cầu tối thiểu 8 chữ số để không
 * che nhầm phép tính hoặc mã ngắn có dấu `+`.
 */
const PHONE_E164 = /(?<![\p{L}\p{N}])\+(?:\d[\s.\-()]*){7,14}\d(?![\p{L}\p{N}])/gu;

/**
 * URL — chỉ giữ lại host để câu trả lời còn nói được "có link GitHub".
 *
 * Tên có hậu tố `_PATTERN` vì `URL` trần sẽ che constructor `URL` toàn cục và
 * làm `new URL(...)` bên dưới không compile — lỗi này TypeScript báo ở dòng
 * khác hẳn nơi gây ra nó.
 */
const URL_PATTERN = /https?:\/\/[^\s<>"')]+/g;

/** Ngày sinh dạng dd/mm/yyyy hoặc dd-mm-yyyy. §1.3 cấm dùng để xếp hạng. */
const BIRTHDATE =
  /(?<![\d])(?:0?[1-9]|[12]\d|3[01])[/-](?:0?[1-9]|1[0-2])[/-](?:19|20)\d{2}(?![\d])/g;

export type RedactionSummary = {
  text: string;
  /** Đếm theo loại — ghi vào log để biết bộ lọc có chạy hay không. */
  removed: { emails: number; phones: number; urls: number; birthdates: number };
};

export function redact(input: string | null | undefined): RedactionSummary {
  if (!input) {
    return { text: '', removed: { emails: 0, phones: 0, urls: 0, birthdates: 0 } };
  }

  let emails = 0;
  let phones = 0;
  let urls = 0;
  let birthdates = 0;

  const text = input
    .replace(EMAIL, () => {
      emails += 1;
      return '[email đã ẩn]';
    })
    .replace(PHONE_VN, () => {
      phones += 1;
      return '[số điện thoại đã ẩn]';
    })
    .replace(PHONE_E164, () => {
      phones += 1;
      return '[số điện thoại đã ẩn]';
    })
    .replace(BIRTHDATE, () => {
      birthdates += 1;
      return '[ngày sinh đã ẩn]';
    })
    .replace(URL_PATTERN, (match) => {
      urls += 1;
      // Giữ host: model cần biết đây là github.com hay một blog cá nhân để nhận
      // xét về portfolio, nhưng không cần đường dẫn đầy đủ.
      try {
        return `[liên kết: ${new URL(match).host}]`;
      } catch {
        return '[liên kết đã ẩn]';
      }
    });

  return { text, removed: { emails, phones, urls, birthdates } };
}

/**
 * Địa chỉ: chỉ giữ tỉnh/thành cuối cùng, bỏ số nhà và tên đường.
 *
 * "12/3 Nguyễn Trãi, Thanh Xuân, Hà Nội" → "Hà Nội". Địa điểm cần cho matching
 * (§11.3 có `location_score`), nhưng số nhà thì không — và số nhà là thứ định
 * danh được một người.
 */
export function coarsenAddress(address: string | null | undefined): string | null {
  if (!address?.trim()) return null;
  const parts = address
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.at(-1) ?? null;
}

/**
 * Thay tên thật bằng nhãn ẩn danh.
 *
 * §16.4: "Tên candidate nên được thay bằng Candidate A, Candidate B trong
 * matching và evaluation." Với Copilot của chính ứng viên thì dùng "Bạn" — tự
 * nhiên hơn trong hội thoại và vẫn không gửi tên thật cho model.
 */
export function anonymizeSelf(fullName: string | null | undefined, text: string): string {
  const name = fullName?.trim();
  if (!name || name.length < 2) return text;

  // Thay cả tên đầy đủ và từng phần tên (>= 2 ký tự) để không sót "Bình" khi
  // tên đầy đủ là "Phan Bình".
  const candidates = [name, ...name.split(/\s+/).filter((part) => part.length >= 2)]
    // Dài trước để không thay phần trước khi thay toàn bộ.
    .sort((left, right) => right.length - left.length);

  return candidates.reduce((accumulated, needle) => {
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return accumulated.replace(new RegExp(escaped, 'gi'), 'Bạn');
  }, text);
}
