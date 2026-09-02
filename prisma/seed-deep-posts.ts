import { PrismaClient, PostStatus, PostType, FilePurpose, FileVisibility } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';
import { randomUUID } from 'crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

interface DeepTechPostItem {
  title: string;
  slug: string;
  categorySlug: string;
  tagSlugs: string[];
  thumbnailUrl: string;
  coverUrl: string;
  excerpt: string;
  viewCount: number;
  publishedAt: string;
  metaTitle: string;
  metaDescription: string;
  metaKeywords: string;
  focusKeyword: string;
  content: string;
}

const dataPath = path.join(__dirname, 'data', 'deep_tech_posts.json');
const DEEP_TECH_POSTS: DeepTechPostItem[] = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));

// Slug của bộ 20 bài viết cũ (đã bị thay thế) — xoá sạch trước khi seed lại để
// tránh để lại bài viết "mồ côi" không còn nằm trong bộ dữ liệu mới.
const LEGACY_SLUGS_TO_REMOVE = [
  'kien-truc-microservices-chuan-enterprise-nestjs-kafka-clean-architecture-2026',
  'xay-dung-he-thong-rag-langchain-llama-3-postgresql-pgvector',
  'toi-uu-hieu-nang-nextjs-16-app-router-server-actions-ppr-view-transitions',
  'trien-khai-kubernetes-production-terraform-helm-argocd-gitops',
  'bi-quyet-toi-uu-hoa-postgresql-he-thong-trieu-record-indexes-partitioning',
  'cam-nang-phong-van-system-design-senior-tech-lead',
  'bao-mat-toan-dien-web-api-oauth2-oidc-refresh-token-rotation-rate-limiting',
  'bao-cao-thi-truong-tuyen-dung-dai-luong-it-2026',
  'quan-ly-state-toan-dien-react-zustand-tanstack-query-server-state',
  'toi-uu-hoa-docker-image-sieu-nhe-nodejs-go-multi-stage-distroless',
  'mau-cv-lap-trinh-vien-chuan-ats-2026-project-highlight-impact',
  'lam-chu-concurrency-golang-goroutines-channels-mutex-100k-rps',
  'he-thong-hang-doi-cache-da-tang-redis-bullmq-websocket-realtime',
  'chien-luoc-kiem-thu-toan-dien-vitest-testcontainers-playwright',
  'xay-dung-doi-ngu-ky-thuat-dinh-cao-1-on-1-code-review-thang-tien',
  'xay-dung-thuong-hieu-tuyen-dung-cong-nghe-tech-employer-branding-senior',
  'so-sanh-kien-truc-mobile-app-2026-flutter-vs-react-native',
  'bi-quyet-cat-giam-40-phan-tram-chi-phi-aws-cloud-spot-graviton',
  'ung-dung-ai-tu-dong-hoa-phong-van-ung-vien-ai-mock-interview',
  'upnext-platform-nang-tam-tuyen-dung-it-viet-nam-ai-matching',
];

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required to run Prisma seed.');
}

