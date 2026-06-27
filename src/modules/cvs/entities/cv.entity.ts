import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CvSource, CvStatus } from '@prisma/client';

export class CvVersionFile {
  @ApiProperty({ example: '1f5f4a65-50d7-4f24-a65f-4f2a4d42f9cf', description: 'UUID của file.' })
  id!: string;

  @ApiProperty({ example: 'phan-van-a-cv.pdf', description: 'Tên file gốc.' })
  originalName!: string;

  @ApiProperty({ example: 'application/pdf', description: 'Loại MIME của file.' })
  mimeType!: string;

  @ApiPropertyOptional({
    example: 'https://cdn.upnext.dev/cvs/phan-van-a-cv.pdf',
    nullable: true,
    description: 'URL công khai của file nếu có.',
  })
  publicUrl!: string | null;
}

export class CvVersion {
  @ApiProperty({
    example: '2a3b4c5d-50d7-4f24-a65f-4f2a4d42f9cf',
    description: 'UUID phiên bản CV.',
  })
  id!: string;

  @ApiPropertyOptional({
    example: '1f5f4a65-50d7-4f24-a65f-4f2a4d42f9cf',
    nullable: true,
    description: 'UUID file nguồn của phiên bản CV.',
  })
  sourceFileId!: string | null;

  @ApiProperty({ example: '3c10280c-ae2d-4579-a048-c25279447a3f', description: 'UUID của CV.' })
  cvId!: string;

  @ApiPropertyOptional({
    example: '4d10280c-ae2d-4579-a048-c25279447a3f',
    nullable: true,
    description: 'UUID mẫu CV.',
  })
  templateId!: string | null;

  @ApiProperty({ example: 1, description: 'Số thứ tự phiên bản CV.' })
  versionNo!: number;

  @ApiPropertyOptional({
    example: {
      summary: 'Lập trình viên Backend NestJS có 3 năm kinh nghiệm.',
      skills: ['NestJS', 'Prisma', 'PostgreSQL'],
    },
    nullable: true,
    description: 'Nội dung JSON của phiên bản CV.',
  })
  contentJson!: Record<string, unknown> | null;

  @ApiPropertyOptional({
    example: 'Lập trình viên Backend NestJS có kinh nghiệm với Prisma và PostgreSQL.',
    nullable: true,
    description: 'Nội dung văn bản đã bóc tách hoặc nhập từ CV.',
  })
  parsedText!: string | null;

  @ApiProperty({ example: '2026-06-09T08:00:00.000Z', description: 'Thời điểm tạo phiên bản CV.' })
  createdAt!: Date;

  @ApiPropertyOptional({
    type: CvVersionFile,
    nullable: true,
    description: 'Thông tin file nguồn.',
  })
  sourceFile?: CvVersionFile | null;
}

export class CvEntity {
  @ApiProperty({ example: '3c10280c-ae2d-4579-a048-c25279447a3f', description: 'UUID của CV.' })
  id!: string;

  @ApiProperty({
    example: '8e10280c-ae2d-4579-a048-c25279447a3e',
    description: 'UUID hồ sơ ứng viên sở hữu CV.',
  })
  candidateProfileId!: string;

  @ApiProperty({ example: 'CV Lập trình viên Backend', description: 'Tiêu đề CV.' })
  title!: string;

  @ApiProperty({ enum: CvSource, example: CvSource.BUILDER, description: 'Nguồn tạo CV.' })
  source!: CvSource;

  @ApiProperty({ enum: CvStatus, example: CvStatus.ACTIVE, description: 'Trạng thái CV.' })
  status!: CvStatus;

  @ApiProperty({ example: true, description: 'Cho biết CV có phải CV mặc định hay không.' })
  isDefault!: boolean;

  @ApiProperty({ example: '2026-06-09T08:00:00.000Z', description: 'Thời điểm tạo CV.' })
  createdAt!: Date;

  @ApiProperty({
    example: '2026-06-09T08:00:00.000Z',
    description: 'Thời điểm cập nhật CV gần nhất.',
  })
  updatedAt!: Date;

  @ApiProperty({ type: CvVersion, isArray: true, description: 'Danh sách phiên bản của CV.' })
  versions!: CvVersion[];
}

export class CvListMeta {
  @ApiProperty({ example: 1, description: 'Trang hiện tại.' })
  page!: number;

  @ApiProperty({ example: 20, description: 'Số bản ghi trên mỗi trang.' })
  limit!: number;

  @ApiProperty({ example: 3, description: 'Tổng số bản ghi.' })
  total!: number;

  @ApiProperty({ example: 1, description: 'Tổng số trang.' })
  totalPages!: number;
}

export class CvList {
  @ApiProperty({ type: CvEntity, isArray: true, description: 'Danh sách CV.' })
  items!: CvEntity[];

  @ApiProperty({ type: CvListMeta, description: 'Thông tin phân trang.' })
  meta!: CvListMeta;
}

export class CvVersionListMeta {
  @ApiProperty({ example: 1, description: 'Trang hiện tại.' })
  page!: number;

  @ApiProperty({ example: 20, description: 'Số bản ghi trên mỗi trang.' })
  limit!: number;

  @ApiProperty({ example: 5, description: 'Tổng số phiên bản CV.' })
  total!: number;

  @ApiProperty({ example: 1, description: 'Tổng số trang.' })
  totalPages!: number;
}

export class CvVersionList {
  @ApiProperty({ type: CvVersion, isArray: true, description: 'Danh sách phiên bản CV.' })
  items!: CvVersion[];

  @ApiProperty({ type: CvVersionListMeta, description: 'Thông tin phân trang.' })
  meta!: CvVersionListMeta;
}
