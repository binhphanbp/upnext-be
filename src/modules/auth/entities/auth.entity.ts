import { ApiProperty } from '@nestjs/swagger';
import { ActorType } from '@prisma/client';

export class AuthUser {
  @ApiProperty({ example: '1f5f4a65-50d7-4f24-a65f-4f2a4d42f9cf' })
  id: string;

  @ApiProperty({ example: 'ductoandev@upnext.works' })
  email: string;

  @ApiProperty({ enum: ActorType, example: ActorType.CANDIDATE })
  role: ActorType;
}

export class LoginResponse {
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
  accessToken: string;

  @ApiProperty({ example: 'Bearer' })
  tokenType: 'Bearer';

  @ApiProperty({ type: AuthUser })
  user: AuthUser;
}

export class RecruiterAuthUser {
  @ApiProperty({ example: '1f5f4a65-50d7-4f24-a65f-4f2a4d42f9cf' })
  id: string;

  @ApiProperty({ example: 'recruiter@upnext.works' })
  email: string;

  @ApiProperty({ enum: ActorType, example: ActorType.RECRUITER })
  role: ActorType;
}

export class RecruiterLoginResponse {
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
  accessToken: string;

  @ApiProperty({ example: '1f5f4a65-50d7-4f24-a65f-4f2a4d42f9cf.0ucf7w...' })
  refreshToken: string;

  @ApiProperty({ example: 'Bearer' })
  tokenType: 'Bearer';

  @ApiProperty({ type: RecruiterAuthUser })
  user: RecruiterAuthUser;
}

export class AdminAuthUser {
  @ApiProperty({ example: '1f5f4a65-50d7-4f24-a65f-4f2a4d42f9cf' })
  id: string;

  @ApiProperty({ example: 'admin@upnext.dev' })
  email: string;

  @ApiProperty({ enum: ActorType, example: ActorType.ADMIN })
  role: ActorType;
}

export class AdminLoginResponse {
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
  accessToken: string;

  @ApiProperty({ example: 'Bearer' })
  tokenType: 'Bearer';

  @ApiProperty({ type: AdminAuthUser })
  user: AdminAuthUser;
}
