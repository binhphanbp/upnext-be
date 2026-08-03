import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { basename, extname } from 'node:path';

export type CvUploadFile = {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
};

type CvFormat = 'pdf' | 'docx' | 'doc' | 'txt' | 'md' | 'tex';

type ValidatedCvFile = {
  format: CvFormat;
  mimeType: string;
  originalName: string;
};

const MB = 1024 * 1024;
const MAX_CV_FILE_SIZE = 10 * MB;
const PDF_SIGNATURE = Buffer.from('%PDF-', 'latin1');
const PDF_HEADER_SEARCH_BYTES = 1024;
const DOC_SIGNATURE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const ZIP_LOCAL_FILE_SIGNATURE = 0x04034b50;
const ZIP_CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;
const MAX_DOCX_ENTRIES = 2_048;
const MAX_DOCX_UNCOMPRESSED_BYTES = 50 * MB;
const MAX_DOCX_COMPRESSION_RATIO = 100;

const CV_FORMATS: Record<CvFormat, { mimeType: string; declaredMimeTypes: readonly string[] }> = {
  pdf: {
    mimeType: 'application/pdf',
    declaredMimeTypes: ['application/pdf', 'application/octet-stream'],
  },
  docx: {
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    declaredMimeTypes: [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/zip',
      'application/octet-stream',
    ],
  },
  doc: {
    mimeType: 'application/msword',
    declaredMimeTypes: ['application/msword', 'application/octet-stream'],
  },
  txt: {
    mimeType: 'text/plain',
    declaredMimeTypes: ['text/plain', 'application/octet-stream'],
  },
  md: {
    mimeType: 'text/markdown',
    declaredMimeTypes: ['text/markdown', 'text/plain', 'application/octet-stream'],
  },
  tex: {
    mimeType: 'application/x-tex',
    declaredMimeTypes: ['application/x-tex', 'text/plain', 'application/octet-stream'],
  },
};

const EXTENSION_TO_FORMAT: Record<string, CvFormat> = {
  '.pdf': 'pdf',
  '.docx': 'docx',
  '.doc': 'doc',
  '.txt': 'txt',
  '.md': 'md',
  '.tex': 'tex',
};

/** MIME types accepted by Multer before the CV-specific content validation runs. */
export const CV_DECLARED_MIME_TYPES = Array.from(
  new Set(Object.values(CV_FORMATS).flatMap(({ declaredMimeTypes }) => declaredMimeTypes)),
);
export const CV_FILE_EXTENSIONS = Object.keys(EXTENSION_TO_FORMAT);

/**
 * PDF producers may add a byte-order mark or a short comment before the PDF header.
 * ISO 32000 permits this, so looking only at byte zero rejects otherwise valid PDFs.
 */
export function hasPdfHeader(buffer: Buffer) {
  return buffer.subarray(0, PDF_HEADER_SEARCH_BYTES).includes(PDF_SIGNATURE);
}

export function validateCvUpload(file: CvUploadFile): ValidatedCvFile {
  if (!file.size || !file.buffer.length) {
    throw new BadRequestException('File CV không được để trống');
  }

  if (file.size > MAX_CV_FILE_SIZE || file.buffer.length > MAX_CV_FILE_SIZE) {
    throw new PayloadTooLargeException('File CV vượt quá dung lượng tối đa 10 MB');
  }

  const originalName = sanitizeOriginalFileName(file.originalname);
  const format = EXTENSION_TO_FORMAT[extname(originalName).toLowerCase()];

  if (!format) {
    throw new BadRequestException('CV chỉ hỗ trợ định dạng PDF, DOCX, DOC, TXT, MD hoặc TEX');
  }

  if (!CV_FORMATS[format].declaredMimeTypes.includes(file.mimetype.toLowerCase())) {
    throw new BadRequestException('Định dạng file CV không khớp với nội dung đã tải lên');
  }

  validateContent(format, file.buffer);

  return {
    format,
    mimeType: CV_FORMATS[format].mimeType,
    originalName,
  };
}

export function sanitizeOriginalFileName(originalName: string) {
  const normalized = basename(originalName.replace(/\\/g, '/'))
    .normalize('NFC')
    .split('')
    .map((character) => (isUnsafeFileNameCharacter(character) ? '_' : character))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) {
    throw new BadRequestException('Tên file CV không hợp lệ');
  }

  return normalized.slice(0, 255);
}

