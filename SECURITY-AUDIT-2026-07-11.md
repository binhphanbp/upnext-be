# REST API Security Audit — upnext-backend

**Stack:** NestJS · Prisma · PostgreSQL
**Phạm vi:** Toàn bộ `src/` (~40 module)
**Ngày:** 2026-07-11
**Phương pháp:** Đọc mã tĩnh (static review), không tấn công hệ thống live

**Tổng kết:** 6 Critical · 7 High · 8 Medium · 9 Low

---

## Trạng thái khắc phục (cập nhật 2026-07-11)

> Đã sửa trên nhánh `dev`. Toàn bộ thay đổi qua `typecheck` + `lint` + 50 unit test + `nest build` sạch.

### ✅ Đã khắc phục
- **Toàn bộ 6 Critical**: xoá backdoor `x-bypass-auth`; thêm auth guard + `@CurrentUser()` cho 5 route applications; khoá field nhạy cảm + ownership `recruiter-accounts`; `checkCompanyPermission` cho 6 route companies; ownership CV/cv-versions (candidate sở hữu, recruiter chỉ qua application của công ty, admin toàn quyền); shortlists dùng `@CurrentUser()`.
- **High**: IDOR company-reviews/company-follows/saved-jobs/recruiter-profiles (dùng `@CurrentUser()`); rate-limit global `ThrottlerGuard` + `@Throttle` chặt cho login/refresh; gỡ credential admin khỏi Swagger; validate file CV bằng magic bytes `%PDF-` + hardcode extension; invoice `pay` chỉ ADMIN xác nhận (chặn recruiter tự kích hoạt miễn phí).
- **Medium**: `/docs` chỉ mở ngoài production + áp helmet cho cả /docs; body size limit 1MB; refresh-token reuse → revoke toàn bộ token family; upload `limits.fileSize` + `fileFilter` MIME cho tất cả endpoint upload.
- **Low**: JWT secret min 32 ký tự; CORS chặn localhost ở production (fail-closed); Prisma global `omit` cho `passwordHash` (defense-in-depth); xoá `src/test-db.ts`; `@MaxLength(2000)` cho các trường free-text review; notification `test-send` yêu cầu ADMIN.

### ⏳ Chưa sửa — cần quyết định/kiểm thử riêng (không sửa mù để tránh vỡ luồng đang chạy)
- **OAuth `state` CSRF (Medium)**: cần hạ tầng session/cookie ký + kiểm thử vòng OAuth Google thật.
- **Token trả qua URL redirect (Medium)**: cần đổi sang mã trao đổi một lần (one-time code) + thay đổi hợp đồng phía frontend.
- **Invoice: verify cổng thanh toán thật (High, còn lại)**: đã chặn tạm bằng ADMIN-only; giải pháp đúng là webhook có verify chữ ký từ payment provider.
- **Google client dummy fallback (Low)**: đổi sang `getOrThrow` sẽ fail-closed nhưng làm hỏng dev khi chưa cấu hình Google — cần quyết định chính sách env.
- **`ownerType` free string (Low)**: cần tập owner-type chính thức để chuyển sang `@IsIn` mà không làm hỏng upload hợp lệ.
- **`@Public()` dead code (Low)**: hiện vô hại (không guard nào đọc); nên wire vào global `JwtAuthGuard` hoặc xoá — churn thuần, để lại.

---

## Việc cần làm ngay (5 mục — chặn trong tuần này)

Đây là các lỗi có thể khai thác trực tiếp qua HTTP, không cần điều kiện đặc biệt.

1. Xoá header backdoor `x-bypass-auth` trong `JwtAuthGuard` — cấp quyền ADMIN không cần token.
2. Chặn IDOR trên toàn bộ module `cvs` / `cv-versions` — bất kỳ ai cũng đọc/sửa/xoá CV người khác qua UUID.
3. Thêm kiểm tra sở hữu công ty (`checkCompanyPermission`) vào các endpoint update/delete/upload ảnh của `companies`.
4. Thêm `JwtAuthGuard` cho 5 route của `applications` hiện đang hoàn toàn public.
5. Sửa `PATCH /recruiter-accounts/:id` để không cho tự đặt `companyId` / `recruiterRoleId` tuỳ ý (leo thang đặc quyền).

