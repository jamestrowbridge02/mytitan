import * as crypto from 'crypto';
import { ServiceUnavailableException } from '@nestjs/common';

const deriveKey = () => {
  const secret = process.env.INTEGRATIONS_ENCRYPTION_KEY?.trim();
  if (!secret) {
    throw new ServiceUnavailableException(
      'Webhook secret storage is unavailable until INTEGRATIONS_ENCRYPTION_KEY is injected on the server.',
    );
  }
  return crypto.createHash('sha256').update(secret).digest();
};

export const encryptText = (value: string) => {
  const key = deriveKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}.${tag.toString('base64')}.${ciphertext.toString('base64')}`;
};

export const decryptText = (payload: string) => {
  const key = deriveKey();
  const [ivB64, tagB64, dataB64] = payload.split('.');
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error('Invalid encrypted payload');
  }
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const data = Buffer.from(dataB64, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(data), decipher.final()]);
  return plaintext.toString('utf8');
};
