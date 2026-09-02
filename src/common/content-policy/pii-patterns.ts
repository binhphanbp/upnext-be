/**
 * Mẫu nhận dạng thông tin liên hệ / định danh, dùng chung cho hai việc **khác
 * nhau** và không được lẫn:
 *
 * - **Redaction** (`modules/ai/context/pii-redactor.ts`): che dữ liệu trước khi
 *   gửi cho model. Đầu vào là văn bản của hệ thống, mục tiêu là *giảm thiểu*.
 * - **Blocking** (`contact-exchange.ts`, sẽ thêm ở PR sau): từ chối tin nhắn do
 *   người dùng tự gõ *trước khi lưu*. Mục tiêu là chặn, và tuyệt đối không được
 *   âm thầm sửa nội dung của người dùng.
 *
 * Vì sao là factory chứ không phải hằng regex: cờ `g` mang trạng thái
 * `lastIndex`. Một regex `/g` ở module scope chia sẻ giữa hai consumer sẽ cho
 * kết quả sai ngay khi một bên dùng `.exec()`/`.test()` trong vòng lặp — bên
 * kia bắt đầu quét từ giữa chuỗi. Trả về instance mới mỗi lần gọi làm lỗi đó
 * không thể xảy ra, và chi phí là không đáng kể so với một lượt `.replace()`.
 */

/**
 * Email. Ký tự chữ Unicode — `\w` của JS chỉ hiểu ASCII nên vô dụng với tiếng
 * Việt.
 */
export const emailPattern = () => /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/**
 * Số điện thoại Việt Nam: 0xxxxxxxxx / +84xxxxxxxxx, cho phép dấu cách, chấm,
 * gạch ngang, ngoặc giữa các nhóm. Yêu cầu ranh giới không-phải-chữ-số ở hai
 * đầu để không cắt giữa một dãy số dài (mã số thuế, số hợp đồng).
 */
export const phoneVnPattern = () => /(?<![\d])(?:\+?84|0)(?:[\s.\-()]?\d){8,10}(?![\d])/g;

/**
 * Số quốc tế ở định dạng E.164 (có thể được người dùng viết kèm khoảng trắng,
 * dấu chấm, gạch ngang hoặc ngoặc). Candidate profile đã hỗ trợ số quốc tế; vì
 * vậy chỉ lọc `phoneVnPattern` sẽ làm lộ số như `+1 (415) 555-2671` trong CV.
 *
 * E.164 giới hạn tối đa 15 chữ số. Mẫu yêu cầu tối thiểu 8 chữ số để không che
 * nhầm phép tính hoặc mã ngắn có dấu `+`.
 */
export const phoneE164Pattern = () =>
  /(?<![\p{L}\p{N}])\+(?:\d[\s.\-()]*){7,14}\d(?![\p{L}\p{N}])/gu;

/**
 * URL có scheme.
 *
 * Tên có hậu tố `Pattern` vì `URL` trần sẽ che constructor `URL` toàn cục và
 * làm `new URL(...)` ở nơi dùng không compile — lỗi này TypeScript báo ở dòng
 * khác hẳn nơi gây ra nó.
 *
 * Lưu ý phạm vi: mẫu này **không** bắt URL không có scheme (`github.com/me`,
 * `www.x.io`). Với redaction đó là chấp nhận được. Với blocking thì không, và
 * đó là việc của rule `URL_SCHEMELESS` riêng — đừng nới mẫu này ra để phục vụ
 * blocking, vì nới sẽ làm `redact()` che nhầm `Node.js` hay `asp.net`.
 */
export const urlPattern = () => /https?:\/\/[^\s<>"')]+/g;

/** Ngày sinh dạng dd/mm/yyyy hoặc dd-mm-yyyy. §1.3 cấm dùng để xếp hạng. */
export const birthdatePattern = () =>
  /(?<![\d])(?:0?[1-9]|[12]\d|3[01])[/-](?:0?[1-9]|1[0-2])[/-](?:19|20)\d{2}(?![\d])/g;
