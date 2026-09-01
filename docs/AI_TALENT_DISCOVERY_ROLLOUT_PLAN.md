# Kế hoạch triển khai AI Talent Discovery

> Trạng thái: đặc tả triển khai v1 đã chốt nguyên tắc nghiệp vụ; chỉ bắt đầu development sau khi Product, Legal/Privacy và Engineering sign-off các P0 ở mục 16.
>
> Phạm vi: `upnext-be`, `upnext-frontend`, `upnext-infra`, cấu hình gói dịch vụ và rollout staging.
>
> Mục tiêu: giúp recruiter chủ động tìm được ứng viên phù hợp với một Job Post, nhưng mọi thông tin định danh và liên hệ vẫn được bảo vệ để quá trình kết nối diễn ra trên UpNext.

## 1. Quyết định sản phẩm

Tên sản phẩm v1: **AI Talent Discovery** (gợi ý ứng viên phù hợp theo tin tuyển dụng).

Đây không phải là tính năng tải/xem CV gốc hay mua danh sách liên hệ. Recruiter nhận các hồ sơ **ẩn danh có lý do phù hợp**; để tiếp cận ứng viên, recruiter phải gửi lời mời qua UpNext. Candidate quyết định chấp nhận, từ chối hoặc chặn công ty. Trong v1, candidate vẫn ẩn danh cả sau khi accept và toàn bộ trao đổi diễn ra trong UpNext; không có reveal tên, email, SĐT hay link cá nhân.

| Chính sách | Quyết định v1 |
| --- | --- |
| Consent mặc định | Tắt. `OPEN_TO_WORK` hoặc profile `PUBLIC` không tự động đồng ý vào Talent Discovery. |
| Owner quota | Theo **company**, không theo recruiter account. Các recruiter của cùng công ty dùng chung quota và audit ghi rõ người thực hiện. |
| Free | 1 lượt Discovery/chu kỳ tháng, tối đa 5 hồ sơ ẩn danh; xem chi tiết CV đã redaction của 5 hồ sơ này; 1 lời mời trao đổi thử nghiệm/chu kỳ. |
| Pro | 10 lượt Discovery/chu kỳ tháng, tối đa 30 hồ sơ ẩn danh/lượt; xem chi tiết CV đã redaction của các hồ sơ trả về; 250 lời mời trao đổi/chu kỳ. |
| Chu kỳ quota | Chu kỳ tháng của subscription. Với gói thanh toán năm, billing phải vẫn cấp `currentPeriodStart/currentPeriodEnd` theo tháng cho các feature metered; UI hiển thị ngày reset chính xác, không ghi mơ hồ “30 ngày”. |
| Đơn vị tính | 1 Discovery = snapshot match mới cho một Job Post. Xem lại snapshot không tốn lượt. Refresh chỉ tạo snapshot/charge mới khi job matching fingerprint đã đổi hoặc snapshot cũ hơn 7 ngày. |
| Thời hạn snapshot | 30 ngày hoặc đến khi job/candidate không còn đủ điều kiện. |
| Liên hệ | 1 credit `talent_contact` khi recruiter gửi lời mời; không hoàn chỉ vì candidate từ chối. |
| Kênh liên lạc | Anonymous chat UpNext sau khi candidate chấp nhận. Không tự trả hay cho hai bên trao đổi email, SĐT, tên thật, CV file hoặc link cá nhân trong v1. |
| CV Pool cũ | `POST /talent-pool/:candidateProfileId/unlock` (trả direct contact) phải bị retire trước beta; Talent Pool nếu giữ lại chỉ được tạo invitation ẩn danh qua cùng policy Discovery. |
| AI | Chỉ hỗ trợ tìm/giải thích mức phù hợp; không tự động reject, shortlist hay ra quyết định tuyển dụng. |
| Dữ liệu nhạy cảm | Không đưa vào ranking hoặc hiển thị: giới tính, ngày sinh/tuổi, địa chỉ chính xác, ảnh, sức khỏe, quan điểm, nguồn gốc, dữ liệu nhận diện và thông tin liên hệ. |

Mức 10 × 30 cho Pro cho phép tối đa 300 **lượt gợi ý hồ sơ ẩn danh** mỗi chu kỳ, nhưng không hứa rằng mọi run đều đủ 30 người. Nếu nguồn ứng viên đủ điều kiện thấp, hệ thống phải trả số lượng thực tế và hướng recruiter cải thiện JD/filter, không bịa thêm kết quả.

## 2. Nguyên tắc không được phá vỡ

