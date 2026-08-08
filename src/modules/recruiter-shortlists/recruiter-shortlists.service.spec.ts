import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ActorType, Prisma, ShortlistStatus } from '@prisma/client';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RecruiterShortlistsService } from './recruiter-shortlists.service';

describe('RecruiterShortlistsService', () => {
  let service: RecruiterShortlistsService;

  const prismaMock: any = {
    recruiterCandidateShortlist: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    candidateProfile: { findUnique: jest.fn() },
    jobPost: { findFirst: jest.fn() },
  };

  const recruiter: AuthenticatedUser = {
    id: 'recruiter-account-id',
    email: 'recruiter@test.dev',
    role: ActorType.RECRUITER,
    companyId: 'company-id',
    permissions: [],
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RecruiterShortlistsService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get(RecruiterShortlistsService);
    jest.clearAllMocks();
    prismaMock.candidateProfile.findUnique.mockResolvedValue({ id: 'candidate-profile-id' });
    prismaMock.recruiterCandidateShortlist.create.mockResolvedValue({ id: 'shortlist-id' });
  });

  describe('addToShortlist', () => {
    it('files the candidate under the company, not the individual recruiter', async () => {
      await service.addToShortlist(recruiter, { candidateProfileId: 'candidate-profile-id' });

      expect(prismaMock.recruiterCandidateShortlist.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            companyId: 'company-id',
            recruiterAccountId: 'recruiter-account-id',
          }),
        }),
      );
    });

    it('rejects a recruiter with no company', async () => {
      await expect(
        service.addToShortlist(
          { ...recruiter, companyId: null },
          { candidateProfileId: 'candidate-profile-id' },
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('reports the duplicate the unique index caught', async () => {
      prismaMock.recruiterCandidateShortlist.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('duplicate', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );

      // Two recruiters pressing Save at once must get a 409, not a 500.
      await expect(
        service.addToShortlist(recruiter, { candidateProfileId: 'candidate-profile-id' }),
      ).rejects.toThrow(ConflictException);
    });

    it('refuses to tag a posting that belongs to another company', async () => {
      prismaMock.jobPost.findFirst.mockResolvedValue(null);

      await expect(
        service.addToShortlist(recruiter, {
          candidateProfileId: 'candidate-profile-id',
          jobPostId: 'someone-elses-job',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('listShortlist', () => {
    beforeEach(() => {
      prismaMock.recruiterCandidateShortlist.findMany.mockResolvedValue([]);
      prismaMock.recruiterCandidateShortlist.count.mockResolvedValue(0);
    });

    it('shows the whole company by default', async () => {
      await service.listShortlist(recruiter, { page: 1, limit: 20 });

      expect(prismaMock.recruiterCandidateShortlist.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            companyId: 'company-id',
            status: ShortlistStatus.ACTIVE,
          }),
        }),
      );
      expect(prismaMock.recruiterCandidateShortlist.findMany.mock.calls[0][0].where).not.toEqual(
        expect.objectContaining({ recruiterAccountId: expect.anything() }),
      );
    });

    it('narrows to the caller when asked', async () => {
      await service.listShortlist(recruiter, { page: 1, limit: 20, mine: true });

      expect(prismaMock.recruiterCandidateShortlist.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ recruiterAccountId: 'recruiter-account-id' }),
        }),
      );
    });

    it('flags a candidate with no CV as unschedulable', async () => {
      prismaMock.recruiterCandidateShortlist.findMany.mockResolvedValue([
        {
          id: 'row-with-cv',
          candidateProfile: { id: 'p1', cvs: [{ id: 'cv-1', title: 'CV chính' }] },
        },
        { id: 'row-without-cv', candidateProfile: { id: 'p2', cvs: [] } },
      ]);
      prismaMock.recruiterCandidateShortlist.count.mockResolvedValue(2);

      const result = await service.listShortlist(recruiter, { page: 1, limit: 20 });

      // An interview needs a CV version to attach, so the UI must know before offering it.
      expect(result.items[0]?.latestCv).toEqual({ id: 'cv-1', title: 'CV chính' });
      expect(result.items[1]?.latestCv).toBeNull();
      expect(result.items[0]?.candidateProfile).not.toHaveProperty('cvs');
    });
  });

  describe('removeFromShortlist', () => {
    it('reports another company’s row as missing rather than forbidden', async () => {
      prismaMock.recruiterCandidateShortlist.findUnique.mockResolvedValue({
        id: 'shortlist-id',
        companyId: 'another-company',
      });

      // Returning 403 here would confirm that this id exists, and whose it is.
      await expect(service.removeFromShortlist('shortlist-id', recruiter)).rejects.toThrow(
        NotFoundException,
      );
      expect(prismaMock.recruiterCandidateShortlist.delete).not.toHaveBeenCalled();
    });

    it('deletes a row belonging to the caller’s company', async () => {
      prismaMock.recruiterCandidateShortlist.findUnique.mockResolvedValue({
        id: 'shortlist-id',
        companyId: 'company-id',
      });

      await service.removeFromShortlist('shortlist-id', recruiter);

      expect(prismaMock.recruiterCandidateShortlist.delete).toHaveBeenCalledWith({
        where: { id: 'shortlist-id' },
      });
    });
  });
});
