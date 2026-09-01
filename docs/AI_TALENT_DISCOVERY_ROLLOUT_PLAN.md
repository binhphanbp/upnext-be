# Kế hoạch triển khai AI Talent Discovery

> Trạng thái: sẵn sàng triển khai sau khi chốt chính sách dữ liệu và pricing.
>
> Phạm vi: `upnext-be`, `upnext-frontend`, `upnext-infra`, cấu hình gói dịch vụ và rollout staging.
>
> Mục tiêu: giúp recruiter chủ động tìm được ứng viên phù hợp với một Job Post, nhưng mọi thông tin định danh và liên hệ vẫn được bảo vệ để quá trình kết nối diễn ra trên UpNext.

## 1. Quyết định sản phẩm

Tên sản phẩm v1: **AI Talent Discovery** (gợi ý ứng viên phù hợp theo tin tuyển dụng).

Đây không phải là tính năng tải/xem CV gốc hay mua danh sách liên hệ. Recruiter nhận các hồ sơ **ẩn danh có lý do phù hợp**; để tiếp cận ứng viên, recruiter phải gửi lời mời qua UpNext. Candidate quyết định chấp nhận, từ chối, chặn công ty hoặc tự nguyện chia sẻ thông tin liên hệ trong cuộc trò chuyện.

| Chính sách | Quyết định v1 |
| --- | --- |
| Consent mặc định | Tắt. `OPEN_TO_WORK` hoặc profile `PUBLIC` không tự động đồng ý vào Talent Discovery. |
| Free | 1 lượt Discovery/30 ngày, tối đa 5 hồ sơ ẩn danh; 1 lời mời trao đổi thử nghiệm/30 ngày. |
| Pro | 10 lượt Discovery/30 ngày, tối đa 30 hồ sơ ẩn danh/lượt; 250 lời mời trao đổi/30 ngày. |
| Đơn vị tính | 1 Discovery = tạo/refresh một snapshot match cho một Job Post. Xem lại snapshot không tốn lượt. |
| Thời hạn snapshot | 30 ngày hoặc đến khi job/candidate không còn đủ điều kiện. |
| Liên hệ | 1 credit `talent_contact` khi recruiter gửi lời mời; không hoàn chỉ vì candidate từ chối. |
| Kênh liên lạc | Chat UpNext sau khi candidate chấp nhận. Không tự trả email, SĐT, CV file hoặc link cá nhân. |
| AI | Chỉ hỗ trợ tìm/giải thích mức phù hợp; không tự động reject, shortlist hay ra quyết định tuyển dụng. |
| Dữ liệu nhạy cảm | Không đưa vào ranking hoặc hiển thị: giới tính, ngày sinh/tuổi, địa chỉ chính xác, ảnh, sức khỏe, quan điểm, nguồn gốc, dữ liệu nhận diện và thông tin liên hệ. |

Mức 10 × 30 cho Pro cho phép tối đa 300 **lượt gợi ý hồ sơ ẩn danh** mỗi chu kỳ, nhưng không hứa rằng mọi run đều đủ 30 người. Nếu nguồn ứng viên đủ điều kiện thấp, hệ thống phải trả số lượng thực tế và hướng recruiter cải thiện JD/filter, không bịa thêm kết quả.

## 2. Nguyên tắc không được phá vỡ

1. Candidate là chủ thể kiểm soát việc xuất hiện trong Talent Discovery và có thể rút consent ngay lập tức.
2. Recruiter không được nhận `candidateProfileId`, tên thật, email, điện thoại, file CV gốc, link LinkedIn/GitHub/portfolio, địa chỉ chính xác hoặc parsed CV chưa che thông tin.
3. Không tồn tại đường vòng từ recommendation sang endpoint mở khóa liên hệ trực tiếp.
4. Candidate chỉ nhận lời mời có Job Post và company còn hợp lệ; không có cold outreach vô ngữ cảnh.
5. Mọi lần xem, gợi ý, gửi lời mời, trả lời, block và reveal tự nguyện đều phải audit được.
6. Mô hình không được dùng dữ liệu bảo vệ để xếp hạng, và recruiter luôn thấy lý do/gap có thể kiểm chứng thay vì “điểm AI” mơ hồ.

