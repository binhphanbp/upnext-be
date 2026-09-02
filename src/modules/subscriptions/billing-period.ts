/**
 * Suy ra cửa sổ counter theo tháng cho một subscription.
 *
 * `AI_TALENT_DISCOVERY_ROLLOUT_PLAN.md` §1 và §8: hạn mức metered phải reset
 * theo **tháng** kể cả khi công ty thanh toán theo năm, và backend phải trả
 * `periodEnd` để UI hiển thị đúng **ngày** reset thay vì một câu "30 ngày" mơ hồ.
 *
 * ## Vì sao suy ra (lazy) chứ không phải một cron
 *
 * `SubscriptionQuotaCounter` unique theo `(companySubscriptionId, feature,
 * periodStart)`, nên **một cửa sổ mới tự khắc là một dòng counter mới** — không
 * cần hạ tầng gì thêm, và chính comment của model đã ghi ý định đó ("A new
 * period is a new row, so resetting allowances needs no scheduled job").
 *
 * Một cron sẽ là nguồn sự thật thứ hai trong một codebase chưa có distributed
 * lock nào: cờ `running` của `OutboxProcessorService` chỉ có phạm vi một
 * process. Một lần cron chạy muộn cho phép công ty tiếp tục rút hạn mức của
 * tháng trước; một lần chạy hai lần thì reset hai lần. Hàm thuần thì không có
 * chế độ lỗi nào cả và test được mà không cần DB.
 *
 * ## Tính chất quan trọng nhất
 *
 * Với plan 30 ngày (tức mọi plan đang bán), `anchor === currentPeriodStart` và
 * `n = 0`, nên `resolveMonthlyWindow` trả về **đúng** `periodStart` mà
 * `resolvePeriod` trả về hôm nay ⇒ **cùng một dòng counter**. Không cần migration
 * dữ liệu, không có counter mồ côi. Một cửa sổ thứ hai chỉ xuất hiện khi có ai
 * bán một gói dài hơn 30 ngày. Đây là assertion quan trọng nhất trong spec.
 */

export type BillingWindow = {
  periodStart: Date;
  periodEnd: Date;
};

/**
 * Cộng `months` tháng, kẹp về ngày cuối tháng khi ngày gốc không tồn tại.
 *
 * `new Date(2026, 0, 31)` cộng một tháng bằng cách đặt month = 1 sẽ cho ra
 * 2026-03-03 (JS tự tràn sang tháng sau), tức chu kỳ của một người neo ngày 31
 * sẽ **trôi** dần và tháng Hai của họ biến mất. Kẹp về 28/29 giữ mốc neo ổn
 * định qua mọi tháng.
 */
export function addMonthsClamped(date: Date, months: number): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + months;
  const day = date.getUTCDate();

  // Ngày 0 của tháng kế = ngày cuối của tháng đích.
  const lastDayOfTargetMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  return new Date(
    Date.UTC(
      year,
      month,
      Math.min(day, lastDayOfTargetMonth),
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
      date.getUTCMilliseconds(),
    ),
  );
}

/** Số tháng **trọn** đã trôi qua giữa hai mốc, theo cùng quy tắc kẹp ngày. */
export function wholeMonthsBetween(anchor: Date, now: Date): number {
  if (now <= anchor) return 0;

  const rough =
    (now.getUTCFullYear() - anchor.getUTCFullYear()) * 12 +
    (now.getUTCMonth() - anchor.getUTCMonth());

  // Điều chỉnh một bước: nếu mốc neo trong tháng hiện tại còn ở tương lai thì
  // tháng đó chưa trọn. So bằng `addMonthsClamped` chứ không so ngày-trong-tháng
  // để một mốc neo ngày 31 được đối xử nhất quán.
  return addMonthsClamped(anchor, rough) > now ? Math.max(0, rough - 1) : rough;
}

/**
 * Cửa sổ tháng đang chứa `now`.
 *
 * `periodEnd` bị kẹp bởi `expiredAt`: cửa sổ cuối của một gói không được kéo dài
 * quá hạn của chính gói đó, nếu không UI sẽ hiển thị một ngày reset nằm sau ngày
 * subscription hết hiệu lực.
 */
export function resolveMonthlyWindow(anchor: Date, expiredAt: Date, now: Date): BillingWindow {
  // Kẹp `now` vào `expiredAt` trước khi đếm tháng.
  //
  // Không kẹp thì một subscription đã quá hạn sinh ra một cửa sổ nằm **sau**
  // ngày hết hạn của chính nó: gói 31/07 → 30/08, đọc vào 02/09 sẽ cho
  // `periodStart = 31/08`. Đó là một dòng counter cho một cửa sổ chưa từng tồn
  // tại, và nó phá luôn tính chất quan trọng nhất của thiết kế này — gói 30
  // ngày phải cho ra **đúng** `periodStart` mà `resolvePeriod` cũ cho ra.
  //
  // `resolveActiveSubscription` đã reconcile gói quá hạn trước khi tới đây, nên
  // trường hợp này lẽ ra không xảy ra. Nhưng "lẽ ra không xảy ra" không phải
  // một bảo đảm, và cái giá của việc kẹp là một phép so sánh.
  const effectiveNow = now < expiredAt ? now : expiredAt;

  let elapsed = wholeMonthsBetween(anchor, effectiveNow);

  // Cửa sổ phải **chứa được** thời gian. Đọc đúng vào thời điểm `expiredAt` của
  // một gói năm cho `elapsed = 12` và `periodStart = expiredAt` — một khoảng
  // rỗng. Nó tệ hơn vẻ ngoài: `reverse()` định vị counter bằng
  // `periodStart <= usage.createdAt < periodEnd`, nên một khoảng rỗng không bao
  // giờ khớp và **quota đã trừ sẽ không hoàn lại được**.
  //
  // Lùi về cửa sổ cuối cùng thực sự tồn tại. `while` bị chặn bởi chính `elapsed`
  // nên không thể lặp vô hạn.
  while (elapsed > 0 && addMonthsClamped(anchor, elapsed) >= expiredAt) {
    elapsed -= 1;
  }

  const periodStart = elapsed === 0 ? anchor : addMonthsClamped(anchor, elapsed);
  const naturalEnd = addMonthsClamped(anchor, elapsed + 1);

  return {
    periodStart,
    periodEnd: naturalEnd < expiredAt ? naturalEnd : expiredAt,
  };
}
