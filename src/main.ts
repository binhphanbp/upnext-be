import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { apiReference } from '@scalar/nestjs-api-reference';
import { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/docs')) {
      return next();
    }
    helmet({
      contentSecurityPolicy: {
        directives: {
          'default-src': ["'self'"],
          'script-src': ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net', 'https://cdn.scalar.com'],
          'style-src': ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net', 'https://cdn.scalar.com'],
          'img-src': ["'self'", 'data:', 'https:'],
          'font-src': ["'self'", 'data:', 'https:'],
          'connect-src': ["'self'", 'https://cdn.scalar.com', 'https://api.scalar.com', 'https://cdn.jsdelivr.net'],
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
    .addTag('Candidate - Auth', 'Đăng ký và đăng nhập ứng viên')
    .addTag('Candidate - Account', 'Email, password và trạng thái tài khoản ứng viên')
    .addTag('Candidate - Profile', 'Thông tin hồ sơ ứng viên')
    .addTag('Recruiter - Auth', 'Đăng nhập recruiter')
    .addTag('Recruiter - Account', 'Quản lý tài khoản recruiter')
    .addTag('Recruiter - Profile', 'Thông tin hồ sơ recruiter')
    .addTag('Recruiter - Shortlist', 'Danh sách candidate recruiter quan tâm')
    .addTag('Recruiter - Roles', 'Role của recruiter')
    .addTag('Recruiter - Permissions', 'Permission của recruiter')
    .addTag('Admin - Auth', 'Đăng nhập admin')
    .build();
  const openApiDocument = SwaggerModule.createDocument(app, openApiConfig);
  app.use(
    '/docs',
    apiReference({
      content: openApiDocument,
    }),
  );
  await app.listen(config.getOrThrow<number>('port'));
}

void bootstrap();
