import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUrl, MaxLength } from 'class-validator';

export class CreateCandidateLinkDto {
  @ApiProperty({ example: 'github', maxLength: 50 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  type: string;

  @ApiProperty({ example: 'https://github.com/upnext', maxLength: 500 })
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  url: string;
}
