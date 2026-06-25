import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { diskStorage } from 'multer';
import { promises as fs } from 'fs';
import { extname, join } from 'path';
import { JwtPayload } from '../auth/auth.types';
import { assertUploadAllowed, UPLOAD_LIMITS } from './upload-policy';

const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp']);
export const BOOKING_MEDIA_MAX_BYTES = Number(process.env.PUBLIC_BOOKING_IMAGE_MAX_BYTES ?? 5 * 1024 * 1024);

export function safeBookingMediaSegment(value: string) {
  return String(value || '').replace(/[^a-zA-Z0-9._-]/g, '_');
}

export function bookingMediaUploadOptions(prefix: 'location' | 'folder') {
  return {
    storage: diskStorage({
      destination: async (req: any, _file: any, cb: (error: Error | null, destination: string) => void) => {
        try {
          const user = req.user as JwtPayload;
          const dir = join(process.cwd(), 'uploads', 'tenants', safeBookingMediaSegment(user.companyId), 'booking');
          await fs.mkdir(dir, { recursive: true });
          cb(null, dir);
        } catch (error: any) {
          cb(error, '');
        }
      },
      filename: (_req: any, file: any, cb: (error: Error | null, fileName: string) => void) => {
        const extension = extname(file.originalname || '') || '.png';
        cb(null, `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}${safeBookingMediaSegment(extension)}`);
      },
    }),
    fileFilter: (_req: any, file: any, cb: (error: Error | null, acceptFile: boolean) => void) => {
      if (!ALLOWED_MIME.has(file.mimetype)) {
        return cb(new ForbiddenException('Unsupported file type'), false);
      }
      cb(null, true);
    },
    limits: { fileSize: Math.min(BOOKING_MEDIA_MAX_BYTES, UPLOAD_LIMITS.image) },
  };
}

export async function validateBookingMediaFile(file: any) {
  if (!file) throw new BadRequestException('Choose an image to upload');
  try {
    const policy = assertUploadAllowed(file);
    if (policy.category !== 'image' || Number(file.size || 0) > BOOKING_MEDIA_MAX_BYTES) {
      throw new BadRequestException(`Image must be ${Math.round(BOOKING_MEDIA_MAX_BYTES / 1024 / 1024)} MB or smaller`);
    }
  } catch (error) {
    if (file.path) await fs.unlink(file.path).catch(() => undefined);
    throw error;
  }
}

export function bookingMediaPath(tenantId: string, fileName: string) {
  return join(
    process.cwd(),
    'uploads',
    'tenants',
    safeBookingMediaSegment(tenantId),
    'booking',
    safeBookingMediaSegment(fileName),
  );
}
