# Tổng hợp cách hoạt động của lọc CV bằng AI

Tài liệu này giải thích dễ hiểu luồng lọc CV bằng AI trong backend UpNext: từ lúc recruiter bấm chạy lọc CV, hệ thống lấy dữ liệu ở đâu, AI chấm điểm thế nào, lưu kết quả vào bảng nào, và phần code nào chịu trách nhiệm.

## 1. Mục tiêu của tính năng

Tính năng lọc CV bằng AI giúp nhà tuyển dụng xếp hạng ứng viên đã nộp vào một job post.

Thay vì recruiter phải mở từng CV thủ công, hệ thống làm 2 lớp lọc:

1. Lọc nhanh bằng embedding để xem CV nào giống yêu cầu job nhất về mặt ngữ nghĩa.
2. Chấm chi tiết bằng Gemini để đánh giá kỹ năng, kinh nghiệm, dự án, học vấn và đưa ra nhận xét.

Kết quả cuối cùng là bảng điểm `application_ai_scores`, được sắp xếp theo `finalScore` từ cao xuống thấp.

## 2. Các file code chính

| File | Vai trò |
| --- | --- |
| `src/modules/cv-screening/cv-screening.controller.ts` | Khai báo API cho recruiter chạy lọc, xem tiến độ, xem kết quả, xem điểm AI từng application, xem CV gốc. |
| `src/modules/cv-screening/cv-screening.service.ts` | Điều phối toàn bộ quy tr�nh lọc CV. Đây là file quan trọng nhất của feature. |
| `src/modules/cv-screening/embedding.service.ts` | Tạo embedding cho job và CV, cache embedding vào database, tính cosine similarity. |
| `src/modules/cv-screening/gemini-scoring.service.ts` | Gửi top CV sang Gemini để chấm điểm chi tiết và chuẩn hóa response JSON. |
| `src/modules/cv-screening/dto/run-cv-screening.dto.ts` | DTO body khi recruiter bắt đầu chạy lọc CV. |
| `prisma/schema.prisma` | Định nghĩa các bảng `cv_screening_runs`, `job_embeddings`, `cv_embeddings`, `application_ai_scores`. |
| `src/common/config/env.validation.ts` | Đọc cấu hình `GEMINI_API_KEY` thành `geminiApiKey`. |

## 3. API mà frontend gọi

Controller nằm ở:

```txt
src/modules/cv-screening/cv-screening.controller.ts
```

Tất cả endpoint bên dưới yêu cầu recruiter đăng nhập và có role `RECRUITER`.

| Method | Endpoint | Mục đích |
| --- | --- | --- |
| `POST` | `/api/recruiter/cv-screening/run` | Tạo một phiên lọc CV mới cho một job post. |
| `GET` | `/api/recruiter/cv-screening/runs/:runId` | Xem trạng thái phiên lọc: pending, processing, completed, failed. |
| `GET` | `/api/recruiter/cv-screening/runs/:runId/results` | Lấy danh sách ứng viên đã được AI chấm, sắp xếp theo điểm tổng. |
| `GET` | `/api/recruiter/applications/:applicationId/ai-score` | Lấy điểm và nhận xét AI chi tiết của một hồ sơ. |
| `GET` | `/api/recruiter/applications/:applicationId/cv` | Xem file CV gốc của ứng viên. |

Body khi bắt đầu chạy lọc:

```json
{
  "jobPostId": "8e10280c-ae2d-4579-a048-c25279447a3e",
  "limit": 100,
  "minScore": 50
}
```

Ý nghĩa:

| Field | Ý nghĩa |
| --- | --- |
| `jobPostId` | Job post cần lọc CV. |
| `limit` | Số CV tối đa đưa sang Gemini chấm chi tiết. Mặc định 100, tối đa 200. |
| `minScore` | Điểm semantic tối thiểu. CV thấp hơn điểm này sẽ không được đưa sang Gemini. |

