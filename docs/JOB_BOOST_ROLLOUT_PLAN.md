# Kế hoạch triển khai Job Boost

> Trạng thái: sẵn sàng triển khai
>
> Phạm vi: `upnext-be`, `upnext-frontend`, dữ liệu cấu hình staging và quy trình phát hành.
>
> Mục tiêu: biến Job Boost từ phần khung backend thành quyền lợi gói dịch vụ có thể mua, có tác dụng tăng tiếp cận thực tế, minh bạch với candidate và đo lường được hiệu quả.

## 1. Quyết định sản phẩm cần giữ cố định

Job Boost là **vị trí tuyển dụng được tài trợ trong 7 ngày**, không phải quyền được thay thế hoàn toàn kết quả phù hợp tự nhiên.

| Chính sách | Quyết định triển khai |
| --- | --- |
| Gói Free | 1 lượt Boost / chu kỳ 30 ngày để trải nghiệm giá trị thực tế. |
| Gói Pro | 10 lượt Boost / chu kỳ 30 ngày. |
| Đơn vị tiêu | 1 lượt = 1 tin được tài trợ tối đa 7 ngày. |
| Cộng dồn | Không cộng dồn credit qua chu kỳ hoặc sau khi gói hết hạn. |
| Phạm vi bản đầu | Một sản phẩm duy nhất: `BOOSTED_JOB`. Không đưa lựa chọn `URGENT` ra UI. |
| Hiển thị candidate | Nhãn rõ `Được tài trợ`, không gọi là `Hot`, `Phù hợp`, hay `Được đề xuất`. |
| Phân phối | Tối đa 2 vị trí tài trợ trong 20 kết quả; giới hạn 2 tin/công ty trong cùng tập kết quả. |
| Email/push | Không gửi chỉ vì Boost ở bản đầu. Đây là hạng mục sau, cần consent và frequency cap. |
| Cam kết hiệu quả | Báo cáo impression/click/application; không hứa số view hay số CV tối thiểu. |

`URGENT` trong schema hiện tại được giữ để tương thích dữ liệu cũ. Nếu sau này cần nhãn “Tuyển gấp”, đó phải là một chính sách riêng có điều kiện nghiệp vụ rõ ràng, không phải một loại quảng cáo thứ hai dùng chung credit.

## 2. Hiện trạng đã xác nhận

### Có sẵn

- Schema đã có `JobBoost`, trạng thái `SCHEDULED | ACTIVE | ENDED | CANCELLED`, loại `FEATURED | URGENT` và bảng `JobBoostMetric`.
- Backend đã có endpoint tạo và hủy Boost cho recruiter:
  - `POST /api/v1/recruiter/job-posts/:id/boost`
  - `POST /api/v1/recruiter/job-posts/boosts/:boostId/cancel`
- Một lượt đang có thời hạn cố định 7 ngày, dùng quota `featured_job`; cron kết thúc Boost hết hạn mỗi 10 phút.
- Seed local xác định `RECRUITER_PRO` có `featured_job = 10`. Khi triển khai v1, `RECRUITER_FREE` phải có `featured_job = 1` để doanh nghiệp được trải nghiệm Boost trước khi nâng cấp.

### Chưa hoàn tất hoặc sai với sản phẩm cần bán

1. API public vẫn `orderBy publishedAt DESC`; Boost không thay đổi bất kỳ placement nào.
2. API có trả relation `boosts` cho job public, nhưng frontend public bỏ qua và gán `featured = false`, `urgent = false`.
3. Frontend recruiter chưa có API client, nút Boost, modal xác nhận, danh sách Boost, lịch sử hoặc báo cáo.
4. `JobBoostMetric` chưa được ghi bởi bất cứ luồng impression/click/save/application nào.
5. Không có database constraint chống hai request song song tạo nhiều Boost active cho cùng một job.
6. Idempotency hiện tạo từ timestamp server; retry của client vẫn có thể tiêu thêm credit.
7. Hủy Boost đang hoàn toàn bộ credit ngay cả khi Boost đã được phân phối.
8. Số liệu UI legacy (`boostCreditTotal`, `boostCreditUsed`) có thể lệch quota thực (`plan_features`/`subscription_quota_counters`).
9. Trên staging tại thời điểm audit, public plans API chỉ trả `RECRUITER_FREE`; `RECRUITER_PRO` chưa được bán công khai. Không được quảng bá Boost trước khi sửa cấu hình này.

