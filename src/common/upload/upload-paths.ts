import { isAbsolute, posix, relative, resolve, sep } from 'node:path';

export const UPLOAD_STORAGE_PREFIX = 'uploads/';

export function buildUploadStorageKey(...segments: string[]) {
  return posix.join('uploads', ...segments.map((segment) => segment.replaceAll('\\', '/')));
}

export function resolveUploadStoragePath(uploadRoot: string, storageKey: string) {
  const normalizedStorageKey = storageKey.replaceAll('\\', '/');
  if (!normalizedStorageKey.startsWith(UPLOAD_STORAGE_PREFIX)) {
    throw new Error('Local upload storage key must start with uploads/');
  }

  const root = resolve(uploadRoot);
  const absolutePath = resolve(root, normalizedStorageKey.slice(UPLOAD_STORAGE_PREFIX.length));
  const relativePath = relative(root, absolutePath);

  if (relativePath === '..' || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
    throw new Error('Local upload storage key resolves outside the upload root');
  }

  return absolutePath;
}