## 4. Luồng hoạt động tổng thể

Luồng chính nằm trong `CvScreeningService`.

```mermaid
flowchart TD
  A[Recruiter gọi POST /cv-screening/run] --> B[Kiểm tra recruiter thuộc đúng công ty của job]
  B --> C[Đếm tổng số applications của job]
  C --> D[Tạo CvScreeningRun trạng thái PENDING]
  D --> E[Trả runId ngay cho frontend]
  E --> F[processRun chạy nền bằng setImmediate]
  F --> G[Chuyển run sang PROCESSING]
  G --> H[Tạo hoặc lấy JobEmbedding]
  G --> I[Lấy applications và tạo hoặc lấy CvEmbedding]
  H --> J[Tính cosine similarity giữa job vector và từng CV vector]
  I --> J
  J --> K[Lọc theo minScore, sort giảm dần, lấy top limit]
  K --> L[Tái sử dụng AI score cũ nếu còn mới]
  L --> M[Gửi các CV còn lại sang Gemini theo batch]
  M --> N[Lưu điểm vào ApplicationAiScore]
  N --> O[Cập nhật run COMPLETED hoặc PARTIAL_FAILED]
```

Điểm quan trọng: API `POST /cv-screening/run` không chờ AI chạy xong. Nó chỉ tạo run, trả `runId`, sau đó backend xử lý nền. Frontend dùng `GET /runs/:runId` để poll tiến độ.

## 5. Bước 1: tạo phiên chạy lọc CV

Hàm chính:

```txt
CvScreeningService.startRun()
```

Code làm các việc sau:

1. Tìm recruiter bằng `recruiterId`.
2. Kiểm tra recruiter có `companyId`.
3. Tìm job post theo `dto.jobPostId`.
4. Kiểm tra job post đó có thuộc cùng công ty với recruiter không.
5. Đếm số application của job bằng `prisma.application.count`.
6. Tạo bản ghi `cvScreeningRun` với trạng thái `PENDING`.
7. Gọi `processRun(run.id)` bằng `setImmediate`.
8. Trả về `{ runId, status }`.

Đoạn logic nền:

```ts
setImmediate(() => {
  void this.processRun(run.id).catch((error: unknown) => {
    this.logger.error(`Unhandled CV screening run ${run.id} error`, this.getErrorStack(error));
  });
});
```

Vì dùng `setImmediate`, recruiter nhận response nhanh, còn việc nặng như embedding và Gemini chạy phía sau.

## 6. Bước 2: chuyển run sang PROCESSING

Hàm:

```txt
CvScreeningService.processRun()
```

Khi bắt đầu chạy thật, service update:

```ts
status: CvScreeningRunStatus.PROCESSING,
startedAt: new Date(),
errorMessage: null
```

Từ đây, frontend có thể gọi:

```txt
GET /api/recruiter/cv-screening/runs/:runId
```

để xem `processedCount`, `failedCount`, `status`.

## 7. Bước 3: tạo embedding cho job post

Hàm:

```txt
EmbeddingService.getOrCreateJobEmbedding()
```

Hệ thống lấy job post cùng các relation:

```ts
jobCategory
employmentType
experienceLevel
jobPostSkills.skill
jobPostSpecializations.specialization
jobPostLocations.jobLocation
```

Sau đó build thành một chuỗi text đại diện cho job:

```txt
Job title: ...
Category: ...
Employment type: ...
Experience level: ...
Education level: ...
Working days: ...
Description: ...
Requirements: ...
Benefits: ...
Required skills: ...
Specializations: ...
Locations: ...
```

Chuỗi này được gửi sang Gemini embedding model:

```txt
gemini-embedding-001
```

Kết quả là một vector số, ví dụ dạng ý tưởng:

```json
[0.013, -0.021, 0.442, ...]
```

Vector này được lưu vào bảng `job_embeddings`.