---

## 1 · Xác thực & quản lý phiên

JWT, OAuth Google, hash mật khẩu, refresh token cho candidate / recruiter / admin.

### 🔴 Critical — Backdoor bypass xác thực qua header
**File:** `src/modules/auth/guards/jwt-auth.guard.ts:6-17`

- **Vấn đề:** Nếu `NODE_ENV === 'development'` và request có header `x-bypass-auth: true`, guard gán thẳng `{ role: 'ADMIN' }` và bỏ qua toàn bộ xác minh JWT. Guard này được dùng ở gần như mọi route bảo vệ.
- **Khai thác:** `curl -H "x-bypass-auth: true" https://host/api/v1/admin/roles` → toàn quyền admin, không cần token — miễn tiến trình đang chạy có biến môi trường `NODE_ENV=development` (rất dễ xảy ra ở staging/UAT copy nhầm .env).
- **Fix:** Xoá hẳn nhánh này. Nếu cần bypass cho test, dùng dependency injection thay strategy trong test module, không gate bằng biến môi trường runtime.

### 🟠 High — Không rate-limit endpoint đăng nhập/reset mật khẩu
**File:** `src/app.module.ts:55-60` (đã đăng ký nhưng chưa bind global)

- **Vấn đề:** `ThrottlerModule` có cấu hình nhưng không có `APP_GUARD` toàn cục. Chỉ 2 controller email-verification dùng `@UseGuards(ThrottlerGuard)` thủ công; toàn bộ login/refresh/reset của admin, recruiter, candidate không giới hạn.
- **Khai thác:** Brute-force mật khẩu admin không giới hạn qua `POST /admin/auth/login`; spam email qua endpoint reset mật khẩu.
- **Fix:** Đăng ký `{ provide: APP_GUARD, useClass: ThrottlerGuard }` toàn cục, thêm `@Throttle()` chặt hơn riêng cho login/register/refresh/forgot-password.

### 🟠 High — Tài khoản admin seed mặc định bị công khai trong Swagger
**File:** `prisma/seed.ts:1365,1553-1566` · `admin-auth.controller.ts:24-27`

- **Vấn đề:** Seed tạo `admin.super@upnext.dev` với mật khẩu `Password123!`, và mô tả `@ApiOperation` in luôn credential này — hiển thị tại `/docs` không cần xác thực.
- **Khai thác:** Đọc `/docs` → login thẳng bằng credential mẫu. Kết hợp với việc thiếu rate-limit ở trên, đây là đường thẳng tới quyền super-admin nếu seed chưa đổi mật khẩu.
- **Fix:** Không in credential thật/giống thật vào docs công khai; đảm bảo seed không chạy được trên production; bắt buộc đổi mật khẩu lần đăng nhập đầu.

### 🟡 Medium — OAuth Google không có CSRF state thật
**File:** `recruiter-google-auth.guard.ts:6-13` · `google.strategy.ts`

- **Vấn đề:** `state` chỉ chứa locale (`'vi'`/`'en'`), không phải nonce ngẫu nhiên, không có session middleware để lưu/so khớp. Xác nhận độc lập bởi 2 audit riêng biệt (auth + upload/integration).
- **Khai thác:** Login-CSRF kiểu OAuth cổ điển: kẻ tấn công khởi tạo flow rồi lừa nạn nhân hoàn tất callback, không có gì ràng buộc callback với đúng request đã khởi tạo.
- **Fix:** Sinh nonce ngẫu nhiên ký per-request, lưu cookie, so khớp ở callback — không dùng `state` để mã hoá locale.

### 🟡 Medium — Phát hiện refresh-token reuse nhưng không revoke toàn bộ
**File:** `recruiter-auth.service.ts:116-163,471-498`

