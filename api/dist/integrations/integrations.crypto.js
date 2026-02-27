"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.decryptText = exports.encryptText = void 0;
const crypto_1 = require("crypto");
const common_1 = require("@nestjs/common");
const deriveKey = () => {
    const secret = process.env.INTEGRATIONS_ENCRYPTION_KEY?.trim();
    if (!secret) {
        throw new common_1.ServiceUnavailableException('INTEGRATIONS_ENCRYPTION_KEY is not configured');
    }
    return crypto_1.default.createHash('sha256').update(secret).digest();
};
const encryptText = (value) => {
    const key = deriveKey();
    const iv = crypto_1.default.randomBytes(12);
    const cipher = crypto_1.default.createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('base64')}.${tag.toString('base64')}.${ciphertext.toString('base64')}`;
};
exports.encryptText = encryptText;
const decryptText = (payload) => {
    const key = deriveKey();
    const [ivB64, tagB64, dataB64] = payload.split('.');
    if (!ivB64 || !tagB64 || !dataB64) {
        throw new Error('Invalid encrypted payload');
    }
    const iv = Buffer.from(ivB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');
    const data = Buffer.from(dataB64, 'base64');
    const decipher = crypto_1.default.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(data), decipher.final()]);
    return plaintext.toString('utf8');
};
exports.decryptText = decryptText;
//# sourceMappingURL=integrations.crypto.js.map