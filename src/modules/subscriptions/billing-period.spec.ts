import { addMonthsClamped, resolveMonthlyWindow, wholeMonthsBetween } from './billing-period';

const utc = (iso: string) => new Date(iso);

describe('billing-period', () => {
  describe('addMonthsClamped', () => {
    it('cộng tháng bình thường', () => {
      expect(addMonthsClamped(utc('2026-01-15T00:00:00.000Z'), 1).toISOString()).toBe(
        '2026-02-15T00:00:00.000Z',
      );
    });

    it.each([
      ['31/01 + 1 tháng ⇒ 28/02 (năm thường)', '2026-01-31T00:00:00.000Z', 1, '2026-02-28'],
      ['31/01 + 1 tháng ⇒ 29/02 (năm nhuận)', '2028-01-31T00:00:00.000Z', 1, '2028-02-29'],
      ['31/03 + 1 tháng ⇒ 30/04', '2026-03-31T00:00:00.000Z', 1, '2026-04-30'],
      ['30/01 + 1 tháng ⇒ 28/02', '2026-01-30T00:00:00.000Z', 1, '2026-02-28'],
    ])('%s', (_label, from, months, expectedDate) => {
      // `new Date(2026,0,31)` đặt month=1 sẽ tràn sang 03/03 và làm chu kỳ của
      // một người neo ngày 31 trôi dần, đồng thời tháng Hai của họ biến mất.
      expect(addMonthsClamped(utc(from), months).toISOString().slice(0, 10)).toBe(expectedDate);
    });

    it('không mất giờ/phút/giây khi kẹp ngày', () => {
      expect(addMonthsClamped(utc('2026-01-31T13:45:07.123Z'), 1).toISOString()).toBe(
        '2026-02-28T13:45:07.123Z',
      );
    });

    it('cộng 12 tháng trở về đúng ngày năm sau', () => {
      expect(addMonthsClamped(utc('2026-05-10T00:00:00.000Z'), 12).toISOString()).toBe(
        '2027-05-10T00:00:00.000Z',
      );
    });

    it('vượt biên năm', () => {
      expect(addMonthsClamped(utc('2026-11-15T00:00:00.000Z'), 3).toISOString()).toBe(
        '2027-02-15T00:00:00.000Z',
      );
    });
  });

  describe('wholeMonthsBetween', () => {
    it.each([
      ['cùng thời điểm', '2026-01-15T00:00:00.000Z', 0],
      ['trước mốc neo', '2026-01-01T00:00:00.000Z', 0],
      ['29 ngày sau (chưa trọn tháng)', '2026-02-13T00:00:00.000Z', 0],
      ['đúng một tháng', '2026-02-15T00:00:00.000Z', 1],
      ['một tháng thiếu một giây', '2026-02-14T23:59:59.000Z', 0],
      ['gần hai tháng', '2026-03-14T00:00:00.000Z', 1],
      ['đúng hai tháng', '2026-03-15T00:00:00.000Z', 2],
      ['một năm', '2027-01-15T00:00:00.000Z', 12],
    ])('mốc neo 15/01/2026, %s ⇒ %s tháng', (_label, now, expected) => {
      expect(wholeMonthsBetween(utc('2026-01-15T00:00:00.000Z'), utc(now))).toBe(expected);
    });

    it('mốc neo ngày 31: 28/02 là đã trọn một tháng, không phải chưa', () => {
      // Nếu so bằng ngày-trong-tháng thì 28 < 31 sẽ bị coi là chưa trọn tháng, và
      // ứng viên neo ngày 31 sẽ mất một chu kỳ mỗi tháng ngắn.
      expect(
        wholeMonthsBetween(utc('2026-01-31T00:00:00.000Z'), utc('2026-02-28T00:00:00.000Z')),
      ).toBe(1);
    });
  });

  describe('resolveMonthlyWindow', () => {
    it('PLAN 30 NGÀY: n=0 nên periodStart TRÙNG mốc neo — cùng một dòng counter', () => {
      // Assertion quan trọng nhất của cả PR này. Mọi plan đang bán đều
      // `durationDays = 30`, nên hàm mới phải trả về đúng giá trị mà
      // `resolvePeriod` cũ trả về. Nếu test này đỏ thì thay đổi đã tạo counter
      // mới cho các subscription đang chạy, tức reset hạn mức của khách hàng
      // thật giữa chu kỳ.
      const startedAt = utc('2026-09-01T00:00:00.000Z');
      const expiredAt = utc('2026-10-01T00:00:00.000Z');

      const window = resolveMonthlyWindow(startedAt, expiredAt, utc('2026-09-20T10:00:00.000Z'));

      expect(window.periodStart.toISOString()).toBe(startedAt.toISOString());
      expect(window.periodEnd.toISOString()).toBe(expiredAt.toISOString());
    });

    it('GÓI NĂM: 12 cửa sổ riêng biệt', () => {
      const startedAt = utc('2026-01-15T00:00:00.000Z');
      const expiredAt = utc('2027-01-15T00:00:00.000Z');

      const starts = new Set<string>();
      for (let month = 0; month < 12; month += 1) {
        const now = addMonthsClamped(startedAt, month);
        starts.add(resolveMonthlyWindow(startedAt, expiredAt, now).periodStart.toISOString());
      }

      expect(starts.size).toBe(12);
    });

    it('GÓI NĂM: cửa sổ tháng thứ ba đúng mốc đầu và cuối', () => {
      const startedAt = utc('2026-01-15T00:00:00.000Z');
      const expiredAt = utc('2027-01-15T00:00:00.000Z');

      const window = resolveMonthlyWindow(startedAt, expiredAt, utc('2026-03-20T00:00:00.000Z'));

      expect(window.periodStart.toISOString()).toBe('2026-03-15T00:00:00.000Z');
      expect(window.periodEnd.toISOString()).toBe('2026-04-15T00:00:00.000Z');
    });

    it('kẹp periodEnd ở expiredAt để UI không hiện ngày reset sau khi gói đã hết', () => {
      const startedAt = utc('2026-01-15T00:00:00.000Z');
      // Gói kết thúc giữa cửa sổ tháng cuối.
      const expiredAt = utc('2026-02-05T00:00:00.000Z');

      const window = resolveMonthlyWindow(startedAt, expiredAt, utc('2026-01-20T00:00:00.000Z'));

      expect(window.periodEnd.toISOString()).toBe(expiredAt.toISOString());
    });

    it('mốc neo ngày 31 trên gói năm: mọi cửa sổ đều kẹp đúng, mốc neo không trôi', () => {
      const startedAt = utc('2026-01-31T00:00:00.000Z');
      const expiredAt = utc('2027-01-31T00:00:00.000Z');

      // Tháng Hai
      expect(
        resolveMonthlyWindow(startedAt, expiredAt, utc('2026-03-01T00:00:00.000Z'))
          .periodStart.toISOString()
          .slice(0, 10),
      ).toBe('2026-02-28');
      // Tháng Ba phải trở lại ngày 31, KHÔNG kế thừa 28 của tháng trước.
      expect(
        resolveMonthlyWindow(startedAt, expiredAt, utc('2026-04-05T00:00:00.000Z'))
          .periodStart.toISOString()
          .slice(0, 10),
      ).toBe('2026-03-31');
    });

    it('quá hạn: KHÔNG sinh cửa sổ nằm sau expiredAt', () => {
      // Bug thật, do assertion "gói 30 ngày dùng cùng dòng counter" bắt được.
      // Gói 31/07 -> 30/08, đọc vào 02/09 mà không kẹp `now` sẽ cho
      // `periodStart = 31/08` -- một cửa sổ chưa từng tồn tại.
      const startedAt = utc('2026-07-31T00:00:00.000Z');
      const expiredAt = utc('2026-08-30T00:00:00.000Z');

      const window = resolveMonthlyWindow(startedAt, expiredAt, utc('2026-09-02T00:00:00.000Z'));

      expect(window.periodStart.toISOString()).toBe(startedAt.toISOString());
      expect(window.periodEnd.toISOString()).toBe(expiredAt.toISOString());
      expect(window.periodStart.getTime()).toBeLessThan(expiredAt.getTime());
    });

    it('quá hạn trên gói năm: dừng ở cửa sổ cuối cùng thực sự tồn tại', () => {
      const startedAt = utc('2026-01-15T00:00:00.000Z');
      const expiredAt = utc('2027-01-15T00:00:00.000Z');

      const window = resolveMonthlyWindow(startedAt, expiredAt, utc('2027-06-01T00:00:00.000Z'));

      expect(window.periodStart.toISOString()).toBe('2026-12-15T00:00:00.000Z');
      expect(window.periodEnd.toISOString()).toBe(expiredAt.toISOString());
    });

    it('cửa sổ trả về LUÔN chứa được thời gian — periodStart < periodEnd', () => {
      // `reverse()` định vị counter bằng `periodStart <= createdAt < periodEnd`.
      // Một khoảng rỗng không bao giờ khớp, nên quota đã trừ sẽ không hoàn lại
      // được. Quét nhiều mốc để bắt cả các trường hợp biên.
      const cases: Array<[string, string, string]> = [
        ['2026-01-15T00:00:00.000Z', '2027-01-15T00:00:00.000Z', '2027-01-15T00:00:00.000Z'],
        ['2026-01-15T00:00:00.000Z', '2027-01-15T00:00:00.000Z', '2030-01-01T00:00:00.000Z'],
        ['2026-07-31T00:00:00.000Z', '2026-08-30T00:00:00.000Z', '2026-09-02T00:00:00.000Z'],
        ['2026-01-31T00:00:00.000Z', '2026-02-28T00:00:00.000Z', '2026-03-15T00:00:00.000Z'],
        ['2026-01-15T00:00:00.000Z', '2026-01-20T00:00:00.000Z', '2026-01-16T00:00:00.000Z'],
      ];

      for (const [anchorIso, expiredIso, nowIso] of cases) {
        const window = resolveMonthlyWindow(utc(anchorIso), utc(expiredIso), utc(nowIso));
        expect(window.periodStart.getTime()).toBeLessThan(window.periodEnd.getTime());
        expect(window.periodStart.getTime()).toBeLessThan(utc(expiredIso).getTime());
      }
    });

    it('thời điểm trước mốc neo trả về đúng cửa sổ đầu tiên', () => {
      const startedAt = utc('2026-06-01T00:00:00.000Z');
      const expiredAt = utc('2027-06-01T00:00:00.000Z');

      const window = resolveMonthlyWindow(startedAt, expiredAt, utc('2026-05-01T00:00:00.000Z'));

      expect(window.periodStart.toISOString()).toBe(startedAt.toISOString());
    });

    it('hai lần gọi ở hai thời điểm trong cùng tháng cho cùng một cửa sổ', () => {
      // Đây là điều khiến counter được tái dùng đúng thay vì mỗi request tạo một
      // dòng mới.
      const startedAt = utc('2026-01-15T00:00:00.000Z');
      const expiredAt = utc('2027-01-15T00:00:00.000Z');

      const first = resolveMonthlyWindow(startedAt, expiredAt, utc('2026-03-16T01:00:00.000Z'));
      const second = resolveMonthlyWindow(startedAt, expiredAt, utc('2026-04-14T23:00:00.000Z'));

      expect(second.periodStart.toISOString()).toBe(first.periodStart.toISOString());
    });
  });
});
