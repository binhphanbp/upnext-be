import { IsString, IsUUID, Length, Matches } from 'class-validator';

/**
 * A client-generated key makes a double click, a retry after a lost response,
 * or two browser tabs resolve to one purchase rather than two active plans.
 */
export class CandidateSandboxCheckoutDto {
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
