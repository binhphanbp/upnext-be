/**
 * Đưa logo email lên Cloudinary và in ra dòng `MAIL_LOGO_URL` để dán vào `.env`.
 *
 * Vì sao cần: logo trong email vốn nhúng inline qua `cid:`. Cách đó không cần hạ tầng
 * gì, nhưng Gmail thực tế không khớp được `cid` và để nguyên `src="cid:..."` — người
 * nhận thấy ảnh lỗi. Trỏ `<img>` tới một URL công khai thì client nào cũng hiện được,
 * và bỏ luôn phần đính kèm khỏi từng email.
 *
 * Không dùng `APP_FRONTEND_URL` cho việc này được: ở môi trường dev nó là
 * `http://localhost:3000`, hộp thư của người nhận không với tới được.
 *
 * Chạy: pnpm tsx scripts/upload-mail-logo.ts
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { v2 as cloudinary } from 'cloudinary';
import 'dotenv/config';

const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const API_KEY = process.env.CLOUDINARY_API_KEY;
const API_SECRET = process.env.CLOUDINARY_API_SECRET;

if (!CLOUD_NAME || !API_KEY || !API_SECRET) {
  throw new Error('Thiếu CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET.');
}

cloudinary.config({
  cloud_name: CLOUD_NAME,
  api_key: API_KEY,
  api_secret: API_SECRET,
  secure: true,
});

const FOLDER = `${process.env.CLOUDINARY_FOLDER ?? 'upnext'}/email-assets`;
// `public_id` cố định + overwrite: chạy lại script không sinh ảnh rác, và URL không đổi
// nên `.env` đã dán rồi thì không phải sửa lại.
const PUBLIC_ID = 'upnext-logo';

async function main() {
  const logoPath = join(__dirname, '..', 'src', 'common', 'email', 'assets', 'upnext-logo.png');
  const buffer = readFileSync(logoPath);

  const result = await new Promise<{ secure_url: string; bytes: number }>((resolve, reject) => {
    const upload = cloudinary.uploader.upload_stream(
      {
        folder: FOLDER,
        public_id: PUBLIC_ID,
        resource_type: 'image',
        type: 'upload',
        overwrite: true,
        invalidate: true,
      },
      (error, response) => {
        if (error) return reject(new Error(error.message ?? 'Cloudinary upload failed'));
        if (!response) return reject(new Error('Cloudinary upload failed: empty response'));
        resolve({ secure_url: response.secure_url, bytes: response.bytes });
      },
    );
    upload.end(buffer);
  });

  console.log('================================================================');
  console.log('✅ Đã tải logo email lên Cloudinary');
  console.log('================================================================');
  console.log(`   Kích thước : ${result.bytes} bytes`);
  console.log(`   URL        : ${result.secure_url}`);
  console.log('');
  console.log('👉 Dán dòng này vào .env rồi restart backend:');
  console.log('');
  console.log(`MAIL_LOGO_URL=${result.secure_url}`);
  console.log('');
  console.log('   Sau đó email sẽ lấy logo từ URL này thay vì đính kèm inline qua cid.');
  console.log('================================================================');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