## 3. Ranh giới phạm vi

### Bao gồm trong release Job Boost v1

- Quyền lợi Boost trong Pro, quota và lifecycle chính xác.
- Tạo, xem trạng thái, kết thúc sớm và lịch sử Boost của recruiter.
- Placement được tài trợ trên trang tìm việc và trang chủ với nhãn minh bạch.
- Rotation/frequency cap cơ bản để không làm một công ty chiếm kết quả.
- Metrics chuẩn cho impression, click, save và application.
- Dashboard recruiter tối thiểu và dashboard admin vận hành.
- Migration dữ liệu, staging verification, test tự động và rollout có khả năng tắt nhanh.

### Không bao gồm trong v1

- Đấu giá giá thầu, CPC/CPM, pay-per-boost độc lập ngoài gói Pro.
- Đảm bảo số CV, số view hoặc SLA tuyển dụng.
- Gửi email, push, SMS hàng loạt vì một recruiter vừa Boost tin.
- Xếp hạng bí mật hoặc gắn Boost vào khối recommendation cá nhân hóa.
- Tự động gia hạn Boost sau khi hết 7 ngày.

## 4. Luồng nghiệp vụ chuẩn

### 4.1. Recruiter kích hoạt Boost

1. Recruiter mở một job thuộc công ty mình trong trang quản lý tin.
2. Hệ thống hiển thị số Boost còn lại lấy từ quota `featured_job` của subscription active.
3. Nút `Boost tin` chỉ khả dụng khi job:
   - thuộc công ty của recruiter;
   - đang `PUBLISHED`, `APPROVED`, không hidden, không deleted, chưa hết hạn;
   - chưa có Boost `SCHEDULED` hoặc `ACTIVE`;
   - công ty có entitlement `featured_job` còn ít nhất một credit.
4. Modal xác nhận nêu rõ: một credit, tối đa 7 ngày, hiển thị nhãn `Được tài trợ`, không hoàn credit sau khi đã phân phối.
5. Client gửi `Idempotency-Key` UUID ổn định. Trong retry do timeout, phải gửi lại đúng key đó.
6. Backend atomically trừ một credit, tạo Boost và trả về trạng thái/placement dự kiến.
7. UI cập nhật quota và job status, sau đó hướng recruiter đến báo cáo kết quả.

### 4.2. Khi job không còn hợp lệ

- Recruiter đóng/xóa job, admin ẩn hoặc từ chối job, hoặc job hết hạn: hệ thống kết thúc Boost ngay lập tức với lý do tương ứng; không tiếp tục trả vào sponsored inventory.
- Gói Pro hết hạn trong lúc một Boost còn active: Boost tiếp tục đến `endsAt`. Quyền lợi đã được kích hoạt hợp lệ trong chu kỳ trả phí, không nên bị cắt ngang.
- Nếu platform gặp outage khiến Boost chưa nhận bất kỳ impression hợp lệ nào, admin/support được phép cấp **compensation credit** qua một ledger rõ ràng. Không đảo usage lịch sử một cách im lặng.

### 4.3. Kết thúc sớm và hoàn credit

Quy tắc v1:

- `SCHEDULED` chưa từng được phân phối: có thể hủy và hoàn credit.
- `ACTIVE` đã có impression: recruiter có thể dừng hiển thị sớm nhưng **không hoàn credit**.
- `ENDED`, `CANCELLED`, `INVALIDATED`: không thể hủy thêm.

V1 kích hoạt ngay (`ACTIVE`) nên UI không cần khuyến khích nút hủy. Nếu giữ endpoint cũ, đổi ý nghĩa thành `stop` và luôn trả `creditRefunded: false` với Boost đã active. Điều này tránh việc dùng một phần phân phối rồi đổi credit sang tin khác.

## 5. Phân phối công khai và công bằng marketplace

### 5.1. Không được làm

- Không đẩy mọi tin trả phí lên đầu danh sách hữu cơ.
- Không hiển thị tin không khớp keyword, địa điểm, filter hoặc trạng thái public.
- Không gắn nhãn `Phù hợp với bạn` cho tin chỉ được phân phối do trả phí.
- Không ghi nhận impression chỉ vì API trả JSON; card phải thực sự đi vào viewport.