- **Vấn đề:** Rotation revoke đúng token cũ và phát hiện replay (trả 401), nhưng không revoke các token còn hiệu lực khác của cùng tài khoản, không log/cảnh báo khi phát hiện reuse.
- **Khai thác:** Kẻ tấn công có refresh token bị lộ chạy đua với client hợp lệ; bên thua chỉ nhận 401 sạch, không có tín hiệu nào cho biết token đã bị đánh cắp — token còn lại của kẻ tấn công vẫn hoạt động bình thường.
- **Fix:** Khi phát hiện reuse, revoke toàn bộ `recruiterRefreshToken` chưa hết hạn của account đó và bắt đăng nhập lại; cân nhắc log/cảnh báo.

### 🟢 Low — Endpoint push-notification test-send không cần auth
**File:** `notifications/notification-token.controller.ts:41-75`

- **Vấn đề:** `POST /notifications/tokens/test-send` có `@Public()`, nhận FCM token + title/body tuỳ ý, gửi qua Firebase credential của server.
- **Khai thác:** Kẻ tấn công có/đoán được FCM token có thể spam người dùng bằng nội dung push tự chọn (phishing), dùng quota Firebase của ứng dụng.
- **Fix:** Bỏ khỏi production hoặc yêu cầu `JwtAuthGuard` + role admin + throttle.

### 🟢 Low — Fallback ngầm cho Google client secret
**File:** `google.strategy.ts:10` · `recruiter-google.strategy.ts:11`

- **Vấn đề:** `configService.get('googleClientSecret') || 'dummy-google-client-secret'` — thiếu biến môi trường sẽ boot âm thầm với giá trị giả thay vì crash, khác với cách xử lý `getOrThrow` ở chỗ khác trong `env.validation.ts`.
- **Fix:** Dùng `getOrThrow` nhất quán với phần còn lại của cấu hình.

### 🟢 Low — `@Public()` là dead code, không guard nào đọc nó
**File:** `src/common/decorators/public.decorator.ts`

- **Vấn đề:** `IS_PUBLIC_KEY` metadata không được `JwtAuthGuard`/`RolesGuard`/`AdminPermissionsGuard` đọc ở bất kỳ đâu — bảo vệ route hiện tại hoàn toàn dựa vào việc có/không có `@UseGuards(...)` tường minh. 21 chỗ dùng `@Public()` hiện không gây bypass thật, nhưng là code gây hiểu lầm.
- **Fix:** Wire thật vào một global guard (khuyến nghị: đăng ký `JwtAuthGuard` global, dùng `@Public()` để opt-out — defense in depth), hoặc xoá annotation để tránh ảo giác an toàn.

**Đã kiểm tra — ổn:** bcrypt salt rounds 10–12 hợp lý · password hash không bao giờ trả về client (Prisma `select` allow-list tường minh) · refresh token lưu dạng hash bcrypt, không plaintext · CORS dùng allow-list thật, không wildcard.

---

## 2 · Phân quyền & IDOR (Broken Object-Level Authorization)

Đây là nhóm nghiêm trọng nhất — OWASP API Top 1. Rất nhiều route lấy identity (`candidateAccountId`, `recruiterAccountId`) từ query string thay vì từ JWT, hoặc query theo `id` đơn thuần mà không lọc theo chủ sở hữu.

### 🔴 Critical — Leo thang đặc quyền / chiếm quyền công ty qua PATCH recruiter-accounts
**File:** `recruiters/recruiter-accounts.controller.ts:112-116` · `recruiters.service.ts:80-116`

- **Vấn đề:** Chỉ guard bằng `@Roles(RECRUITER, ADMIN)`, không kiểm tra `:id` có phải chính người gọi. DTO cho phép set `companyId`, `recruiterRoleId`, `status`.
- **Khai thác:** `PATCH /recruiter-accounts/{own-id}` với `{"companyId":"<company-bất-kỳ>"}` → service tự tạo `CompanyMember` với role OWNER cho công ty đó nếu chưa có — chiếm quyền sở hữu công ty bất kỳ ngay lập tức. Hoặc set `recruiterRoleId` = role owner để tự thăng quyền trong công ty hiện tại.
- **Fix:** Lấy id mục tiêu từ `@CurrentUser()` cho self-service; tách endpoint admin-only riêng cho sửa cross-account; không cho non-admin set `companyId`/`recruiterRoleId`/`status` tuỳ ý.