function validateContent(format: CvFormat, buffer: Buffer) {
  switch (format) {
    case 'pdf':
      if (!hasPdfHeader(buffer)) {
        throw new BadRequestException('File CV không phải là tài liệu PDF hợp lệ');
      }
      return;
    case 'docx':
      if (!isValidDocxArchive(buffer)) {
        throw new BadRequestException('File CV không phải là tài liệu DOCX hợp lệ');
      }
      return;
    case 'doc':
      if (!buffer.subarray(0, DOC_SIGNATURE.length).equals(DOC_SIGNATURE)) {
        throw new BadRequestException('File CV không phải là tài liệu DOC hợp lệ');
      }
      return;
    case 'txt':
    case 'md':
    case 'tex':
      if (!isSafeUtf8Text(buffer)) {
        throw new BadRequestException('File CV dạng văn bản không hợp lệ hoặc không có nội dung');
      }
  }
}

function isSafeUtf8Text(buffer: Buffer) {
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    if (!text.trim() || text.includes('\0')) {
      return false;
    }

    const disallowedControls = [...text].filter(isDisallowedTextControl).length;
    return disallowedControls / text.length <= 0.01;
  } catch {
    return false;
  }
}

function isUnsafeFileNameCharacter(character: string) {
  const codePoint = character.codePointAt(0) ?? 0;
  return codePoint <= 0x1f || '<>:"|?*'.includes(character);
}

function isDisallowedTextControl(character: string) {
  const codePoint = character.codePointAt(0) ?? 0;
  return codePoint > 0 && codePoint < 0x20 && ![0x09, 0x0a, 0x0d].includes(codePoint);
}

function isValidDocxArchive(buffer: Buffer) {
  if (buffer.length < 22 || buffer.readUInt32LE(0) !== ZIP_LOCAL_FILE_SIGNATURE) {
    return false;
  }

  const endOfCentralDirectory = findEndOfCentralDirectory(buffer);
  if (endOfCentralDirectory === -1) {
    return false;
  }

  const entryCount = buffer.readUInt16LE(endOfCentralDirectory + 10);
  const centralDirectorySize = buffer.readUInt32LE(endOfCentralDirectory + 12);
  const centralDirectoryOffset = buffer.readUInt32LE(endOfCentralDirectory + 16);

  if (
    entryCount === 0 ||
    entryCount > MAX_DOCX_ENTRIES ||
    centralDirectoryOffset + centralDirectorySize > buffer.length
  ) {
    return false;
  }

  const requiredEntries = new Set(['[Content_Types].xml', '_rels/.rels', 'word/document.xml']);
  let cursor = centralDirectoryOffset;
  let totalUncompressedBytes = 0;

  for (let index = 0; index < entryCount; index += 1) {
    if (
      cursor + 46 > buffer.length ||
      buffer.readUInt32LE(cursor) !== ZIP_CENTRAL_DIRECTORY_SIGNATURE
    ) {
      return false;
    }

    const compressedBytes = buffer.readUInt32LE(cursor + 20);
    const uncompressedBytes = buffer.readUInt32LE(cursor + 24);
    const fileNameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localHeaderOffset = buffer.readUInt32LE(cursor + 42);
    const fileNameStart = cursor + 46;
    const nextEntry = fileNameStart + fileNameLength + extraLength + commentLength;

    if (nextEntry > buffer.length) {
      return false;
    }

    if (
      localHeaderOffset + 30 > buffer.length ||
      buffer.readUInt32LE(localHeaderOffset) !== ZIP_LOCAL_FILE_SIGNATURE
    ) {
      return false;
    }

    const localFileNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
    const localDataOffset = localHeaderOffset + 30 + localFileNameLength + localExtraLength;
    if (localDataOffset + compressedBytes > buffer.length) {
      return false;
    }

    totalUncompressedBytes += uncompressedBytes;
    if (
      totalUncompressedBytes > MAX_DOCX_UNCOMPRESSED_BYTES ||
      (compressedBytes > 0 && uncompressedBytes / compressedBytes > MAX_DOCX_COMPRESSION_RATIO)
    ) {
      return false;
    }

    requiredEntries.delete(buffer.toString('utf8', fileNameStart, fileNameStart + fileNameLength));
    cursor = nextEntry;
  }

  return requiredEntries.size === 0;
}

function findEndOfCentralDirectory(buffer: Buffer) {
  const minimumOffset = Math.max(0, buffer.length - 0xffff - 22);

  for (let offset = buffer.length - 22; offset >= minimumOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE) {
      return offset;
    }
  }

  return -1;
}
