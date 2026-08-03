import { BadRequestException } from '@nestjs/common';
import { validateCvUpload } from './cv-file-validation';

describe('validateCvUpload', () => {
  it('accepts a valid PDF when its header is not at byte zero', () => {
    const buffer = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('%PDF-1.7\n')]);

    expect(
      validateCvUpload({
        buffer,
        mimetype: 'application/pdf',
        originalname: 'candidate.pdf',
        size: buffer.length,
      }),
    ).toMatchObject({ mimeType: 'application/pdf', originalName: 'candidate.pdf' });
  });

  it('accepts a structurally valid DOCX archive with required Office entries', () => {
    const buffer = createStoredZip([
      ['[Content_Types].xml', '<?xml version="1.0"?><Types/>'],
      ['_rels/.rels', '<?xml version="1.0"?><Relationships/>'],
      ['word/document.xml', '<?xml version="1.0"?><w:document xmlns:w="urn:upnext"/>'],
    ]);

    expect(
      validateCvUpload({
        buffer,
        mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        originalname: 'candidate.docx',
        size: buffer.length,
      }),
    ).toMatchObject({
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
  });

  it('rejects a file when its declared MIME type conflicts with its extension', () => {
    const buffer = Buffer.from('%PDF-1.7\n');

    expect(() =>
      validateCvUpload({
        buffer,
        mimetype: 'application/pdf',
        originalname: 'candidate.docx',
        size: buffer.length,
      }),
    ).toThrow(BadRequestException);
  });
});

function createStoredZip(entries: ReadonlyArray<readonly [name: string, contents: string]>) {
  const localRecords: Buffer[] = [];
  const centralRecords: Buffer[] = [];
  let offset = 0;

  for (const [name, contents] of entries) {
    const nameBuffer = Buffer.from(name, 'utf8');
    const contentBuffer = Buffer.from(contents, 'utf8');
    const crc = crc32(contentBuffer);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(contentBuffer.length, 18);
    local.writeUInt32LE(contentBuffer.length, 22);
    local.writeUInt16LE(nameBuffer.length, 26);
    local.writeUInt16LE(0, 28);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(contentBuffer.length, 20);
    central.writeUInt32LE(contentBuffer.length, 24);
    central.writeUInt16LE(nameBuffer.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt32LE(offset, 42);

    localRecords.push(local, nameBuffer, contentBuffer);
    centralRecords.push(central, nameBuffer);
    offset += local.length + nameBuffer.length + contentBuffer.length;
  }

  const centralDirectory = Buffer.concat(centralRecords);
  const endOfCentralDirectory = Buffer.alloc(22);
  endOfCentralDirectory.writeUInt32LE(0x06054b50, 0);
  endOfCentralDirectory.writeUInt16LE(entries.length, 8);
  endOfCentralDirectory.writeUInt16LE(entries.length, 10);
  endOfCentralDirectory.writeUInt32LE(centralDirectory.length, 12);
  endOfCentralDirectory.writeUInt32LE(offset, 16);

  return Buffer.concat([...localRecords, centralDirectory, endOfCentralDirectory]);
}

function crc32(buffer: Buffer) {
  let value = 0xffffffff;

  for (const byte of buffer) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
    }
  }

  return (value ^ 0xffffffff) >>> 0;
}