### 🔴 Critical — Chiếm quyền / phá hoại công ty đối thủ
**File:** `companies.controller.ts:163-323` · `companies.service.ts:188-343`

- **Vấn đề:** 6 route (update, logo, cover, photo, delete-photo, delete company) chỉ gọi `ensureCompanyExists(id)`, không gọi `checkCompanyPermission(id, user)` như 6 route khác cùng file (business-license, verify, locations) đã làm đúng.
- **Khai thác:** Recruiter công ty A gửi `DELETE /companies/{company-B}` xoá vĩnh viễn công ty đối thủ (cascade job posts/recruiters), hoặc `PATCH`/upload ảnh để deface trang công khai của họ.
- **Fix:** Thêm `@CurrentUser()` và gọi `checkCompanyPermission(id, user)` trước mọi mutation, đúng pattern đã có trong cùng file.

### 🔴 Critical — IDOR toàn diện trên CV / CV-version — đọc/sửa/xoá CV bất kỳ
**File:** `cvs.controller.ts`, `cv-versions.controller.ts` (toàn bộ handler)

- **Vấn đề:** `candidateAccountId` lấy từ query string (không phải `@CurrentUser()`) cho create/list; `findOne/update/remove/setDefault` và toàn bộ `cv-versions` (upload/download/restore/remove) query bằng `id` đơn thuần, không filter theo chủ sở hữu. Xác nhận độc lập bởi 2 audit khác nhau (authz + upload/integration).
- **Khai thác:** `GET /cv-versions/{uuid-bất-kỳ}/download` tải CV PDF của người khác; `PATCH/DELETE /cvs/{uuid}` sửa/xoá CV người khác; `POST /cvs?candidateAccountId={victim}` tạo CV gán cho nạn nhân.
- **Fix:** Suy ra `candidateProfileId` của người gọi từ `@CurrentUser()` trong mọi handler và thêm vào mọi `where` clause của Prisma; bỏ hẳn `candidateAccountId` như tham số client cung cấp.

### 🔴 Critical — Endpoint applications hoàn toàn không có auth guard
**File:** `applications/applications.controller.ts:61-163` (5 route)

- **Vấn đề:** withdraw, getMyApplications, findOne, getJobApplicants, checkAppliedJob không có `@UseGuards(JwtAuthGuard,...)` và không có global auth guard bù lại. Identity đọc thẳng từ query string, "ownership check" so sánh application với chính giá trị attacker-supplied đó — một phép so sánh vô nghĩa (tautology).
- **Khai thác:** `GET /applications/me?candidateAccountId={uuid-bất-kỳ}` — không cần token — đọc/rút đơn ứng tuyển bất kỳ; `GET /job-posts/{id}/applications?recruiterId={uuid}` lộ toàn bộ danh sách ứng viên (PII + CV) của một công ty cho người ẩn danh.
- **Fix:** Thêm `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles(...)`, lấy identity từ `@CurrentUser()`, bỏ query param.

### 🔴 Critical — Recruiter shortlist — identity giả mạo qua query param
**File:** `recruiter-shortlists.controller.ts:29-55` · `service.ts:9-61`

- **Vấn đề:** `recruiterAccountId` lấy từ `@Query()`; ownership check trong `removeFromShortlist` so với chính giá trị query đã bị giả mạo đó.
- **Khai thác:** `GET /recruiter/shortlists?recruiterAccountId={victim}` đọc ghi chú shortlist riêng tư của recruiter khác; `DELETE .../{id}?recruiterAccountId={victim}` xoá entry của họ.
- **Fix:** Dùng `@CurrentUser()` cho `recruiterAccountId` ở cả 3 handler.

### 🟠 High — company-reviews / company-follows / saved-jobs — cùng lỗi identity qua query
**File:** `company-reviews.controller.ts:36-83` · `company-follows.controller.ts:31-57` · `saved-jobs.controller.ts:31-53`