1. Candidate là chủ thể kiểm soát việc xuất hiện trong Talent Discovery và có thể rút consent ngay lập tức.
2. Recruiter không được nhận `candidateProfileId`, tên thật, email, điện thoại, file CV gốc, link LinkedIn/GitHub/portfolio, địa chỉ chính xác hoặc parsed CV chưa che thông tin — kể cả qua chat, notification, analytics, realtime payload và cache.
3. Không tồn tại đường vòng từ recommendation sang endpoint mở khóa liên hệ trực tiếp; legacy CV Pool direct unlock bị retire trước beta.
4. Candidate chỉ nhận lời mời có Job Post và company verified còn hợp lệ; không có cold outreach vô ngữ cảnh.
5. Sau accept, conversation vẫn dùng alias; v1 cấm trao đổi direct contact/link ngoài nền tảng. Nếu sau này muốn reveal, đó là một feature mới có consent, policy và review riêng — không mặc định kế thừa từ Discovery.
6. Mọi lần xem, gợi ý, gửi lời mời, trả lời, block, vi phạm policy và revoke phải audit được.
7. Mô hình không được dùng dữ liệu bảo vệ để xếp hạng, và recruiter luôn thấy lý do/gap có thể kiểm chứng thay vì “điểm AI” mơ hồ.

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
| Talent Pool `unlock()` trả tên/email/SĐT | Đây là đường vòng phá mục tiêu giữ trao đổi trên UpNext; `candidateProfileId` từ pool còn có thể bị dùng làm direct key. | Retire endpoint direct unlock trước beta. Nếu giữ Talent Pool, chuyển toàn bộ sang card/invitation ẩn danh, không có direct reveal v1. |
| Conversation hiện select/trả `candidateAccount.fullName` và frontend dùng nó làm tên hội thoại | Candidate bị lộ danh tính ngay sau accept, trái với Discovery masking. | Tạo serializer/contract riêng cho `TALENT_OUTREACH`: recruiter chỉ nhận alias và opaque participant reference. Identity reveal không tồn tại trong v1. |
| Chat hiện nhận text tự do | Recruiter hoặc candidate có thể tự gửi email, SĐT, social/link để bypass nền tảng. | Áp `ContactExchangePolicy` cho mọi message/invitation outreach: reject phone, email, URL, handle, QR-like text trước persistence; attachment vẫn tắt; report/audit và UX giải thích lý do. |
| `CHAT_OUTREACH_ENABLED` mặc định false | Luồng mời/accept có thể chưa hoạt động ở staging. | Verify feature flag, realtime/outbox và end-to-end trước beta. |
| Candidate contact preference hiện chỉ `OPTED_IN/OPTED_OUT` | Consent liên hệ hiện có không đủ để suy ra consent xử lý/ranking CV cho Discovery, và không được dùng để bật invitation Discovery. | Thêm preference/consent Discovery riêng, default off, versioned và có `allowInvitations`; không dùng consent direct-contact legacy. |
| Contact request hiện unique theo `(company, candidate, job)` | Công ty có thể mời cùng candidate cho nhiều Job Post trong cùng ngày. | Thêm window enforce ở DB theo `(company, candidate)` với `nextEligibleAt`; kiểm trước consume quota và trong transaction tạo invitation. |
| Quota hiện bám theo current subscription period; `CV_POOL_VIEW` mang nghĩa direct unlock | Kế hoạch “30 ngày” và reuse `CV_POOL_VIEW` sẽ tính/hiển thị sai, có thể phá quyền lợi gói đang bán. | Dùng `TALENT_DISCOVERY_RUN` riêng; anonymous profile nằm trong run, không có `CV_POOL_VIEW`; chuẩn hóa monthly period theo billing. |

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
allowInvitations: boolean
allowRedactedCvView: boolean
allowedJobFamilies / locations / workingModels (candidate-configurable)
salaryVisibility: HIDE | RANGE_ONLY
lastReviewedAt
```

Yêu cầu UX candidate:

1. Giải thích ngắn gọn: recruiter sẽ thấy profile ẩn danh, CV đã redaction (nếu candidate bật), kỹ năng/kinh nghiệm đã khái quát và lý do match; không thấy tên/email/SĐT/file CV.
2. Cho candidate preview chính xác card và CV đã redaction mà recruiter sẽ nhìn thấy; candidate bật/tắt riêng quyền xem CV chi tiết và quyền nhận invitation.
3. Tách checkbox consent Discovery khỏi “Open to work”, profile visibility và consent nhận lời mời.
4. Cho phép tắt ngay, theo company block, hoặc giới hạn theo vị trí/địa điểm/mô hình làm việc.
5. Lưu consent version, thời điểm và audit event. Không dùng pre-checked checkbox.

### 4.2. Eligibility tại thời điểm đọc, không chỉ lúc chạy AI

Candidate chỉ xuất hiện khi đồng thời thỏa:

```text
TalentDiscoveryPreference = ENABLED
AND JobSearchStatus = OPEN_TO_WORK
AND ProfileVisibility = PUBLIC
AND allowInvitations = true
AND candidate chưa ứng tuyển Job Post đó
AND candidate chưa block company
AND candidate preference khớp job ở các điều kiện cứng đã chọn
AND candidate chưa vượt candidate exposure cap
```

Khi candidate rút consent, tắt invitation/CV view, ẩn profile hoặc block company, mọi recommendation cũ phải bị loại ngay khi recruiter đọc/sử dụng item. Snapshot được lưu cho audit nhưng không còn trả card, không thể gửi contact request và không thể render data cũ từ cache.

Candidate exposure cap v1: cùng một company chỉ được thấy cùng candidate một lần trong 30 ngày, kể cả từ run khác; candidate tối đa xuất hiện với 10 company/30 ngày. Những ngưỡng này được feature-config để điều chỉnh theo beta, nhưng không được bỏ qua chỉ để lấp đủ kết quả. Candidate có trang xem lịch sử company đã thấy/gửi lời mời và có thể block/revoke ngay.

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

V1 không hỗ trợ exchange tên thật, email, SĐT, link cá nhân hay attachment trong Talent Discovery chat. `ContactExchangePolicy` kiểm tra cả invitation và message; phát hiện contact/link thì chặn trước khi lưu, ghi audit với nội dung đã tối thiểu hóa và hướng người dùng tiếp tục trong UpNext. Candidate có thể decline/block bất cứ lúc nào. Bất kỳ cơ chế reveal tự nguyện/direct contact nào là phase mới, không thuộc phạm vi v1.

### 5.3. CV gốc và bản CV ẩn danh

**CV gốc là dữ liệu mật của candidate, không phải dữ liệu recruiter được xem trong Talent Discovery.** Chỉ chặn nút download hoặc vẽ ô đen đè lên PDF là không đủ: text layer, hyperlink, filename, metadata, ảnh/QR, copy-paste và OCR vẫn có thể làm lộ thông tin.

Vì vậy v1 áp dụng hai lớp rõ ràng:

| Thành phần | Quy tắc bắt buộc |
| --- | --- |
| CV gốc (`original CV`) | Là input mật để server tạo bản đã redaction. Không cấp signed URL, preview URL, document id, filename, thumbnail hay API response cho recruiter qua Talent Discovery. |
| CV đã redaction (`redacted anonymous CV`) | Nếu recruiter cần xem sâu hơn card, backend tạo **bản dẫn xuất mới** giữ lại nội dung nghề nghiệp hữu ích nhưng đã loại bỏ hoặc tổng quát hóa dữ liệu định danh. Không chỉnh sửa/đè chữ trên file gốc và không download trong v1. |

Mục tiêu không phải biến CV thành một bản tóm tắt nghèo thông tin. Recruiter vẫn cần thấy vai trò, seniority, skills/công nghệ, trách nhiệm, thành tựu, lĩnh vực công ty, dạng dự án và dải thời gian để đánh giá. Pipeline chỉ giữ đoạn text phù hợp sau khi redaction; không để raw CV đi thẳng ra client.

| Nhóm nội dung | Chính sách trong CV đã redaction |
| --- | --- |
| Giữ sau sanitizer | Chức danh/level, skills, stack, trách nhiệm, thành tựu, loại sản phẩm/ngành, quy mô team đã tổng quát hóa, chứng chỉ không có credential ID, dải thời gian và dải kinh nghiệm. |
| Che bắt buộc | Họ tên/chữ ký, email, SĐT, địa chỉ, ngày sinh, ảnh, số định danh, QR, username, link LinkedIn/GitHub/portfolio/website/social, header/footer contact, filename, metadata, hyperlink, attachment và mọi contact trong body. |
| Che hoặc tổng quát hóa để chống truy ngược | Tên công ty, trường, khách hàng, dự án/sản phẩm nội bộ, tên người, địa điểm làm việc hoặc mốc tháng/năm quá cụ thể và các câu thành tựu có fingerprint đủ để tìm ra một người. Ví dụ `Senior Engineer tại Công ty X, dự án Y cho khách hàng Z` thành `Senior Engineer, nền tảng SaaS, 3–5 năm kinh nghiệm`. |
| Không chắc an toàn | Bỏ đoạn đó, không “cố che” rồi hiển thị. Candidate có thể trao đổi thêm qua anonymous chat, nhưng v1 không cho gửi direct contact/link. |

Renderer phải dựng HTML/PDF mới hoàn toàn từ `AnonymousCandidateView` đã được server redaction/validate: giữ các đoạn nghề nghiệp an toàn, thay token nhạy cảm bằng `[đã ẩn]` hoặc dạng tổng quát hóa, rồi flatten và loại bỏ link/annotation, metadata, form fields, hidden layer, image, QR/barcode và attachment. Không dùng PDF redaction overlay, không proxy file gốc, không truyền raw parsed text vào client.

Trước khi publish bản dẫn xuất, worker chạy kiểm tra nhiều lớp: regex PII (email/phone/URL/social handle), detector tên/địa chỉ theo locale, detector tên công ty/trường/dự án/khách hàng theo dữ liệu trích xuất, OCR trên trang render, kiểm tra PDF text/link/metadata và regression fixtures với PDF/DOCX/image CV. Phát hiện nghi ngờ thì fail closed: không phát hành document, chỉ giữ card an toàn và tạo security event để xử lý. Candidate phải thấy chính xác preview recruiter thấy và có thể tắt riêng quyền xem CV đã redaction mà không cần rút toàn bộ consent Discovery.

`anonymousCvId` nếu cần là opaque, scoped theo recommendation/run, TTL ngắn, chỉ stream sau authorization server-side; không được là CV/source id. Với v1 beta, có thể tắt hoàn toàn document preview và chỉ phát hành card/hồ sơ structured ẩn danh cho đến khi pipeline render-redact vượt toàn bộ privacy test.

## 6. Luồng recruiter và candidate

### 6.1. Recruiter tạo Discovery

1. Mở một Job Post của công ty mình, đang PUBLISHED/APPROVED/còn hạn; company phải VERIFIED và subscription còn active.
2. Chọn `Tìm ứng viên phù hợp` và nhìn thấy số lượt còn lại.
3. Client gửi `Idempotency-Key` UUID bền vững khi tạo run.
4. Backend authorize job, reserve/tạo usage entitlement, tạo run `PENDING`, xếp hàng tính toán.
5. Khi hoàn thành, recruiter nhận tối đa số kết quả entitlement cho phép; card luôn ẩn danh.
6. Xem lại cùng snapshot không trừ thêm quota. `Refresh` chỉ tạo run mới khi `matchingFingerprint` (title, requirements, required/preferred skills, experience, location, working model, salary) đổi hoặc run completed đã quá 7 ngày; nếu không trả snapshot cũ, không charge và không dùng refresh để dò ứng viên.

### 6.2. Recruiter gửi lời mời

1. Recruiter mở card ẩn danh và bấm `Mời trao đổi trên UpNext`.
2. Viết message có context job; backend kiểm tra candidate còn eligible, candidate exposure cap, company cooldown, anti-spam và candidate chưa bị block. Request chỉ nhận `recommendationId`, không nhận `candidateProfileId`.
3. `ContactExchangePolicy` block phone/email/URL/social handle/QR-like content trước khi lưu. Trừ một `talent_contact` khi request, intro message và outbox cùng commit thành công; nếu transaction thất bại trước commit, không được trừ hoặc phải reverse có audit.
4. Candidate nhận invitation hiển thị company, recruiter, Job Post và message. Candidate có 7 ngày để accept/decline/block.
5. Khi accept, mở `TALENT_OUTREACH` anonymous conversation. Recruiter thấy `Candidate #A7K4`, không thấy candidate account/profile id, full name hay avatar; candidate vẫn thấy company/recruiter và Job Post. V1 giữ no-contact-exchange policy trong toàn bộ conversation.