## 8. Bước 4: tạo embedding cho từng CV

Hàm:

```txt
EmbeddingService.getOrCreateCvEmbeddings()
```

Input là danh sách `cvVersionId` lấy từ applications của job.

Với mỗi CV, hệ thống tạo một đoạn text đại diện cho ứng viên.

Nếu `cvVersion.parsedText` có dữ liệu, hệ thống ưu tiên dùng luôn `parsedText`. Đây thường là nội dung được parse từ file PDF/doc CV.

Nếu không có `parsedText`, hệ thống tự tổng hợp từ database:

```txt
CV file
Candidate name
Candidate email
Headline
Profile summary
Skills
Experience
Projects
Education
Certifications
```

Sau đó hệ thống gọi Gemini embedding model giống job:

```txt
gemini-embedding-001
```

Kết quả lưu vào bảng `cv_embeddings`.

## 9. Cache embedding hoạt động thế nào?

Job và CV đều có cache embedding.

Với job:

```ts
if (existing?.modelName === EMBEDDING_MODEL && existing.embeddingText === embeddingText) {
  return cachedVector;
}
```

Với CV cũng tương tự:

```ts
if (existing?.modelName === EMBEDDING_MODEL && existing.embeddingText === embeddingText) {
  return cachedVector;
}
```

Nghĩa là:

1. Nếu text không đổi và model không đổi, dùng lại vector cũ.
2. Nếu job/CV đổi nội dung, tạo vector mới.
3. Cách này giảm chi phí gọi Gemini và tăng tốc các lần chạy sau.

## 10. Bước 5: tính điểm semantic

Sau khi có vector của job và vector của CV, hệ thống tính cosine similarity.

Hàm:

```txt
EmbeddingService.cosineSimilarity()
```

Công thức:

```txt
similarity = (A dot B) / (length(A) * length(B))
```

Ý nghĩa dễ hiểu:

| Giá trị | Ý nghĩa |
| --- | --- |
| Gần 1 | CV và job rất giống nhau về nội dung/ngữ nghĩa. |
| Gần 0 | CV và job ít liên quan. |

Sau đó service đổi sang thang 100:

```ts
const semanticScore = this.roundScore(similarity * 100);
```

Ví dụ:

```txt
similarity = 0.72
semanticScore = 72
```

Điểm này chỉ là điểm lọc nhanh, chưa phải điểm AI cuối cùng.

## 11. Bước 6: lọc top ứng viên trước khi gọi Gemini

Trong `processRun()`, hệ thống làm:

```ts
const selected = ranked
  .filter((item) => minScore === null || item.semanticScore >= minScore)
  .sort((left, right) => right.semanticScore - left.semanticScore)
  .slice(0, detailLimit);
```

Nghĩa là:

1. Bỏ CV lỗi hoặc không tạo được embedding.
2. Nếu có `minScore`, chỉ giữ CV có `semanticScore >= minScore`.
3. Sort theo semantic score giảm dần.
4. Lấy top theo `limit`, mặc định 100, tối đa 200.

Lý do phải lọc trước: gửi toàn bộ CV sang Gemini rất tốn chi phí và thời gian. Semantic search giúp chọn nhóm đáng xem nhất trước.

## 12. Bước 7: tái sử dụng điểm AI cũ nếu còn mới

Hàm:

```txt
CvScreeningService.reuseFreshScores()
```

Hệ thống kiểm tra bảng `application_ai_scores`.

Nếu application đã từng được Gemini chấm bằng:

```txt
modelName = gemini-2.5-flash
scoringVersion = cv-screening-v3-vi
```

và điểm đó mới hơn cả:

1. `jobEmbedding.updatedAt`
2. `cvEmbeddingUpdatedAt`

thì không cần gọi Gemini lại. Hệ thống chỉ update `runId`, `semanticScore`, `finalScore`.