Nghị định 13/2023/NĐ-CP về bảo vệ dữ liệu cá nhân có hiệu lực từ 01-07-2023. Thiết kế này phải được Legal/Privacy review trước production, đặc biệt về consent, mục đích xử lý, retention và nhà cung cấp AI. Đây là kế hoạch sản phẩm/kỹ thuật, không thay thế tư vấn pháp lý. [Văn bản Chính phủ](https://vanban.chinhphu.vn/?classid=1&docid=207759&orggroupid=2&pageid=27160)

## 3. Hiện trạng đã audit

### Thành phần có thể tái sử dụng

- `TalentRecommendationRun` và `TalentRecommendation` đã tồn tại.
- `TalentRecommendationService` đã lọc candidate đang mở tìm việc, profile public, opt-in liên hệ, chưa ứng tuyển job và chưa block công ty.
- `TalentContactService` đã có lời mời 7 ngày, idempotency, quota `talent_contact`, accept/decline/block, rate limit, notification, realtime và conversation riêng cho outreach.
- `TalentPoolService` đã biết cách trả card rút gọn không email/SĐT khi browse.
- `EmbeddingService` đã có cache embedding, pgvector và fallback khi pgvector chưa sẵn sàng.

### Blocker và rủi ro hiện có

| Vấn đề | Tác động | Yêu cầu xử lý trước launch |
| --- | --- | --- |
| Recommendation hiện trả `account.fullName` và `candidateProfileId` | Recruiter nhận định danh thật và có thể gọi endpoint khác bằng profile ID. | Thay response bằng reference opaque, projection ẩn danh và authorization per item. |
| Recommendation không tiêu quota | Có thể tạo run không giới hạn dù gói không có quyền lợi. | Thêm feature `talent_discovery_run`, idempotency và usage ledger. |
| Ranking load toàn bộ embedding vào application memory rồi cosine sort | Không mở rộng được theo số lượng CV; duplicate CV version có thể làm sai kết quả. | Xây discovery index một record/candidate và query pgvector có filter server-side. |
| `buildCvText()` ưu tiên raw `parsedText` và có thể chứa tên/email; fallback cũng đưa name/email vào embedding text | PII có thể đi sang embedding provider và lưu trong cache. | Tạo text/index discovery riêng chỉ gồm dữ liệu đã pseudonymize, không tái dùng raw CV text. |
| Talent Pool `unlock()` trả tên/email/SĐT | Đây là đường vòng phá mục tiêu giữ trao đổi trên UpNext. | Thay bằng profile ẩn danh + in-app invitation; direct reveal chỉ có thể tồn tại nếu candidate consent riêng, không áp dụng cho Discovery v1. |
| `CHAT_OUTREACH_ENABLED` mặc định false | Luồng mời/accept có thể chưa hoạt động ở staging. | Verify feature flag, realtime/outbox và end-to-end trước beta. |
| Candidate contact preference hiện chỉ `OPTED_IN/OPTED_OUT` | Consent liên hệ không đủ để suy ra consent xử lý/ranking CV cho Discovery. | Thêm preference/consent riêng, default off và versioned. |

Không được chỉ nối UI vào endpoint `talent-recommendations/runs` hiện tại. Làm vậy sẽ đưa tên thật ra API, không có commercial entitlement, không có masking policy và không đảm bảo scale.

## 4. Consent và vòng đời quyền riêng tư

### 4.1. Candidate Talent Discovery preference

Tạo model riêng, ví dụ `CandidateTalentDiscoveryPreference`:

```text
candidateProfileId (unique)
status: DISABLED | ENABLED
consentVersion
consentedAt
revokedAt
allowedJobFamilies / locations / workingModels (candidate-configurable)
salaryVisibility: HIDE | RANGE_ONLY
lastReviewedAt
```

Yêu cầu UX candidate:

1. Giải thích ngắn gọn: recruiter sẽ thấy profile ẩn danh, kỹ năng/kinh nghiệm đã khái quát và lý do match; không thấy tên/email/SĐT/file CV.
2. Cho candidate preview chính xác card mà recruiter sẽ nhìn thấy.
3. Tách checkbox consent Discovery khỏi “Open to work”, profile visibility và consent nhận lời mời.
4. Cho phép tắt ngay, theo company block, hoặc giới hạn theo vị trí/địa điểm/mô hình làm việc.
5. Lưu consent version, thời điểm và audit event. Không dùng pre-checked checkbox.

### 4.2. Eligibility tại thời điểm đọc, không chỉ lúc chạy AI

Candidate chỉ xuất hiện khi đồng thời thỏa:

```text
TalentDiscoveryPreference = ENABLED
AND JobSearchStatus = OPEN_TO_WORK
AND ProfileVisibility = PUBLIC
AND CandidateContactPreference = OPTED_IN
AND candidate chưa ứng tuyển Job Post đó
AND candidate chưa block company
AND candidate preference khớp job ở các điều kiện cứng đã chọn
```

Khi candidate rút consent, ẩn profile hoặc block company, mọi recommendation cũ phải bị loại ngay khi recruiter đọc/sử dụng item. Snapshot được lưu cho audit nhưng không còn trả card, không thể gửi contact request và không thể render data cũ từ cache.

## 5. Dữ liệu nào được hiển thị

### 5.1. Card recruiter được phép xem

| Có thể hiển thị | Quy tắc |
| --- | --- |
| `Candidate #A7K4` | Alias ngẫu nhiên theo recommendation/run; không phải profile ID và không dùng để truy ngược giữa các company. |
| Job family/headline khái quát | Ví dụ “Backend Engineer”, không có tên cá nhân. |
| Kinh nghiệm | Dải như `3–5 năm`, không cần mốc thời gian chính xác. |
| Kỹ năng và độ khớp | Tối đa 8 skill; reason codes: kỹ năng khớp, kinh nghiệm phù hợp, working model/location match. |
| Khoảng trống | Tối đa 3 gap chuyên môn dựa trên JD; diễn đạt là thông tin để recruiter đánh giá, không phải đánh giá con người. |
| Vị trí/mô hình làm việc | Thành phố/tỉnh hoặc `Remote`, không hiển thị địa chỉ. |
| Mong muốn công việc | Chỉ trường candidate chọn cho phép hiển thị, ví dụ notice-period range hoặc salary range. |

### 5.2. Tuyệt đối che trong v1

- Tên thật, avatar/ảnh, email, số điện thoại, địa chỉ, ngày sinh/tuổi, giới tính.
- URL LinkedIn, GitHub, portfolio, website, social handles, QR code.
- Tên công ty cũ, tên trường, project title, tên khách hàng, file name, raw CV, parsed CV và attachment.
- Bất kỳ text tự do nào chưa qua sanitizer/redaction; text này có thể ẩn danh không đủ vì chứa PII hoặc fingerprint hiếm.
- `candidateProfileId`, `candidateAccountId`, CV id/version id và signed download URL.

Candidate có thể tự nguyện gửi link/email/SĐT sau khi đã chấp nhận trò chuyện. UpNext không tự reveal bất kỳ trường nào trong số đó.

## 6. Luồng recruiter và candidate

### 6.1. Recruiter tạo Discovery

1. Mở một Job Post của công ty mình, đang PUBLISHED/APPROVED/còn hạn.
2. Chọn `Tìm ứng viên phù hợp` và nhìn thấy số lượt còn lại.
3. Client gửi `Idempotency-Key` UUID bền vững khi tạo run.
4. Backend authorize job, reserve/tạo usage entitlement, tạo run `PENDING`, xếp hàng tính toán.
5. Khi hoàn thành, recruiter nhận tối đa số kết quả entitlement cho phép; card luôn ẩn danh.
6. Xem lại cùng snapshot không trừ thêm quota. `Refresh` tạo run mới và trừ một lượt mới nếu JD hoặc thị trường đã thay đổi.

### 6.2. Recruiter gửi lời mời

1. Recruiter mở card ẩn danh và bấm `Mời trao đổi trên UpNext`.
2. Viết message có context job; backend kiểm tra candidate còn eligible, anti-spam và candidate chưa bị block.
3. Trừ một `talent_contact` khi message được lưu/đưa vào outbox thành công; nếu transaction thất bại trước delivery, không được trừ hoặc phải reverse có audit.
4. Candidate nhận invitation hiển thị company, recruiter, Job Post và message. Candidate có 7 ngày để accept/decline/block.
5. Khi accept, mở `TALENT_OUTREACH` conversation. Không reveal contact detail; candidate tự chọn chia sẻ nếu muốn.

### 6.3. Chống spam và bypass

- Một company chỉ được mời cùng candidate một lần trong 30 ngày, bất kể khác Job Post. Đây mạnh hơn unique hiện tại theo `(company, candidate, job)`.
- Giới hạn theo recruiter, company, candidate và job; có daily cap, retry cooldown và candidate-side inbox cap.
- Thêm report/block trực tiếp trong invitation/chat; block có hiệu lực ngay với cả recommendation và outreach tương lai.
- Không trả profile identifier cho client. Action sau đó dùng `recommendationId` hoặc opaque `candidateRef`, server tự resolve và re-check quyền.
- `CV_POOL_VIEW` hiện trả liên hệ trực tiếp phải được đổi trước launch: v1 chỉ cho xem profile ẩn danh chi tiết, hoặc tắt endpoint unlock cũ. Nếu vẫn giữ direct reveal cho sản phẩm khác, phải có consent `DIRECT_CONTACT_ALLOWED` riêng và Discovery candidates tuyệt đối không dùng được đường đó.

## 7. Matching architecture

### 7.1. Discovery index không chứa PII

Tạo `TalentDiscoveryIndex` một record active cho mỗi candidate:

```text
candidateProfileId (internal only)
sanitizedText
embeddingVector / embeddingPgvector
embeddingModel, embeddingVersion
sourceProfileVersion
updatedAt, deactivatedAt
```

`sanitizedText` chỉ ghép từ taxonomy và field đã chuẩn hóa/candidate-approved: job family, skills, technology, experience band, working model, city level, desired position và summary đã sanitizer. Không dùng `CVVersion.parsedText`, original file, tên, email hoặc raw description mặc định.

Indexer chạy khi candidate thay đổi consent, skill, experience, preference hoặc CV/profile discovery summary. Rút consent phải deactivate index và ngăn query ngay; re-enable phải index lại bằng dữ liệu hiện tại.

### 7.2. Pipeline ranking

```text
Job Post hợp lệ
  -> hard filter (consent, visibility, availability, block, applied, location/model)
  -> pgvector semantic retrieval trên TalentDiscoveryIndex
  -> deterministic rerank bằng dữ liệu chuẩn hóa
  -> threshold + diversity/cap
  -> store recommendation snapshot + reason codes
  -> trả card ẩn danh
```

Rerank v1 đề xuất:

| Thành phần | Trọng số | Ghi chú |
| --- | ---: | --- |
| Required/preferred skills | 35 | Skill bắt buộc thiếu phải hạ mạnh hoặc loại theo rule job. |
| Semantic similarity JD ↔ discovery profile | 30 | Dùng retrieval, không phải một quyết định tuyển dụng. |
| Kinh nghiệm/cấp bậc | 20 | So theo dải và role taxonomy, không suy luận tuổi. |
| Location/working model | 10 | Theo preference rõ ràng của candidate. |
| Salary/availability opt-in | 5 | Chỉ dùng nếu candidate cho phép và cùng currency. |

Không có tín hiệu protected characteristic. Score hiển thị dạng `Rất phù hợp / Phù hợp / Có thể cân nhắc`, kèm reason codes và gaps; không gọi là “đủ điều kiện tuyển dụng”. Nếu dưới confidence threshold, không đưa vào kết quả chỉ để lấp đủ 30 card.

### 7.3. Khả năng mở rộng và chất lượng

- Không dùng `findMany()` toàn bộ CV embedding rồi sort trong Node.js.
- Query pgvector phải join/filter candidate eligibility ngay trong database và chỉ lấy top-K cần thiết; không truyền danh sách toàn corpus vào query.
- Bảo đảm một candidate chỉ có một active discovery index (ví dụ CV default/newest eligible), tránh nhiều CV version xuất hiện lặp.
- Run chạy async; queue/retry idempotent. Nếu index chưa sẵn sàng, trả trạng thái rõ ràng và không charge run thất bại.
- Ghi `scoringVersion`, weights, index version và input job snapshot để kết quả giải thích/audit/reproducible.

## 8. Entitlement và thanh toán

Thêm feature registry riêng, không tái sử dụng `AI_CV_MATCHING`:

```text
TALENT_DISCOVERY_RUN  # metered, số lần tạo/refresh snapshot
```

`AI_CV_MATCHING` tiếp tục dành cho chấm CV của **ứng viên đã nộp đơn**. Trộn hai khái niệm sẽ làm pricing, COGS và UX sai.

| Quyền lợi | Free | Pro | Ghi chú |
| --- | ---: | ---: | --- |
| Talent Discovery run | 1 | 10 | Reset theo chu kỳ 30 ngày, không rollover. |
| Số card tối đa/run | 5 | 30 | Số thực tế có thể thấp hơn. |
| Profile ẩn danh chi tiết | 0 | dùng entitlement `CV_POOL_VIEW` đã đổi nghĩa | Không bao giờ unmask PII. |
| Lời mời trao đổi trong app | 1 | 250 | Dùng `TALENT_CONTACT`, theo anti-spam policy. |

Khi run thành công mới finalize consume. Có thể reserve usage trong transaction tạo run và reverse rõ lý do `talent-discovery-failed` khi worker thất bại trước khi publish result. Không charge lượt xem lại, polling hay result bị candidate rút consent.

Trước khi chốt các limit sau beta, đo riêng COGS của embedding index, query, rerank và storage. Không suy ra COGS Discovery từ chi phí Gemini screening của CV application.

## 9. API contract v1

### Recruiter

```http
POST /api/v1/recruiter/job-posts/:jobPostId/talent-discovery-runs
Idempotency-Key: <uuid>

{ "limit": 30 }
```

```json
{
  "id": "run-uuid",
  "status": "PENDING",
  "remainingRuns": 9,
  "jobPostId": "job-uuid"
}
```

```text
GET  /api/v1/recruiter/talent-discovery-runs/:runId
GET  /api/v1/recruiter/talent-discovery-runs/:runId/recommendations
POST /api/v1/recruiter/talent-recommendations/:recommendationId/contact-requests
GET  /api/v1/recruiter/talent-discovery-runs?jobPostId=...&page=...&limit=...
```

Recommendation response chỉ có field ẩn danh, ví dụ:

```json
{
  "id": "recommendation-uuid",
  "candidateRef": "cand_opaque_per_run",
  "matchBand": "STRONG",
  "experienceBand": "3-5 years",
  "headline": "Backend Engineer",
  "city": "Ho Chi Minh City",
  "workingModel": "HYBRID",
  "matchedSkills": ["TypeScript", "Node.js", "PostgreSQL"],
  "gaps": ["Kubernetes"],
  "reasons": ["Kỹ năng cốt lõi khớp", "Kinh nghiệm phù hợp"],
  "contactState": "AVAILABLE"
}
```

Không trả score thô, candidate profile/account/CV identifier hay PII. Mọi endpoint detail/contact nhận `recommendationId`; server validate run ownership, candidate eligibility hiện tại và policy chặn trước khi trả kết quả.

### Candidate

```text
GET   /api/v1/candidate/talent-discovery-preference
PUT   /api/v1/candidate/talent-discovery-preference
GET   /api/v1/candidate/talent-discovery-preview
DELETE /api/v1/candidate/talent-discovery-preference  # revoke ngay
```

Candidate contact endpoints hiện có được giữ nhưng bổ sung source `TALENT_DISCOVERY`, recommendation/run attribution và per-company-per-candidate cooldown.

## 10. Data model và audit

Thêm/chỉnh các model theo hướng additive migration:

```text
CandidateTalentDiscoveryPreference
TalentDiscoveryIndex
TalentDiscoveryRun
TalentDiscoveryRecommendation
TalentDiscoveryViewEvent
TalentContactRequest.source / recommendationId
```

Các bản ghi recommendation trong database có thể giữ foreign key nội bộ `candidateProfileId` để join, nhưng serializer recruiter tuyệt đối không gửi value này. Mỗi run lưu job snapshot, scoring config/version, candidate eligibility checked-at và masking policy version.

Audit event tối thiểu:

```text
DISCOVERY_CONSENT_GRANTED / REVOKED
DISCOVERY_RUN_CREATED / COMPLETED / FAILED
RECOMMENDATION_VIEWED
ANONYMOUS_PROFILE_VIEWED
CONTACT_REQUESTED / ACCEPTED / DECLINED / BLOCKED / EXPIRED
```

Không log raw request payload chứa CV, contact data hoặc model prompt. Retention của recommendation snapshot, event audit và embedding/index phải do Privacy/Legal phê duyệt trước production; phải có job cleanup và kiểm tra deletion/opt-out trong test.

## 11. Công việc theo repository

### `upnext-be`

1. Viết migration cho preference/index/run/recommendation/audit attribution; không xóa lịch sử hiện có.
2. Tạo discovery consent service, candidate preview và immediate revocation gate.
3. Tách `DiscoveryTextBuilder`/sanitizer khỏi `buildCvText`; tạo tests phủ email, phone, URL, name, address, file name và raw parsed CV không xuất hiện trong discovery text/provider request.
4. Xây indexer một index/candidate và pgvector repository có hard filter trong SQL.
5. Thay/rework `TalentRecommendationService`: async queue, idempotency, feature quota, rerank, threshold, snapshot và projection ẩn danh.
6. Cứng hóa authorization/IDOR: recruiter chỉ action bằng recommendation id thuộc company/run của mình; re-check candidate state ở every read/action.
7. Nối contact request với recommendation và giữ toàn bộ trao đổi trong conversation; thay policy direct contact unlock trước launch.
8. Thêm API Swagger, errors, outbox, metrics/alerts và admin audit/read-only tools.

### `upnext-frontend`

1. Thêm candidate consent page, preview masked profile, revoke/block settings và copy minh bạch.
2. Thêm recruiter flow tại Job Post: quota banner, generate/poll/retry, card ẩn danh, reason/gap, invitation composer và invitation state.
3. Thêm workspace `Ứng viên đề xuất` chỉ như inbox conversation; không biến chat tab thành nơi list PII.
4. Không render raw candidate ID, file URL hoặc contact field trong state/devtools/analytics; typed API contract phải không có PII.
5. Thêm UI states: không đủ entitlement, index đang cập nhật, không đủ candidate, candidate vừa opt-out, contact quota hết, rate limited và API failure.

### `upnext-infra`

1. Feature flags riêng: `TALENT_DISCOVERY_ENABLED`, `TALENT_DISCOVERY_CONTACT_ENABLED`; không tái sử dụng flag chat chung làm cờ product duy nhất.
2. Queue/worker, cron retry, dead-letter monitoring và single-scheduler/idempotent worker behavior khi scale.
3. Secrets/egress policy cho embedding provider; không gửi raw CV vào provider discovery path.
4. Dashboard/alerts: queue lag, run failure, PII sanitizer violation, zero-result rate, contact acceptance/block rate, quota errors.
5. Migration deploy trước application code, backup và rollback theo pipeline chuẩn.

### `upnext-ai`

V1 không cần tạo một service AI mới nếu backend embedding provider hiện có đáp ứng. Chỉ dùng `upnext-ai` ở phase sau nếu cần reranker/normalizer riêng, khi đó phải có contract không-PII, versioning, evaluation set và human review.

## 12. Test matrix bắt buộc

### Privacy và authorization

- Snapshot/API/frontend payload không chứa name, email, phone, address, avatar, link, file URL/id, profile/account/CV id, raw parsed text hoặc source file name.
- Recruiter đổi recommendation id/run id/company id để truy cập candidate khác đều trả 404/403 không làm lộ tồn tại data.
- Candidate revoke consent/hide profile/block company giữa lúc run đang xử lý: result không được trả/contact được.
- Endpoint Talent Pool unlock không thể dùng recommendation reference để lấy direct contact.
- Logs/error/analytics/provider mock không nhận PII discovery text.

### Product và quota

- Free đúng 1 run + 5 card + 1 invitation; Pro đúng 10 run + 30 card/run + 250 contact theo cycle.
- Retry cùng Idempotency-Key không charge hai lần; request đồng thời không vượt limit.
- Run failed trước publish được reverse/không charge; result read không charge lại.
- Candidate đã apply/block/opt-out/không open-to-work bị loại.
- Candidate nhận tối đa rate/frequency policy; accept/decline/block/expiry cập nhật conversation đúng.

### Matching quality và scale

- Skill required, experience, location/work model, salary opt-in, threshold và reason codes có unit tests deterministic.
- Không có 30 người đủ điều kiện thì trả số thực tế, không lấp bằng match dưới ngưỡng.
- Một candidate có nhiều CV version chỉ xuất hiện một lần.
- pgvector query có filter/limit và benchmark corpus staging; fallback phải có cap rõ ràng, không full scan vô hạn.

### End-to-end staging

```text
Candidate opt-in + preview -> index ready
-> recruiter Pro tạo run -> nhận card masked
-> recruiter gửi invitation -> candidate accept
-> conversation mở -> contact không tự reveal
-> candidate revoke/block -> future discovery/contact bị chặn
```

## 13. Rollout và rollback

1. Deploy migration/indexer với flags tắt; backfill chỉ cho candidate đã explicit opt-in mới (ban đầu sẽ không có ai nếu consent mới, đây là đúng).
2. Internal test với account giả, assertion kiểm tra absence of PII ở API/log/provider mock.
3. Bật staging cho cohort nhỏ candidate/recruiter và test end-to-end contact acceptance.
4. Đo zero-result, match open rate, invitation acceptance, block/report, latency/cost trước khi mở rộng.
5. Beta Pro có giới hạn company; chỉ public pricing sau khi consent, masking, chat và audit pass.

Rollback:

- Tắt `TALENT_DISCOVERY_ENABLED`: ngừng tạo run mới, không xóa historical audit.
- Tắt contact flag: ẩn CTA gửi lời mời nhưng giữ candidate control/conversation đã có.
- Revocation vẫn phải hoạt động khi feature flag tắt.
- Không rollback bằng cách expose profile/contact hoặc xóa evidence audit. Migration phải additive và backward-compatible.

## 14. Tiêu chí nghiệm thu

Chỉ có thể gọi AI Talent Discovery là done khi:

- Candidate phải explicit opt-in và có preview đúng card ẩn danh.
- Không có PII/direct identifier nào qua recruiter API, UI, logs, embedding provider hoặc đường CV Pool unlock.
- Recruiter Pro dùng được quota thật; Free có trải nghiệm thử giới hạn; retry/concurrency không trừ sai.
- Mọi kết quả đều gắn với Job Post hợp lệ, có reason/gap giải thích được và không dùng protected data.
- Candidate chọn accept/decline/block, và conversation UpNext là đường liên lạc mặc định sau accept.
- Opt-out/block có hiệu lực với cả snapshot cũ và request mới ngay lập tức.
- Staging E2E, security/contract tests, migration safety, observability và Legal/Privacy approval đều pass.

## 15. Thứ tự triển khai

1. **P0 – privacy foundation:** consent riêng, masked contract, đóng bypass direct unlock và discovery embedding không-PII.
2. **P0 – backend integrity:** index, async run, quota, idempotency, server-side eligibility/ranking.
3. **P0 – in-platform outreach:** recommendation attribution, frequency cap, candidate controls, chat flow.
4. **P0 – frontend end-to-end:** recruiter discovery UI và candidate consent/preview/revoke UI.
5. **P0 – staging privacy/E2E test:** chỉ mở beta sau khi xác nhận no-PII và contact loop.
6. **P1 – quality/cost tuning:** evaluation dataset được consent, analytics, reranker và admin support tooling.
7. **P2 – mở rộng:** notification opt-in, talent discovery filter nâng cao, marketplace matching analytics; không làm trước khi v1 chứng minh được chất lượng và an toàn dữ liệu.
