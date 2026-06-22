import crypto from 'crypto';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;

function getEncryptionKey() {
    const raw = process.env.CREDENTIAL_ENCRYPTION_KEY || process.env.JWT_SECRET || 'crm-dev-credential-key-change-me';
    return crypto.createHash('sha256').update(String(raw)).digest();
}

export function encryptCredential(plainText) {
    if (!plainText) return '';
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LEN);
    const cipher = crypto.createCipheriv(ALGO, key, iv);
    const encrypted = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

export function decryptCredential(cipherText) {
    if (!cipherText) return '';
    const key = getEncryptionKey();
    const buf = Buffer.from(String(cipherText), 'base64');
    const iv = buf.subarray(0, IV_LEN);
    const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
    const encrypted = buf.subarray(IV_LEN + TAG_LEN);
    const decipher = crypto.createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

export function maskCredential(value) {
    if (!value) return '';
    const s = String(value);
    if (s.length <= 4) return '****';
    return `${'*'.repeat(Math.min(8, s.length - 2))}${s.slice(-2)}`;
}
