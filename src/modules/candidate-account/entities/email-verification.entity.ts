import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CandidateEmailVerificationRequest {
  @ApiProperty({ example: 'candidate@upnext.dev' })
  email: string;

  @ApiProperty({ example: false })
  emailVerified: boolean;

  @ApiPropertyOptional({ example: null, nullable: true })
  emailVerifiedAt: Date | null;

  @ApiProperty({ example: 'Nếu email chưa xác thực, hệ thống đã gửi link xác thực đến email của bạn.' })
  message: string;
}

export class CandidateEmailVerificationResult {
  @ApiProperty({ example: 'candidate@upnext.dev' })
  email: string;

  @ApiProperty({ example: true })
  emailVerified: boolean;

  @ApiProperty({ example: '2026-06-16T15:30:00.000Z' })
  emailVerifiedAt: Date;
}