- **Vấn đề:** Cả 3 module lấy `candidateAccountId` từ query param thay vì `@CurrentUser()`.
- **Khai thác:** Tạo/sửa/xoá review, follow/unfollow công ty, lưu/bỏ lưu job "thay mặt" bất kỳ candidate nào.
- **Fix:** Thay `candidateAccountId` query param bằng `@CurrentUser()` ở cả 3 module.

### 🟠 High — Recruiter profile IDOR — xem/sửa profile người khác
**File:** `recruiter-profiles.controller.ts:94-97,145-148`

- **Vấn đề:** `findMe` lấy `accountId` từ query; `update` không kiểm tra sở hữu `:id`.
- **Khai thác:** Bất kỳ recruiter nào xem/sửa tên, số điện thoại, avatar của recruiter khác qua id/accountId.
- **Fix:** Lấy identity từ `@CurrentUser()`; giới hạn update vào profile của chính người gọi (hoặc yêu cầu ADMIN cho sửa cross-profile).

### 🟠 High — Broken access control khi upload logo/cover/photo công ty
**File:** `companies.service.ts:218-338`

- **Vấn đề:** Cùng gốc với lỗi Critical "Chiếm quyền / phá hoại công ty đối thủ" ở trên nhưng xác nhận riêng bởi audit upload/integration: `uploadLogo/uploadCover/uploadPhoto/deletePhoto` chỉ check `ensureCompanyExists`, không check quyền sở hữu.
- **Fix:** Gộp chung với fix ở trên — thêm `checkCompanyPermission(id, user)`.

### 🟡 Medium — Lộ thông tin cross-company: recruiter account/role
**File:** `recruiter-accounts.controller.ts:88-92,132-136` · `recruiter-roles.service.ts:42-57`

- **Vấn đề:** Không scope theo công ty; bất kỳ recruiter nào cũng xem được trạng thái xác minh, file giấy phép kinh doanh, số liệu dashboard, hoặc danh sách role/permission của công ty khác qua UUID.
- **Fix:** Scope các endpoint này vào công ty của người gọi, trừ khi là ADMIN.

### 🟢 Low — change-password không tự kiểm tra id
**File:** `recruiter-accounts.controller.ts:148-154`

- **Vấn đề:** Không có check `id === user.id`, nhưng service đã verify `currentPassword` đúng của tài khoản mục tiêu trước — khai thác đòi hỏi đã biết mật khẩu nạn nhân, impact thấp.
- **Fix:** Thêm check tường minh cho defense in depth.

**Đã kiểm tra — ổn:** job-posts (mọi mutation qua `verifyJobOwner`) · candidate-profile · company-members · admin-roles · interviews · invoices (quyền truy cập) · company-subscriptions · toàn bộ candidate-certifications/educations/experiences/links/projects/skills/languages/job-preferences · các endpoint locations/business-license/verify của companies.

---

## 3 · Upload file & tích hợp bên thứ ba

Cloudinary, email, Firebase, Google OAuth, invoice/payment.

### 🟠 High — Validate file CV yếu — bypass bằng OR-logic, ghi extension tuỳ ý
**File:** `cv-versions.service.ts:254-278`

- **Vấn đề:** `if (file.mimetype !== 'application/pdf' && extension !== '.pdf')` — chỉ cần MỘT trong hai điều kiện đúng (không sniff magic-byte thật); `extension` để ghi file lên đĩa lấy trực tiếp từ tên file do client đặt.
- **Khai thác:** Upload file tên `x.html` với `Content-Type` giả mạo thành `application/pdf` — qua được validate, nội dung thật (không phải PDF) được lưu với extension do attacker chọn. Nếu `uploads/` từng được serve qua static file/reverse-proxy, đây là stored XSS/HTML injection.
- **Fix:** Kiểm tra magic bytes thật (`%PDF-`), yêu cầu CẢ mimetype VÀ extension khớp (không phải OR), hardcode extension khi ghi đĩa thành `.pdf`, không lấy từ input người dùng.

### 🟠 High — Invoice "pay" tự set PAID, không xác minh cổng thanh toán
**File:** `invoices.service.ts:97-123` · `dto/pay-invoice.dto.ts`

