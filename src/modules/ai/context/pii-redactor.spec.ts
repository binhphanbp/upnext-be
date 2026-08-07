import { anonymizeSelf, coarsenAddress, redact } from './pii-redactor';

describe('redact', () => {
  it('ẩn email nhưng giữ phần văn bản còn lại', () => {
    const result = redact('Liên hệ: binh.phan@example.com để trao đổi thêm');
    expect(result.text).not.toContain('binh.phan@example.com');
    expect(result.text).toContain('Liên hệ:');
    expect(result.text).toContain('để trao đổi thêm');
    expect(result.removed.emails).toBe(1);
  });

  it('ẩn số điện thoại Việt Nam ở các cách viết khác nhau', () => {
    for (const phone of ['0912345678', '+84912345678', '091 234 5678', '091.234.5678']) {
      const result = redact(`SĐT ${phone} nhé`);
      expect(result.removed.phones).toBeGreaterThanOrEqual(1);
      expect(result.text).not.toContain('345678');
    }
  });

  it('không cắt giữa một dãy số dài không phải số điện thoại', () => {
    // Mã số thuế 10 chữ số không bắt đầu bằng 0 — không được coi là SĐT.
    const result = redact('Mã số thuế 3101234567 của công ty');
    expect(result.removed.phones).toBe(0);
    expect(result.text).toContain('3101234567');
  });

  it('giữ host của liên kết để còn nhận xét được về portfolio', () => {
    const result = redact('Portfolio: https://github.com/someone/private-repo');
    expect(result.text).toContain('github.com');
    expect(result.text).not.toContain('private-repo');
    expect(result.removed.urls).toBe(1);
  });

  it('ẩn ngày sinh', () => {
    const result = redact('Sinh ngày 15/05/1998 tại Hà Nội');
    expect(result.text).not.toContain('15/05/1998');
    expect(result.removed.birthdates).toBe(1);
    expect(result.text).toContain('Hà Nội');
  });

  it('trả về rỗng an toàn với đầu vào null hoặc undefined', () => {
    expect(redact(null).text).toBe('');
    expect(redact(undefined).text).toBe('');
    expect(redact('').removed.emails).toBe(0);
  });

  it('không làm gì với văn bản sạch', () => {
    const clean = 'Backend Developer với NestJS và PostgreSQL, 2 năm kinh nghiệm.';
    const result = redact(clean);
    expect(result.text).toBe(clean);
    expect(Object.values(result.removed).every((count) => count === 0)).toBe(true);
  });
});

describe('coarsenAddress', () => {
  it('chỉ giữ tỉnh/thành, bỏ số nhà và tên đường', () => {
    expect(coarsenAddress('12/3 Nguyễn Trãi, Thanh Xuân, Hà Nội')).toBe('Hà Nội');
  });

  it('giữ nguyên khi địa chỉ chỉ có một thành phần', () => {
    expect(coarsenAddress('Đà Nẵng')).toBe('Đà Nẵng');
  });

  it('trả null với đầu vào rỗng', () => {
    expect(coarsenAddress(null)).toBeNull();
    expect(coarsenAddress('   ')).toBeNull();
  });
});

describe('anonymizeSelf', () => {
  it('thay cả tên đầy đủ và từng phần tên', () => {
    const result = anonymizeSelf(
      'Phan Bình',
      'Phan Bình là backend dev. Bình có 2 năm kinh nghiệm.',
    );
    expect(result).not.toContain('Phan Bình');
    expect(result).not.toContain('Bình');
    expect(result).toContain('backend dev');
  });

  it('không phân biệt chữ hoa chữ thường', () => {
    expect(anonymizeSelf('Nam', 'nam đã làm việc tại đây')).not.toContain('nam');
  });

  it('bỏ qua khi không có tên', () => {
    const text = 'Backend developer';
    expect(anonymizeSelf(null, text)).toBe(text);
    expect(anonymizeSelf('', text)).toBe(text);
    // Tên một ký tự sẽ thay bừa khắp văn bản — cố ý bỏ qua.
    expect(anonymizeSelf('A', text)).toBe(text);
  });

  it('không sập với tên chứa ký tự đặc biệt của regex', () => {
    expect(() => anonymizeSelf('A. B (C)', 'A. B (C) là ứng viên')).not.toThrow();
  });
});
