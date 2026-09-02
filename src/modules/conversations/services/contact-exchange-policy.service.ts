import { BadRequestException, Injectable } from '@nestjs/common';
import { ConversationType } from '@prisma/client';
import {
  emailPattern,
  phoneE164Pattern,
  phoneVnPattern,
  urlPattern,
} from '../../../common/content-policy/pii-patterns';

/**
 * Enforces the v1 Talent Discovery boundary at persistence time. Client-side
 * checks are only UX; this service is the source of truth.
 */
@Injectable()
export class ContactExchangePolicyService {
  assertMessageAllowed(input: {
    conversationType: ConversationType;
    content: string | null;
    attachmentCount: number;
  }) {
    if (input.conversationType !== ConversationType.TALENT_OUTREACH) return;

    if (input.attachmentCount) {
      throw new BadRequestException({
        code: 'CONTACT_EXCHANGE_BLOCKED',
        message: 'Không thể gửi tệp đính kèm trong cuộc trao đổi ẩn danh.',
      });
    }

    const content = input.content ?? '';
    const matchesContactPattern =
      emailPattern().test(content) ||
      phoneVnPattern().test(content) ||
      phoneE164Pattern().test(content) ||
      urlPattern().test(content) ||
      /\b(?:www\.)?[a-z0-9][a-z0-9-]{0,61}\.(?:com|net|org|io|me|dev|vn)(?:\/\S*)?/iu.test(
        content,
      ) ||
      /(?:^|\s)@\w{2,}/u.test(content);

    if (matchesContactPattern) {
      throw new BadRequestException({
        code: 'CONTACT_EXCHANGE_BLOCKED',
        message: 'Không thể chia sẻ thông tin liên hệ hoặc liên kết trong cuộc trao đổi ẩn danh.',
      });
    }
  }
}
