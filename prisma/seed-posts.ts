/* eslint-disable */
/**
 * Standalone seed for Post Module:
 * - Post Categories with Parent-Child Hierarchy (Blog UpNext, Sự nghiệp IT, Chuyên môn IT)
 * - Post Tags
 * - Rich, real-world IT articles curated for UpNext platform
 * - Downloads & saves REAL high-resolution JPEG thumbnail images to uploads/posts/${slug}.jpg
 * - Creates FileAsset records with publicUrl = APP_BACKEND_URL + /uploads/posts/${slug}.jpg
 *
 * Run with:  npx tsx prisma/seed-posts.ts
 */
import { FilePurpose, FileVisibility, PostStatus, PostType, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as fs from 'node:fs';
import * as path from 'node:path';
import 'dotenv/config';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is not set in the environment (.env).');
}

const baseUrl = process.env.APP_BACKEND_URL || 'http://localhost:3636';
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

/** Helper to generate fixed UUIDs for deterministic seed runs */
const uid = (n: number) => `b0e80b22-0000-4000-8000-${String(n).padStart(12, '0')}`;

/** Curated high-quality Unsplash real tech JPEG images mapped by category & topic */
const TOPIC_IMAGE_URLS: Record<string, string[]> = {
  ai: [
    'https://images.unsplash.com/photo-1677442136019-21780efad99a?w=1200&q=80',
    'https://images.unsplash.com/photo-1555949963-ff9fe0c870eb?w=1200&q=80',
    'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1200&q=80',
    'https://images.unsplash.com/photo-1534972195531-d756b9bfa9f2?w=1200&q=80',
  ],
  backend: [
    'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=1200&q=80',
    'https://images.unsplash.com/photo-1607799279861-4dd421887fb3?w=1200&q=80',
    'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=1200&q=80',
    'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=1200&q=80',
  ],
  frontend: [
    'https://images.unsplash.com/photo-1507238691740-187a5b1d37b8?w=1200&q=80',
    'https://images.unsplash.com/photo-1551650975-87deedd944c3?w=1200&q=80',
    'https://images.unsplash.com/photo-1581291518633-83b4ebd1d83e?w=1200&q=80',
  ],
  cloud: [
    'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1200&q=80',
    'https://images.unsplash.com/photo-1667372393119-3d4c48d07fc9?w=1200&q=80',
    'https://images.unsplash.com/photo-1544197150-b99a580bb7a8?w=1200&q=80',
  ],
  career: [
    'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=1200&q=80',
    'https://images.unsplash.com/photo-1531482615713-2afd69097998?w=1200&q=80',
    'https://images.unsplash.com/photo-1515187029135-18ee286d815b?w=1200&q=80',
    'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=1200&q=80',
  ],
  default: [
    'https://images.unsplash.com/photo-1518770660439-4636190af475?w=1200&q=80',
    'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=1200&q=80',
    'https://images.unsplash.com/photo-1486312338219-ce68d2c6f44d?w=1200&q=80',
  ],
};

