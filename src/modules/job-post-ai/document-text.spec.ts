/**
 * `extractPdfText` không chạy thật được dưới Jest: pdfjs dựng worker bằng dynamic
 * import, mà VM CJS của Jest từ chối ("A dynamic import callback was invoked
 * without --experimental-vm-modules"). Runtime Node thật thì bình thường — đã đo
 * 27–114ms trên PDF tiếng Việt thật, dấu chính xác tuyệt đối — nên đây là giới hạn
 * của test runner, không phải của production.
 *
 * Vì vậy: `pdf-parse` được mock để test phần đấu dây (cờ bảo mật, giới hạn trang,
 * giải phóng worker), còn phần có phán đoán thật (`classifyPdfError`,
 * `isUsableExtractedText`, `hasUsableTextLayer`) được test trực tiếp bằng chuỗi.
 */
const pdfParseMock = {
  options: jest.fn(),
  getText: jest.fn(),
  destroy: jest.fn(),
};

jest.mock('pdf-parse', () => ({
  PDFParse: class {
    constructor(options: unknown) {
      pdfParseMock.options(options);
    }

    getText(options: unknown): Promise<unknown> {
      return pdfParseMock.getText(options) as Promise<unknown>;
    }

    destroy(): Promise<void> {
      return pdfParseMock.destroy() as Promise<void>;
    }
  },
}));

import {
  MIN_KEYWORD_HITS,
  PdfTextResult,
  TEXT_LAYER_MIN_LETTERS_PER_PAGE,
  UnreadablePdfError,
  classifyPdfError,
  countLetters,
  extractPdfText,
  hasUsableTextLayer,
  isUsableExtractedText,
} from './document-text';

/** Một đoạn JD tiếng Việt thật, đủ để vượt mọi ngưỡng. */
const REAL_JD_VI = `
Mô tả công việc
Chúng tôi đang tuyển Backend Engineer cho đội sản phẩm tại Hà Nội.
Ứng viên sẽ phát triển API bằng NestJS, làm việc với PostgreSQL và Redis.

Yêu cầu
- Tối thiểu 2 năm kinh nghiệm với Node.js hoặc NestJS
- Thành thạo SQL, hiểu về indexing và query plan
- Kỹ năng giao tiếp tốt, chủ động trong công việc

Quyền lợi
- Mức lương 20.000.000 - 30.000.000 VND, thương lượng theo năng lực
- Phúc lợi đầy đủ theo quy định, review lương hai lần mỗi năm
`;

const REAL_JD_EN = `
Job description
We are hiring a Backend Engineer for our product team.
Responsibilities include building APIs and owning the data layer.

Requirements
- At least 2 years of experience with Node.js
- Strong SQL skills and an understanding of query plans

Benefits
- Competitive salary reviewed twice a year
- Qualifications recognised with a clear promotion path
`;

function page(num: number, text: string) {
  return { num, text, letters: countLetters(text) };
}

function result(pages: Array<{ num: number; text: string; letters: number }>): PdfTextResult {
  return { pageCount: pages.length, pages, text: pages.map((item) => item.text).join('\n') };
}

describe('countLetters', () => {
  it('chỉ đếm chữ và số, không đếm dấu câu hay khoảng trắng', () => {
    expect(countLetters('abc 123')).toBe(6);
    expect(countLetters('--- ... \t\n')).toBe(0);
  });

  it('đếm đúng chữ tiếng Việt có dấu', () => {
    expect(countLetters('Đại An, Văn Quán')).toBe(12);
  });

  it('không tính \\t mà pdf-parse chèn làm cell separator', () => {
    // Một trang chỉ gồm bảng rỗng: rất nhiều ký tự, không nội dung nào.
    expect(countLetters('\t'.repeat(500))).toBe(0);
  });
});

