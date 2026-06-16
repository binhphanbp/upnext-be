import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class CandidateAccountQueryDto {
  @ApiProperty({
    example: '8e10280c-ae2d-4579-a048-c25279447a3e',
    description: 'UUID tài khoản ứng viên.',
  })
  @IsUUID()
  candidateAccountId!: string;
}

export class ListMyCvsQueryDto extends PaginationQueryDto {
  @ApiProperty({
    example: '8e10280c-ae2d-4579-a048-c25279447a3e',
    description: 'UUID tài khoản ứng viên.',
  })
  @IsUUID()
  candidateAccountId!: string;
}
