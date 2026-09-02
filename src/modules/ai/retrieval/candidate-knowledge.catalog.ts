import { AiKnowledgeSourceType } from '@prisma/client';
import type { CandidateKnowledgeUpsert } from './candidate-knowledge-indexer.service';

/**
 * The first-party knowledge corpus that the Candidate Assistant is allowed to
 * cite.  It intentionally contains no scraped pages, user CVs, recruiter data
 * or legal promises.  A content change must receive a new sourceVersion so the
 * indexer can retain an auditable history and retire the prior version safely.
 */
const SOURCE_VERSION = '2026-09-03';
const EFFECTIVE_AT = new Date('2026-09-03T00:00:00.000Z');
const REVIEW_AT = new Date('2026-12-03T00:00:00.000Z');

type CatalogEntry = Omit<CandidateKnowledgeUpsert, 'effectiveAt' | 'reviewAt'>;

const guide = (
  locale: 'vi' | 'en',
  slug: string,
  title: string,
  content: string,
  sourceType: AiKnowledgeSourceType = AiKnowledgeSourceType.CANDIDATE_GUIDE,
): CatalogEntry => ({
  sourceType,
  locale,
  title,
  // This is a stable in-product source identifier.  Citations also contain the
  // reviewed title and redacted excerpt, so they remain useful if navigation is
  // unavailable in a lightweight client.
  canonicalUrl: `/candidate/ai?guide=${slug}&locale=${locale}`,
  sourceVersion: SOURCE_VERSION,
  content,
});