describe('isUsableExtractedText', () => {
  it('nhận một JD tiếng Việt thật', () => {
    expect(isUsableExtractedText(REAL_JD_VI)).toBe(true);
  });

  it('nhận một JD tiếng Anh qua stoplist tiếng Anh', () => {
    expect(isUsableExtractedText(REAL_JD_EN)).toBe(true);
  });

  it('nhận JD tiếng Việt đã bị OCR làm sai dấu', () => {
    // Đây là lý do phép so khớp bỏ dấu: nội dung vẫn đúng, chỉ dấu bị sập.
    const mangled = REAL_JD_VI.normalize('NFD').replace(/[̀-ͯ]/g, '');
    expect(isUsableExtractedText(mangled)).toBe(true);
  });

  it('từ chối chuỗi rỗng', () => {
    expect(isUsableExtractedText('')).toBe(false);
    expect(isUsableExtractedText('   \n\t  ')).toBe(false);
  });

  it('từ chối một đoạn quá ngắn dù là văn bản thật', () => {
    expect(isUsableExtractedText('Tuyển Backend Engineer, yêu cầu 2 năm kinh nghiệm.')).toBe(false);
  });

  it('từ chối rác OCR dạng ký tự nhiễu dù dài', () => {
    expect(isUsableExtractedText('l1I|/\\ '.repeat(120))).toBe(false);
  });

  it('từ chối mojibake dày đặc từ PDF có font mapping lỗi', () => {
    // Ca mà đếm ký tự một mình không bắt được: rất nhiều "chữ", hoàn toàn vô nghĩa.
    expect(isUsableExtractedText('ÐÑÒÓÔÕÖ×ØÙÚÛÜÝÞß'.repeat(40))).toBe(false);
  });

  it('từ chối văn bản dài nhưng không phải JD', () => {
    const notAJd = 'Hợp đồng thuê nhà số 17 giữa bên A và bên B. '.repeat(20);
    expect(MIN_KEYWORD_HITS).toBeGreaterThan(1);
    expect(isUsableExtractedText(notAJd)).toBe(false);
  });

  it('từ chối rác vỡ thành từng ký tự rời', () => {
    expect(isUsableExtractedText('a b c d e f g h i j '.repeat(60))).toBe(false);
  });
});

describe('hasUsableTextLayer', () => {
  const richPage = (num: number) => page(num, REAL_JD_VI);

  it('nhận PDF nhiều trang có text layer đầy đủ', () => {
    expect(hasUsableTextLayer(result([richPage(1), richPage(2)]))).toBe(true);
  });

  it('từ chối PDF scan không có ký tự nào', () => {
    expect(hasUsableTextLayer(result([page(1, ''), page(2, '')]))).toBe(false);
  });

  it('từ chối trang scan chỉ có con dấu của máy scan', () => {
    // Fixture làm cho ngưỡng 120 không võ đoán: 12 ký tự, thấp hơn hai bậc độ lớn
    // so với một trang thật (đo được 1900–3000).
    const stamped = page(1, 'Page 1 of 2');
    expect(stamped.letters).toBeLessThan(TEXT_LAYER_MIN_LETTERS_PER_PAGE);
    expect(hasUsableTextLayer(result([stamped, page(2, 'Page 2 of 2')]))).toBe(false);
  });

  it('vẫn đi đường rẻ khi chỉ trang bìa là scan', () => {
    expect(hasUsableTextLayer(result([page(1, ''), richPage(2), richPage(3)]))).toBe(true);
  });

  it('vẫn đi đường rẻ khi tài liệu 2 trang có trang cuối gần trống', () => {
    // Ca này đo được trên PDF thật và là lý do luật đếm-trang bị thay bằng trung
    // bình: text đã đầy đủ, nhưng đếm trang cho tỉ lệ 0.5 nên loại oan.
    expect(hasUsableTextLayer(result([richPage(1), page(2, 'Trang 2')]))).toBe(true);
  });

  it('từ chối tài liệu nhiều trang mà chỉ một trang có chữ', () => {
    // Đây mới là ca thật đáng lo: đi đường text-layer sẽ bỏ mất phần lớn nội dung.
    const pages = [richPage(1), ...Array.from({ length: 7 }, (_, index) => page(index + 2, ''))];
    expect(hasUsableTextLayer(result(pages))).toBe(false);
  });

  it('từ chối PDF có text layer dày nhưng là mojibake', () => {
    const garbled = page(1, 'ÐÑÒÓÔÕÖ×ØÙÚÛÜÝÞß'.repeat(40));
    expect(garbled.letters).toBeGreaterThan(TEXT_LAYER_MIN_LETTERS_PER_PAGE);
    expect(hasUsableTextLayer(result([garbled]))).toBe(false);
  });

  it('từ chối kết quả không có trang nào', () => {
    expect(hasUsableTextLayer({ pageCount: 0, pages: [], text: '' })).toBe(false);
  });
});

