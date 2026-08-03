import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { documentUploadOptions, filesUploadOptions, pdfUploadOptions } from './multer-options';

type FilterResult = { error: Error | null; accepted: boolean };

describe('upload Multer options', () => {
  it('keeps the shared document upload contract limited to PDFs and images', () => {
    expect(filter(documentUploadOptions, 'application/pdf', 'license.pdf')).toEqual({
      error: null,
      accepted: true,
    });
    expect(
      filter(
        documentUploadOptions,
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'candidate.docx',
      ).accepted,
    ).toBe(false);
  });

  it('allows supported CV documents only through the Files upload API', () => {
    expect(
      filter(
        filesUploadOptions,
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'candidate.docx',
      ),
    ).toEqual({ error: null, accepted: true });
    expect(filter(filesUploadOptions, 'application/octet-stream', 'payload.exe').accepted).toBe(
      false,
    );
  });

  it('does not change the PDF-only CV Version upload contract', () => {
    expect(filter(pdfUploadOptions, 'application/pdf', 'exported-cv')).toEqual({
      error: null,
      accepted: true,
    });
    expect(filter(pdfUploadOptions, 'application/msword', 'candidate.doc')).toMatchObject({
      accepted: false,
    });
  });
});

function filter(options: MulterOptions, mimetype: string, originalname: string): FilterResult {
  let result: FilterResult | undefined;

  options.fileFilter?.({}, { mimetype, originalname } as never, (error, accepted) => {
    result = { error, accepted };
  });

  if (!result) {
    throw new Error('Multer file filter did not resolve');
  }

  return result;
}