- **Vấn đề:** `pay()` nhận `paymentMethod` do client gửi và set thẳng `paymentStatus: PAID` + kích hoạt subscription — không có xác minh webhook/chữ ký từ Stripe hay bất kỳ cổng thanh toán nào.
- **Khai thác:** Recruiter thuộc công ty (đã pass ownership check) gọi `POST /invoices/:id/pay` với `{"paymentMethod":"STRIPE"}` → kích hoạt subscription miễn phí, không cần thanh toán thật.
- **Fix:** Chỉ set PAID từ webhook server-to-server đã verify chữ ký của cổng thanh toán thật; endpoint client-facing chỉ nên khởi tạo phiên thanh toán, không tự set trạng thái.

### 🟡 Medium — Access & refresh token trả qua query string của redirect URL
**File:** `candidate-account-auth.controller.ts:65` · `recruiter-auth.controller.ts:~88-90`

- **Vấn đề:** Callback OAuth set `token` và (với recruiter) `refreshToken` trực tiếp vào query string rồi redirect.
- **Khai thác:** Token nằm trong lịch sử trình duyệt, log truy cập của server/proxy/CDN, có thể lộ qua header `Referer` nếu trang SPA đích load resource bên thứ 3 trước khi xoá URL.
- **Fix:** Dùng mã trao đổi một lần ngắn hạn, hoặc set token qua cookie httpOnly / postMessage thay vì URL.

### 🟡 Medium — Thiếu giới hạn kích thước & whitelist MIME cho upload nói chung
**File:** `files.controller.ts` · `companies.controller.ts` (logo/cover/photo) · `cv-versions.controller.ts:57`

- **Vấn đề:** Không route upload nào cấu hình `limits.fileSize` hay `fileFilter` cho multer; xác nhận bởi cả 3 audit (input-validation, upload/integration, global-config) độc lập.
- **Khai thác:** Upload body multipart cực lớn → DoS bộ nhớ (multer buffer mặc định vào RAM); upload file loại bất kỳ (vd SVG chứa script) lên Cloudinary dưới tài khoản tổ chức → rủi ro stored-XSS khi serve lại, rủi ro lưu trữ nội dung độc hại/vi phạm dưới domain Cloudinary của công ty.
- **Fix:** Thêm `limits:{fileSize}` và `fileFilter` whitelist MIME/extension theo từng `purpose` cho mọi `FileInterceptor`/`FilesInterceptor`.

**Đã kiểm tra — ổn:** Email service escape HTML biến template trước khi chèn (không có header/HTML injection) · SMTP credentials chỉ từ env · Firebase Admin credentials chỉ từ env, không service-account JSON commit · không tìm thấy secret hardcode (`sk_`, `AIza`, connection string...) · invoices không lưu dữ liệu thẻ (PCI).

---

## 4 · Cấu hình toàn cục & hardening hạ tầng

### 🟡 Medium — /docs public ở mọi môi trường, bỏ qua helmet
**File:** `src/main.ts:26-29,132-137`

- **Vấn đề:** Middleware skip hẳn `helmet()` cho path bắt đầu bằng `/docs`, không gate theo `NODE_ENV` hay auth. Route Scalar API reference truy cập được không cần đăng nhập trong production, và trang docs không có CSP/X-Frame-Options gì cả.
- **Fix:** Gate `/docs` sau `nodeEnv !== 'production'` hoặc auth (basic auth/IP allowlist) nếu cần giữ ở prod; cấu hình helmet riêng (nới lỏng) cho path này thay vì bỏ hoàn toàn.

### 🟢 Low — CORS default bao gồm localhost
**File:** `env.validation.ts:24-28`

- **Vấn đề:** `CORS_ORIGIN` mặc định gồm cả `http://localhost:5173`/`:3000` cùng domain thật, kết hợp `credentials: true`. Không phải wildcard nên rủi ro thấp, nhưng nếu operator quên set biến này ở prod, localhost vẫn là origin được tin cậy kèm cookie.
- **Fix:** Không đặt default chứa localhost trong khi ở production; bắt buộc set tường minh.

### 🟢 Low — JWT secret chỉ check độ dài, không check entropy
**File:** `env.validation.ts:7`

