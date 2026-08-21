import { ApiProperty } from '@nestjs/swagger';

/** Multipart body of `POST /cv-versions/:id/rendered-pdf` — documentation only. */
export class AttachRenderedCvPdfDto {
  @ApiProperty({
    type: 'string',
    format: 'binary',
    description: 'PDF do client kết xuất từ snapshot CV Builder. Tối đa 10 MB.',
  })
  file!: unknown;
}