### 5.2. Placement v1

Tạo source dữ liệu công khai riêng cho sponsored placements, không sửa thứ hạng organic một cách mơ hồ:

```text
Candidate mở /jobs với query/filter
  -> API lọc job public hợp lệ và khớp ngữ cảnh
  -> chọn tối đa 2 active Boost theo rotation
  -> trả sponsored slots có nhãn disclosure
  -> phần còn lại giữ sort organic mà candidate đã chọn
```

Các slot hiển thị:

| Bề mặt | Số lượng tối đa | Vị trí | Điều kiện |
| --- | ---: | --- | --- |
| `/jobs` list/grid | 2 trên 20 kết quả | slot 3 và 12, không đẩy pagination | phải khớp filter/query |
| Homepage | 2–4 | section riêng `Việc làm được tài trợ` | chỉ job public hợp lệ |
| Job detail | 0 | không bán placement tại trang chi tiết | không áp dụng |

Nếu chưa thể triển khai pagination server-side an toàn, release v1 phải dùng section sponsored riêng thay vì frontend tự sort toàn bộ danh sách. Không được phát hành một “Boost” chỉ thay đổi thứ tự mảng đã tải rồi coi là có cam kết phân phối.

### 5.3. Thuật toán rotation v1

1. Lọc mọi Boost active với job public, chưa hết hạn, phù hợp query/filter.
2. Loại job đã applied (nếu candidate đã đăng nhập) và job đã nhìn thấy trong cùng placement/session gần đây.
3. Chọn tối đa hai job; không quá hai job của một company trong một response.
4. Sắp xếp theo `lastServedAt ASC`, rồi `startsAt ASC`, rồi `id ASC`; cập nhật ledger serve sau khi response được phát hành.
5. Dùng seed theo visitor/session/ngày để thứ tự ổn định trong một phiên nhưng được xoay giữa các candidate.

V1 không sử dụng giá thầu. Mọi Boost có giá trị ngang nhau, nên rotation phải công bằng theo lượt phân phối thay vì ưu tiên công ty kích hoạt sớm.

## 6. Thiết kế dữ liệu và migration

### 6.1. Sửa `JobBoost`

Giữ các cột hiện có và thêm tối thiểu:

- `endedReason`: `EXPIRED | RECRUITER_STOPPED | JOB_CLOSED | JOB_EXPIRED | JOB_HIDDEN | MODERATION_REJECTED | ADMIN_CANCELLED`.
- `firstImpressionAt`, `lastImpressionAt`: phục vụ chính sách hoàn credit và báo cáo.
- `placementVersion`: biết Boost được phân phối theo thuật toán nào.
- `idempotencyKey`: unique, dùng trực tiếp cho create request.

Tạo partial unique index tại Postgres:

```sql
CREATE UNIQUE INDEX job_boost_one_live_per_job
ON job_boost (job_post_id)
WHERE status IN ('scheduled', 'active');
```

Thêm index cho phát hiện hết hạn và query inventory, ví dụ `(status, ends_at)` và `(company_id, status, starts_at)`.

### 6.2. Event và metric

Không ghi aggregate trực tiếp từ browser không kiểm soát. Tạo event/ledger tối thiểu:

```text
JobBoostDeliveryEvent
  boostId, jobPostId, placement, visitorHash, candidateId?, eventType,
  occurredAt, deliveryToken
```

- `IMPRESSION`: client gửi khi card nằm trong viewport ít nhất 50% trong 1 giây, dùng delivery token một lần/đợt.
- `CLICK`: ghi server-side khi candidate mở job qua sponsored card hoặc client gửi token đã ký.
- `SAVE`, `APPLICATION`: gắn với Boost nếu hành động đến từ sponsored placement trong attribution window rõ ràng.
- Deduplicate impression theo `boostId + visitorHash + date + placement`; hash visitor key bằng server secret, không lưu khóa định danh thô.
- JobBoostMetric là aggregate theo UTC day, upsert atomically từ event. Nó không phải source of truth cho audit.

### 6.3. Quota và plan data

