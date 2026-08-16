import { ConflictException, Injectable } from '@nestjs/common';
import { ApplicationStatus } from '@prisma/client';

const PIPELINE_ORDER: Partial<Record<ApplicationStatus, number>> = {
  [ApplicationStatus.SUBMITTED]: 0,
  [ApplicationStatus.VIEWED]: 1,
  [ApplicationStatus.CONSIDERING]: 1, // legacy items fallback
  [ApplicationStatus.SHORTLISTED]: 2,
  [ApplicationStatus.INTERVIEWING]: 3,
  [ApplicationStatus.OFFERED]: 4,
  [ApplicationStatus.HIRED]: 5,
};

@Injectable()
export class ApplicationTransitionPolicy {
  assertAllowed(from: ApplicationStatus, to: ApplicationStatus) {
    if (from === to) {
      return;
    }

    // 1. Không cho phép chuyển tới WITHDRAWN (chỉ ứng viên mới được rút hồ sơ)
    if (to === ApplicationStatus.WITHDRAWN) {
      throw new ConflictException({
        code: 'INVALID_APPLICATION_TRANSITION',
        message: `Chỉ ứng viên mới có thể rút hồ sơ ứng tuyển`,
      });
    }

    // 2. Không cho phép chuyển tới trạng thái CONSIDERING (đã loại bỏ khỏi quy trình)
    if (to === ApplicationStatus.CONSIDERING) {
      throw new ConflictException({
        code: 'INVALID_APPLICATION_TRANSITION',
        message: `Trạng thái "Cân nhắc" không còn được hỗ trợ trong quy trình tuyển dụng`,
      });
    }

    // 3. Nếu hồ sơ đã ở trạng thái kết thúc (HIRED, REJECTED, WITHDRAWN) -> Tuyệt đối không được thay đổi
    if (from === ApplicationStatus.HIRED) {
      throw new ConflictException({
        code: 'INVALID_APPLICATION_TRANSITION',
        message: `Hồ sơ đã ở trạng thái "Nhận việc" (HIRED), không thể thay đổi trạng thái`,
      });
    }

    if (from === ApplicationStatus.REJECTED) {
      throw new ConflictException({
        code: 'INVALID_APPLICATION_TRANSITION',
        message: `Hồ sơ đã ở trạng thái "Chưa phù hợp" (REJECTED), không thể chuyển lùi hoặc đổi trạng thái khác`,
      });
    }

    if (from === ApplicationStatus.WITHDRAWN) {
      throw new ConflictException({
        code: 'INVALID_APPLICATION_TRANSITION',
        message: `Ứng viên đã rút hồ sơ (WITHDRAWN), không thể thay đổi trạng thái`,
      });
    }

    // 4. Cho phép chuyển sang REJECTED từ bất kỳ trạng thái đang xử lý nào
    if (to === ApplicationStatus.REJECTED) {
      return;
    }

    // 5. Kiểm tra thứ tự tiến trình: Cho phép nhảy cóc về phía trước, TUYỆT ĐỐI KHÔNG ĐƯỢC LÙI TRẠNG THÁI
    const fromRank = PIPELINE_ORDER[from];
    const toRank = PIPELINE_ORDER[to];

    if (fromRank !== undefined && toRank !== undefined) {
      if (toRank <= fromRank) {
        throw new ConflictException({
          code: 'INVALID_APPLICATION_TRANSITION',
          message: `Không được phép chuyển lùi trạng thái ứng viên (từ ${from} về ${to})`,
        });
      }
      // toRank > fromRank: Cho phép nhảy cóc về phía trước
      return;
    }

    throw new ConflictException({
      code: 'INVALID_APPLICATION_TRANSITION',
      message: `Chuyển đổi trạng thái từ ${from} sang ${to} không hợp lệ`,
    });
  }
}