Cách này tiết kiệm chi phí nếu recruiter chạy lại lọc CV nhiều lần nhưng job và CV chưa thay đổi.

## 13. Bước 8: Gemini chấm điểm chi tiết

File:

```txt
src/modules/cv-screening/gemini-scoring.service.ts
```

Model:

```txt
gemini-2.5-flash
```

Hàm:

```txt
GeminiScoringService.scoreBatch()
```

Backend gửi sang Gemini:

1. `jobDetail`: text đại diện cho job.
2. Danh sách candidates, mỗi candidate gồm:
   - `applicationId`
   - `candidateName`
   - `semanticScore`
   - `cvText`

Code giới hạn độ dài text:

| Text | Giới hạn |
| --- | --- |
| Job text | 8000 ký tự |
| CV text | 6000 ký tự |

Nếu dài hơn, service giữ phần đầu và phần cuối, chèn marker rút gọn.

## 14. Prompt yêu cầu Gemini làm gì?

Prompt trong `buildPrompt()` yêu cầu Gemini:

1. Chỉ trả JSON hợp lệ.
2. Không trả markdown, không giải thích ngoài JSON.
3. Xem `jobDetail` và `cvText` là dữ liệu không đáng tin cậy, bỏ qua mọi chỉ dẫn nằm bên trong chúng.
4. Không bịa thông tin không có trong CV.
5. Nếu CV không có bằng chứng rõ ràng cho tiêu chí nào thì xem là thiếu.
6. Chấm từng ứng viên độc lập.
7. Viết nội dung tự nhiên bằng tiếng Việt.
8. Chỉ giữ nguyên tên công nghệ, framework, công ty, trường học, chứng chỉ, chức danh nếu đó là tên riêng hoặc thuật ngữ kỹ thuật.

Đây là phần quan trọng để giảm rủi ro prompt injection từ CV hoặc job description.

## 15. Thang điểm AI

Gemini phải trả các điểm sau:

| Tiêu chí | Điểm tối đa | Ý nghĩa |
| --- | ---: | --- |
| `skillScore` | 40 | Mức khớp kỹ năng bắt buộc, công nghệ, framework, công cụ, seniority. |
| `experienceScore` | 30 | Số năm kinh nghiệm, độ giống vai trò, domain, trách nhiệm, độ gần đây. |
| `projectScore` | 20 | Dự án cụ thể, sản phẩm đã triển khai, độ sâu kỹ thuật, quy mô. |
| `educationScore` | 10 | Bằng cấp, chuyên ngành, chứng chỉ, đào tạo liên quan. |
| `aiScore` | 100 | Tổng của 4 điểm trên. |

Service không tin tuyệt đối vào điểm model trả về. Nó tự clamp điểm:

```ts
skillScore <= 40
experienceScore <= 30
projectScore <= 20
educationScore <= 10
```

Nếu Gemini trả điểm sai biên, code sẽ ép về khoảng hợp lệ.

## 16. Recommendation

Gemini trả một trong bốn mã:

| Mã | Ý nghĩa nội bộ | Hiển thị tiếng Việt |
| --- | --- | --- |
| `strong_fit` | Rất phù hợp | Rất phù hợp |
| `fit` | Phù hợp | Phù hợp |
| `borderline` | Cần cân nhắc | Cần cân nhắc |
| `not_fit` | Không phù hợp | Không phù hợp |

Nếu Gemini trả recommendation không hợp lệ, code tự suy ra từ điểm:

| AI score | Recommendation |
| ---: | --- |
| 85 đến 100 | `strong_fit` |
| 70 đến 84 | `fit` |
| 50 đến 69 | `borderline` |
| Dưới 50 | `not_fit` |

## 17. Điểm cuối cùng tính thế nào?

Trong `persistScore()`, backend tính:

```ts
aiScore = skillScore + experienceScore + projectScore + educationScore;
finalScore = aiScore * 0.7 + semanticScore * 0.3;
```

Ý nghĩa:

| Điểm | Vai trò |
| --- | --- |
| `semanticScore` | Điểm khớp nhanh bằng vector, dùng để lọc và hỗ trợ xếp hạng. |
| `aiScore` | Điểm Gemini chấm chi tiết dựa trên bằng chứng trong CV. |
| `finalScore` | Điểm cuối cùng dùng để ranking. |

Tỷ trọng hiện tại:

```txt
70% AI detailed score
30% semantic score
```

Ví dụ:

```txt
semanticScore = 80
aiScore = 72
finalScore = 72 * 0.7 + 80 * 0.3 = 74.4
```

## 18. Gemini trả về JSON dạng nào?

`GeminiScoringService` dùng `responseSchema()` để bắt Gemini trả JSON array.

Mỗi phần tử cần có:

```json
{
  "applicationId": "uuid",
  "overallScore": 82,
  "skillScore": 34,
  "experienceScore": 24,
  "projectScore": 16,
  "educationScore": 8,
  "matchedSkills": ["Java", "Spring Boot", "PostgreSQL"],
  "missingSkills": ["Kafka"],
  "strengths": ["Có kinh nghiệm backend phù hợp với yêu cầu"],
  "weaknesses": ["Chưa thấy bằng chứng rõ về hệ thống message queue"],
  "summary": "Ứng viên phù hợp cho vị trí backend senior, cần kiểm tra thêm kinh nghiệm Kafka.",
  "recommendation": "fit"
}
```

Backend parse JSON, chuẩn hóa điểm, chuẩn hóa arrays và chỉ giữ kết quả có `applicationId` nằm trong batch đã gửi.

## 19. Batch, fallback và xử lý lỗi

Các hằng số trong `cv-screening.service.ts`:

```ts
const DEFAULT_DETAILED_LIMIT = 100;
const MAX_DETAILED_LIMIT = 200;
const EMBEDDING_CONCURRENCY = 8;
const GEMINI_BATCH_SIZE = 8;
const GEMINI_BATCH_CONCURRENCY = 1;
const GEMINI_FALLBACK_CONCURRENCY = 1;
const SCORING_VERSION = 'cv-screening-v3-vi';
```

Ý nghĩa:

| Hằng số | Ý nghĩa |
| --- | --- |
| `DEFAULT_DETAILED_LIMIT` | Nếu frontend không truyền `limit`, lấy tối đa 100 CV để chấm chi tiết. |
| `MAX_DETAILED_LIMIT` | Dù frontend truyền cao hơn, backend chỉ cho tối đa 200. |
| `EMBEDDING_CONCURRENCY` | Tạo CV embedding song song tối đa 8 luồng. |
| `GEMINI_BATCH_SIZE` | Mỗi request Gemini scoring chứa tối đa 8 CV. |
| `GEMINI_BATCH_CONCURRENCY` | Chỉ chạy 1 batch scoring cùng lúc để tránh rate limit. |
| `GEMINI_FALLBACK_CONCURRENCY` | Khi batch lỗi, retry từng CV, cũng chạy 1 luồng. |
| `SCORING_VERSION` | Version logic chấm điểm. Đổi prompt hoặc thang điểm thì nên đổi version. |

Nếu batch Gemini lỗi:

1. Nếu batch có nhiều hơn 1 CV, backend retry từng CV riêng.
2. Nếu từng CV vẫn lỗi, tăng `failedCount`.
3. Nếu Gemini thiếu kết quả cho một application, backend retry application đó riêng.

## 20. Database dùng cho feature

### `cv_screening_runs`

Lưu một phiên chạy lọc CV.