### 6.3. Chống spam và bypass

- `CompanyCandidateOutreachWindow` là nguồn sự thật cho cooldown: unique `(companyId, candidateProfileId)`, `nextEligibleAt`; 30 ngày được enforce trong transaction, bất kể khác Job Post. Không dựa vào unique hiện tại theo `(company, candidate, job)`.
- Limit v1: 20 invitation/recruiter/ngày, 100 invitation/company/ngày, 1 invitation/company-candidate/30 ngày, tối đa 10 company thấy candidate/30 ngày. Các con số config được và phải hiện trong dashboard/alert.
- Thêm report/block trực tiếp trong invitation/chat; block có hiệu lực ngay với cả recommendation và outreach tương lai.
- Không trả profile identifier cho client. Action sau đó dùng `recommendationId` hoặc opaque `candidateRef`, server tự resolve và re-check quyền.
- Retire `POST /talent-pool/:candidateProfileId/unlock` trước beta, trả `410` có thông điệp migration và xóa CTA trên frontend. Talent Pool chỉ được mở lại sau v1 nếu dùng chính anonymous card + invitation contract; không có `DIRECT_CONTACT_ALLOWED` trong v1.
- Không có nút `Xem CV gốc`, `Tải CV`, `Mở file` hay preview dùng source URL trong Discovery. CTA duy nhất (nếu Candidate cho phép) là `Xem hồ sơ ẩn danh`; mọi lần xem phải qua authorization, audit và policy current-state.
- Conversation serializer riêng cho `TALENT_OUTREACH` phải bỏ candidate account/profile identifier và fullName/avatar khỏi REST, Socket.IO, notification, search index, analytics payload và frontend state. Không được tái dùng projection của application chat.

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