- `PlanFeature(featured_job)` là source of truth cho số credit.
- API billing/read model phải trả `used`, `remaining`, `periodStart`, `periodEnd` từ `SubscriptionQuotaService.peek()`, không tính từ legacy fields.
- Có migration idempotent đảm bảo:
  - `RECRUITER_FREE`: `featured_job` enabled, limit `1`.
  - `RECRUITER_PRO`: `featured_job` enabled, limit `10`.
  - scalar legacy `boost_credit_limit` được đồng bộ chỉ để tương thích response cũ, không dùng để authorize.
- Không chạy `prisma db seed` để sửa staging/prod: seed không phải migration vận hành và có thể thay đổi dữ liệu không liên quan.

## 7. API contract cần triển khai

Mọi endpoint private dùng `JwtAuthGuard`, role recruiter và cùng model phân quyền company đang dùng cho job posts.

### Recruiter

```http
POST /api/v1/recruiter/job-posts/:jobId/boost
Idempotency-Key: <uuid>
Content-Type: application/json

{}
```

Response tối thiểu:

```json
{
  "id": "uuid",
  "jobPostId": "uuid",
  "status": "ACTIVE",
  "startsAt": "2026-09-01T00:00:00.000Z",
  "endsAt": "2026-09-08T00:00:00.000Z",
  "creditCost": 1,
  "remainingCredits": 9
}
```

Các endpoint bổ sung:

```text
GET  /api/v1/recruiter/job-posts/:jobId/boost
GET  /api/v1/recruiter/job-boosts?status=ACTIVE&page=1&limit=20
POST /api/v1/recruiter/job-boosts/:boostId/stop
GET  /api/v1/recruiter/job-boosts/:boostId/metrics?from=YYYY-MM-DD&to=YYYY-MM-DD
```

Mã lỗi chuẩn cần có: `FEATURE_NOT_IN_PLAN`, `QUOTA_EXHAUSTED`, `JOB_NOT_ELIGIBLE_FOR_BOOST`, `JOB_BOOST_ALREADY_ACTIVE`, `IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST`, `JOB_BOOST_NOT_STOPPABLE`.

### Public delivery

Không để frontend tự suy diễn tin nào sponsored. Contract phải trả explicit metadata:

```text
GET /api/v1/job-posts?...     # organic list/pagination
GET /api/v1/public/sponsored-jobs?placement=SEARCH&keyword=...&location=...
POST /api/v1/public/job-boost-deliveries/:deliveryToken/impression
POST /api/v1/public/job-boost-deliveries/:deliveryToken/click
```

Response sponsored card trả `sponsored: true`, `boostId`, `placement`, `endsAt`, `deliveryToken`; public response không trả subscription data của công ty.

## 8. Công việc theo repository

### `upnext-be`

1. Viết Prisma migration/data migration và regenerate Prisma client.
2. Tách `JobBoostPolicyService` hoặc mở rộng `JobBoostService` với eligibility, idempotency, lifecycle và error codes rõ ràng.
3. Đưa kiểm tra live Boost vào transaction và map unique violation thành `JOB_BOOST_ALREADY_ACTIVE`.
4. Đổi cancel hiện tại thành stop policy theo mục 4.3; thêm invalidation khi trạng thái job thay đổi.
5. Xây public sponsored inventory/delivery service, rotation, event ingestion và metrics aggregation.
6. Thêm endpoint recruiter/public, DTO Swagger và response contract.
7. Điều chỉnh `JobPostsService.findAll` sang contract pagination trước khi chèn sponsored slots vào search results; không thay đổi response một phía.
8. Đồng bộ subscription read model theo quota thật và thêm admin read/report endpoints cần thiết.
9. Viết unit, integration và concurrency tests; cập nhật OpenAPI artifact dùng cho frontend nếu repository duy trì artifact đó.

### `upnext-frontend`

