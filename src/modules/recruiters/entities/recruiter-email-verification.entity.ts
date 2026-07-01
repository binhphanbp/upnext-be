import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RecruiterEmailVerificationRequest {
  @ApiProperty({ example: 'recruiter@company.com' })
  email: string;

  @ApiProperty({ example: false })
  emailVerified: boolean;

  @ApiPropertyOptional({ example: null, nullable: true })
  emailVerifiedAt: Date | null;

  @ApiProperty({
    example: 'Hệ thống đã gửi link xác thực đến email của bạn.',
  })
  message: string;
}

export class RecruiterEmailVerificationResult {
  @ApiProperty({ example: 'recruiter@company.com' })
  email: string;

  @ApiProperty({ example: true })
  emailVerified: boolean;

  @ApiProperty({ example: '2026-06-16T15:30:00.000Z' })
  emailVerifiedAt: Date;
}