CV redaction và Discovery index là hai pipeline tách biệt: index chỉ dùng taxonomy/sanitized text không-PII; redacted CV dùng source CV trong trusted backend để tạo artifact xem bởi recruiter. Không gửi raw CV, parsed CV, company/school/project names hay redacted artifact sang embedding provider.

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
- Mỗi job snapshot có `matchingFingerprint` SHA-256 trên các field ảnh hưởng ranking. Run mới chỉ được charge khi fingerprint thay đổi hoặc snapshot đã quá 7 ngày; candidate eligibility luôn re-check lúc đọc/action dù fingerprint không đổi.

### 7.4. Quality gate trước beta

Không launch đại trà chỉ vì vector search chạy được. Trước beta, team tạo tập evaluation được consent, tối thiểu 100 cặp Job–candidate phân bố trên các job family pilot; reviewer recruiter chấm blind `relevant / not relevant` theo rubric đã thống nhất. Điều kiện vào beta:

- Precision@10 từ 70% trở lên trên tập pilot; không đạt thì chỉ điều chỉnh retrieval/rerank, không hạ threshold để đủ card.
- 100% job hard requirement bị thiếu theo rule loại phải không xuất hiện trong expected fixture.
- P95 run dưới 15 giây với corpus staging mục tiêu; zero PII trong provider mock, API, socket, log và artifact scan.
- Chỉ bật job family/location có đủ candidate explicit opt-in để trả ít nhất 5 kết quả quality-gated; vùng thiếu supply hiển thị unavailable/waitlist, không bịa match.