1. Thêm typed API client cho Boost, quota snapshot và sponsored delivery events.
2. Mở rộng `RecruiterJobPost` bằng active Boost summary; render nút/modal/status trên management page.
3. Hiển thị remaining credits từ quota chính xác; deep link pricing khi hết lượt.
4. Thêm trang/list lịch sử và report theo Boost: impression, click, CTR, save, application, thời gian còn lại.
5. Thêm sponsored cards tại placement đã duyệt; label `Được tài trợ`, disclosure accessible và không dùng badge `Phù hợp`/`Hot`.
6. Dùng `IntersectionObserver` phát impression một lần sau điều kiện viewport; gửi click attribution khi card được mở.
7. Cập nhật pricing/billing copy theo đơn vị rõ ràng: `10 lượt Boost, mỗi lượt tối đa 7 ngày`.
8. Bỏ mapping cứng `featured: false`/`urgent: false` sau khi public contract mới sẵn sàng; không dùng static mock data để kiểm tra Boost production.

### `upnext-infra`

1. Bảo đảm backend scheduler chạy đúng một logical worker hoặc cron idempotent khi scale nhiều replica.
2. Thêm env/config feature flag `JOB_BOOST_ENABLED` và `JOB_BOOST_PUBLIC_PLACEMENTS_ENABLED` để tắt creation hoặc tắt placement độc lập.
3. Thêm monitoring: error rate create Boost, quota conflict, event ingestion failure, cron delay, zero-impression active Boost.
4. Đảm bảo migration chạy trước backend mới trong pipeline deploy; backup/rollback theo deploy script chuẩn.

### `upnext-ai`

Không cần thay đổi ở v1. Không được gọi AI chỉ để ưu tiên Boost. Nếu sau này dùng scoring để loại tin chất lượng thấp khỏi sponsored inventory, đó là phase riêng, cần tiêu chí giải thích được và review bias.

## 9. Kế hoạch staging và cấu hình gói

Trước khi test UI, làm theo thứ tự này:

1. Read-only kiểm tra `subscription_plans`/`plan_features` qua admin hoặc DB staging: mã, audience, status, isPublic và `featured_job` limit.
2. Chạy migration idempotent tạo/sửa `RECRUITER_PRO` nếu thiếu; đặt `status=ACTIVE`, `isPublic=true`, limit 10. Không tạo bản ghi trùng mã.
3. Xác minh public endpoint trả cả Free và Pro.
4. Thực hiện một checkout staging thật hoặc sandbox: invoice paid -> subscription active -> quota `featured_job` = 10.
5. Kích hoạt một Boost với account test, kiểm tra card được phân phối, label disclosure, metrics và expiry.
6. Test stop/close/expiry, kế tiếp rollback feature flag và xác nhận organic feed vẫn hoạt động.

Điều kiện bắt buộc trước khi mở bán: staging phải có một Pro plan mua được và một Boost có impression/click được đo end-to-end. Không dựa vào việc seed local có Pro để suy ra staging đã đúng.

## 10. Test matrix bắt buộc

### Backend

- Job không thuộc company, DRAFT, CLOSED, hidden, rejected, expired và deleted đều bị từ chối.
- Free có đúng 1 credit mỗi chu kỳ, Free đã dùng hết credit, Pro hết credit, Pro có credit, entitlement disabled, subscription expired.
- Retry cùng Idempotency-Key không tiêu thêm credit; cùng key khác payload bị từ chối.
- Hai request song song cùng job: chỉ một Boost và một usage consume tồn tại.
- Hai job khác nhau tiêu quota song song không vượt giới hạn.
- `stop` trước/ sau impression theo đúng chính sách hoàn credit.
- Job đóng/ẩn/hết hạn làm Boost biến mất khỏi inventory ngay lập tức.
- Boost hết hạn qua cron; chạy lại cron idempotent; batch lớn không bỏ sót record.
- Rotation, cap theo company, context filter và candidate applied-job exclusion.
- Event duplicate, token giả, token hết hạn, click/application attribution.

### Frontend

- Recruiter đủ/thiếu credit, đang có Boost, job không đủ điều kiện và API error/retry.
- Modal có disclosure đúng; double click không tạo hai request.
- Public list/grid/mobile có sponsored card đúng vị trí, nhãn và keyboard navigation.
- Impression chỉ gửi khi card vào viewport; không gửi khi skeleton/hidden.
- Filter/search không hiển thị sponsored job không khớp.
- Organic sort `newest`, `salary`, `relevant` vẫn hoạt động đúng độc lập với sponsored section.
- Dashboard metric: loading, empty, error, timezone/date range.

### End-to-end staging

