import { sanitizeJobPostContent, sanitizeJobPostHtml } from './job-post-content.policy';

describe('sanitizeJobPostHtml', () => {
  describe('chặn thực thi mã', () => {
    it.each([
      ['<script>alert(1)</script>', 'script'],
      ['<img src=x onerror="alert(1)">', 'onerror'],
      ['<iframe src="https://evil.test"></iframe>', 'iframe'],
      ['<svg/onload=alert(1)>', 'onload'],
      ['<object data="evil.swf"></object>', 'object'],
      ['<embed src="evil.swf">', 'embed'],
      ['<p onclick="alert(1)">xin chào</p>', 'onclick'],
      ['<a href="javascript:alert(1)">bấm</a>', 'javascript:'],
      ['<a href="data:text/html;base64,PHNjcmlwdD4=">bấm</a>', 'data:'],
      ['<style>body{display:none}</style>', 'style'],
    ])('loại bỏ %s', (input, forbidden) => {
      expect(sanitizeJobPostHtml(input).toLowerCase()).not.toContain(forbidden.toLowerCase());
    });

    it('bỏ thẻ script nhưng giữ lại phần văn bản hợp lệ xung quanh', () => {
      const output = sanitizeJobPostHtml('<p>Mô tả</p><script>alert(1)</script><p>Yêu cầu</p>');

      expect(output).toContain('<p>Mô tả</p>');
      expect(output).toContain('<p>Yêu cầu</p>');
      expect(output).not.toContain('script');
    });
  });

  describe('giữ nguyên định dạng trình soạn thảo tạo ra', () => {
    it.each([
      '<p>Đoạn văn</p>',
      '<h2>Tiêu đề 2</h2>',
      '<h3>Tiêu đề 3</h3>',
      '<h4>Tiêu đề 4</h4>',
      '<strong>đậm</strong>',
      '<em>nghiêng</em>',
      '<u>gạch chân</u>',
      '<s>gạch ngang</s>',
      '<code>mã</code>',
      '<pre><code>khối mã</code></pre>',
      '<ul><li>gạch đầu dòng</li></ul>',
      '<ol><li>đánh số</li></ol>',
      '<blockquote>trích dẫn</blockquote>',
      '<hr />',
    ])('giữ %s', (input) => {
      // sanitize-html có thể chuẩn hoá thẻ tự đóng, nên so theo tên thẻ chứ không so chuỗi.
      const tag = /<([a-z0-9]+)/.exec(input)![1];
      expect(sanitizeJobPostHtml(input)).toContain(`<${tag}`);
    });
  });

  describe('liên kết', () => {
    it('giữ liên kết http/https/mailto — đây là lý do không dùng lại sanitizeRichText', () => {
      const output = sanitizeJobPostHtml('<a href="https://upnext.works">Trang tuyển dụng</a>');

      expect(output).toContain('href="https://upnext.works"');
      expect(output).toContain('Trang tuyển dụng');
    });

    it('buộc rel="noopener noreferrer" khi mở tab mới', () => {
      const output = sanitizeJobPostHtml('<a href="https://upnext.works" target="_blank">x</a>');

      expect(output).toContain('rel="noopener noreferrer"');
    });

    it('giữ lớp định dạng của trình soạn thảo nhưng bỏ lớp lạ', () => {
      const output = sanitizeJobPostHtml(
        '<a href="https://upnext.works" class="text-emerald-600 fixed inset-0">x</a>',
      );

      expect(output).toContain('text-emerald-600');
      expect(output).not.toContain('fixed');
      expect(output).not.toContain('inset-0');
    });
  });
});

describe('sanitizeJobPostContent', () => {
  it('làm sạch cả ba trường rich text', () => {
    const output = sanitizeJobPostContent({
      description: '<p>Mô tả</p><script>alert(1)</script>',
      requirements: '<img src=x onerror="alert(1)">',
      benefits: '<p onclick="alert(1)">Thưởng</p>',
    });

    expect(output.description).not.toContain('script');
    expect(output.requirements).not.toContain('onerror');
    expect(output.benefits).not.toContain('onclick');
    expect(output.benefits).toContain('Thưởng');
  });

  it('không đụng tới các trường khác', () => {
    const output = sanitizeJobPostContent({
      title: 'Senior Backend Engineer',
      vacanciesCount: 3,
      salaryIsNegotiable: false,
      description: '<p>ok</p>',
    });

    expect(output.title).toBe('Senior Backend Engineer');
    expect(output.vacanciesCount).toBe(3);
    expect(output.salaryIsNegotiable).toBe(false);
  });

  it('bỏ qua trường không gửi thay vì biến thành chuỗi rỗng', () => {
    // `update` nhận DTO một phần. Ghi '' cho `benefits` chưa gửi sẽ xoá dữ liệu
    // recruiter không hề định sửa.
    const output = sanitizeJobPostContent({ description: '<p>chỉ sửa mô tả</p>' });

    expect(output).not.toHaveProperty('requirements');
    expect(output).not.toHaveProperty('benefits');
  });

  it('giữ null nguyên vẹn', () => {
    const output = sanitizeJobPostContent({ requirements: null });

    expect(output.requirements).toBeNull();
  });
});