## 8. Entitlement và thanh toán

Thêm feature registry riêng, không tái sử dụng `AI_CV_MATCHING`:

```text
TALENT_DISCOVERY_RUN  # metered, số lần tạo/refresh snapshot
```

`AI_CV_MATCHING` tiếp tục dành cho chấm CV của **ứng viên đã nộp đơn**. Trộn hai khái niệm sẽ làm pricing, COGS và UX sai.

| Quyền lợi | Free | Pro | Ghi chú |
| --- | ---: | ---: | --- |
| Talent Discovery run | 1 | 10 | Theo company và theo chu kỳ tháng subscription; không rollover. |
| Số card tối đa/run | 5 | 30 | Số thực tế có thể thấp hơn. |
| Profile/CV đã redaction chi tiết | Bao gồm cho tối đa 5 card của run | Bao gồm cho tối đa 30 card của run | Không charge view riêng; không dùng/redefine `CV_POOL_VIEW`; không bao giờ unmask PII. |
| Lời mời trao đổi trong app | 1 | 250 | Dùng `TALENT_CONTACT`, theo anti-spam policy. |

`TALENT_DISCOVERY_RUN` và `TALENT_CONTACT` phải được provision theo monthly period ngay cả khi company thanh toán gói năm. Backend trả `periodEnd`/`remaining`; frontend copy đúng ngày reset. Upgrade có hiệu lực ở cycle tiếp theo, downgrade không thu hồi snapshot/chat đang hợp lệ nhưng chặn run/contact mới vượt allowance; không rollover hay chuyển quota giữa company.

Khi run thành công mới finalize consume. Có thể reserve usage trong transaction tạo run và reverse rõ lý do `talent-discovery-failed` khi worker thất bại trước khi publish result. Không charge lượt xem lại, polling, refresh bị reject do fingerprint chưa đổi hay result bị candidate rút consent.

Trước khi chốt các limit sau beta, đo riêng COGS của embedding index, query, rerank và storage. Không suy ra COGS Discovery từ chi phí Gemini screening của CV application.

## 9. API contract v1

### Recruiter

```http
POST /api/v1/recruiter/job-posts/:jobPostId/talent-discovery-runs
Idempotency-Key: <uuid>
```

```json
{
  "id": "run-uuid",
  "status": "PENDING",
  "remainingRuns": 9,
  "maxResults": 30,
  "periodEnd": "2026-10-01T00:00:00.000Z",
  "jobPostId": "job-uuid"
}
```

