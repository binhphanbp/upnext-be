import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { CandidateContextAssembler } from './candidate-context.assembler';
import { PrismaService } from '../../../prisma/prisma.service';

describe('CandidateContextAssembler.cvVersion', () => {
  let assembler: CandidateContextAssembler;
  const prismaMock: any = {
    cVVersion: {
      findFirst: jest.fn(),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    assembler = new CandidateContextAssembler(prismaMock as PrismaService);
  });

  const baseCandidateProfile = {
    account: { fullName: 'Nguyễn Văn A', email: 'a@example.com' },
    description: null,
    skills: [],
    experiences: [],
    projects: [],
    educations: [],
    certifications: [],
    jobPreference: null,
  };

  it('uses parsedText directly when the CV was parsed (built via CV Builder)', async () => {
    prismaMock.cVVersion.findFirst.mockResolvedValue({
      id: 'v1',
      versionNo: 1,
      parsedText: 'Kinh nghiệm 3 năm React, Node.js.',
      contentJson: { some: 'builder-content' },
      sourceFile: null,
      cv: { title: 'CV chính', candidateProfile: baseCandidateProfile },
    });

    const result = await assembler.cvVersion('profile-1');

    expect(result.parsedText).toContain('React');
    expect(result.hasStructuredContent).toBe(true);
  });

  it('falls back to structured profile data when parsedText is empty (raw PDF upload, never OCR-ed)', async () => {
    prismaMock.cVVersion.findFirst.mockResolvedValue({
      id: 'v2',
      versionNo: 1,
      parsedText: '',
      contentJson: null,
      sourceFile: { originalName: 'CV_UngVien.pdf' },
      cv: {
        title: 'CV upload',
        candidateProfile: {
          ...baseCandidateProfile,
          skills: [
            {
              skill: { name: 'TypeScript' },
              proficiencyLevel: 'ADVANCED',
              yearsOfExperience: 3,
            },
          ],
          experiences: [
            {
              positionTitle: 'Backend Developer',
              companyName: 'Acme Corp',
              technologies: 'NestJS, PostgreSQL',
              description: 'Xây dựng API tuyển dụng.',
            },
          ],
        },
      },
    });

    const result = await assembler.cvVersion('profile-1');

    // Trước bản sửa này, parsedText rỗng khiến toàn bộ context gửi cho model
    // cũng rỗng — Copilot báo "CV chưa có nội dung" dù hồ sơ có đủ dữ liệu.
    expect(result.parsedText).toContain('TypeScript');
    expect(result.parsedText).toContain('Backend Developer');
    expect(result.parsedText).toContain('Acme Corp');
    expect(result.hasStructuredContent).toBe(false);
  });

  it('throws NotFoundException when the candidate has no CV at all', async () => {
    prismaMock.cVVersion.findFirst.mockResolvedValue(null);

    await expect(assembler.cvVersion('profile-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws ForbiddenException when a specific cvVersionId does not belong to the candidate', async () => {
    prismaMock.cVVersion.findFirst.mockResolvedValue(null);

    await expect(assembler.cvVersion('profile-1', 'someone-elses-cv')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
