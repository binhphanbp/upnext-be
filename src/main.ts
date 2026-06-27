import { RequestMethod, ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { apiReference } from '@scalar/nestjs-api-reference';
import { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';

Object.defineProperty(BigInt.prototype, 'toJSON', {
  value: function (this: bigint): string {
    return this.toString();
  },
});

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  app.setGlobalPrefix('api', {
    exclude: [{ path: 'health', method: RequestMethod.GET }],
  });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.enableShutdownHooks();
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/docs')) {
      return next();
    }
    helmet({
      contentSecurityPolicy: {
        directives: {
          'default-src': ["'self'"],
          'script-src': [
            "'self'",
            "'unsafe-inline'",
            'https://cdn.jsdelivr.net',
            'https://cdn.scalar.com',
          ],
          'style-src': [
            "'self'",
            "'unsafe-inline'",
            'https://cdn.jsdelivr.net',
            'https://cdn.scalar.com',
          ],
          'img-src': ["'self'", 'data:', 'https:'],
          'font-src': ["'self'", 'data:', 'https:'],
          'connect-src': [
            "'self'",
            'https://cdn.scalar.com',
            'https://api.scalar.com',
            'https://cdn.jsdelivr.net',
          ],
        },
      },
    })(req, res, next);
  });
  app.enableCors({
    origin: config.getOrThrow<string[]>('corsOrigins'),
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const openApiConfig = new DocumentBuilder()
    .setTitle('UpNext API')
    .setDescription('Backend API for the UpNext IT recruitment platform.')
    .setVersion('1.0')
    .addBearerAuth()
    // --- Candidate ---
    .addTag('Candidate - Auth', 'Đăng ký và đăng nhập ứng viên')
    .addTag('Candidate - Account', 'Quản lý tài khoản ứng viên')
    .addTag('Candidate - Profile', 'Thông tin hồ sơ ứng viên')
    .addTag('Candidate - Job Preferences', 'Tiêu chí công việc mong muốn của ứng viên')
    .addTag('Candidate - Educations', 'Học vấn của ứng viên')
    .addTag('Candidate - Experiences', 'Kinh nghiệm làm việc của ứng viên')
    .addTag('Candidate - Projects', 'Dự án của ứng viên')
    .addTag('Candidate - Certifications', 'Chứng chỉ của ứng viên')
    .addTag('Candidate - Skills', 'Kỹ năng của ứng viên')
    .addTag('Candidate - Languages', 'Ngôn ngữ của ứng viên')
    .addTag('Candidate - Links', 'Liên kết cá nhân của ứng viên')
    .addTag('Cvs', 'Quản lý thông tin ứng tuyển của ứng viên')
    .addTag('Cv - Versions', 'Các phiên bản CV của ứng viên')
    .addTag('Cv - Templates', 'Mẫu thiết kế CV của ứng viên')
    .addTag('Saved - Jobs', 'Danh sách tin tuyển dụng đã lưu của ứng viên')
    .addTag('Applications', 'Nộp và quản lý hồ sơ ứng tuyển')
    .addTag('Companies', 'Thông tin doanh nghiệp và theo dõi doanh nghiệp')
    .addTag('Company - Reviews', 'Đánh giá doanh nghiệp từ ứng viên')
    .addTag('Candidate - Reports', 'Báo cáo vi phạm (Ứng viên)')
    // --- Recruiter ---
    .addTag('Recruiter - Auth', 'Đăng ký và đăng nhập nhà tuyển dụng')
    .addTag('Recruiter - Account', 'Quản lý tài khoản nhà tuyển dụng')
    .addTag('Recruiter - Profile', 'Thông tin hồ sơ nhà tuyển dụng')
    .addTag('Recruiter - Shortlist', 'Danh sách ứng viên nhà tuyển dụng quan tâm')
    .addTag('Recruiter - Roles', 'Vai trò phân quyền nhà tuyển dụng')
    .addTag('Recruiter - Permissions', 'Danh sách quyền hạn nhà tuyển dụng')
    .addTag('Company - Members', 'Thành viên doanh nghiệp')
    .addTag('Company Subscriptions', 'Đăng ký gói dịch vụ của doanh nghiệp')
    .addTag('Job - Posts', 'Đăng và quản lý tin tuyển dụng')
    .addTag('Interviews', 'Lịch hẹn phỏng vấn và đánh giá')
    .addTag('Invoices', 'Quản lý hóa đơn dịch vụ')
    // --- Admin ---
    .addTag('Admin - Auth', 'Đăng nhập quản trị viên')
    .addTag('Admin - Dashboard', 'Thống kê tổng quan dashboard admin')
    .addTag('Admin - Roles', 'Quản lý vai trò admin')
    .addTag('Admin - Permissions', 'Quản lý danh sách quyền hạn admin')
    .addTag('Admin - Job Posts', 'Quản lý và duyệt tin tuyển dụng hệ thống')
    .addTag('Admin - Reports', 'Quản lý các báo cáo vi phạm từ người dùng')
    .addTag('Admin - Posts', 'Bài viết tin tức và blog hệ thống')
    .addTag('Subscription Plans', 'Quản lý các gói dịch vụ hệ thống')
    // --- Shared & Dictionary ---
    .addTag('Home', 'Dữ liệu trang chủ tuyển dụng')
    .addTag('Search - Keywords', 'Thống kê từ khóa tìm kiếm')
    .addTag('Skills', 'Danh mục kỹ năng hệ thống')
    .addTag('Specializations', 'Danh mục chuyên ngành hệ thống')
    .addTag('Job - Categories', 'Danh mục ngành nghề hệ thống')
    .addTag('Job - Locations', 'Danh mục địa điểm làm việc')
    .addTag('Experience - Levels', 'Danh mục cấp bậc kinh nghiệm')
    .addTag('Employment - Types', 'Danh mục hình thức làm việc')
    .addTag('Files', 'Tải lên phương tiện Cloudinary')
    .addTag('Notifications', 'Đăng ký token thông báo đẩy push notification')
    .addTag('Health', 'Kiểm tra trạng thái hoạt động của hệ thống')
    .build();
  const openApiDocument = SwaggerModule.createDocument(app, openApiConfig);
  app.use(
    '/docs',
    apiReference({
      content: openApiDocument,
    }),
  );
  await app.listen(config.getOrThrow<number>('port'), '0.0.0.0');
}

void bootstrap();
