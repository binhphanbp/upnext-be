/**
 * Biến một file recruiter tải lên thành văn bản thuần, ưu tiên cách rẻ nhất trước.
 *
 * Đọc JD bằng vision model là việc đắt và không cần thiết cho phần lớn file thật:
 * JD hầu hết là PDF export từ Word/Google Docs/Canva/TopCV, tức đã mang sẵn một
 * text layer. Lấy text đó ra là đọc đúng bytes có trong file — chính xác 100% và
 * mất khoảng 90ms — thay vì gửi ảnh từng trang cho model đoán lại.
 *
 * Module này thuần hàm và không phụ thuộc Nest (giống `rich-text.ts`) để chỗ phán
 * đoán "văn bản này có dùng được không" chỉ có một nhà duy nhất. Cùng bộ tiêu chí
 * đó sẽ được dùng lại cho văn bản do OCR sinh ra.
 */
import { PDFParse } from 'pdf-parse';

/**
 * Một trang JD thật đo được 1900–3000 ký tự. Một trang scan có 0 ký tự, hoặc vài
 * ký tự từ dấu trang / con dấu của máy scan ("Page 1 of 2"). Ngưỡng đặt ở 120 vì
 * nó nằm giữa hai bậc độ lớn đó, nên không phụ thuộc vào việc đoán đúng con số.
 */
export const TEXT_LAYER_MIN_LETTERS_PER_PAGE = 120;
export const TEXT_LAYER_MIN_TOTAL_LETTERS = 200;
/** JD không bao giờ 9 trang. Chặn luôn PDF 400 trang gửi lên để đốt CPU. */
export const PDF_MAX_PAGES_READ = 8;

/** Tỉ lệ ký tự "bình thường" tối thiểu — bắt mojibake và rác OCR. */
export const MIN_LETTER_RATIO = 0.55;
/** Độ dài từ trung bình tối thiểu — bắt loại rác vỡ thành từng ký tự rời. */
export const MIN_MEAN_WORD_LENGTH = 2.2;
/** Số từ khoá khác nhau tối thiểu phải xuất hiện để tin đây là một JD. */
export const MIN_KEYWORD_HITS = 3;

/**
 * Rác OCR và mojibake gần như không bao giờ sinh ra được những từ này, còn một JD
 * thật thì sinh ra cả chục. So khớp sau khi bỏ dấu, nên một JD bị OCR làm sai dấu
 * vẫn qua được cổng. Danh sách để ở dạng đã bỏ dấu để khỏi chuẩn hoá hai lần.
 */
const JD_KEYWORDS_VI = [
  'va',
  'cac',
  'voi',
  'kinhnghiem',
  'yeucau',
  'mota',
  'congviec',
  'phucloi',
  'luong',
  'ungvien',
  'kynang',
  'tuyen',
  'nam',
  'ungtuyen',
  'quyenloi',
];
const JD_KEYWORDS_EN = [
  'experience',
  'requirements',
  'responsibilities',
  'benefits',
  'salary',
  'skills',
  'years',
  'qualifications',
  'about',
];

export type PdfTextPage = { num: number; text: string; letters: number };
export type PdfTextResult = { pageCount: number; pages: PdfTextPage[]; text: string };

/** Vì sao PDF không đọc được, để phía service chọn thông điệp cho recruiter. */
export type UnreadablePdfReason = 'password' | 'corrupt';

export class UnreadablePdfError extends Error {
  constructor(readonly reason: UnreadablePdfReason) {
    super(`unreadable pdf: ${reason}`);
    this.name = 'UnreadablePdfError';
  }
}

/**
 * Chỉ đếm chữ và số. `pdf-parse` chèn `\t` làm cell separator, nên một trang chỉ
 * gồm bảng rỗng sẽ có rất nhiều ký tự mà không có nội dung nào; đếm cả dấu câu
 * làm ngưỡng ở trên mất ý nghĩa.
 */
export function countLetters(text: string): number {
  return (text.match(/[\p{L}\p{N}]/gu) ?? []).length;
}

function stripDiacritics(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLocaleLowerCase();
}

/**
 * Văn bản có giống một JD thật hay chỉ là ký tự rác.
 *
 * Đếm ký tự một mình không đủ: một PDF có bảng ToUnicode CMap lỗi sẽ nhả ra
 * mojibake dày đặc, vượt mọi ngưỡng số lượng nhưng vô nghĩa với model. Rác OCR
 * cũng vậy. Phép thử từ khoá là phần rẻ mà thực sự phân biệt được hai thứ.
 */
