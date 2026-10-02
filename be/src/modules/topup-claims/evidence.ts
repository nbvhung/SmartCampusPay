import { BadRequestException } from '@nestjs/common';

export const MAX_EVIDENCE_SIZE = 5 * 1024 * 1024;
export interface EvidenceUpload {
  buffer: Buffer;
  size: number;
  mimetype: string;
}

export function validateEvidence(file?: EvidenceUpload): string {
  if (!file?.buffer?.length)
    throw new BadRequestException('Vui lòng tải ảnh minh chứng giao dịch');
  const bytes = file.buffer;
  if (bytes.length > MAX_EVIDENCE_SIZE)
    throw new BadRequestException('Ảnh minh chứng tối đa 5 MB');
  let mime: string | undefined;
  if (
    bytes.length >= 24 &&
    bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) &&
    bytes.toString('ascii', 12, 16) === 'IHDR'
  )
    mime = 'image/png';
  else if (
    bytes.length >= 4 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  )
    mime = 'image/jpeg';
  else if (
    bytes.length >= 16 &&
    bytes.toString('ascii', 0, 4) === 'RIFF' &&
    bytes.toString('ascii', 8, 12) === 'WEBP'
  )
    mime = 'image/webp';
  if (!mime || mime !== file.mimetype)
    throw new BadRequestException(
      'Minh chứng phải là ảnh JPG, PNG hoặc WebP hợp lệ',
    );
  return mime;
}
