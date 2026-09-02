import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsUUID } from 'class-validator';

export class CreateInvoiceDto {
  @ApiProperty({
    description: 'ID của gói dịch vụ',
    example: 'd3b07384-d113-49cd-a5d6-8c2fa8e1b644',
  })
  @IsUUID()
  @IsNotEmpty()
  subscriptionPlanId: string;

  @ApiPropertyOptional({
    description: 'ID của công ty (Bắt buộc đối với Admin tạo cho NTD, Recruiter sẽ tự động lấy từ Token)',
    example: 'e2b07384-d113-49cd-a5d6-8c2fa8e1b655',
  })
  @IsUUID()
  @IsOptional()
  companyId?: string;

  @ApiPropertyOptional({
    description: 'ID hồ sơ ứng viên (Dành cho Admin, Candidate sẽ tự động lấy từ Token)',
    example: 'c2b07384-d113-49cd-a5d6-8c2fa8e1b666',
  })
  @IsUUID()
  @IsOptional()
  candidateProfileId?: string;
}
