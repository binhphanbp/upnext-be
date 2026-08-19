import { IsString, IsUUID, Length, Matches } from 'class-validator';

/**
 * A browser-generated idempotency key makes retrying a sandbox checkout safe.
 * The company is never accepted from the client: it is resolved from the JWT.
 */
export class RecruiterSandboxCheckoutDto {
  @IsUUID('4')
  planId!: string;

  @IsString()
  @Length(8, 180)
  @Matches(/^[A-Za-z0-9:_-]+$/, {
    message:
      'Khóa xác nhận chỉ được chứa chữ cái, chữ số, dấu hai chấm, gạch dưới hoặc gạch ngang.',
  })
  idempotencyKey!: string;
}
