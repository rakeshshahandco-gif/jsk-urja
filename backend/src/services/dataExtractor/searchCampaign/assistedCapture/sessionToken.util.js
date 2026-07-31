import crypto from 'crypto';
import { ApiError } from '../../../../utils/ApiError.js';

const TOKEN_PREFIX = 'jskac_';

export function generateSessionToken() {
    const randomHex = crypto.randomBytes(32).toString('hex');
    return `${TOKEN_PREFIX}${randomHex}`;
}

export function hashSessionToken(token) {
    return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

export function issueSessionToken(now = new Date(), ttlMinutes = 30) {
    const plain = generateSessionToken();
    const hash = hashSessionToken(plain);
    const expiresAt = new Date(now.getTime() + ttlMinutes * 60 * 1000);
    return { plain, hash, expiresAt };
}

export function assertSessionTokenHeader(token) {
    const value = String(token || '').trim();
    if (!value) throw new ApiError(401, 'Missing X-Assisted-Session-Token');
    if (!value.startsWith(TOKEN_PREFIX)) throw new ApiError(401, 'Invalid assisted session token');
    return value;
}
