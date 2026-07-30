import { PrismaService } from '../../common/prisma/prisma.service';
import { SkillsService } from './skills.service';

function createService(rows: Array<{ id: string; name: string }>) {
  const create = jest.fn().mockImplementation(({ data }: { data: { name: string } }) => data);
  const prisma = {
    skill: {
      findMany: jest.fn().mockResolvedValue(rows),
      create,
    },
  } as unknown as PrismaService;

  return { service: new SkillsService(prisma), create };
}

describe('SkillsService.create', () => {
  it('trims and collapses whitespace before storing the name', async () => {
    const { service, create } = createService([]);

    await service.create({ name: '  Spring   Boot ' });

    expect(create).toHaveBeenCalledWith({
      data: { name: 'Spring Boot' },
      include: { category: true },
    });
  });

  it('rejects a skill that already exists under a different spelling', async () => {
    const { service, create } = createService([{ id: 'skill-1', name: 'ReactJS' }]);

    await expect(service.create({ name: 'react js' })).rejects.toThrow(
      'Kỹ năng "ReactJS" đã có trong danh mục',
    );
    expect(create).not.toHaveBeenCalled();
  });

  it('still lets C, C++ and C# coexist', async () => {
    const { service, create } = createService([
      { id: 'skill-1', name: 'C' },
      { id: 'skill-2', name: 'C++' },
    ]);

    await service.create({ name: 'C#' });

    expect(create).toHaveBeenCalledWith({ data: { name: 'C#' }, include: { category: true } });
  });
});
