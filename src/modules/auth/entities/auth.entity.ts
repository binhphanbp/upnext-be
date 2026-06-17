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