export function isUsableExtractedText(text: string, minLetters = TEXT_LAYER_MIN_TOTAL_LETTERS) {
  const trimmed = text.trim();
  const letters = countLetters(trimmed);
  if (letters < minLetters) return false;

  const normalCharacters = (trimmed.match(/[\p{L}\p{N}\s]/gu) ?? []).length;
  if (normalCharacters / trimmed.length < MIN_LETTER_RATIO) return false;

  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length && letters / words.length < MIN_MEAN_WORD_LENGTH) return false;

  const haystack = stripDiacritics(trimmed).replace(/[^a-z0-9]+/g, '');
  const hits = new Set<string>();
  for (const keyword of [...JD_KEYWORDS_VI, ...JD_KEYWORDS_EN]) {
    if (haystack.includes(keyword)) hits.add(keyword);
    if (hits.size >= MIN_KEYWORD_HITS) return true;
  }

  return false;
}

/**
 * Có nên dùng text layer này thay cho vision model.
 *
 * Ba điều kiện: đủ tổng ký tự, mật độ trung bình mỗi trang không quá thấp, và nội
 * dung trông giống văn bản thật.
 *
 * Điều kiện mật độ cố ý tính theo **trung bình trên số trang đã đọc**, không phải
 * đếm bao nhiêu trang đạt ngưỡng. Bản đầu dùng cách đếm trang với tỉ lệ 0.6, và đo
 * trên PDF thật thì nó loại oan: một tài liệu 2 trang chỉ có thể ra tỉ lệ 0, 0.5
 * hoặc 1, nên mọi CV/JD hai trang có trang cuối gần trống — layout rất phổ biến —
 * đều bị đẩy sang vision dù text đã đầy đủ. Trung bình xử lý đúng ca đó, đồng thời
 * vẫn loại được ca thật đáng lo: một tài liệu nhiều trang mà chỉ một trang có chữ.
 *
 * Điều kiện văn xuôi là thứ chặn PDF có font mapping lỗi: nó *có* text layer, chỉ
 * là text layer đó vô nghĩa, và khi ấy vision model đọc ảnh trang sẽ tốt hơn.
 */
export function hasUsableTextLayer(result: PdfTextResult): boolean {
  if (!result.pages.length) return false;

  const totalLetters = result.pages.reduce((sum, page) => sum + page.letters, 0);
  if (totalLetters < TEXT_LAYER_MIN_TOTAL_LETTERS) return false;
  if (totalLetters / result.pages.length < TEXT_LAYER_MIN_LETTERS_PER_PAGE) return false;

  return isUsableExtractedText(result.text);
}

/**
 * Đọc text layer của một PDF.
 *
 * pdfjs chạy trên bytes do người ngoài gửi lên và có tiền sử CVE (đáng chú ý
 * CVE-2024-4367, RCE qua font khi `isEvalSupported` bật). Ba tuỳ chọn dưới đây
 * tắt hết các đường đó, `first` chặn PDF nhiều trang, và `destroy()` luôn chạy
 * để không giữ worker lại.
 */
export async function extractPdfText(
  buffer: Buffer,
  options: { maxPages?: number } = {},
): Promise<PdfTextResult> {
  const parser = new PDFParse({
    data: new Uint8Array(buffer),
    isEvalSupported: false,
    disableFontFace: true,
    useSystemFonts: false,
  });

  try {
    const result = await parser.getText({ first: options.maxPages ?? PDF_MAX_PAGES_READ });
    const pages = (result.pages ?? []).map((page) => ({
      num: page.num,
      text: page.text,
      letters: countLetters(page.text),
    }));

    return { pageCount: result.total ?? pages.length, pages, text: result.text ?? '' };
  } catch (error) {
    throw classifyPdfError(error);
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}

/**
 * Phân loại lỗi pdfjs theo `name`, **không** theo `instanceof`.
 *
 * pdfjs được ship ở dạng đã minify, nên `error.constructor.name` là những chuỗi
 * như `hr`; chỉ `error.name` còn giữ đúng `InvalidPDFException` / `PasswordException`.
 * Hai lỗi đó là do file của recruiter nên đáng báo lại cho họ sửa; mọi lỗi khác
 * được trả về nguyên trạng để phía gọi rơi xuống đường vision, thay vì làm chết
 * một endpoint vốn đang chạy tốt vì một bug của thư viện đọc PDF.
 */
export function classifyPdfError(error: unknown): unknown {
  if (!(error instanceof Error)) return error;
  if (error.name === 'PasswordException') return new UnreadablePdfError('password');
  if (error.name === 'InvalidPDFException') return new UnreadablePdfError('corrupt');
  return error;
}