- **Vấn đề:** `JWT_ACCESS_SECRET: z.string().min(16)` — chuỗi như `"aaaaaaaaaaaaaaaa"` vẫn pass.
- **Fix:** Tăng độ dài tối thiểu (32+) và/hoặc thêm check entropy/từ điển phổ biến.

### 🟢 Low — PrismaSerializeInterceptor không thực sự lọc field nhạy cảm
**File:** `common/interceptors/prisma-serialize.interceptor.ts:14-23`

- **Vấn đề:** Interceptor chỉ làm `JSON.parse(JSON.stringify(data))` để chuẩn hoá Decimal/Date, không denylist `passwordHash`/`tokenHash`. Hiện tại chưa lộ vì mọi query nhạy cảm đều dùng Prisma `select` tường minh — nhưng không có lưới an toàn cho endpoint tương lai.
- **Fix:** Thêm strip denylist thật, hoặc dùng Prisma global `omit` cho `passwordHash`/`tokenHash` làm defense-in-depth độc lập với kỷ luật `select` per-query.

### 🟢 Low — Script debug còn sót lại, chứa email cá nhân hardcode
**File:** `src/test-db.ts:1-16`

- **Vấn đề:** Script mở raw `pg.Client` query bảng `recruiter_accounts` theo email hardcode, console.log id/email/status. Không wire vào route nào nên không khai thác được từ xa, nhưng là dead code không nên nằm trong `src/`.
- **Fix:** Xoá, hoặc chuyển ra thư mục `scripts/` loại khỏi build.

**Đã kiểm tra — ổn:** helmet áp dụng với CSP thật cho các route ngoài /docs · ValidationPipe global có whitelist/forbidNonWhitelisted/transform · .gitignore/.dockerignore loại đúng .env* · passwordHash lưu bcrypt (cost 10) ở cả 3 bảng account · không console.log log full request body/password/token · không custom exception filter nhưng default filter của Nest không leak stack trace.

---

## 5 · Input validation & injection

Không tìm thấy lỗ hổng injection nghiêm trọng — điểm mạnh nhất của codebase.

### 🟢 Low — Trường text tự do không giới hạn độ dài
**File:** `company-reviews/dto/create-company-review.dto.ts`

- **Vấn đề:** `summary`, `overtimeReason`, `whatILove`, `improvementSuggestion` map `@db.Text`, không có `@MaxLength`. Không SQL-injectable (Prisma parameterize), nhưng payload không giới hạn có thể gây DoS lưu trữ/băng thông.
- **Fix:** Thêm `@MaxLength` hợp lý cho các trường free-text.

### 🟢 Low — `ownerType` là free string thay vì enum
**File:** `files/dto/upload-file.dto.ts:19`

- **Vấn đề:** `@IsString @MaxLength(50)` thay vì whitelist giá trị hợp lệ. Chưa phải injection vector vì không dùng để dựng dynamic query, nhưng là lỗ hổng toàn vẹn dữ liệu.
- **Fix:** Ràng buộc bằng `@IsIn([...])` theo tập owner-type đã biết.

**Đã kiểm tra — ổn:** Global ValidationPipe (whitelist+forbidNonWhitelisted+transform) chặn mass-assignment · toàn bộ `$queryRaw` dùng tagged-template parameterized, không có `$queryRawUnsafe`/`$executeRawUnsafe` nào trong repo · không có `orderBy`/`where` dựng động từ input thô, sort/filter field đều whitelist qua `@IsEnum` · không có `child_process`/`eval`/dynamic `require` · Cloudinary public_id dựng từ UUID nội bộ, không path traversal.

---

## Ghi chú phương pháp

Phạm vi audit: đọc mã tĩnh trên 5 luồng song song (Auth · Authorization/IDOR · Input validation · Upload/tích hợp · Config toàn cục). Không thực hiện tấn công lên hệ thống đang chạy. Một số phát hiện (JWT bypass, CV IDOR, thiếu rate-limit, OAuth CSRF, upload validation) được xác nhận độc lập bởi từ 2 luồng trở lên — độ tin cậy cao hơn các phát hiện đơn lẻ.