```text
Mua Pro -> payment confirmed -> quota 10
-> Boost job public -> sponsored card xuất hiện
-> candidate xem/click/save/apply -> metric tăng đúng
-> job đóng hoặc hết 7 ngày -> card biến mất
-> credit/accounting/history không bị sai
```

## 11. Rollout, quan sát và rollback

### Trình tự phát hành

1. Merge backend migration + service + test.
2. Deploy staging với public placement flag tắt; kiểm tra migration, quota và recruiter flow.
3. Merge/deploy frontend; kiểm tra recruiter UI và metric event.
4. Bật public placement cho account/company test; quan sát ít nhất một chu kỳ ngắn.
5. Bật beta có giới hạn số company, sau đó mở toàn bộ Pro khi KPI và error rate ổn định.

### KPI theo dõi

- Tỷ lệ create Boost thành công và tỷ lệ lỗi quota/race.
- Số Boost active nhưng zero impression sau 24 giờ.
- Impressions, CTR, save rate, apply rate so với baseline organic có cùng filter/thời gian đăng.
- Tỷ lệ recruiter dùng hết quota và tỷ lệ stop sớm.
- Complaint/hidden/report rate của sponsored jobs.

### Rollback

- Tắt `JOB_BOOST_PUBLIC_PLACEMENTS_ENABLED`: dừng phân phối mới ngay nhưng không làm organic feed lỗi.
- Tắt `JOB_BOOST_ENABLED`: chặn tạo Boost mới, vẫn cho recruiter xem lịch sử/report.
- Không xóa `JobBoost`, usage hoặc metric để rollback. Mọi dữ liệu phải giữ cho audit và hỗ trợ khách hàng.
- Database migration phải additive/backward-compatible; rollback application trước rồi mới cân nhắc migration follow-up, không dùng `reset`.

## 12. Tiêu chí nghiệm thu release

Release chỉ được coi là hoàn tất khi mọi điều sau đúng:

- Recruiter Pro thực sự mua được gói và thấy 10 lượt Boost còn lại.
- Một lần click/refresh/retry không thể trừ hơn một credit.
- Một job không thể có hai Boost live.
- Tin Boost có mặt ở placement public phù hợp, có nhãn `Được tài trợ`, và không phá filter/sort organic.
- Tin không hợp lệ hoặc đã kết thúc không còn được phân phối.
- Recruiter xem được số liệu tối thiểu: impressions, clicks, CTR, saves, applications, startsAt, endsAt.
- Staging test end-to-end pass, CI pass, migration safe, feature flags và alert vận hành đã được kiểm chứng.
- Copy pricing/billing, API contract và behavior thực tế không mâu thuẫn nhau.

## 13. Thứ tự thực hiện khuyến nghị

1. **P0 — sửa dữ liệu/cấu hình staging Free/Pro**: Free phải có 1 Boost để trải nghiệm và Pro phải mua được với 10 Boost.
2. **P0 — backend integrity**: idempotency, unique live Boost, lifecycle và quota read model.
3. **P0 — recruiter UX**: khởi tạo Boost và hiển thị trạng thái/quota thật.
4. **P0 — sponsored delivery + disclosure**: đây mới là phần làm Boost tạo thêm reach.
5. **P0 — metrics + E2E staging**: không mở bán nếu không đo được delivery.
6. **P1 — admin report, bù credit có kiểm soát, alert vận hành**.
7. **P2 — outbound notifications có consent, top-up/auction hoặc AI quality guard**, chỉ sau khi dữ liệu v1 chứng minh nhu cầu.

## 14. Ghi chú cho người triển khai

- Không “fix nhanh” bằng cách chỉ hiển thị badge hoặc sort `featured` ở frontend. Điều đó không bảo đảm phân phối, không chống duplicate credit và không tạo báo cáo đáng tin.
- Không dùng Boost như cách bù cho chất lượng JD thấp hoặc để đưa job sai filter đến candidate. Candidate trust quan trọng hơn một lần click ngắn hạn.
- Mỗi thay đổi contract giữa backend/frontend phải được triển khai trong cùng release train; tránh backend trả `boosts` nhưng frontend bỏ qua, hoặc frontend hiển thị advertised state không được backend authorize.
- Mọi thay đổi entitlement phải đi qua migration/admin configuration có audit, không dựa vào seed local.
