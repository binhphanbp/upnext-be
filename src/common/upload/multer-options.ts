import { BadRequestException } from '@nestjs/common';
import type { Request } from 'express';
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';

type MulterFile = { mimetype: string; originalname: string };
type FileFilterCallback = (error: Error | null, acceptFile: boolean) => void;

const MB = 1024 * 1024;

const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
];

function buildFilter(allowed: string[]) {
  return (_req: Request, file: MulterFile, callback: FileFilterCallback) => {
    if (allowed.includes(file.mimetype)) {
      callback(null, true);
      return;
    }
    callback(
      new BadRequestException(`Định dạng file không được hỗ trợ: ${file.mimetype}`),
      false,
    );
  };
}

/** Images only (logos, covers, photos, avatars). Max 5 MB. */
export const imageUploadOptions: MulterOptions = {
  limits: { fileSize: 5 * MB },
  fileFilter: buildFilter(IMAGE_MIME_TYPES),
};

/** PDFs and images (generic documents, business licenses). Max 10 MB. */
export const documentUploadOptions: MulterOptions = {
  limits: { fileSize: 10 * MB },
  fileFilter: buildFilter(DOCUMENT_MIME_TYPES),
};

/** PDF-only uploads (CV versions). Max 10 MB. */
export const pdfUploadOptions: MulterOptions = {
  limits: { fileSize: 10 * MB },
  fileFilter: buildFilter(['application/pdf']),
};
