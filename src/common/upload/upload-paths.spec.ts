import { resolve } from 'node:path';
import { buildUploadStorageKey, resolveUploadStoragePath } from './upload-paths';

describe('upload paths', () => {
  const uploadRoot = resolve('tmp', 'test-uploads');

  it('builds portable storage keys and resolves them under the configured root', () => {
    const storageKey = buildUploadStorageKey('cvs', 'cv-id', 'version.pdf');

    expect(storageKey).toBe('uploads/cvs/cv-id/version.pdf');
    expect(resolveUploadStoragePath(uploadRoot, storageKey)).toBe(
      resolve(uploadRoot, 'cvs', 'cv-id', 'version.pdf'),
    );
  });

  it('rejects paths outside the configured upload root', () => {
    expect(() => resolveUploadStoragePath(uploadRoot, 'uploads/../../secret')).toThrow(
      'outside the upload root',
    );
    expect(() => resolveUploadStoragePath(uploadRoot, 'other/file.pdf')).toThrow(
      'must start with uploads/',
    );
  });
});