const adapter = new PrismaPg({
  connectionString: databaseUrl,
});
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log(
    `🚀 Bắt đầu seed ${DEEP_TECH_POSTS.length} bài viết kỹ thuật & tuyển dụng siêu chuyên sâu...`,
  );

  console.log('\n🧹 Dọn dẹp bộ bài viết cũ trước khi seed lại...');
  const legacyPosts = await prisma.post.findMany({
    where: { slug: { in: LEGACY_SLUGS_TO_REMOVE } },
    select: { id: true, slug: true, thumbnailFileId: true, coverImageFileId: true },
  });
  for (const legacy of legacyPosts) {
    await prisma.postTag.deleteMany({ where: { postId: legacy.id } });
    await prisma.postSlugHistory.deleteMany({ where: { postId: legacy.id } });
    await prisma.post.delete({ where: { id: legacy.id } });
    const fileIds = [legacy.thumbnailFileId, legacy.coverImageFileId].filter(Boolean) as string[];
    if (fileIds.length) {
      await prisma.fileAsset.deleteMany({ where: { id: { in: fileIds } } });
    }
  }
  console.log(`✅ Đã xoá ${legacyPosts.length} bài viết cũ (và FileAsset ảnh liên quan).`);

  // 1. Find or create Admin User
  let admin = await prisma.adminUser.findFirst();
  if (!admin) {
    // Fallback for a completely empty DB (no admin.super seeded yet by the
    // main `prisma:seed` run): reuse/create the Super Admin role so the
    // relation is valid — AdminUser.roleId is a FK to admin_roles, not a
    // free-text string.
    const superAdminRole = await prisma.adminRole.upsert({
      where: { roleCode: 'SUPER_ADMIN' },
      update: {},
      create: {
        id: randomUUID(),
        roleCode: 'SUPER_ADMIN',
        roleName: 'Super Admin',
        description: 'Toàn quyền quản trị hệ thống UpNext.',
        isSystem: true,
      },
    });
    admin = await prisma.adminUser.create({
      data: {
        id: randomUUID(),
        email: 'editorial@upnext.works',
        fullName: 'UpNext Editorial Team',
        roleId: superAdminRole.id,
        passwordHash: '$2a$10$abcdefghijklmnopqrstuvwxyz1234567890',
      },
    });
    console.log(`✅ Đã tạo Admin Author: ${admin.fullName} (${admin.id})`);
  } else {
    console.log(`✅ Sử dụng Admin Author: ${admin.fullName} (${admin.id})`);
  }

  console.log(`📖 Đã đọc ${DEEP_TECH_POSTS.length} bài viết từ file data.`);

  let insertedCount = 0;

  for (const postData of DEEP_TECH_POSTS) {
    // 2. Resolve Category
    let category = await prisma.postCategory.findUnique({
      where: { slug: postData.categorySlug },
    });

    if (!category) {
      // Try to find category by name or first available
      category = await prisma.postCategory.findFirst();
    }

    // Nếu bài viết này đã tồn tại từ lần seed trước, dọn FileAsset ảnh cũ
    // trước khi tạo mới — tránh tích luỹ FileAsset "mồ côi" mỗi lần re-run.
    const existingPost = await prisma.post.findUnique({
      where: { slug: postData.slug },
      select: { id: true, thumbnailFileId: true, coverImageFileId: true },
    });
    if (existingPost) {
      const oldFileIds = [existingPost.thumbnailFileId, existingPost.coverImageFileId].filter(
        (id): id is string => Boolean(id),
      );
      if (oldFileIds.length) {
        await prisma.post.update({
          where: { id: existingPost.id },
          data: { thumbnailFileId: null, coverImageFileId: null },
        });
        await prisma.fileAsset.deleteMany({ where: { id: { in: oldFileIds } } });
      }
    }

    // 3. Create or Resolve Thumbnail & Cover File Assets — ảnh bìa được sinh
    // thực tế bởi Gemini và lưu tại uploads/posts/covers/<slug>.png, nên đọc
    // luôn kích thước & mimeType thật từ ổ đĩa thay vì hard-code.
    const coverExt = (postData.coverUrl?.split('.').pop() || 'png').toLowerCase();
    const coverMime = coverExt === 'jpg' || coverExt === 'jpeg' ? 'image/jpeg' : 'image/png';
    const localCoverPath = path.join(
      __dirname,
      '..',
      'uploads',
      'posts',
      'covers',
      `${postData.slug}.${coverExt}`,
    );
    const coverSizeBytes = fs.existsSync(localCoverPath)
      ? fs.statSync(localCoverPath).size
      : 450000;

    let thumbnailFile = null;
    if (postData.thumbnailUrl) {
      thumbnailFile = await prisma.fileAsset.create({
        data: {
          id: randomUUID(),
          ownerType: 'admin',
          ownerId: admin.id,
          purpose: FilePurpose.POST_THUMBNAIL,
          visibility: FileVisibility.PUBLIC,
          storageKey: `posts/covers/${postData.slug}.${coverExt}`,
          originalName: `${postData.slug}-thumb.${coverExt}`,
          mimeType: coverMime,
          sizeBytes: BigInt(coverSizeBytes),
          publicUrl: postData.thumbnailUrl,
        },
      });
    }

    let coverFile = null;
    if (postData.coverUrl) {
      coverFile = await prisma.fileAsset.create({
        data: {
          id: randomUUID(),
          ownerType: 'admin',
          ownerId: admin.id,
          purpose: FilePurpose.POST_COVER,
          visibility: FileVisibility.PUBLIC,
          storageKey: `posts/covers/${postData.slug}.${coverExt}`,
          originalName: `${postData.slug}-cover.${coverExt}`,
          mimeType: coverMime,
          sizeBytes: BigInt(coverSizeBytes),
          publicUrl: postData.coverUrl,
        },
      });
    }

    // 4. Upsert Post
    const post = await prisma.post.upsert({
      where: { slug: postData.slug },
      update: {
        title: postData.title,
        content: postData.content,
        excerpt: postData.excerpt,
        status: PostStatus.PUBLISHED,
        type: PostType.BLOG,
        categoryId: category?.id ?? null,
        adminId: admin.id,
        thumbnailFileId: thumbnailFile?.id ?? undefined,
        coverImageFileId: coverFile?.id ?? undefined,
        metaTitle: postData.metaTitle,
        metaDescription: postData.metaDescription,
        metaKeywords: postData.metaKeywords,
        focusKeyword: postData.focusKeyword,
        viewCount: postData.viewCount || Math.floor(Math.random() * 20000) + 5000,
        publishedAt: postData.publishedAt ? new Date(postData.publishedAt) : new Date(),
      },
      create: {
        id: randomUUID(),
        title: postData.title,
        slug: postData.slug,
        content: postData.content,
        excerpt: postData.excerpt,
        status: PostStatus.PUBLISHED,
        type: PostType.BLOG,
        categoryId: category?.id ?? null,
        adminId: admin.id,
        thumbnailFileId: thumbnailFile?.id ?? null,
        coverImageFileId: coverFile?.id ?? null,
        metaTitle: postData.metaTitle,
        metaDescription: postData.metaDescription,
        metaKeywords: postData.metaKeywords,
        focusKeyword: postData.focusKeyword,
        viewCount: postData.viewCount || Math.floor(Math.random() * 20000) + 5000,
        publishedAt: postData.publishedAt ? new Date(postData.publishedAt) : new Date(),
      },
    });

    // 5. Connect Tags
    if (Array.isArray(postData.tagSlugs)) {
      // Clear existing tags
      await prisma.postTag.deleteMany({
        where: { postId: post.id },
      });

      for (const tagSlug of postData.tagSlugs) {
        let tag = await prisma.tag.findUnique({
          where: { slug: tagSlug },
        });

        if (!tag) {
          tag = await prisma.tag.create({
            data: {
              id: randomUUID(),
              name: tagSlug.replace(/-/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()),
              slug: tagSlug,
            },
          });
        }

        await prisma.postTag.create({
          data: {
            postId: post.id,
            tagId: tag.id,
          },
        });
      }
    }

    insertedCount++;
    console.log(
      `  [${insertedCount}/${DEEP_TECH_POSTS.length}] Đã nạp bài: "${post.title.substring(0, 45)}..."`,
    );
  }

  console.log(
    `\n🎉 HOÀN TẤT SEED! Đã nạp thành công ${insertedCount} bài viết chuyên sâu vào PostgreSQL!`,
  );
}

main()
  .catch((e) => {
    console.error('❌ Lỗi khi seed bài viết:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