export const CANDIDATE_KNOWLEDGE_CATALOG: readonly CandidateKnowledgeUpsert[] = [
  guide(
    'vi',
    'cv-ho-so',
    'UpNext: chuẩn bị hồ sơ và CV rõ ràng, trung thực',
    `Mục tiêu của CV là giúp nhà tuyển dụng kiểm tra mức độ liên quan của bạn với một vị trí cụ thể. Hãy dùng chức danh, kỹ năng, kinh nghiệm và kết quả có thể kiểm chứng; tránh chép nguyên mô tả công việc hoặc thêm thành tích không thể giải thích khi phỏng vấn.

Ưu tiên thông tin gần nhất và liên quan nhất: vai trò, phạm vi công việc, công cụ đã dùng, kết quả và bối cảnh. Với mỗi kinh nghiệm, nêu việc bạn đã làm và tác động nếu có số liệu đáng tin cậy. Nếu chưa có kinh nghiệm chính thức, hãy dùng project, thực tập, coursework hoặc hoạt động có trách nhiệm rõ ràng.

Trước khi ứng tuyển, đọc lại CV theo job đang chọn: giữ các kỹ năng thật sự có trong hồ sơ, làm rõ ví dụ liên quan và bỏ thông tin không phục vụ mục tiêu. Không đưa mật khẩu, mã OTP, số thẻ ngân hàng, tài liệu mật của công ty cũ hoặc dữ liệu cá nhân của người khác vào CV hay tin nhắn.`,
  ),
  guide(
    'vi',
    'danh-gia-job',
    'UpNext: đọc và đánh giá một tin tuyển dụng trước khi ứng tuyển',
    `Hãy đối chiếu yêu cầu bắt buộc của tin tuyển dụng với kinh nghiệm và kỹ năng đã được nêu trong hồ sơ của bạn. Tách ba nhóm: điểm đã có bằng chứng, khoảng trống có thể học hoặc giải thích, và yêu cầu chưa đủ thông tin để kết luận.

Đọc kỹ phạm vi công việc, cấp độ kinh nghiệm, địa điểm hoặc hình thức làm việc, loại hợp đồng, kỹ năng bắt buộc, kỹ năng ưu tiên và thời hạn hiển thị trên tin. Đừng suy ra lương, trạng thái tuyển dụng hoặc điều kiện nội bộ nếu tin không công khai các thông tin đó.

Một khoảng trống không tự động có nghĩa là bạn không nên ứng tuyển. Nếu bạn đáp ứng phần lớn yêu cầu cốt lõi, hãy nêu ví dụ tương đương trong CV và chuẩn bị cách giải thích phần đang học. Nếu thiếu yêu cầu bắt buộc, cân nhắc hỏi rõ hoặc tìm job phù hợp hơn thay vì tự nhận khả năng chưa có.`,
  ),
  guide(
    'vi',
    'ung-tuyen-theo-doi',
    'UpNext: ứng tuyển và theo dõi đơn một cách chủ động',
    `Trước khi gửi đơn, kiểm tra bạn đang dùng phiên bản CV phù hợp với vị trí, đọc lại yêu cầu công khai của tin và chỉ gửi thông tin chính xác. Lưu lại những điểm bạn đã nêu trong hồ sơ để có thể giải thích nhất quán ở vòng trao đổi sau.

Sau khi ứng tuyển, theo dõi trạng thái và thông báo của chính đơn đó trên nền tảng. Trạng thái của một đơn là thông tin nghiệp vụ do hệ thống hiển thị; không nên suy đoán kết quả khi chưa có cập nhật. Nếu có lời mời phỏng vấn, chuẩn bị lại yêu cầu công việc, các ví dụ kinh nghiệm liên quan và câu hỏi bạn cần làm rõ.

Không gửi nhiều phiên bản mâu thuẫn của cùng một thông tin để cố tăng cơ hội. Nếu cần cập nhật CV hoặc hồ sơ, dùng phiên bản mới có nội dung đúng và nhất quán trước khi nộp các đơn tiếp theo.`,
  ),
  guide(
    'vi',
    'an-toan-tuyen-dung',
    'An toàn khi tìm việc và trao đổi tuyển dụng',
    `Bảo vệ thông tin đăng nhập và dữ liệu tài chính của bạn trong toàn bộ quá trình tìm việc. Không chia sẻ mật khẩu, mã OTP, mã xác thực, số thẻ ngân hàng hoặc ảnh giấy tờ nhạy cảm chỉ vì một lời đề nghị tuyển dụng chưa được xác minh.

Hãy thận trọng khi người liên hệ thúc ép chuyển tiền, yêu cầu cài phần mềm không rõ nguồn gốc, yêu cầu gửi dữ liệu bí mật của công ty hiện tại hoặc buộc bạn trao đổi ngoài kênh chính thức ngay từ đầu. Giữ lại bằng chứng trao đổi và xác minh tên công ty, nội dung job và người liên hệ qua thông tin công khai đáng tin cậy.

Nếu một yêu cầu có vẻ bất thường, dừng cung cấp thông tin nhạy cảm. Bạn có thể hỏi rõ mục đích, chỉ gửi dữ liệu tối thiểu cần thiết và sử dụng kênh hỗ trợ chính thức của UpNext khi cần báo cáo một dấu hiệu đáng ngờ.`,
    AiKnowledgeSourceType.UPNEXT_POLICY,
  ),
  guide(
    'en',
    'cv-profile',
    'UpNext: prepare a clear, truthful profile and CV',
    `A CV should help an employer assess your relevance for a specific role. Use truthful titles, skills, experience and verifiable outcomes. Do not copy a job description as if it were your experience or add achievements you could not explain in an interview.

Prioritize recent and relevant evidence: your role, scope, tools, outcomes and context. For each experience, say what you did and the impact when you have reliable evidence. If you do not yet have formal experience, use projects, internships, coursework or activities with a clear responsibility.

Before applying, read the CV against the selected job. Keep skills you genuinely have, make relevant examples easy to find and remove material that does not help the decision. Never include passwords, one-time codes, bank-card information, confidential former-employer material or another person's personal data in a CV or message.`,
  ),
  guide(
    'en',
    'job-review',
    'UpNext: review a job before you apply',
    `Compare the job's stated requirements with evidence in your own profile and CV. Separate what you can demonstrate, gaps you can learn or explain, and requirements for which there is not enough information to draw a conclusion.

Read the public scope, seniority, location or working arrangement, employment type, required skills, preferred skills and deadline carefully. Do not infer salary, hiring status or internal company conditions when they are not published in the job post.

A gap does not automatically mean that you should not apply. If you meet most core requirements, make equivalent evidence clear in your CV and prepare an honest explanation of what you are learning. If a required capability is missing, consider asking a focused question or looking for a better-fit role instead of claiming experience you do not have.`,
  ),
  guide(
    'en',
    'application-follow-up',
    'UpNext: apply and follow up deliberately',
    `Before submitting an application, confirm that the CV version fits the role, reread the public requirements and submit only accurate information. Keep track of the examples you used so that you can explain them consistently in a later conversation.

After applying, use the platform to follow the status and notifications for that application. Application status is a system record; do not assume an outcome before an update appears. If you receive an interview invitation, revisit the job requirements, relevant work examples and questions you need answered.

Do not send conflicting versions of the same information just to increase your chances. When a CV or profile needs an update, make one accurate, consistent revision before using it for later applications.`,
  ),
  guide(
    'en',
    'recruitment-safety',
    'Staying safe while searching and communicating about jobs',
    `Protect your login and financial information throughout your job search. Do not share a password, one-time code, authentication code, bank-card number or sensitive identity document merely because an unverified contact presents a job opportunity.

Be cautious when someone pressures you to transfer money, install unknown software, disclose confidential information from your current employer or immediately move the conversation away from a trusted channel. Keep the exchange, and verify the company, job details and contact through reliable public information.

If a request seems unusual, stop before sharing sensitive information. Ask for the purpose, disclose only the minimum necessary data and use UpNext's official support channel if you need to report a suspicious signal.`,
    AiKnowledgeSourceType.UPNEXT_POLICY,
  ),
].map((entry) => ({ ...entry, effectiveAt: EFFECTIVE_AT, reviewAt: REVIEW_AT }));

export const CANDIDATE_KNOWLEDGE_CATALOG_VERSION = SOURCE_VERSION;
