import 'reflect-metadata';
import { MODULE_METADATA, PARAMTYPES_METADATA } from '@nestjs/common/constants';
import { TalentPoolModule } from './talent-pool.module';

/**
 * Kiểm đồ thị DI bằng metadata -- cùng lý do và cùng kỹ thuật với
 * `talent-discovery.module.spec.ts`.
 *
 * Mọi spec khác trong module này dựng service bằng `new Service(mockA, mockB)`
 * trực tiếp, nên không cái nào chạm tới `@Module`. Một provider bị quên trong
 * `providers` (hoặc một service inject nhầm token) vẫn để test xanh, rồi app
 * chết lúc boot với `UnknownDependenciesException`. Bài học này đã trả giá
 * thật một lần ở `TalentDiscoveryModule` -- một service export mà không khai
 * `providers` không hề làm 1195 test đỏ.
 */
type ModuleMetadata = {
  providers: unknown[];
  controllers: unknown[];
  exports: unknown[];
};

function readMetadata(): ModuleMetadata {
  const get = (key: string) =>
    (Reflect.getMetadata(key, TalentPoolModule) as unknown[] | undefined) ?? [];
  return {
    providers: get(MODULE_METADATA.PROVIDERS),
    controllers: get(MODULE_METADATA.CONTROLLERS),
    exports: get(MODULE_METADATA.EXPORTS),
  };
}

function nameOf(token: unknown): string {
  return typeof token === 'function' ? token.name : String(token);
}

describe('TalentPoolModule', () => {
  const metadata = readMetadata();
  const providerNames = new Set(metadata.providers.map(nameOf));

  it('mọi thứ trong exports đều có trong providers', () => {
    const exportedButNotProvided = metadata.exports
      .map(nameOf)
      .filter((name) => !name.endsWith('Module'))
      .filter((name) => !providerNames.has(name));

    expect(exportedButNotProvided).toEqual([]);
  });

  it('mọi dependency mà controller cần đều có trong providers hoặc imports đã export', () => {
    // Không thể biết token đến từ `imports` (Prisma, Config, EmbeddingService từ
    // `CvScreeningModule`) hay từ chính module này chỉ bằng metadata, nên chỉ
    // xét token có tên khớp quy ước của module này (`TalentPool*`, `CvPool*`).
    const missing: string[] = [];
    for (const controller of metadata.controllers) {
      const params =
        (Reflect.getMetadata(PARAMTYPES_METADATA, controller as object) as unknown[] | undefined) ??
        [];
      for (const param of params) {
        const name = nameOf(param);
        if (
          (name.startsWith('TalentPool') || name.startsWith('CvPool')) &&
          !providerNames.has(name)
        ) {
          missing.push(`${nameOf(controller)} -> ${name}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('không khai báo trùng trong providers', () => {
    const names = metadata.providers.map(nameOf);
    expect(names).toEqual([...new Set(names)]);
  });
});
