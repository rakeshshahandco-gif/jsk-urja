import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { SESSION_STATUSES } from './constants.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../../../.data-extractor-social-sessions');

function platformDir(platform, companyId) {
    const p = platform === 'instagram' ? 'instagram' : 'facebook';
    return path.join(ROOT, p, String(companyId));
}

function statusPath(platform, companyId) {
    return path.join(platformDir(platform, companyId), 'status.json');
}

export function socialUserDataDir(platform, companyId) {
    return path.join(platformDir(platform, companyId), 'chrome-profile');
}

export function readSocialSession(platform, companyId) {
    try {
        const raw = fs.readFileSync(statusPath(platform, companyId), 'utf8');
        const doc = JSON.parse(raw);
        const status = SESSION_STATUSES.includes(doc.status) ? doc.status : 'disconnected';
        return {
            platform,
            status,
            connectedAt: doc.connectedAt || null,
            lastCheckedAt: doc.lastCheckedAt || null,
            note: doc.note || '',
        };
    } catch {
        return { platform, status: 'disconnected', connectedAt: null, lastCheckedAt: null, note: '' };
    }
}

export function writeSocialSession(platform, companyId, patch = {}) {
    const dir = platformDir(platform, companyId);
    fs.mkdirSync(dir, { recursive: true });
    const prev = readSocialSession(platform, companyId);
    const status = SESSION_STATUSES.includes(patch.status) ? patch.status : (prev.status || 'disconnected');
    // Persist only safe status fields. Never write cookies, tokens, passwords, or Chrome profile contents.
    const next = {
        platform,
        status,
        connectedAt: Object.prototype.hasOwnProperty.call(patch, 'connectedAt') ? patch.connectedAt : prev.connectedAt,
        lastCheckedAt: new Date().toISOString(),
        note: String(Object.prototype.hasOwnProperty.call(patch, 'note') ? (patch.note || '') : (prev.note || '')).slice(0, 500),
    };
    fs.writeFileSync(statusPath(platform, companyId), JSON.stringify(next, null, 2));
    return next;
}

export function clearSocialSession(platform, companyId) {
    const dir = platformDir(platform, companyId);
    try {
        fs.rmSync(dir, { recursive: true, force: true });
    } catch {
        /* ignore */
    }
    return { platform, status: 'disconnected', connectedAt: null, lastCheckedAt: new Date().toISOString(), note: 'Disconnected' };
}

export function isSocialSessionIsolatedFromWhatsApp() {
    const wa = path.resolve(__dirname, '../../../../.whatsapp-auth');
    return path.resolve(ROOT) !== path.resolve(wa);
}
