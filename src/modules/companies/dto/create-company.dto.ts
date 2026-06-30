import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CompanyType } from '@prisma/client';
import { IsEmail, IsEnum, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class CreateCompanyDto {
  @ApiProperty({ maxLength: 200, example: 'Công ty cổ phần UPNEXT Việt Nam' })
  @IsString()
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({
    enum: CompanyType,
    default: CompanyType.OTHER,
    example: CompanyType.STARTUP,
  })
  @IsOptional()
  @IsEnum(CompanyType)
  type?: CompanyType;

  @ApiPropertyOptional({ maxLength: 50, example: '068208005345' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  taxCode?: string;

  @ApiPropertyOptional({
    maxLength: 255,
    example: '688 Quang Trung, Thông Tây Hội, Thành Phố Hồ Chí Minh',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string;

  @ApiPropertyOptional({ example: 'info@upnext.works' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ maxLength: 30, example: '+84-916-110-241' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional({ example: 'https://upnext.works' })
  @IsOptional()
  @IsUrl()
  website?: string;

  @ApiPropertyOptional({
    example: 'Công ty công nghệ tập trung vào các sản phẩm nền tảng tuyển dụng',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    example: 'Phúc lợi gồm có ăn trưa, teambuilding hàng tháng, BHXH...',
  })
  @IsOptional()
  @IsString()
  benefits?: string;

  @ApiPropertyOptional({ maxLength: 80, example: '51-200 nhân sự' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  companySize?: string;
}
