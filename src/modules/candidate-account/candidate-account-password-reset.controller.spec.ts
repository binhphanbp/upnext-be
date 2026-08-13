import { CandidateAccountAuthService } from './candidate-account-auth.service';
import { CandidateAccountPasswordResetController } from './candidate-account-password-reset.controller';

describe('CandidateAccountPasswordResetController', () => {
  const candidateAccountAuthService = {
    requestPasswordReset: jest.fn(),
    resetPassword: jest.fn(),
  };
  const controller = new CandidateAccountPasswordResetController(
    candidateAccountAuthService as unknown as CandidateAccountAuthService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('forwards the requested locale when a candidate asks for a reset link', async () => {
    const dto = { email: 'candidate@example.com' };

    await controller.requestPasswordReset(dto, 'en');

    expect(candidateAccountAuthService.requestPasswordReset).toHaveBeenCalledWith(dto, 'en');
  });

  it('forwards password reset confirmation payloads unchanged', async () => {
    const dto = { token: 'reset-token', password: 'new-password' };

    await controller.resetPassword(dto);

    expect(candidateAccountAuthService.resetPassword).toHaveBeenCalledWith(dto);
  });
});