| Field | Ý nghĩa |
| --- | --- |
| `job_post_id` | Job đang được lọc CV. |
| `company_id` | Công ty sở hữu job. |
| `recruiter_account_id` | Recruiter bấm chạy. |
| `total_applications` | Tổng số hồ sơ của job. |
| `processed_count` | Số hồ sơ đã chấm hoặc reuse thành công. |
| `failed_count` | Số hồ sơ bị lỗi. |
| `limit` | Số CV tối đa đưa sang Gemini. |
| `min_score` | Semantic score tối thiểu. |
| `status` | `PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`, `PARTIAL_FAILED`. |
| `error_message` | Lỗi tổng nếu run bị fail. |
| `started_at`, `finished_at` | Thời điểm bắt đầu và kết thúc. |

### `job_embeddings`

Lưu vector của job post.

| Field | Ý nghĩa |
| --- | --- |
| `job_post_id` | Mỗi job có tối đa một embedding hiện tại. |
| `embedding_text` | Text đã build từ job. |
| `embedding_vector` | Vector JSON từ Gemini. |
| `model_name` | Thường là `gemini-embedding-001`. |

### `cv_embeddings`

Lưu vector của CV.

| Field | Ý nghĩa |
| --- | --- |
| `cv_version_id` | Mỗi version CV có tối đa một embedding hiện tại. |
| `candidate_profile_id` | Ứng viên sở hữu CV. |
| `embedding_text` | Text build từ CV hoặc `parsedText`. |
| `embedding_vector` | Vector JSON từ Gemini. |
| `model_name` | Thường là `gemini-embedding-001`. |

### `application_ai_scores`

Lưu điểm AI cuối cùng cho từng application.

| Field | Ý nghĩa |
| --- | --- |
| `application_id` | Unique, mỗi application có một score mới nhất. |
| `run_id` | Run gần nhất tạo hoặc reuse score này. |
| `semantic_score` | Điểm vector similarity. |
| `ai_score` | Tổng điểm Gemini chấm chi tiết. |
| `final_score` | Điểm ranking cuối cùng. |
| `skill_score`, `experience_score`, `project_score`, `education_score` | Điểm thành phần. |
| `matched_skills`, `missing_skills` | Kỹ năng khớp và thiếu. |
| `strengths`, `weaknesses` | Điểm mạnh, điểm yếu. |
| `summary` | Tóm tắt ứng viên. |
| `recommendation` | Mã đề xuất tuyển dụng. |
| `raw_ai_response` | Response gốc từ Gemini để debug. |
| `model_name` | Model chấm điểm, hiện là `gemini-2.5-flash`. |
| `scoring_version` | Version prompt/chấm điểm. |

## 21. Trạng thái run

Enum nằm trong `prisma/schema.prisma`:

```prisma
enum CvScreeningRunStatus {
  PENDING
  PROCESSING
  COMPLETED
  FAILED
  PARTIAL_FAILED
}
```

Ý nghĩa:

| Status | Ý nghĩa |
| --- | --- |
| `PENDING` | Vừa tạo run, chưa xử lý thật. |
| `PROCESSING` | Đang tạo embedding, lọc, chấm Gemini. |
| `COMPLETED` | Tất cả phần cần xử lý đã xong, không có lỗi. |
| `PARTIAL_FAILED` | Có một số CV lỗi nhưng vẫn có kết quả một phần. |
| `FAILED` | Run lỗi toàn bộ, không có kết quả hữu ích. |

## 22. Quyền truy cập

Service luôn kiểm tra recruiter chỉ được thao tác trên dữ liệu của công ty mình.

Các điểm kiểm tra:

1. `startRun()` kiểm tra `jobPost.companyId === recruiter.companyId`.
2. `getRun()` kiểm tra run thuộc công ty của recruiter.
3. `getResults()` gọi lại `getAuthorizedRun()`.
4. `getApplicationAiScore()` và `getApplicationCv()` kiểm tra application thuộc job của công ty recruiter.

Nếu không đúng công ty, backend trả `ForbiddenException`.

## 23. Cấu hình môi trường

Feature cần biến môi trường:

```env
GEMINI_API_KEY=your_google_gemini_api_key
```

