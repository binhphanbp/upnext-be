import { BadRequestException } from '@nestjs/common';
import { ConversationType } from '@prisma/client';
import { ContactExchangePolicyService } from './contact-exchange-policy.service';

describe('ContactExchangePolicyService', () => {
  const service = new ContactExchangePolicyService();

  it.each([
    'Email mình là candidate@example.com',
    'Gọi mình số 0901 234 567',
    'Xem https://example.com/me',
    'GitHub github.com/example',
    'Telegram @candidate_handle',
  ])('blocks contact exchange in anonymous outreach: %s', (content) => {
    expect(() =>
      service.assertMessageAllowed({
        conversationType: ConversationType.TALENT_OUTREACH,
        content,
        attachmentCount: 0,
      }),
    ).toThrow(BadRequestException);
  });

  it('blocks attachments in anonymous outreach', () => {
    expect(() =>
      service.assertMessageAllowed({
        conversationType: ConversationType.TALENT_OUTREACH,
        content: 'Trao đổi trên UpNext nhé.',
        attachmentCount: 1,
      }),
    ).toThrow(BadRequestException);
  });

  it('does not restrict application chat', () => {
    expect(() =>
      service.assertMessageAllowed({
        conversationType: ConversationType.APPLICATION_CHAT,
        content: 'Liên hệ candidate@example.com',
        attachmentCount: 1,
      }),
    ).not.toThrow();
  });
});