function getImageUrlForPost(slug: string, categorySlug: string): string {
  let list = TOPIC_IMAGE_URLS.default;

  if (slug.includes('ai') || slug.includes('data') || categorySlug.includes('ai')) {
    list = TOPIC_IMAGE_URLS.ai;
  } else if (slug.includes('cloud') || slug.includes('aws') || slug.includes('docker') || slug.includes('kubernetes') || categorySlug.includes('devops')) {
    list = TOPIC_IMAGE_URLS.cloud;
  } else if (slug.includes('react') || slug.includes('mobile') || categorySlug.includes('frontend')) {
    list = TOPIC_IMAGE_URLS.frontend;
  } else if (slug.includes('backend') || slug.includes('architecture') || slug.includes('sql') || slug.includes('microservices') || categorySlug.includes('backend')) {
    list = TOPIC_IMAGE_URLS.backend;
  } else if (categorySlug.includes('su-nghiep') || slug.includes('career') || slug.includes('luong') || slug.includes('phong-van')) {
    list = TOPIC_IMAGE_URLS.career;
  }

  // Hash slug string deterministically to pick an image from list
  let hash = 0;
  for (let i = 0; i < slug.length; i++) {
    hash = (hash << 5) - hash + slug.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % list.length;
  return list[index];
}

async function fetchImageBuffer(imageUrl: string): Promise<Buffer> {
  try {
    const res = await fetch(imageUrl);
    if (res.ok) {
      const arrayBuffer = await res.arrayBuffer();
      return Buffer.from(arrayBuffer);
    }
  } catch (e) {
    console.warn(`⚠️ Network fetch failed for ${imageUrl}, falling back to default image...`);
  }

  // Fallback to primary Unsplash tech image
  const fallbackRes = await fetch('https://images.unsplash.com/photo-1518770660439-4636190af475?w=1200&q=80');
  const fallbackBuffer = await fallbackRes.arrayBuffer();
  return Buffer.from(fallbackBuffer);
}

async function main() {
  console.log('🚀 === BẮT ĐẦU SEED DỮ LIỆU BÀI VIẾT (POST, CATEGORY, TAG & REAL JPEG THUMBNAILS) ===\n');

  // Ensure uploads/posts directory exists
  const uploadDir = path.resolve(process.cwd(), 'uploads', 'posts');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
    console.log(`✅ Đã tạo thư mục lưu trữ ảnh bài viết: ${uploadDir}`);
  }

  // 1. Lấy hoặc tạo tài khoản Admin mặc định để làm tác giả bài viết
  let admin = await prisma.adminUser.findFirst();
  if (!admin) {
    admin = await prisma.adminUser.create({
      data: {
        fullName: 'Super Admin UpNext',
        email: 'admin.super@upnext.dev',
        passwordHash: '$2a$10$wK1kC2.L2T8rF9lX6V3O1e8j7g6h5i4j3k2l1m0n9o8p7q6r5s4t3', // Password123!
      },
    });
    console.log('✅ Đã tạo tài khoản Admin mặc định để gắn với bài viết.');
  }

  // 2. Tạo 3 Danh mục CHA (Parent Categories)
  console.log('\n--- 1. SEED DANH MỤC PHÂN CẤP (PARENT & CHILD CATEGORIES) ---');
  const parent1 = await prisma.postCategory.upsert({
    where: { slug: 'blog-upnext' },
    update: { name: 'Blog UpNext' },
    create: { id: uid(1), name: 'Blog UpNext', slug: 'blog-upnext' },
  });

  const parent2 = await prisma.postCategory.upsert({
    where: { slug: 'su-nghiep-it' },
    update: { name: 'Sự nghiệp IT' },
    create: { id: uid(2), name: 'Sự nghiệp IT', slug: 'su-nghiep-it' },
  });

  const parent3 = await prisma.postCategory.upsert({
    where: { slug: 'chuyen-mon-it' },
    update: { name: 'Chuyên môn IT' },
    create: { id: uid(3), name: 'Chuyên môn IT', slug: 'chuyen-mon-it' },
  });

  console.log('✅ Đã khởi tạo 3 Danh mục Cha: Blog UpNext, Sự nghiệp IT, Chuyên môn IT.');

  // Tạo các Danh mục CON (Child Categories)
  const childCategoriesData = [
    // Con của Sự nghiệp IT
    { id: uid(10), name: 'Developer', slug: 'su-nghiep-developer', parentId: parent2.id },
    { id: uid(11), name: 'Ứng tuyển & Thăng tiến', slug: 'ung-tuyen-thang-tien', parentId: parent2.id },
    { id: uid(12), name: 'Phỏng vấn & Lương thưởng', slug: 'phong-van-luong-thuong', parentId: parent2.id },
    { id: uid(13), name: 'Kỹ năng mềm & Định hướng', slug: 'ky-nang-mem-dinh-huong', parentId: parent2.id },

    // Con của Chuyên môn IT
    { id: uid(20), name: 'AI & Data', slug: 'ai-data-specialty', parentId: parent3.id },
    { id: uid(21), name: 'Backend & Architecture', slug: 'backend-architecture', parentId: parent3.id },
    { id: uid(22), name: 'DevOps & Cloud', slug: 'devops-cloud', parentId: parent3.id },
    { id: uid(23), name: 'Mobile & Frontend', slug: 'mobile-frontend', parentId: parent3.id },

    // Con của Blog UpNext
    { id: uid(30), name: 'Tin tức UpNext', slug: 'tin-tuc-upnext', parentId: parent1.id },
    { id: uid(31), name: 'Sự kiện IT', slug: 'su-kien-it-upnext', parentId: parent1.id },
    { id: uid(32), name: 'Báo cáo thị trường IT', slug: 'bao-cao-thi-truong-it', parentId: parent1.id },
    { id: uid(33), name: 'FAQ & Hướng dẫn', slug: 'faq-huong-dan', parentId: parent1.id },
  ];

  const categoriesMap: Record<string, { id: string; name: string }> = {};
  categoriesMap['blog-upnext'] = { id: parent1.id, name: parent1.name };
  categoriesMap['su-nghiep-it'] = { id: parent2.id, name: parent2.name };
  categoriesMap['chuyen-mon-it'] = { id: parent3.id, name: parent3.name };

  for (const c of childCategoriesData) {
    const created = await prisma.postCategory.upsert({
      where: { slug: c.slug },
      update: { name: c.name, parentId: c.parentId },
      create: { id: c.id, name: c.name, slug: c.slug, parentId: c.parentId },
    });
    categoriesMap[c.slug] = { id: created.id, name: created.name };
  }
  console.log(`✅ Đã tạo thành công ${childCategoriesData.length} Danh mục Con.`);

  // 3. Tạo các TAGS
  console.log('\n--- 2. SEED TAGS BÀI VIẾT ---');
  const tagsData = [
    { name: 'ReactJS', slug: 'reactjs' },
    { name: 'NestJS', slug: 'nestjs' },
    { name: 'AI & Data', slug: 'ai-data' },
    { name: 'Cloud & AWS', slug: 'cloud-aws' },
    { name: 'Developer', slug: 'developer' },
    { name: 'Big Data', slug: 'big-data' },
    { name: 'Python', slug: 'python' },
    { name: 'Technical Lead', slug: 'technical-lead' },
    { name: 'Phỏng vấn IT', slug: 'phong-van-it' },
    { name: 'Lương IT', slug: 'luong-it' },
    { name: 'DevOps', slug: 'devops' },
    { name: 'Machine Learning', slug: 'machine-learning' },
    { name: 'System Architecture', slug: 'system-architecture' },
    { name: 'Agile & Scrum', slug: 'agile-scrum' },
    { name: 'Career Path', slug: 'career-path' },
    { name: 'Xu hướng công nghệ', slug: 'xu-huong-cong-nghe' },
    { name: 'Backend & Architecture', slug: 'backend-architecture-tag' },
    { name: 'Sự kiện IT', slug: 'su-kien-it-tag' },
    { name: 'Báo cáo thị trường IT', slug: 'bao-cao-thi-truong-it-tag' },
    { name: 'Tin tức UpNext', slug: 'tin-tuc-upnext-tag' },
    { name: 'FAQ & Hướng dẫn', slug: 'faq-huong-dan-tag' },
    { name: 'Tuyển dụng IT', slug: 'tuyen-dung-it-tag' },
  ];

  const tagsMap: Record<string, string> = {};
  for (const t of tagsData) {
    const createdTag = await prisma.tag.upsert({
      where: { slug: t.slug },
      update: { name: t.name },
      create: { name: t.name, slug: t.slug },
    });
    tagsMap[t.name] = createdTag.id;
  }
  console.log(`✅ Đã khởi tạo ${tagsData.length} Thẻ (Tag) bài viết.`);

  // 4. Khởi tạo danh sách BÀI VIẾT với ảnh JPEG chất lượng cao
  console.log('\n--- 3. SEED BÀI VIẾT & DOWNLOADING REAL JPEG THUMBNAIL IMAGES ---');

  const postsData = [
    // ==========================================
    // CATE 1: SỰ NGHIỆP IT (su-nghiep-it) - 12 BÀI
    // ==========================================
    {
      id: uid(101),
      title: 'Designing AI Systems for Millions of Digital Assets: The Orange Logic Approach',
      slug: 'designing-ai-systems-for-millions-of-digital-assets-orange-logic',
      content: `Most enterprises have millions of images, videos, and documents they can't find when they need them. The assets exist, but the information inside them, such as who's in the photo, what's said in the recording, or what the document is about, is locked up in files scattered across cloud buckets and legacy servers.

In this article, we take a deep dive into the Orange Logic architectural pattern for designing large-scale AI systems capable of indexing, tagging, and making millions of digital assets searchable in near real-time using deep learning models and distributed vector databases.`,
      status: PostStatus.PUBLISHED,
      type: PostType.BLOG,
      categorySlug: 'su-nghiep-developer',
      metaTitle: 'Designing AI Systems for Millions of Digital Assets',
      metaDescription: 'Khám phá kiến trúc thiết kế hệ thống AI xử lý hàng triệu tài sản số cùng giải pháp từ Orange Logic.',
      tags: ['AI & Data', 'Xu hướng công nghệ', 'System Architecture'],
    },
    {
      id: uid(102),
      title: 'Scala Developer là gì: Kỹ năng yêu cầu và cơ hội nghề nghiệp',
      slug: 'scala-developer-la-gi-ky-nang-yeu-cau-va-co-hoi-nghe-nghiep',
      content: `Trong bối cảnh hệ thống dữ liệu và backend ngày càng phức tạp, nhiều doanh nghiệp tìm đến các ngôn ngữ có hiệu năng cao và khả năng mở rộng tốt như Scala. Chạy trên JVM và kết hợp giữa lập trình hướng đối tượng và lập trình chức năng (Functional Programming), Scala trở thành lựa chọn hàng đầu cho các hệ thống Big Data và xử lý phân tán.

Để trở thành một Scala Developer chuyên nghiệp, bạn cần nắm vững:
1. Lập trình hướng đối tượng (OOP) & Lập trình chức năng (FP)
2. Hệ sinh thái JVM và bộ công cụ Akka / Pekko / Cats / ZIO
3. Xử lý dữ liệu quy mô lớn với Apache Spark
4. Tư duy thiết kế hệ thống chịu tải cao và xử lý bất đồng bộ`,
      status: PostStatus.PUBLISHED,
      type: PostType.BLOG,
      categorySlug: 'su-nghiep-developer',
      metaTitle: 'Scala Developer là gì: Kỹ năng yêu cầu và cơ hội nghề nghiệp',
      metaDescription: 'Khám phá lộ trình phát triển và các kỹ năng cần thiết dành cho Scala Developer trên thị trường hiện nay.',
      tags: ['Developer', 'Backend & Architecture', 'Career Path'],
    },
    {
      id: uid(103),
      title: 'Recap Swinburne Career Festival 2026: Khai phá "Thị trường việc làm ẩn" cùng UpNext',
      slug: 'recap-swinburne-career-festival-2026',
      content: `Sự kiện Swinburne Career Festival 2026 đã diễn ra đầy sôi động, thu hút hơn 200 sinh viên năm cuối thuộc các ngành Computer Science, Business và Media & Communications vào ngày 27 tháng 3 vừa qua.

Với sự góp mặt của các chuyên gia tuyển dụng hàng đầu từ UpNext và doanh nghiệp đối tác, sinh viên đã được trang bị bức tranh toàn cảnh về "Thị trường việc làm ẩn" (Hidden Job Market) – nơi 70% cơ hội tuyển dụng hấp dẫn không hề được đăng tải công khai trên các bảng tin tuyển dụng truyền thống.`,
      status: PostStatus.PUBLISHED,
      type: PostType.BLOG,
      categorySlug: 'ky-nang-mem-dinh-huong',
      metaTitle: 'Recap Swinburne Career Festival 2026: Khai phá thị trường việc làm ẩn',
      metaDescription: 'Sự kiện kết nối hàng trăm sinh viên IT với các chuyên gia tuyển dụng hàng đầu.',
      tags: ['Sự kiện IT', 'Career Path', 'Tuyển dụng IT'],
    },
    {
      id: uid(104),
      title: 'BUILD YOU THEN BUILD IMPACT: Định hướng cam kết xây dựng Chất riêng sự nghiệp IT',
      slug: 'build-you-then-build-impact-dinh-huong-cam-ket-su-nghiep-it',
      content: `Trong nhiều năm, thành công trong sự nghiệp công nghệ thường được đo bằng những cột mốc quen thuộc: mức lương cao hơn, chức danh cao cấp hơn, hay quy mô đội nhóm lớn hơn. Những chỉ số đó vẫn quan trọng. Nhưng trong một thế giới nơi AI đang phát triển với tốc độ chóng mặt, chất riêng của một kỹ sư IT không nằm ở số dòng code gõ ra mà ở Dấu ấn tác động (Impact) tạo ra cho sản phẩm và cộng đồng.

Chiến lược "BUILD YOU THEN BUILD IMPACT" nhấn mạnh 3 trụ cột:
1. Build Your Core: Làm chủ nền tảng kỹ thuật vững chắc
2. Build Your Identity: Định hình thương hiệu cá nhân và thế mạnh riêng
3. Build Impact: Tạo ra giá trị thực sự cho người dùng và tổ chức`,
      status: PostStatus.PUBLISHED,
      type: PostType.BLOG,
      categorySlug: 'ung-tuyen-thang-tien',
      metaTitle: 'BUILD YOU THEN BUILD IMPACT - Định hướng sự nghiệp IT',
      metaDescription: 'Trong nhiều năm, thành công trong sự nghiệp công nghệ được đo bằng mức lương hay chức danh. Đã đến lúc khẳng định chất riêng.',
      tags: ['Career Path', 'Lương IT', 'Developer'],
    },
    {
      id: uid(105),
      title: 'Thực tế mới của lực lượng nhân sự IT: "Bạn không còn cơ hội làm việc thủ công nữa"',
      slug: 'thuc-te-moi-cua-luc-luong-nhan-su-it-kye-nguyen-ai',
      content: `Thời kỳ đánh giá năng suất của một chuyên gia IT bằng số dòng code viết ra hay số bug được sửa đang dần khép lại. Khi Trí tuệ Nhân tạo (AI) thâm nhập sâu vào ngành phần mềm, nó không đơn thuần đóng vai trò là một công cụ; nó đang thiết lập nên một tiêu chuẩn mới cho lực lượng lao động IT.

Theo chia sẻ từ các Tech Director tại các tập đoàn lớn, các lập trình viên hiện đại cần nhanh chóng thích nghi với quy trình làm việc AI-Assisted, chuyển từ việc viết code thuần túy sang vai trò xem xét, kiểm thử và thiết kế kiến trúc cao cấp.`,
      status: PostStatus.PUBLISHED,
      type: PostType.BLOG,
      categorySlug: 'ky-nang-mem-dinh-huong',
      metaTitle: 'Thực tế mới của lực lượng nhân sự IT trong kỷ nguyên AI',
      metaDescription: 'Thời kỳ đánh giá năng suất chuyên gia IT bằng số dòng code đã khép lại.',
      tags: ['AI & Data', 'Developer', 'Career Path'],
    },
    {
      id: uid(106),
      title: 'Từ Tư Duy "Thợ Code" Đến Kỹ Sư AI Tại Big Tech Châu Âu',
      slug: 'tu-tu-duy-tho-code-den-ky-su-ai-tai-big-tech-chau-au',
      content: `Nếu bạn từng tò mò về hành trình của một kỹ sư Việt vươn mình ra biển lớn, chinh phục các tập đoàn công nghệ hàng đầu (Big Tech) tại Châu Âu, thì đây chính là bài viết dành cho bạn.

Để chuyển đổi từ tư duy "thợ code" (làm theo yêu cầu có sẵn) sang vai trò Kỹ sư AI tại các công ty hàng đầu thế giới, yếu tố quyết định là tư duy giải quyết vấn đề (Problem-Solving), hiểu biết sâu sắc về bản chất thuật toán và khả năng tối ưu hóa mô hình dưới các điều kiện hạ tầng nghiêm ngặt.`,
      status: PostStatus.PUBLISHED,
      type: PostType.BLOG,
      categorySlug: 'su-nghiep-developer',
      metaTitle: 'Từ Tư Duy Thợ Code Đến Kỹ Sư AI Tại Big Tech Châu Âu',
      metaDescription: 'Hành trình vươn mình ra biển lớn và làm chủ công nghệ mới của kỹ sư AI Việt Nam.',
      tags: ['AI & Data', 'Career Path', 'Technical Lead'],
    },
    {
      id: uid(107),
      title: 'Sinh viên Greenwich Việt Nam khám phá thế giới điện toán đám mây cùng UpNext và AWS',
      slug: 'sinh-vien-greenwich-viet-nam-kham-pha-aws',
      content: `Trong bối cảnh điện toán đám mây trở thành 'xương sống' của hạ tầng số và AI bùng nổ mạnh mẽ, sự kiện Study Tour – First Cloud AI Journey không chỉ cập nhật tình hình tuyển dụng IT tại Việt Nam mà còn mở ra không gian trải nghiệm thực tế công nghệ Cloud AI trên hạ tầng AWS.

Sinh viên đã được thực hành triển khai mô hình Machine Learning cơ bản và nghe chia sẻ trực tiếp từ các kiến trúc sư đám mây về kỹ năng cần chuẩn bị khi ra trường.`,
      status: PostStatus.PUBLISHED,
      type: PostType.BLOG,
      categorySlug: 'ky-nang-mem-dinh-huong',
      metaTitle: 'Sinh viên Greenwich Việt Nam khám phá AWS và Cloud AI',
      metaDescription: 'Hành trình học tập và trải nghiệm thực tế công nghệ Cloud AI cùng chuyên gia.',
      tags: ['Cloud & AWS', 'Sự kiện IT', 'Developer'],
    },
    {
      id: uid(108),
      title: 'Đặc trưng của Big Data: Hiểu rõ 7V quan trọng',
      slug: 'dac-trung-cua-big-data-hieu-ro-7v-quan-trong',
      content: `Big Data không chỉ là khối lượng dữ liệu khổng lồ. Nó còn có những đặc trưng riêng biệt khiến việc thu thập, lưu trữ, và phân tích trở thành thách thức nhưng cũng mở ra cơ hội lớn cho các doanh nghiệp.

7V kinh điển trong Big Data bao gồm:
1. Volume (Dung lượng)
2. Velocity (Tốc độ)
3. Variety (Đa dạng)
4. Veracity (Độ chính xác)
5. Value (Giá trị)
6. Variability (Tính biến đổi)
7. Visualization (Trực quan hóa)`,
      status: PostStatus.PUBLISHED,
      type: PostType.BLOG,
      categorySlug: 'su-nghiep-developer',
      metaTitle: 'Đặc trưng của Big Data: Hiểu rõ 7V quan trọng',
      metaDescription: 'Tìm hiểu 7 yếu tố cốt lõi định hình hệ thống dữ liệu lớn trong doanh nghiệp.',
      tags: ['Big Data', 'AI & Data', 'System Architecture'],
    },
    {
      id: uid(109),
      title: 'Lộ trình trở thành Technical Lead từ Senior Developer',
      slug: 'lo-trinh-tro-thanh-technical-lead-tu-senior-developer',
      content: `Chuyển mình từ vị trí Senior Developer lên Technical Lead là bước ngoặt lớn đòi hỏi sự cân bằng giữa năng lực kiến trúc hệ thống và kỹ năng quản lý con người.

Lộ trình chuyển giao gồm 5 giai đoạn:
- Giai đoạn 1: Master kỹ năng lập trình & thiết kế hệ thống
- Giai đoạn 2: Tham gia cố vấn (Mentorship) và Code Review
- Giai đoạn 3: Làm quen với quản lý dự án Agile/Scrum
- Giai đoạn 4: Đóng góp vào định hướng kỹ thuật doanh nghiệp
- Giai đoạn 5: Phát triển kỹ năng giao tiếp và giải quyết xung đột`,
      status: PostStatus.PUBLISHED,
      type: PostType.BLOG,
      categorySlug: 'ung-tuyen-thang-tien',
      metaTitle: 'Lộ trình trở thành Technical Lead từ Senior Developer',
      metaDescription: 'Những kỹ năng quản trị kỹ thuật và con người cần trang bị để thăng tiến vị trí Tech Lead.',
      tags: ['Technical Lead', 'Career Path', 'Developer'],
    },
    {
      id: uid(110),
      title: 'Bí quyết đàm phán lương IT thành công dành cho Senior',
      slug: 'bi-quyet-dam-phan-luong-it-thanh-cong-danh-cho-senior',
      content: `Đàm phán mức lương tương xứng với năng lực là một nghệ thuật. Đối với các lập trình viên Senior, con số lương không chỉ phụ thuộc vào số năm kinh nghiệm mà dựa trên giá trị bạn mang lại cho doanh nghiệp.

Các nguyên tắc vàng khi deal lương:
1. Nghiên cứu báo cáo thị trường tuyển dụng IT mới nhất
2. Đo lường thành tích cũ bằng số liệu kinh doanh cụ thể
3. Đưa ra khoảng lương mong muốn dựa trên tổng gói đãi ngộ (Base + Bonus + Equity)
4. Giữ thái độ chuyên nghiệp và lắng nghe đề xuất từ nhà tuyển dụng`,
      status: PostStatus.PUBLISHED,
      type: PostType.BLOG,
      categorySlug: 'phong-van-luong-thuong',
      metaTitle: 'Bí quyết đàm phán lương IT thành công dành cho Senior',
      metaDescription: 'Cách xác định giá trị bản thân và kỹ thuật deal lương hiệu quả khi nhận Offer.',
      tags: ['Lương IT', 'Phỏng vấn IT', 'Career Path'],
    },
    {
      id: uid(111),
      title: 'Phỏng vấn System Design: Những câu hỏi kinh điển và cách trả lời',
      slug: 'phong-van-system-design-nhung-cau-hoi-kinh-dien-va-cach-tra-loi',
      content: `Phỏng vấn System Design là thách thức lớn nhất đối với các ứng viên Senior/Lead khi ứng tuyển vào các công ty lớn.

Khung trả lời 4 bước chuẩn hóa:
- Bước 1: Clarify Requirements & Scope (Làm rõ yêu cầu chức năng & phi chức năng)
- Bước 2: High-Level Design (Vẽ sơ đồ kiến trúc tổng quan)
- Bước 3: Deep Dive Component (Đi sâu vào cơ sở dữ liệu, caching, message queue)
- Bước 4: Identify Bottlenecks & Scale (Phân tích điểm nghẽn và chiến lược mở rộng)`,
      status: PostStatus.PUBLISHED,
      type: PostType.BLOG,
      categorySlug: 'phong-van-luong-thuong',
      metaTitle: 'Phỏng vấn System Design: Những câu hỏi kinh điển và cách trả lời',
      metaDescription: 'Tổng hợp chiến lược trả lời phỏng vấn thiết kế hệ thống phân tán cho Developer.',
      tags: ['Phỏng vấn IT', 'System Architecture', 'Backend & Architecture'],
    },
    {
      id: uid(112),
      title: 'Agile & Scrum trong dự án công nghệ: Từ lý thuyết đến thực chiến',
      slug: 'agile-scrum-trong-du-an-cong-nghe-tu-ly-thuyet-den-thuc-chien',
      content: `Áp dụng Agile và mô hình Scrum mang lại tốc độ và sự linh hoạt cho đội ngũ IT. Bài viết chia sẻ trải nghiệm thực tế về cách vận hành các buổi Sprint Planning, Daily Standup, Demo và Retrospective sao cho không sa lầy vào hình thức văn phòng.`,
      status: PostStatus.PUBLISHED,
      type: PostType.BLOG,
      categorySlug: 'ky-nang-mem-dinh-huong',
      metaTitle: 'Agile & Scrum trong dự án công nghệ: Từ lý thuyết đến thực chiến',
      metaDescription: 'Cách tối ưu quy trình phát triển phần mềm linh hoạt cho đội ngũ phát triển.',
      tags: ['Agile & Scrum', 'Technical Lead', 'Developer'],
    },

    // ==========================================
    // CATE 2: CHUYÊN MÔN IT (chuyen-mon-it) - 12 BÀI
    // ==========================================
    {
      id: uid(201),
      title: 'Tổng quan về Microservices Architecture: Khi nào nên áp dụng?',
      slug: 'tong-quan-ve-microservices-architecture-khi-nao-nen-ap-dung',
      content: `Kiến trúc Microservices mang lại sự độc lập trong triển khai và khả năng mở rộng tuyệt vời. Tuy nhiên, nó cũng đi kèm với độ phức tạp cao trong quản lý giao tiếp mạng, phân tán dữ liệu và giám sát.

Bài viết phân tích sâu:
- So sánh chi tiết Monolithic vs Microservices
- Các thiết kế mẫu: API Gateway, Event Sourcing, Saga Pattern
- Tiêu chí đánh giá doanh nghiệp đã sẵn sàng cho Microservices chưa`,
      status: PostStatus.PUBLISHED,
      type: PostType.BLOG,
      categorySlug: 'backend-architecture',
      metaTitle: 'Tổng quan về Microservices Architecture: Khi nào nên áp dụng?',
      metaDescription: 'So sánh chi tiết giữa Monolith và Microservices trong thiết kế phần mềm doanh nghiệp.',
      tags: ['System Architecture', 'Backend & Architecture', 'DevOps'],
    },
    {
      id: uid(202),
      title: 'Xây dựng RESTful API chuẩn mực với NestJS và Prisma',
      slug: 'xay-dung-restful-api-chuan-muc-voi-nestjs-va-prisma',
      content: `NestJS là một trong những framework Node.js mã nguồn mở phát triển nhanh nhất cho xây dựng ứng dụng máy chủ hiệu quả và dễ bảo trì.

Hướng dẫn chi tiết trong bài viết:
- Tổ chức Controller, Service, DTO và Module chuẩn NestJS
- Tích hợp class-validator & Swagger OpenAPI tự động
- Truy vấn cơ sở dữ liệu PostgreSQL an toàn với Prisma ORM`,
      status: PostStatus.PUBLISHED,
      type: PostType.BLOG,
      categorySlug: 'backend-architecture',
      metaTitle: 'Xây dựng RESTful API chuẩn mực với NestJS và Prisma',
      metaDescription: 'Hướng dẫn từng bước phát triển Backend chuyên nghiệp với NestJS, TypeScript và Prisma ORM.',
      tags: ['NestJS', 'Backend & Architecture', 'Developer'],
    },
    {
      id: uid(203),
      title: 'Tối ưu hóa hiệu năng ứng dụng ReactJS với Server-Driven UI và Virtualization',
      slug: 'toi-uu-hoa-hieu-nang-ung-dung-reactjs',
      content: `Khi ứng dụng ReactJS phình to về quy mô, các vấn đề về Re-render thừa và dung lượng Bundle Size lớn sẽ ảnh hưởng trực tiếp đến trải nghiệm người dùng.

Khám phá các phương pháp tối ưu:
1. Sử dụng React.memo & useCallback đúng cách
2. Áp dụng Virtual List (react-window) cho bảng dữ liệu lớn
3. Kỹ thuật Server-Driven UI linh hoạt render linh kiện từ Backend`,
      status: PostStatus.PUBLISHED,
      type: PostType.BLOG,
      categorySlug: 'mobile-frontend',
      metaTitle: 'Tối ưu hóa hiệu năng ứng dụng ReactJS với Server-Driven UI',
      metaDescription: 'Các kỹ thuật nâng cao giúp giảm thời gian render và cải thiện chỉ số Core Web Vitals.',
      tags: ['ReactJS', 'Developer', 'Xu hướng công nghệ'],
    },
    {
      id: uid(204),
      title: 'CI/CD Pipeline với Docker & Kubernetes cho ứng dụng Node.js',
      slug: 'ci-cd-pipeline-voi-docker-kubernetes-cho-ung-dung-nodejs',
      content: `Thiết lập chuỗi tích hợp và triển khai liên tục (CI/CD) giúp rút ngắn vòng đời phát hành phần mềm từ tuần xuống phút. Bài viết thực hành cách viết Dockerfile đa tầng (Multi-stage build), cấu hình Helm Chart và chạy GitHub Actions tự động.`,
      status: PostStatus.PUBLISHED,
      type: PostType.BLOG,
      categorySlug: 'devops-cloud',
      metaTitle: 'CI/CD Pipeline với Docker & Kubernetes cho ứng dụng Node.js',
      metaDescription: 'Tự động hóa quy trình đóng gói, kiểm thử và triển khai ứng dụng lên Kubernetes.',
      tags: ['DevOps', 'Cloud & AWS', 'System Architecture'],
    },
    {
      id: uid(205),
      title: 'Hiểu rõ về Prompt Engineering và RAG trong lập trình ứng dụng AI',
      slug: 'hieu-ro-ve-prompt-engineering-va-rag-trong-lap-trinh-ung-dung-ai',
      content: `Retrieval-Augmented Generation (RAG) là giải pháp hàng đầu để khắc phục hiện tượng "ảo giác" (Hallucination) của các mô hình ngôn ngữ lớn (LLM). Hướng dẫn từng bước xây dựng hệ thống RAG với Vector Database (pgvector, Pinecone) và LangChain.`,
      status: PostStatus.PUBLISHED,
      type: PostType.BLOG,
      categorySlug: 'ai-data-specialty',
      metaTitle: 'Hiểu rõ về Prompt Engineering và RAG trong lập trình AI',
      metaDescription: 'Kỹ thuật kết hợp LLM với tri thức doanh nghiệp thông qua Retrieval-Augmented Generation.',
      tags: ['AI & Data', 'Machine Learning', 'Python'],
    },
    {
      id: uid(206),
      title: 'Tối ưu hóa truy vấn SQL và Indexing trong PostgreSQL',
      slug: 'toi-uu-hoa-truy-van-sql-va-indexing-trong-postgresql',
      content: `Nút thắt hiệu năng của hầu hết các ứng dụng Web/Mobile xuất phát từ cơ sở dữ liệu. Bài viết giải thích cơ chế B-Tree Index, Partial Index, Composite Index trong PostgreSQL và chiến lược tối ưu hóa các câu lệnh JOIN phức tạp.`,
      status: PostStatus.PUBLISHED,
      type: PostType.BLOG,
      categorySlug: 'backend-architecture',
      metaTitle: 'Tối ưu hóa truy vấn SQL và Indexing trong PostgreSQL',
      metaDescription: 'Cách đọc EXPLAIN ANALYZE và tạo Index hiệu quả cho cơ sở dữ liệu triệu bản ghi.',
      tags: ['Backend & Architecture', 'Big Data', 'System Architecture'],
    },
    {
      id: uid(207),
      title: 'Bảo mật Web API: Phòng chống OWASP Top 10 trong Node.js',
      slug: 'bao-mat-web-api-phong-chong-owasp-top-10-trong-nodejs',
      content: `Bảo mật thông tin là ưu tiên hàng đầu trong phát triển phần mềm. Tìm hiểu cách ngăn chặn SQL Injection, XSS, CSRF, Broken Access Control và thực thi mã hóa JWT Token an toàn theo tiêu chuẩn bảo mật OWASP.`,
      status: PostStatus.PUBLISHED,
      type: PostType.BLOG,
      categorySlug: 'backend-architecture',
      metaTitle: 'Bảo mật Web API: Phòng chống OWASP Top 10 trong Node.js',
      metaDescription: 'Những lỗ hổng bảo mật phổ biến và cách gia cố ứng dụng của bạn.',
      tags: ['Backend & Architecture', 'Developer', 'DevOps'],
    },
    {
      id: uid(208),
      title: 'Tạo ứng dụng Mobile đa nền tảng hiệu năng cao với React Native',
      slug: 'tao-ung-dung-mobile-da-nen-tang-hieu-nang-cao-voi-react-native',
      content: `React Native cho phép phát triển ứng dụng di động cho cả iOS và Android chỉ với một cơ sở mã nguồn duy nhất. Bài viết chia sẻ kiến trúc New Architecture (Fabric, TurboModules) giúp ứng dụng chạy mượt mà như Native App.`,
      status: PostStatus.PUBLISHED,
      type: PostType.BLOG,
      categorySlug: 'mobile-frontend',
      metaTitle: 'Tạo ứng dụng Mobile đa nền tảng hiệu năng cao với React Native',
      metaDescription: 'Kinh nghiệm tối ưu UI/UX và native bridge cho ứng dụng iOS & Android.',
      tags: ['ReactJS', 'Developer', 'Xu hướng công nghệ'],
    },
    {
      id: uid(209),
      title: 'Python cho Data Science và Machine Learning: Từ cơ bản đến chuyên sâu',
      slug: 'python-cho-data-science-va-machine-learning',
      content: `Python khẳng định vị thế số một trong lĩnh vực khoa học dữ liệu và học máy nhờ hệ sinh thái thư viện phong phú. Bài viết hướng dẫn quy trình tiền xử lý dữ liệu, phân tích khám phá (EDA) và huấn luyện mô hình dự đoán.`,
      status: PostStatus.PUBLISHED,
      type: PostType.BLOG,
      categorySlug: 'ai-data-specialty',
      metaTitle: 'Python cho Data Science và Machine Learning: Từ cơ bản đến chuyên sâu',
      metaDescription: 'Sử dụng NumPy, Pandas, Scikit-Learn và PyTorch để xử lý dữ liệu và huấn luyện mô hình.',
      tags: ['Python', 'AI & Data', 'Machine Learning'],
    },
    {
      id: uid(210),
      title: 'Kiến trúc Serverless với AWS Lambda và API Gateway',
      slug: 'kien-truc-serverless-voi-aws-lambda-va-api-gateway',
      content: `Serverless Computing giúp các doanh nghiệp tập trung hoàn toàn vào logic kinh doanh thay vì lo lắng về việc hạ tầng. Tìm hiểu cách kết hợp AWS Lambda, API Gateway và DynamoDB để tạo ra dịch vụ thanh toán sẵn sàng phục vụ hàng triệu request.`,
      status: PostStatus.PUBLISHED,
      type: PostType.BLOG,
      categorySlug: 'devops-cloud',
      metaTitle: 'Kiến trúc Serverless với AWS Lambda và API Gateway',
      metaDescription: 'Xây dựng hệ thống tự động co giãn không cần quản trị máy chủ.',
      tags: ['Cloud & AWS', 'DevOps', 'System Architecture'],
    },
    {
      id: uid(211),
      title: 'Clean Code và Refactoring: Viết mã nguồn dễ đọc và dễ bảo trì',
      slug: 'clean-code-va-refactoring-viet-ma-nguon-de-doc-va-de-bao-tri',
      content: `Mã nguồn được viết ra cho con người đọc nhiều hơn là cho máy tính chạy. Bài viết tổng hợp các quy tắc Clean Code cốt lõi: đặt tên biến có ý nghĩa, hàm ngắn gọn đơn chức năng, xử lý ngoại lệ rõ ràng và loại bỏ mã lặp (DRY).`,
      status: PostStatus.PUBLISHED,
      type: PostType.BLOG,
      categorySlug: 'backend-architecture',
      metaTitle: 'Clean Code và Refactoring: Viết mã nguồn dễ đọc và dễ bảo trì',
      metaDescription: 'Các nguyên tắc SOLID và kỹ thuật viết mã sạch dành cho mọi Developer.',
      tags: ['Developer', 'Backend & Architecture', 'Career Path'],
    },
    {
      id: uid(212),
      title: 'Event-Driven Architecture với Apache Kafka và RabbitMQ',
      slug: 'event-driven-architecture-voi-apache-kafka-va-rabbitmq',
      content: `Kiến trúc hướng sự kiện (Event-Driven) giải quyết triệt để vấn đề phụ thuộc trực tiếp (Tight Coupling) giữa các dịch vụ. So sánh trường hợp sử dụng phù hợp giữa Apache Kafka (Event Streaming) và RabbitMQ (Message Broker).`,
      status: PostStatus.PUBLISHED,
      type: PostType.BLOG,
      categorySlug: 'backend-architecture',
      metaTitle: 'Event-Driven Architecture với Apache Kafka và RabbitMQ',
      metaDescription: 'Thiết kế hệ thống giao tiếp bất đồng bộ cho ứng dụng quy mô lớn.',
      tags: ['System Architecture', 'Big Data', 'Backend & Architecture'],
    },

    // ==========================================
    // CATE 3: BLOG UPNEXT (blog-upnext) - 11 BÀI
    // ==========================================
    {
      id: uid(301),
      title: 'Báo cáo Thị trường Việc làm IT Việt Nam 2026: Mức lương & Xu hướng Kỹ năng HOT',
      slug: 'bao-cao-thi-truong-viec-lam-it-viet-nam-2026',
      content: `UpNext chính thức phát hành Báo cáo Thị trường IT Việt Nam 2026 dựa trên dữ liệu từ hơn 100.000 tin tuyển dụng và khảo sát 5.000 chuyên gia công nghệ. Báo cáo chỉ ra sự gia tăng mạnh mẽ nhu cầu tuyển dụng các vị trí AI Engineer, Data Engineer và DevOps Specialist.`,
      status: PostStatus.PUBLISHED,
      type: PostType.NEWS,
      categorySlug: 'bao-cao-thi-truong-it',
      metaTitle: 'Báo cáo Thị trường Việc làm IT Việt Nam 2026',
      metaDescription: 'Phân tích toàn diện về nhu cầu tuyển dụng, dải lương IT và những công nghệ được săn đón nhất.',
      tags: ['Báo cáo thị trường IT', 'Lương IT', 'Xu hướng công nghệ'],
    },
    {
      id: uid(302),
      title: 'UpNext ra mắt tính năng AI Matching CV và Phòng phỏng vấn thử Mock Interview AI',
      slug: 'upnext-ra-mat-tinh-nang-ai-matching-cv-va-mock-interview-ai',
      content: `UpNext tự hào giới thiệu bộ tính năng AI vượt trội giúp nâng tầm trải nghiệm tìm việc IT. Ứng dụng mô hình AI tiên tiến, hệ thống hỗ trợ tính toán độ phù hợp giữa CV và mô tả công việc, đồng thời cung cấp phòng phỏng vấn ảo AI với phản hồi thời gian thực.`,
      status: PostStatus.PUBLISHED,
      type: PostType.NEWS,
      categorySlug: 'tin-tuc-upnext',
      metaTitle: 'UpNext ra mắt tính năng AI Matching CV và Mock Interview AI',
      metaDescription: 'Trải nghiệm công nghệ AI thế hệ mới hỗ trợ ứng viên tự động khớp công việc và phỏng vấn thử.',
      tags: ['AI & Data', 'Tin tức UpNext', 'Developer'],
    },
    {
      id: uid(303),
      title: 'Hướng dẫn sử dụng UpNext Builder để tạo CV IT chuyên nghiệp trong 5 phút',
      slug: 'huong-dan-su-dung-upnext-builder-tao-cv-it-chuyen-nghiep',
      content: `Một chiếc CV chuẩn chỉnh là chìa khóa đầu tiên mở ra cơ hội phỏng vấn. Bài viết hướng dẫn chi tiết cách sử dụng công cụ UpNext CV Builder để lựa chọn template, sắp xếp dự án cá nhân và làm nổi bật các kỹ năng chuyên môn.`,
      status: PostStatus.PUBLISHED,
      type: PostType.FAQ,
      categorySlug: 'faq-huong-dan',
      metaTitle: 'Hướng dẫn sử dụng UpNext Builder tạo CV IT chuyên nghiệp',
      metaDescription: 'Cách tạo hồ sơ ấn tượng thu hút nhà tuyển dụng với các mẫu CV IT chuẩn quốc tế.',
      tags: ['FAQ & Hướng dẫn', 'Career Path', 'Phỏng vấn IT'],
    },
    {
      id: uid(304),
      title: 'Tổng kết Sự kiện UpNext Tech Connect 2026: Kết nối 50+ Doanh nghiệp IT Hàng đầu',
      slug: 'tong-ket-su-kien-upnext-tech-connect-2026',
      content: `Sự kiện UpNext Tech Connect 2026 đã diễn ra thành công rực rỡ tại TP. Hồ Chí Minh với sự tham gia của hơn 50 doanh nghiệp công nghệ hàng đầu và 1.500 ứng viên IT. Các phiên thảo luận chuyên sâu về AI, Cloud và Security nhận được phản hồi tích cực.`,
      status: PostStatus.PUBLISHED,
      type: PostType.NEWS,
      categorySlug: 'su-kien-it-upnext',
      metaTitle: 'Tổng kết Sự kiện UpNext Tech Connect 2026',
      metaDescription: 'Hơn 1.500 Developer tham gia sự kiện ngày hội tuyển dụng trực tiếp lớn nhất đầu năm 2026.',
      tags: ['Sự kiện IT', 'Tin tức UpNext', 'Tuyển dụng IT'],
    },
    {
      id: uid(305),
      title: 'Giải đáp thắc mắc thường gặp về Quy trình nộp hồ sơ ứng tuyển trên UpNext',
      slug: 'giai-dap-thac-mac-thuong-gap-quy-trinh-nop-ho-so-ung-tuyen-upnext',
      content: `Dành cho các ứng viên mới sử dụng nền tảng UpNext: Làm thế nào để theo dõi trạng thái hồ sơ? Nhà tuyển dụng có thấy thông tin cá nhân của tôi khi chưa ứng tuyển không? Bài viết giải đáp chi tiết tất cả thắc mắc trên.`,
      status: PostStatus.PUBLISHED,
      type: PostType.FAQ,
      categorySlug: 'faq-huong-dan',
      metaTitle: 'Giải đáp thắc mắc thường gặp quy trình ứng tuyển UpNext',
      metaDescription: 'Mọi câu hỏi về bảo mật thông tin, theo dõi trạng thái ứng tuyển và liên hệ nhà tuyển dụng.',
      tags: ['FAQ & Hướng dẫn', 'Tin tức UpNext'],
    },
    {
      id: uid(306),
      title: 'UpNext hợp tác chiến lược cùng 20 Trường Đại học đào tạo Nhân lực IT chất lượng cao',
      slug: 'upnext-hop-tac-chien-luoc-cung-20-truong-dai-hoc-it',
      content: `Nhằm rút ngắn khoảng cách giữa nhà trường và doanh nghiệp, UpNext ký kết hợp tác chiến lược với 20 trường đại học đào tạo CNTT hàng đầu Việt Nam. Chương trình cung cấp tài khoản CV miễn phí và cơ hội thực tập tại các công ty Product tên tuổi.`,
      status: PostStatus.PUBLISHED,
      type: PostType.NEWS,
      categorySlug: 'tin-tuc-upnext',
      metaTitle: 'UpNext hợp tác chiến lược cùng 20 Trường Đại học IT',
      metaDescription: 'Chương trình đồng hành tài trợ học bổng và kết nối việc làm thực tập sinh IT.',
      tags: ['Tin tức UpNext', 'Sự kiện IT', 'Career Path'],
    },
    {
      id: uid(307),
      title: 'Kinh nghiệm vượt qua bài kiểm tra Coding Challenge trực tuyến',
      slug: 'kinh-nghiem-vuot-qua-bai-kiem-tra-coding-challenge-truc-tuyen',
      content: `Nhiều công ty IT áp dụng bài kiểm tra thuật toán trực tuyến làm vòng loại ban đầu. Bài viết tổng hợp phương pháp luyện tập cấu trúc dữ liệu, giải thuật hiệu quả và bí quyết giữ vững tâm lý khi đồng hồ đếm ngược.`,
      status: PostStatus.PUBLISHED,
      type: PostType.BLOG,
      categorySlug: 'faq-huong-dan',
      metaTitle: 'Kinh nghiệm vượt qua bài kiểm tra Coding Challenge trực tuyến',
      metaDescription: 'Mẹo xử lý thời gian và thuật toán khi làm test trên LeetCode, HackerRank.',
      tags: ['Phỏng vấn IT', 'Developer', 'FAQ & Hướng dẫn'],
    },
    {
      id: uid(308),
      title: 'Xu hướng làm việc Remote & Hybrid trong ngành IT năm 2026',
      slug: 'xu-huong-lam-viec-remote-hybrid-trong-nganh-it-nam-2026',
      content: `Mô hình làm việc linh hoạt (Hybrid/Remote) tiếp tục là tiêu chí quan trọng hàng đầu của nhân sự IT khi lựa chọn công ty. Phân tích các chính sách hỗ trợ thiết bị, văn hóa giao tiếp bất đồng bộ (Asynchronous Communication) và cân bằng cuộc sống.`,
      status: PostStatus.PUBLISHED,
      type: PostType.BLOG,
      categorySlug: 'bao-cao-thi-truong-it',
      metaTitle: 'Xu hướng làm việc Remote & Hybrid trong ngành IT năm 2026',
      metaDescription: 'Đánh giá mức độ hài lòng và những thách thức khi làm việc linh hoạt.',
      tags: ['Báo cáo thị trường IT', 'Xu hướng công nghệ', 'Career Path'],
    },
    {
      id: uid(309),
      title: 'Làm thế nào để nhà tuyển dụng chủ động tìm thấy hồ sơ của bạn trên UpNext?',
      slug: 'lam-the-nao-de-nha-tuyen-dung-chu-dong-tim-thay-ho-so-cua-ban',
      content: `Bạn không cần phải chủ động nộp đơn ở khắp mọi nơi. Bằng cách kích hoạt chế độ "Bật tìm việc" và cập nhật đầy đủ các kỹ năng cốt lõi, thuật toán gợi ý của UpNext sẽ tự động đề xuất hồ sơ của bạn tới các Nhà tuyển dụng phù hợp.`,
      status: PostStatus.PUBLISHED,
      type: PostType.FAQ,
      categorySlug: 'faq-huong-dan',
      metaTitle: 'Cách để nhà tuyển dụng chủ động tìm thấy hồ sơ của bạn trên UpNext',
      metaDescription: 'Mẹo bật trạng thái Open to Work và tối ưu hóa từ khóa trong profile.',
      tags: ['FAQ & Hướng dẫn', 'Career Path'],
    },
    {
      id: uid(310),
      title: 'Chương trình UpNext Certified Developer: Khẳng định năng lực lập trình',
      slug: 'chuong-trinh-upnext-certified-developer-khang-dinh-nang-luc',
      content: `UpNext ra mắt hệ thống đánh giá kỹ năng chuẩn hóa bao gồm các bài test trắc nghiệm kiến thức nâng cao và bài tập Coding thực tế. Ứng viên đạt chứng chỉ sẽ được dán nhãn Verified Profile và ưu tiên hiển thị trước nhà tuyển dụng.`,
      status: PostStatus.PUBLISHED,
      type: PostType.NEWS,
      categorySlug: 'tin-tuc-upnext',
      metaTitle: 'Chương trình UpNext Certified Developer khẳng định năng lực',
      metaDescription: 'Hệ thống chứng chỉ kỹ năng lập trình được công nhận bởi hàng trăm doanh nghiệp.',
      tags: ['Tin tức UpNext', 'Developer', 'Career Path'],
    },
    {
      id: uid(311),
      title: 'Cách viết phần Mô tả Kinh nghiệm (Work Experience) gây ấn tượng mạnh',
      slug: 'cach-viet-phan-mo-ta-kinh-nghiem-work-experience-gay-an-tuong',
      content: `Thay vì liệt kê danh sách công việc hàng ngày một cách khô khan, hãy áp dụng công thức STAR (Situation - Task - Action - Result) để làm nổi bật kết quả công việc. Bài viết phân tích các ví dụ cụ thể cho vị trí Frontend, Backend và QA.`,
      status: PostStatus.PUBLISHED,
      type: PostType.FAQ,
      categorySlug: 'faq-huong-dan',
      metaTitle: 'Cách viết phần Mô tả Kinh nghiệm trong CV IT gây ấn tượng',
      metaDescription: 'Áp dụng công thức STAR để trình bày thành tích công việc đo lường bằng số liệu.',
      tags: ['FAQ & Hướng dẫn', 'Phỏng vấn IT', 'Career Path'],
    },
  ];

  let countCreated = 0;
  for (let idx = 0; idx < postsData.length; idx++) {
    const postItem = postsData[idx];
    const catInfo = categoriesMap[postItem.categorySlug] || { id: parent1.id, name: parent1.name };
    const tagIds = postItem.tags.map((tn) => tagsMap[tn]).filter(Boolean);

    // 1. Download real high-res JPEG image binary
    const imageUrl = getImageUrlForPost(postItem.slug, postItem.categorySlug);
    console.log(`[${idx + 1}/${postsData.length}] Downloading JPEG for: ${postItem.slug}`);
    
    const imgBuffer = await fetchImageBuffer(imageUrl);

    // 2. Save JPEG file locally to uploads/posts/${slug}.jpg
    const filename = `${postItem.slug}.jpg`;
    const filePath = path.join(uploadDir, filename);
    fs.writeFileSync(filePath, imgBuffer);

    // 3. Storage key & Public URL format: APP_BACKEND_URL + /uploads/posts/${slug}.jpg
    const storageKey = `uploads/posts/${filename}`;
    const publicUrl = `${baseUrl}/uploads/posts/${filename}`;
    const fileSize = BigInt(imgBuffer.length);

    // 4. Upsert FileAsset with mimeType image/jpeg
    const fileAssetId = uid(1000 + idx);
    const thumbnailFileAsset = await prisma.fileAsset.upsert({
      where: { id: fileAssetId },
      update: {
        purpose: FilePurpose.POST_THUMBNAIL,
        visibility: FileVisibility.PUBLIC,
        storageKey,
        originalName: filename,
        mimeType: 'image/jpeg',
        sizeBytes: fileSize,
        publicUrl,
      },
      create: {
        id: fileAssetId,
        purpose: FilePurpose.POST_THUMBNAIL,
        visibility: FileVisibility.PUBLIC,
        storageKey,
        originalName: filename,
        mimeType: 'image/jpeg',
        sizeBytes: fileSize,
        publicUrl,
      },
    });

    // 5. Upsert Post record with thumbnailFileId & coverImageFileId
    await prisma.post.upsert({
      where: { slug: postItem.slug },
      update: {
        title: postItem.title,
        content: postItem.content,
        status: postItem.status,
        type: postItem.type,
        categoryId: catInfo.id,
        adminId: admin.id,
        thumbnailFileId: thumbnailFileAsset.id,
        coverImageFileId: thumbnailFileAsset.id,
        metaTitle: postItem.metaTitle,
        metaDescription: postItem.metaDescription,
        postTags: {
          deleteMany: {},
          create: tagIds.map((tid) => ({ tagId: tid })),
        },
      },
      create: {
        id: postItem.id,
        title: postItem.title,
        slug: postItem.slug,
        content: postItem.content,
        status: postItem.status,
        type: postItem.type,
        categoryId: catInfo.id,
        adminId: admin.id,
        thumbnailFileId: thumbnailFileAsset.id,
        coverImageFileId: thumbnailFileAsset.id,
        metaTitle: postItem.metaTitle,
        metaDescription: postItem.metaDescription,
        postTags: {
          create: tagIds.map((tid) => ({ tagId: tid })),
        },
      },
    });
    countCreated++;
  }

  console.log(`\n✅ Đã khởi tạo thành công ${countCreated} bài viết cùng FileAsset thumbnail JPEG thực tế (${baseUrl}/uploads/posts/\${slug}.jpg) cho cả 3 danh mục cha!`);
  console.log('\n🎉 🎉 HOÀN THÀNH SEED BÀI VIẾT (POST SEED COMPLETED) 🎉 🎉');
}

main()
  .catch((e) => {
    console.error('❌ Lỗi khi seed dữ liệu bài viết:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
