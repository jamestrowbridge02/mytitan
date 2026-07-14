import { BadRequestException } from '@nestjs/common';
import { promises as fs } from 'fs';

export type DecodedImageInfo = {
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
  width: number;
  height: number;
};

const MAX_LOGO_PIXELS = Number(process.env.TENANT_LOGO_MAX_PIXELS || 16_000_000);
const MAX_LOGO_DIMENSION = Number(process.env.TENANT_LOGO_MAX_DIMENSION || 8192);

function assertSafeDimensions(info: DecodedImageInfo) {
  if (!Number.isFinite(info.width) || !Number.isFinite(info.height) || info.width <= 0 || info.height <= 0) {
    throw new BadRequestException({ code: 'UPLOAD_IMAGE_INVALID', message: 'The image dimensions could not be read.' });
  }
  if (info.width > MAX_LOGO_DIMENSION || info.height > MAX_LOGO_DIMENSION || info.width * info.height > MAX_LOGO_PIXELS) {
    throw new BadRequestException({ code: 'UPLOAD_IMAGE_TOO_LARGE', message: 'The image dimensions are too large for a business logo.' });
  }
}

function readPng(buffer: Buffer): DecodedImageInfo | null {
  if (buffer.length < 24) return null;
  if (!buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return null;
  return { mimeType: 'image/png', width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function readJpeg(buffer: Buffer): DecodedImageInfo | null {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    offset += 2;
    if (marker === 0xd8 || marker === 0xd9) continue;
    if (offset + 2 > buffer.length) break;
    const length = buffer.readUInt16BE(offset);
    if (length < 2 || offset + length > buffer.length) break;
    if (
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf)
    ) {
      return { mimeType: 'image/jpeg', height: buffer.readUInt16BE(offset + 3), width: buffer.readUInt16BE(offset + 5) };
    }
    offset += length;
  }
  return null;
}

function readWebp(buffer: Buffer): DecodedImageInfo | null {
  if (buffer.length < 30 || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WEBP') return null;
  const chunk = buffer.toString('ascii', 12, 16);
  if (chunk === 'VP8X' && buffer.length >= 30) {
    return {
      mimeType: 'image/webp',
      width: 1 + buffer.readUIntLE(24, 3),
      height: 1 + buffer.readUIntLE(27, 3),
    };
  }
  if (chunk === 'VP8 ' && buffer.length >= 30) {
    return {
      mimeType: 'image/webp',
      width: buffer.readUInt16LE(26) & 0x3fff,
      height: buffer.readUInt16LE(28) & 0x3fff,
    };
  }
  if (chunk === 'VP8L' && buffer.length >= 25) {
    const bits = buffer.readUInt32LE(21);
    return {
      mimeType: 'image/webp',
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1,
    };
  }
  return null;
}

export async function inspectDecodedImage(filePath: string): Promise<DecodedImageInfo> {
  const buffer = await fs.readFile(filePath);
  const info = readPng(buffer) || readJpeg(buffer) || readWebp(buffer);
  if (!info) {
    throw new BadRequestException({ code: 'UPLOAD_IMAGE_INVALID', message: 'Choose a valid PNG, JPEG, or WebP image.' });
  }
  assertSafeDimensions(info);
  return info;
}