describe('classifyPdfError', () => {
  function pdfjsError(name: string) {
    const error = new Error(`${name} raised`);
    error.name = name;
    return error;
  }

  it('nhận diện PDF đặt mật khẩu', () => {
    expect(classifyPdfError(pdfjsError('PasswordException'))).toMatchObject({
      name: 'UnreadablePdfError',
      reason: 'password',
    });
  });

  it('nhận diện PDF hỏng', () => {
    expect(classifyPdfError(pdfjsError('InvalidPDFException'))).toMatchObject({
      name: 'UnreadablePdfError',
      reason: 'corrupt',
    });
  });

  it('dựa vào name chứ không dựa vào constructor', () => {
    // pdfjs đã minify: constructor thật là những tên như `hr`. Nếu phân loại bằng
    // instanceof thì mọi PDF hỏng sẽ âm thầm rơi xuống đường vision thay vì báo
    // cho recruiter biết file của họ lỗi.
    class Hr extends Error {}
    const error = new Hr('Invalid PDF structure.');
    error.name = 'InvalidPDFException';
    expect(classifyPdfError(error)).toBeInstanceOf(UnreadablePdfError);
  });

  it('trả nguyên trạng lỗi lạ để phía gọi rơi xuống đường vision', () => {
    const unexpected = new TypeError('worker setup blew up');
    expect(classifyPdfError(unexpected)).toBe(unexpected);
  });

  it('trả nguyên trạng giá trị không phải Error', () => {
    expect(classifyPdfError('nope')).toBe('nope');
  });
});

describe('extractPdfText', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    pdfParseMock.destroy.mockResolvedValue(undefined);
  });

  it('tắt mọi đường thực thi mã của pdfjs và giới hạn số trang', async () => {
    pdfParseMock.getText.mockResolvedValue({
      total: 2,
      pages: [{ num: 1, text: REAL_JD_VI }],
      text: REAL_JD_VI,
    });

    await extractPdfText(Buffer.from('%PDF-1.7'), { maxPages: 3 });

    // CVE-2024-4367 là RCE qua font khi isEvalSupported bật. Ba cờ này phải đóng
    // vì pdfjs đang chạy trên bytes do người ngoài tải lên, ngay trong process.
    expect(pdfParseMock.options).toHaveBeenCalledWith(
      expect.objectContaining({
        isEvalSupported: false,
        disableFontFace: true,
        useSystemFonts: false,
      }),
    );
    expect(pdfParseMock.getText).toHaveBeenCalledWith({ first: 3 });
  });

  it('mặc định chỉ đọc 8 trang đầu', async () => {
    pdfParseMock.getText.mockResolvedValue({ total: 400, pages: [], text: '' });

    await extractPdfText(Buffer.from('%PDF-1.7'));

    expect(pdfParseMock.getText).toHaveBeenCalledWith({ first: 8 });
  });

  it('đếm ký tự cho từng trang', async () => {
    pdfParseMock.getText.mockResolvedValue({
      total: 2,
      pages: [
        { num: 1, text: REAL_JD_VI },
        { num: 2, text: '' },
      ],
      text: REAL_JD_VI,
    });

    const extracted = await extractPdfText(Buffer.from('%PDF-1.7'));

    expect(extracted.pageCount).toBe(2);
    expect(extracted.pages[0]?.letters).toBeGreaterThan(TEXT_LAYER_MIN_LETTERS_PER_PAGE);
    expect(extracted.pages[1]?.letters).toBe(0);
  });

  it('luôn giải phóng worker, kể cả khi đọc lỗi', async () => {
    const failure = new Error('Invalid PDF structure.');
    failure.name = 'InvalidPDFException';
    pdfParseMock.getText.mockRejectedValue(failure);

    await expect(extractPdfText(Buffer.from('%PDF-1.7'))).rejects.toBeInstanceOf(
      UnreadablePdfError,
    );
    expect(pdfParseMock.destroy).toHaveBeenCalledTimes(1);
  });

  it('không che kết quả đọc được bằng một lỗi khi giải phóng worker', async () => {
    pdfParseMock.getText.mockResolvedValue({ total: 1, pages: [], text: '' });
    pdfParseMock.destroy.mockRejectedValue(new Error('destroy failed'));

    await expect(extractPdfText(Buffer.from('%PDF-1.7'))).resolves.toMatchObject({ pageCount: 1 });
  });
});
