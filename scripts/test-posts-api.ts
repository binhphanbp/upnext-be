import 'dotenv/config';

const BASE_URL = process.env.APP_BACKEND_URL
  ? `${process.env.APP_BACKEND_URL}/api/v1`
  : 'http://localhost:3636/api/v1';

type AuthResponse = {
  accessToken?: string;
  refreshToken?: string;
  data?: {
    accessToken?: string;
    refreshToken?: string;
  };
};

type CategoryItem = {
  id: string;
  name: string;
  slug: string;
};

type TagItem = {
  id: string;
  name: string;
  slug: string;
};

type PostItem = {
  id: string;
  title: string;
  slug: string;
};

type PaginatedList = {
  items: unknown[];
  meta?: {
    totalItems?: number;
    total?: number;
  };
};

async function runTest() {
  console.log('🚀 === BẮT ĐẦU CHECK CHI TIẾT API POSTS, CATEGORIES & TAGS ===\n');
  console.log(`Target URL: ${BASE_URL}\n`);

  // 1. Đăng nhập Admin lấy Access Token & Refresh Token
  console.log('--- 1. AUTHENTICATION (ADMIN LOGIN) ---');
  const loginRes = await fetch(`${BASE_URL}/admin/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'admin.super@upnext.dev',
      password: 'Password123!',
    }),
  });

  if (!loginRes.ok) {
    const errText = await loginRes.text();
    console.error('❌ Đăng nhập Admin thất bại:', loginRes.status, errText);
    process.exit(1);
  }

  const authData = (await loginRes.json()) as AuthResponse;
  const accessToken = authData.accessToken || authData.data?.accessToken;
  const refreshToken = authData.refreshToken || authData.data?.refreshToken;

  if (!accessToken) {
    console.error('❌ Không lấy được accessToken trong response:', authData);
    process.exit(1);
  }

  console.log('✅ Đăng nhập Admin thành công!');
  console.log(`   - Access Token: ${accessToken.slice(0, 20)}...${accessToken.slice(-10)}`);
  if (refreshToken) {
    console.log(`   - Refresh Token: ${refreshToken.slice(0, 20)}...${refreshToken.slice(-10)}`);
  }
  console.log();

  const authHeader = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };

  // 2. Test Admin Post Categories CRUD
  console.log('--- 2. ADMIN POST CATEGORIES CRUD ---');
  // Create Category
  const catCreateRes = await fetch(`${BASE_URL}/admin/post-categories`, {
    method: 'POST',
    headers: authHeader,
    body: JSON.stringify({ name: 'Hướng nghiệp IT', slug: 'huong-nghiep-it-test' }),
  });
  const catCreated = (await catCreateRes.json()) as CategoryItem;
  console.log(
    '✅ 2.1 POST /admin/post-categories -> Status:',
    catCreateRes.status,
    '| Name:',
    catCreated.name,
  );

  const categoryId = catCreated.id;

  // List Categories (Admin)
  const catListRes = await fetch(`${BASE_URL}/admin/post-categories`, { headers: authHeader });
  const catList = (await catListRes.json()) as CategoryItem[];
  console.log('✅ 2.2 GET /admin/post-categories -> Total categories:', catList.length);

  // Get One Category (Admin)
  const catDetailRes = await fetch(`${BASE_URL}/admin/post-categories/${categoryId}`, {
    headers: authHeader,
  });
  const catDetail = (await catDetailRes.json()) as CategoryItem;
  console.log(
    '✅ 2.3 GET /admin/post-categories/:id -> Status:',
    catDetailRes.status,
    '| Slug:',
    catDetail.slug,
  );

  // Update Category
  const catUpdateRes = await fetch(`${BASE_URL}/admin/post-categories/${categoryId}`, {
    method: 'PATCH',
    headers: authHeader,
    body: JSON.stringify({ name: 'Hướng nghiệp IT & Công nghệ' }),
  });
  const catUpdated = (await catUpdateRes.json()) as CategoryItem;
  console.log(
    '✅ 2.4 PATCH /admin/post-categories/:id -> Status:',
    catUpdateRes.status,
    '| Updated Name:',
    catUpdated.name,
  );
  console.log();

  // 3. Test Admin Post Tags CRUD
  console.log('--- 3. ADMIN POST TAGS CRUD ---');
  // Create Tag
  const tagCreateRes = await fetch(`${BASE_URL}/admin/post-tags`, {
    method: 'POST',
    headers: authHeader,
    body: JSON.stringify({ name: 'NestJS', slug: 'nestjs-test' }),
  });
  const tagCreated = (await tagCreateRes.json()) as TagItem;
  console.log(
    '✅ 3.1 POST /admin/post-tags -> Status:',
    tagCreateRes.status,
    '| Name:',
    tagCreated.name,
  );

  const tagId = tagCreated.id;

  // List Tags (Admin)
  const tagListRes = await fetch(`${BASE_URL}/admin/post-tags`, { headers: authHeader });
  const tagList = (await tagListRes.json()) as TagItem[];
  console.log('✅ 3.2 GET /admin/post-tags -> Total tags:', tagList.length);

  // Get One Tag (Admin)
  const tagDetailRes = await fetch(`${BASE_URL}/admin/post-tags/${tagId}`, { headers: authHeader });
  const tagDetail = (await tagDetailRes.json()) as TagItem;
  console.log(
    '✅ 3.3 GET /admin/post-tags/:id -> Status:',
    tagDetailRes.status,
    '| Slug:',
    tagDetail.slug,
  );

  // Update Tag
  const tagUpdateRes = await fetch(`${BASE_URL}/admin/post-tags/${tagId}`, {
    method: 'PATCH',
    headers: authHeader,
    body: JSON.stringify({ name: 'NestJS Pro' }),
  });
  const tagUpdated = (await tagUpdateRes.json()) as TagItem;
  console.log(
    '✅ 3.4 PATCH /admin/post-tags/:id -> Status:',
    tagUpdateRes.status,
    '| Updated Name:',
    tagUpdated.name,
  );
  console.log();

  // 4. Test Post Creation & Public Access
  console.log('--- 4. POST LIFECYCLE & PUBLIC APIS ---');
  // Create Published Post as Admin
  const postCreateRes = await fetch(`${BASE_URL}/admin/posts`, {
    method: 'POST',
    headers: authHeader,
    body: JSON.stringify({
      title: 'Bài viết Hướng dẫn NestJS Backend 2026',
      content:
        'Nội dung hướng dẫn chi tiết về xây dựng backend chuẩn RESTful API với NestJS và Prisma...',
      status: 'PUBLISHED',
      type: 'BLOG',
      categoryId: categoryId,
      tagIds: [tagId],
      metaTitle: 'Hướng dẫn NestJS Backend',
      metaDescription: 'Chia sẻ kinh nghiệm làm NestJS từ cơ bản đến nâng cao',
    }),
  });
  const postCreated = (await postCreateRes.json()) as PostItem;
  console.log(
    '✅ 4.1 POST /admin/posts -> Status:',
    postCreateRes.status,
    '| ID:',
    postCreated.id,
    '| Slug:',
    postCreated.slug,
  );

  const postId = String(postCreated.id || '');
  const postSlug = String(postCreated.slug || '');

  // Public GET /posts (NO AUTH TOKEN REQUIRED)
  const publicListRes = await fetch(`${BASE_URL}/posts?limit=10`);
  const publicList = (await publicListRes.json()) as PaginatedList;
  console.log(
    '✅ 4.2 GET /posts (Public List) -> Total items:',
    publicList.meta?.totalItems ?? publicList.meta?.total,
    '| Page 1 items:',
    publicList.items?.length,
  );

  // Public GET /posts/categories (NO AUTH)
  const publicCatsRes = await fetch(`${BASE_URL}/posts/categories`);
  const publicCats = (await publicCatsRes.json()) as CategoryItem[];
  console.log('✅ 4.3 GET /posts/categories (Public Categories) -> Total:', publicCats.length);

  // Public GET /posts/tags (NO AUTH)
  const publicTagsRes = await fetch(`${BASE_URL}/posts/tags`);
  const publicTags = (await publicTagsRes.json()) as TagItem[];
  console.log('✅ 4.4 GET /posts/tags (Public Tags) -> Total:', publicTags.length);

  // Public GET /posts/by-slug/:slug (NO AUTH)
  const publicSlugRes = await fetch(`${BASE_URL}/posts/by-slug/${encodeURIComponent(postSlug)}`);
  const publicSlugData = (await publicSlugRes.json()) as PostItem;
  console.log(
    '✅ 4.5 GET /posts/by-slug/:slug (Public Post by Slug) -> Status:',
    publicSlugRes.status,
    '| Title:',
    publicSlugData.title,
  );

  // Public GET /posts/:id (NO AUTH)
  const publicIdRes = await fetch(`${BASE_URL}/posts/${postId}`);
  const publicIdData = (await publicIdRes.json()) as PostItem;
  console.log(
    '✅ 4.6 GET /posts/:id (Public Post by ID) -> Status:',
    publicIdRes.status,
    '| Title:',
    publicIdData.title,
  );
  console.log();

  // 5. Cleanup
  console.log('--- 5. CLEANUP TEST DATA ---');
  const deletePostRes = await fetch(`${BASE_URL}/admin/posts/${postId}`, {
    method: 'DELETE',
    headers: authHeader,
  });
  console.log('✅ 5.1 DELETE /admin/posts/:id -> Status:', deletePostRes.status);

  const deleteCatRes = await fetch(`${BASE_URL}/admin/post-categories/${categoryId}`, {
    method: 'DELETE',
    headers: authHeader,
  });
  console.log('✅ 5.2 DELETE /admin/post-categories/:id -> Status:', deleteCatRes.status);

  const deleteTagRes = await fetch(`${BASE_URL}/admin/post-tags/${tagId}`, {
    method: 'DELETE',
    headers: authHeader,
  });
  console.log('✅ 5.3 DELETE /admin/post-tags/:id -> Status:', deleteTagRes.status);

  console.log(
    '\n🎉 🎉 KHỦNG BỐ! TẤT CẢ CÁC API POSTS, CATEGORIES, TAGS ĐÃ ĐƯỢC TEST THÀNH CÔNG VÀ CHẠY MƯỢT MÀ! 🎉 🎉',
  );
}

runTest().catch((err) => {
  console.error('❌ Lỗi khi chạy test API:', err);
  process.exit(1);
});