Nếu thiếu key:

1. `EmbeddingService.createEmbedding()` sẽ throw `BadRequestException`.
2. `GeminiScoringService.scoreBatch()` cũng throw `BadRequestException`.

Trong env validation, key này được map thành:

```ts
geminiApiKey: parsed.GEMINI_API_KEY
```

## 24. Luồng dữ liệu từ CV đến kết quả ranking

Tóm tắt theo dạng đường đi dữ liệu:

```txt
Application
  -> cvVersionId
  -> CVVersion.parsedText hoặc CandidateProfile data
  -> CvEmbedding.embeddingVector
  -> cosineSimilarity với JobEmbedding
  -> semanticScore
  -> nếu qua minScore thì gửi Gemini
  -> GeminiScoreResult
  -> ApplicationAiScore
  -> results API sort theo finalScore desc
```

## 25. Ví dụ một kết quả trả về cho frontend

Endpoint:

```txt
GET /api/recruiter/cv-screening/runs/:runId/results
```

Response mỗi item có dạng:

```json
{
  "applicationId": "uuid",
  "candidateName": "Nguyễn Văn A",
  "jobTitle": "Senior Java Backend Engineer",
  "finalScore": 84.3,
  "semanticScore": 79.0,
  "aiScore": 86.5,
  "skillScore": 35,
  "experienceScore": 27,
  "projectScore": 16,
  "educationScore": 8.5,
  "matchedSkills": ["Java", "Spring Boot", "PostgreSQL"],
  "missingSkills": ["Kafka"],
  "summary": "Ứng viên có nền tảng backend tốt, phù hợp phần lớn yêu cầu.",
  "recommendation": "Phù hợp",
  "cvFileUrl": "/api/recruiter/applications/uuid/cv"
}
```

## 26. Những điểm cần nhớ khi debug

Nếu không có kết quả:

1. Kiểm tra job có applications chưa.
2. Kiểm tra application có `cvVersionId` hợp lệ không.
3. Kiểm tra CV có `parsedText` hoặc profile data đủ để build embedding không.
4. Kiểm tra `GEMINI_API_KEY`.
5. Kiểm tra `cv_screening_runs.status`.
6. Kiểm tra `error_message`, `processed_count`, `failed_count`.
7. Kiểm tra bảng `job_embeddings`, `cv_embeddings`.
8. Kiểm tra bảng `application_ai_scores`.

Nếu điểm AI cũ cứ được dùng lại:

1. Kiểm tra `scoringVersion`.
2. Kiểm tra `modelName`.
3. Kiểm tra `updatedAt` của `job_embeddings`, `cv_embeddings`, `application_ai_scores`.

Nếu muốn bắt Gemini chấm lại toàn bộ:

1. Đổi `SCORING_VERSION`.
2. Hoặc xóa score cũ trong `application_ai_scores`.
3. Hoặc làm thay đổi nội dung job/CV để embedding update mới hơn score.

## 27. Tóm tắt ngắn nhất

Hệ thống lọc CV bằng AI hoạt động như sau:

1. Recruiter gọi API chạy lọc CV cho một job.
2. Backend tạo `CvScreeningRun` và xử lý nền.
3. Backend tạo hoặc lấy embedding của job.
4. Backend tạo hoặc lấy embedding của từng CV.
5. Backend tính semantic score bằng cosine similarity.
6. Backend lọc top CV theo `minScore` và `limit`.
7. Backend reuse điểm AI cũ nếu còn mới.
8. Backend gửi CV còn lại sang Gemini `gemini-2.5-flash`.
9. Gemini trả điểm kỹ năng, kinh nghiệm, dự án, học vấn và nhận xét.
10. Backend tính `finalScore = aiScore * 0.7 + semanticScore * 0.3`.
11. Backend lưu vào `application_ai_scores`.
12. Frontend lấy kết quả ranking và hiển thị cho recruiter.

