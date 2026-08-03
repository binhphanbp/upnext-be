import { BadRequestException } from '@nestjs/common';
import type { Request } from 'express';
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { extname } from 'node:path';
import { CV_DECLARED_MIME_TYPES, CV_FILE_EXTENSIONS } from './cv-file-validation';

type MulterFile = { mimetype: string; originalname: string };
type FileFilterCallback = (error: Error | null, acceptFile: boolean) => void;

const MB = 1024 * 1024;

const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const DOCUMENT_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
const FILES_UPLOAD_MIME_TYPES = [...DOCUMENT_MIME_TYPES, ...CV_DECLARED_MIME_TYPES];

function buildFilter(allowed: string[], requireCvDocumentExtension = false) {
  return (_req: Request, file: MulterFile, callback: FileFilterCallback) => {
    const isCvDocument = CV_DECLARED_MIME_TYPES.includes(file.mimetype);
    const hasCvDocumentExtension = CV_FILE_EXTENSIONS.includes(
      extname(file.originalname).toLowerCase(),
    );

    if (
      allowed.includes(file.mimetype) &&
      (!requireCvDocumentExtension || !isCvDocument || hasCvDocumentExtension)
    ) {
      callback(null, true);
      return;
    }
    callback(new BadRequestException(`Định dạng file không được hỗ trợ: ${file.mimetype}`), false);
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

/**
 * Generic Files API accepts all currently supported CV formats plus images.
 * The CV service performs the authoritative extension, MIME and content checks.
 */
export const filesUploadOptions: MulterOptions = {
  limits: { fileSize: 10 * MB },
  fileFilter: buildFilter(FILES_UPLOAD_MIME_TYPES, true),
};

/** PDF-only uploads (CV versions). Max 10 MB. */
export const pdfUploadOptions: MulterOptions = {
  limits: { fileSize: 10 * MB },
  fileFilter: buildFilter(['application/pdf']),
};
