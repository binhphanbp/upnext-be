import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JobBoostPlacement } from '@prisma/client';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export type DeliveryTokenPayload = {
  boostId: string;
  placement: JobBoostPlacement;
  issuedAt: number;
};

/** Đủ dài cho một phiên xem trang, ngắn để một token rò rỉ (log, referrer)
 * không dùng bơm số liệu được lâu dài. */
const TOKEN_TTL_MS = 10 * 60 * 1_000;

/**
 * Ký/xác thực token phân phối gắn với một (boost, placement) cụ thể, để
 * `POST .../impression|click` không nhận `boostId` trần từ client -- token
 * chứng minh giá trị này thực sự đến từ một lượt `GET /public/sponsored-jobs`
 * gần đây, không phải ai đó tự chế `boostId` để bơm số liệu cho boost bất kỳ.
 *
 * Dùng chung `jwtAccessSecret` cho mục đích khác (tamper-evidence, không phải
 * xác thực người dùng) -- chấp nhận được vì token này không cấp quyền truy
 * cập gì, chỉ chống giả mạo giá trị; không cần một secret HMAC riêng cho một
 * rủi ro thấp như vậy.
 */
@Injectable()
export class JobBoostDeliveryService {
  constructor(private readonly configService: ConfigService) {}

  sign(payload: DeliveryTokenPayload): string {
    const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    return `${body}.${this.hmac(body)}`;
  }

  /** Trả về payload nếu token còn hợp lệ (chữ ký đúng, chưa hết TTL); ngược lại `null`. */
  verify(token: string): DeliveryTokenPayload | null {
    const separatorIndex = token.lastIndexOf('.');
    if (separatorIndex <= 0) return null;

    const body = token.slice(0, separatorIndex);
    const signature = token.slice(separatorIndex + 1);
    const expected = this.hmac(body);

    const provided = Buffer.from(signature);
    const expectedBuf = Buffer.from(expected);
    if (provided.length !== expectedBuf.length || !timingSafeEqual(provided, expectedBuf)) {
      return null;
    }

    let payload: DeliveryTokenPayload;
    try {
      payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    } catch {
      return null;
    }
    if (
      typeof payload?.boostId !== 'string' ||
      typeof payload?.placement !== 'string' ||
      typeof payload?.issuedAt !== 'number'
    ) {
      return null;
    }
    if (Date.now() - payload.issuedAt > TOKEN_TTL_MS) return null;

    return payload;
  }

  /** Hash một chiều của khóa khách truy cập (header `x-upnext-visitor-key`
   * hiện có, xem `JobPostsService.recordView`, hoặc IP khi thiếu) dùng làm
   * `visitor_hash` chống đếm trùng -- không lưu định danh gốc. */
  hashVisitor(rawVisitorKey: string): string {
    return createHash('sha256').update(rawVisitorKey).digest('hex');
  }

  private hmac(body: string): string {
    const secret = this.configService.getOrThrow<string>('jwtAccessSecret');
    return createHmac('sha256', secret).update(body).digest('base64url');
  }
}
