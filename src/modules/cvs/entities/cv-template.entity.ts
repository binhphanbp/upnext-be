import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CvTemplateEntity {
  @ApiProperty({ example: '4d10280c-ae2d-4579-a048-c25279447a3f', description: 'UUID của mẫu CV.' })
  id!: string;

  @ApiProperty({ example: 'Mẫu CV Backend tối giản', description: 'Tên hiển thị của mẫu CV.' })
  name!: string;

  @ApiPropertyOptional({
    example: 'Mẫu CV phù hợp cho lập trình viên Backend, ưu tiên kinh nghiệm dự án.',
    nullable: true,
    description: 'Mô tả ngắn về mẫu CV.',
  })
  description!: string | null;

  @ApiPropertyOptional({
    example: 'https://cdn.upnext.dev/cv-templates/backend-minimal.png',
    nullable: true,
    description: 'URL ảnh xem trước của mẫu CV.',
  })
  previewImageUrl!: string | null;

  @ApiProperty({ example: 'backend-minimal', description: 'Khóa định danh layout của mẫu CV.' })
  layoutKey!: string;

  @ApiProperty({ example: true, description: 'Cho biết mẫu CV có đang được phép sử dụng hay không.' })
  isActive!: boolean;

  @ApiProperty({ example: 3, description: 'Số phiên bản CV đang tham chiếu mẫu này.' })
  cvVersionsCount!: number;

  @ApiProperty({ example: '2026-06-09T08:00:00.000Z', description: 'Thời điểm tạo mẫu CV.' })
  createdAt!: Date;

  @ApiProperty({
    example: '2026-06-09T08:00:00.000Z',
    description: 'Thời điểm cập nhật mẫu CV gần nhất.',
  })
  updatedAt!: Date;
}

export class CvTemplateListMeta {
  @ApiProperty({ example: 1, description: 'Trang hiện tại.' })
  page!: number;

  @ApiProperty({ example: 20, description: 'Số bản ghi trên mỗi trang.' })
  limit!: number;

  @ApiProperty({ example: 4, description: 'Tổng số mẫu CV.' })
  total!: number;

  @ApiProperty({ example: 1, description: 'Tổng số trang.' })
  totalPages!: number;
}

export class CvTemplateList {
  @ApiProperty({ type: CvTemplateEntity, isArray: true, description: 'Danh sách mẫu CV.' })
  items!: CvTemplateEntity[];

  @ApiProperty({ type: CvTemplateListMeta, description: 'Thông tin phân trang.' })
  meta!: CvTemplateListMeta;
}
