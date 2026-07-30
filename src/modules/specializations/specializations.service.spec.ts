import { ConflictException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SpecializationsService } from './specializations.service';

type SpecializationRow = { id: string; name: string; slug: string };

function createService(rows: SpecializationRow[]) {
  const create = jest.fn().mockImplementation(({ data }: { data: SpecializationRow }) => data);
  const prisma = {
    specialization: {
      findMany: jest.fn().mockResolvedValue(rows),
      create,
    },
  } as unknown as PrismaService;

  return { service: new SpecializationsService(prisma), create };
}

describe('SpecializationsService.create', () => {
  it('derives the slug from the name when the caller has none', async () => {
    const { service, create } = createService([]);

    await service.create({ name: '  Lập   trình Web  ' });

    expect(create).toHaveBeenCalledWith({ data: { name: 'Lập trình Web', slug: 'lap-trinh-web' } });
  });

  it('rejects a name that already exists under a different spelling', async () => {
    const { service, create } = createService([
      { id: 'specialization-1', name: 'Lập trình web', slug: 'lap-trinh-web' },
    ]);

    await expect(service.create({ name: 'lap trinh Web' })).rejects.toThrow(ConflictException);
    expect(create).not.toHaveBeenCalled();
  });

  it('keeps slugs unique when two different names normalise to one slug', async () => {
    const { service, create } = createService([
      { id: 'specialization-1', name: 'Kiểm thử', slug: 'kiem-thu' },
    ]);

    await service.create({ name: 'Kiem thu tự động' });

    expect(create).toHaveBeenCalledWith({
      data: { name: 'Kiem thu tự động', slug: 'kiem-thu-tu-dong' },
    });
  });
});