```text
GET  /api/v1/recruiter/talent-discovery-runs/:runId
GET  /api/v1/recruiter/talent-discovery-runs/:runId/recommendations
GET  /api/v1/recruiter/talent-recommendations/:recommendationId/anonymous-profile
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

`GET .../anonymous-profile` trả structured anonymous profile hoặc short-lived stream của CV đã redaction; không trả source document, signed URL, filename, original MIME type hoặc raw extracted text. Endpoint mặc định có thể trả `403 ANONYMOUS_CV_NOT_ENABLED` nếu candidate không bật quyền xem sâu hoặc beta chưa mở document preview.

`POST .../contact-requests` chỉ nhận `{ "introMessage": "..." }` và `Idempotency-Key`; server resolve candidate nội bộ từ recommendation. Intro message đi qua `ContactExchangePolicy`; các token direct-contact/link bị reject với code `CONTACT_EXCHANGE_NOT_ALLOWED`, không bị silent-strip. Không có public endpoint nào nhận `candidateProfileId`, `candidateAccountId`, CV id hay `anonymousCvId` để tạo contact/conversation.

### Candidate

```text
GET   /api/v1/candidate/talent-discovery-preference
PUT   /api/v1/candidate/talent-discovery-preference
GET   /api/v1/candidate/talent-discovery-preview
DELETE /api/v1/candidate/talent-discovery-preference  # revoke ngay
```

Candidate Discovery endpoints thêm `GET /api/v1/candidate/talent-discovery-exposure` để candidate xem company đã được hiển thị/mời và block/revoke. Contact endpoint hiện có chỉ được tái sử dụng sau khi thay input bằng recommendation internal mapping, source `TALENT_DISCOVERY`, anonymous conversation và company-candidate cooldown; DTO hiện nhận `candidateProfileId` không được public trong flow này.

## 10. Data model và audit

Thêm/chỉnh các model theo hướng additive migration:

```text
CandidateTalentDiscoveryPreference
AnonymousCandidateView / AnonymousCvArtifact
TalentDiscoveryIndex
TalentDiscoveryRun
TalentDiscoveryRecommendation
TalentDiscoveryViewEvent
CandidateDiscoveryExposureEvent
CompanyCandidateOutreachWindow
CandidateDiscoveryExposureWindow
TalentContactRequest.source / recommendationId / anonymousAlias
Conversation.anonymousMode / candidateAlias / identityRevealState
```

Các bản ghi recommendation trong database có thể giữ foreign key nội bộ `candidateProfileId` để join, nhưng serializer recruiter tuyệt đối không gửi value này. Mỗi run lưu job snapshot, `matchingFingerprint`, scoring config/version, candidate eligibility checked-at và masking policy version. `TalentDiscoveryRecommendation` có opaque reference ký/HMAC per-run; không tạo UUID client-visible có thể suy ra profile.

`CompanyCandidateOutreachWindow` unique theo `(companyId, candidateProfileId)`, giữ `lastContactedAt`, `nextEligibleAt`, last recommendation/job để enforce 30 ngày bằng transaction. `CandidateDiscoveryExposureWindow` unique theo `(candidateProfileId, companyId)`, giữ `lastExposedAt` và `nextEligibleAt` để cùng company không thấy lại candidate trong 30 ngày; `CandidateDiscoveryExposureEvent` append-only là nguồn để transaction đếm distinct company trong rolling 30 ngày. Không dùng cache app hoặc best-effort cron làm nguồn sự thật.

`Conversation.anonymousMode = TALENT_DISCOVERY` buộc serializer theo actor: recruiter không nhận candidate account id/fullName/avatar; candidate vẫn nhận company/recruiter/job để đưa ra quyết định. `identityRevealState` v1 luôn `NOT_AVAILABLE`; field tồn tại chỉ để ngăn việc vô tình dùng application-chat projection và để phase sau có migration rõ ràng.

`AnonymousCandidateView` chỉ lưu structured fields và các đoạn text đã redaction cùng policy/version/source revision; không copy/ngầm trả nguyên `parsedText`. Nếu có `AnonymousCvArtifact`, artifact phải là derived file đã render, encrypted at rest, TTL/cleanup riêng, không có public object key và không chung storage URL với source CV. Candidate revocation, profile visibility change hoặc source revision phải invalidate artifact ngay.

Audit event tối thiểu:

```text
DISCOVERY_CONSENT_GRANTED / REVOKED
DISCOVERY_RUN_CREATED / COMPLETED / FAILED
RECOMMENDATION_VIEWED
ANONYMOUS_PROFILE_VIEWED
ANONYMOUS_CV_RENDERED / BLOCKED_BY_REDACTION / INVALIDATED
CONTACT_REQUESTED / ACCEPTED / DECLINED / BLOCKED / EXPIRED
CONTACT_EXCHANGE_BLOCKED
DISCOVERY_EXPOSURE_RECORDED / CAPPED
```

Không log raw request payload chứa CV, contact data hoặc model prompt. Retention của recommendation snapshot, event audit và embedding/index phải do Privacy/Legal phê duyệt trước production; phải có job cleanup và kiểm tra deletion/opt-out trong test.

## 11. Công việc theo repository

### `upnext-be`

1. Viết additive migration cho preference/index/run/recommendation/exposure/outreach-window/audit/anonymous-conversation attribution; không xóa lịch sử audit.
2. Retire `POST /talent-pool/:candidateProfileId/unlock`: frontend CTA bị xóa trước, backend trả `410 CV_POOL_DIRECT_UNLOCK_RETIRED`, migration không tạo đường fallback direct contact.
3. Tạo Discovery consent service, candidate preview, invitation/CV-view toggles, exposure history và immediate revocation gate; không suy ra từ `CandidateContactPreference` cũ.
4. Tách `DiscoveryTextBuilder`/sanitizer khỏi `buildCvText`; tạo tests phủ email, phone, URL, name, address, file name và raw parsed CV không xuất hiện trong discovery text/provider request.
5. Xây `AnonymousCandidateView` và pipeline redaction/render server-side: trích xuất CV gốc trong trusted backend, giữ text nghề nghiệp an toàn, mask/generalize direct + indirect identifier, re-render derived artifact, strip metadata/link/image/hidden layer, OCR/PII scan và fail closed khi không chắc chắn. Source CV không được dùng như preview.
6. Xây indexer một index/candidate và pgvector repository có hard filter trong SQL; add job fingerprint, candidate exposure cap và evaluation fixtures.
7. Thay/rework `TalentRecommendationService`: async queue, idempotency, monthly feature quota, threshold, snapshot, fingerprint refresh policy và opaque projection.
8. Tạo Discovery contact endpoint chỉ nhận `recommendationId`; thêm `CompanyCandidateOutreachWindow` atomic enforcement, `ContactExchangePolicy`, report/audit và no-contact-exchange policy.
9. Tạo conversation serializer/socket/notification projection riêng cho `TALENT_OUTREACH`; recruiter chỉ nhận alias, không bao giờ reuse application-chat participant projection.
10. Cứng hóa authorization/IDOR: recruiter chỉ action bằng recommendation id thuộc company/run của mình; re-check candidate state ở every read/action.
11. Thêm API Swagger, errors, outbox, metrics/alerts và admin audit/read-only tools.

### `upnext-frontend`

1. Thêm candidate consent page, preview masked profile/redacted CV, invitation/CV-view toggles, exposure history, revoke/block settings và copy minh bạch.
2. Thêm recruiter flow tại Job Post: quota banner có ngày reset, generate/poll/retry, card ẩn danh, reason/gap, `Xem hồ sơ ẩn danh` (nếu được phép), invitation composer và invitation state; tuyệt đối không có raw CV/download action.
3. Thêm workspace `Ứng viên đề xuất` chỉ như anonymous inbox conversation; UI title/avatar dùng alias cho recruiter ở mọi trạng thái, kể cả sau accept.
4. Xóa CTA direct unlock CV Pool và mọi typed contract/raw field liên quan; không render candidate ID, file URL, contact field hoặc alias-to-ID map trong state/devtools/analytics.
5. Composer phải hiển thị policy, block contact/link client-side để UX tốt nhưng backend là source of truth; hiển thị lỗi rõ khi policy block.
6. Thêm UI states: quota period/end, fingerprint chưa đổi, index đang cập nhật, không đủ candidate, exposure cap, candidate vừa opt-out, contact quota hết, rate limited và API failure.

### `upnext-infra`

1. Feature flags riêng: `TALENT_DISCOVERY_ENABLED`, `TALENT_DISCOVERY_CONTACT_ENABLED`, `TALENT_DISCOVERY_REDACTED_CV_ENABLED`; không tái sử dụng flag chat chung làm cờ product duy nhất.
2. Queue/worker, cron retry, dead-letter monitoring và single-scheduler/idempotent worker behavior khi scale.
3. Secrets/egress policy cho embedding provider; không gửi raw CV vào provider discovery path.
4. Dashboard/alerts: queue lag, run failure, PII sanitizer/contact-exchange violation, zero-result rate, Precision@10 pilot, exposure-cap hit, contact acceptance/block/report rate, quota errors.
5. Migration deploy trước application code, backup và rollback theo pipeline chuẩn.

### `upnext-ai`

V1 không cần tạo một service AI mới nếu backend embedding provider hiện có đáp ứng. Chỉ dùng `upnext-ai` ở phase sau nếu cần reranker/normalizer riêng, khi đó phải có contract không-PII, versioning, evaluation set và human review.

## 12. Test matrix bắt buộc

### Privacy và authorization

- Snapshot/API/frontend payload không chứa name, email, phone, address, avatar, link, file URL/id, profile/account/CV id, raw parsed text hoặc source file name.
- Recruiter accept/open/list/detail/realtime notification của `TALENT_OUTREACH` chỉ nhận alias; snapshot test phải chứng minh không có candidate `fullName`, account id, profile id hoặc avatar sau accept. Application chat không được regression.
- Recruiter không thể tìm/preview/download CV gốc bằng recommendation id, opaque ref, artifact id, guessed storage key, browser cache hay URL từng cấp; mọi attempt trả 403/404 và được audit phù hợp.
- CV đã redaction không có text layer/hyperlink/metadata/attachment/image/QR chứa PII; regex + OCR + manual fixture review pass trước beta. Nội dung nghề nghiệp an toàn phải giữ được; câu/field không xác định an toàn phải bị bỏ (fail closed).
- Recruiter đổi recommendation id/run id/company id để truy cập candidate khác đều trả 404/403 không làm lộ tồn tại data.
- Candidate revoke consent/hide profile/block company giữa lúc run đang xử lý: result không được trả/contact được.
- Legacy Talent Pool direct unlock trả `410` với mọi input; không có fallback email/phone/fullName ở API, UI, job queue hay admin helper.
- Invitation/message outreach chứa email, phone, URL, social handle hoặc QR-like content bị backend reject trước persistence; attachment bị từ chối; false-positive fixtures có review rõ ràng.
- Logs/error/analytics/provider mock không nhận PII discovery text.

### Product và quota

- Free đúng 1 run + 5 card/detail + 1 invitation; Pro đúng 10 run + 30 card/detail/run + 250 contact theo company/monthly cycle; annual billing vẫn tạo monthly counter.
- Retry cùng Idempotency-Key không charge hai lần; request đồng thời không vượt limit.
- Refresh fingerprint không đổi hoặc snapshot chưa quá 7 ngày không charge; run failed trước publish được reverse/không charge; result read không charge lại.
- Candidate đã apply/block/opt-out/không open-to-work bị loại.
- Company-candidate 30-day outreach window và candidate exposure 10 company/30 ngày được enforce bằng transaction, kể cả run/job/recruiter khác; accept/decline/block/expiry cập nhật anonymous conversation đúng.

### Matching quality và scale

- Skill required, experience, location/work model, salary opt-in, threshold và reason codes có unit tests deterministic.
- Không có 30 người đủ điều kiện thì trả số thực tế, không lấp bằng match dưới ngưỡng.
- Một candidate có nhiều CV version chỉ xuất hiện một lần.
- pgvector query có filter/limit và benchmark corpus staging; fallback phải có cap rõ ràng, không full scan vô hạn.
- Evaluation fixture có tối thiểu 100 Job–candidate consented pairs; Precision@10 đạt ngưỡng beta, hard-requirement negative cases không lọt kết quả.

### End-to-end staging

```text
Candidate opt-in + preview -> index ready
-> recruiter Pro tạo run -> nhận card masked
-> recruiter gửi invitation -> candidate accept
-> anonymous conversation mở -> alias/contact không tự reveal
-> direct-contact message bị block, CV source không truy cập được
-> candidate revoke/block -> future discovery/contact bị chặn
```

## 13. Rollout và rollback

1. **Phase 0 – retire bypass:** deploy frontend removal, then backend `410` direct CV Pool unlock; verify no service/job/admin helper still calls it. Flags Discovery vẫn tắt.
2. **Phase 1 – anonymous matching:** deploy migration/indexer với flags tắt; backfill chỉ cho candidate explicit opt-in mới. Internal test profile card, consent, quota, fingerprint, exposure window và no-PII provider mock.
3. **Phase 1.5 – anonymous chat:** bật staging cohort nhỏ; test invitation/accept/decline/block with alias-only REST, Socket.IO, notifications và ContactExchangePolicy.
4. **Phase 2 – redacted CV:** chỉ bật `TALENT_DISCOVERY_REDACTED_CV_ENABLED` sau OCR/metadata/manual fixture gate. Nếu scan fail, chỉ card structured, không có source fallback.
5. **Beta Pro có kiểm soát:** chỉ mở cho job family/location đạt quality/supply gate; đo Precision@10, zero-result, accepted invitation, block/report, exposure cap, latency/cost và interview-created rate trước khi mở rộng/public pricing.

Rollback:

- Tắt `TALENT_DISCOVERY_ENABLED`: ngừng tạo run mới, không xóa historical audit.
- Tắt contact flag: ẩn CTA gửi lời mời nhưng giữ candidate control/conversation đã có.
- Revocation vẫn phải hoạt động khi feature flag tắt.
- Không rollback bằng cách expose profile/contact hoặc xóa evidence audit. Migration phải additive và backward-compatible.

## 14. Tiêu chí nghiệm thu

Chỉ có thể gọi AI Talent Discovery là done khi:

- Candidate phải explicit opt-in và có preview đúng card ẩn danh.
- Không có PII/direct identifier nào qua recruiter API, UI, anonymous conversation/realtime/notification, logs, embedding provider hoặc legacy CV Pool unlock.
- Recruiter Pro dùng được quota thật; Free có trải nghiệm thử giới hạn; retry/concurrency không trừ sai.
- Mọi kết quả đều gắn với Job Post hợp lệ, có reason/gap giải thích được và không dùng protected data.
- Candidate chọn accept/decline/block; sau accept conversation vẫn alias-only và ContactExchangePolicy buộc trao đổi ở UpNext.
- Opt-out/block có hiệu lực với cả snapshot cũ và request mới ngay lập tức.
- Precision@10/supply gate, staging E2E, security/contract tests, migration safety, observability và Legal/Privacy approval đều pass.

## 15. Thứ tự triển khai

1. **P0a – retire bypass:** xóa/tắt direct CV Pool unlock và kiểm chứng không còn source/API/CTA dẫn đến PII direct contact.
2. **P0b – privacy foundation:** consent riêng, masked contract, discovery index không-PII, redacted-CV pipeline fail-closed và revocation.
3. **P0c – backend integrity:** monthly entitlement, atomic quota/idempotency, job fingerprint, company-candidate window, candidate exposure cap, async matching/ranking.
4. **P0d – anonymous in-platform outreach:** contact API từ recommendation, ContactExchangePolicy, anonymous conversation serializer/realtime/notification và candidate controls.
5. **P0e – frontend end-to-end:** recruiter Discovery UI, candidate preview/exposure/revoke, alias-only chat, no direct unlock/download/contact-share UI.
6. **P0f – quality and staging gate:** evaluation dataset, precision/supply threshold, privacy/contract test, staging E2E và observability. Chỉ sau đó mới bật beta.
7. **P1 – quality/cost tuning sau beta:** calibration theo job family, COGS, reranker, reporting và admin support tooling; không hạ privacy/quality gate để tăng coverage.
8. **P2 – mở rộng:** notification opt-in, discovery filter nâng cao, marketplace analytics. Identity/contact reveal là product proposal mới, không tự động kế thừa từ v1.

## 16. P0 sign-off bắt buộc trước khi bắt đầu development

| Owner | Quyết định phải ký | Điều kiện pass |
| --- | --- | --- |
| Product | V1 là anonymous end-to-end: không identity reveal, không direct-contact exchange, profile detail đã bao gồm trong Discovery run. | UX/copy và pricing Free/Pro theo company/monthly cycle được duyệt. |
| Engineering | Retire direct unlock; mô hình alias conversation, quota monthly, DB windows/exposure và API opaque được duyệt. | ADR ngắn cho mỗi thay đổi cross-cutting, migration plan additive và owner từng repo. |
| Legal/Privacy | Consent copy, purpose, retention, provider egress, redaction/exposure policy và chat moderation được duyệt. | Không có raw CV/PII đi qua Discovery provider/client; candidate revoke/block policy xác nhận. |
| Data/AI | Taxonomy, evaluation rubric/dataset consented và threshold beta được duyệt. | Precision@10, hard-rule and no-PII gates ở mục 7.4 đo được trước beta. |
| Operations | Feature flags, queue/DLQ, alerts, rollback và support runbook được duyệt. | Staging drill pass cho revoke, redaction scan fail, quota race, contact policy block và outage provider. |

Không có sign-off nào ở trên thì công việc chỉ dừng ở discovery/design; không merge migration hay bật flag production.
