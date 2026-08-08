import { Test, TestingModule } from '@nestjs/testing';
import { UserThrottlerGuard } from '../../common/guards/user-throttler.guard';
import { CvsController } from './cvs.controller';
import { CvsService } from './cvs.service';

describe('CvsController', () => {
  let controller: CvsController;
  const cvsServiceMock = {};

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CvsController],
      providers: [
        {
          provide: CvsService,
          useValue: cvsServiceMock,
        },
      ],
    })
      // `UserThrottlerGuard` cần các provider của `ThrottlerModule` (đăng ký ở
      // AppModule thật) mà một TestingModule trơ như thế này không có — không
      // liên quan gì tới hành vi đang được test ở đây nên chỉ cần thay bằng
      // một guard giả luôn cho qua.
      .overrideGuard(UserThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<CvsController>(CvsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
