import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CompanyType } from '@prisma/client';
import { IsEmail, IsEnum, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class CreateCompanyDto {
  @ApiProperty({ maxLength: 200, example: 'UpNext Labs' })
  @IsString()
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({
    enum: CompanyType,
    default: CompanyType.OTHER,
    example: CompanyType.PRODUCT,
  })
  @IsOptional()
  @IsEnum(CompanyType)
  type?: CompanyType;

  @ApiPropertyOptional({ maxLength: 50, example: '0312345678' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  taxCode?: string;

  @ApiPropertyOptional({ maxLength: 255, example: '123 Nguyen Hue, District 1, Ho Chi Minh City' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string;

  @ApiPropertyOptional({ example: 'hello@upnext.dev' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ maxLength: 30, example: '+84-28-1234-5678' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional({ example: 'https://upnext.dev' })
  @IsOptional()
  @IsUrl()
  website?: string;

  @ApiPropertyOptional({ example: 'Technology company focused on hiring platform products.' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ maxLength: 80, example: '51-200 employees' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  companySize?: string;
}
