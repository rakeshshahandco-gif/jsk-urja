/**
 * WhatsApp Chat media — local filesystem storage (metadata only in MongoDB).
 * Relative root: storage/whatsapp-media/<companyId>/<sessionUserId>/<YYYY>/<MM>/
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** backend/storage/whatsapp-media */
export const WHATSAPP_MEDIA_ROOT_REL = 'storage/whatsapp-media';

const RESERVED_WIN = new Set([
    'CON', 'PRN', 'AUX', 'NUL',
    'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
    'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9',
]);

const EXT_BY_MIME = {
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'video/mp4': '.mp4',
    'video/webm': '.webm',
    'audio/ogg': '.ogg',
    'audio/mpeg': '.mp3',
    'audio/mp4': '.m4a',
    'audio/opus': '.opus',
    'application/pdf': '.pdf',
    'image/webp': '.webp',
};

const ALLOWED_MIME_PREFIXES = [
    'image/',
    'video/',
    'audio/',
    'application/pdf',
    'application/msword',
    'application/vnd.',
    'text/plain',
    'application/zip',
    'application/octet-stream',
];

const BLOCKED_EXT = new Set([
    '.exe', '.bat', '.cmd', '.com', '.msi', '.scr', '.ps1', '.vbs', '.js', '.jar',
    '.sh', '.dll', '.sys', '.apk', '.html', '.htm', '.svg',
]);

export function getWhatsAppMediaRootAbs() {
    // Resolve from backend cwd (npm run dev in backend/)
    return path.resolve(process.cwd(), WHATSAPP_MEDIA_ROOT_REL);
}

export function sanitizeOriginalFilename(name = '') {
    let base = String(name || 'file').split(/[/\\]/).pop() || 'file';
    base = base.replace(/[\u0000-\u001f<>:"|?*]/g, '_').replace(/\.+/g, '.');
    base = base.replace(/^\.+/, '').trim() || 'file';
    if (base.length > 120) {
        const ext = path.extname(base).slice(0, 16);
        base = `${base.slice(0, 100)}${ext}`;
    }
    const stem = path.parse(base).name.toUpperCase();
    if (RESERVED_WIN.has(stem)) base = `_${base}`;
    return base;
}

export function extensionForMime(mime, originalName = '') {
    const fromName = path.extname(String(originalName || '')).toLowerCase();
    if (fromName && fromName.length <= 10 && !BLOCKED_EXT.has(fromName)) return fromName;
    const m = String(mime || '').split(';')[0].trim().toLowerCase();
    if (EXT_BY_MIME[m]) return EXT_BY_MIME[m];
    if (m.startsWith('image/')) return `.${m.split('/')[1] || 'bin'}`.replace(/[^a-z0-9.]/g, '') || '.bin';
    return '.bin';
}

export function isAllowedMediaMime(mime) {
    const m = String(mime || '').toLowerCase();
    if (!m) return false;
    if (BLOCKED_EXT.has(path.extname(m))) return false;
    return ALLOWED_MIME_PREFIXES.some((p) => m.startsWith(p));
}

export function buildRelativeMediaPath({
    companyId = 'default',
    sessionUserId,
    messageId,
    mimeType = '',
    originalFileName = '',
    when = new Date(),
} = {}) {
    const company = String(companyId || 'default').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48) || 'default';
    const user = String(sessionUserId || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48) || 'unknown';
    const yyyy = String(when.getUTCFullYear());
    const mm = String(when.getUTCMonth() + 1).padStart(2, '0');
    const safeMsg = String(messageId || 'msg').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64) || 'msg';
    const suffix = crypto.randomBytes(4).toString('hex');
    const ext = extensionForMime(mimeType, originalFileName);
    const safeFileName = `${safeMsg}-${suffix}${ext}`;
    const relativeFilePath = [
        WHATSAPP_MEDIA_ROOT_REL,
        company,
        user,
        yyyy,
        mm,
        safeFileName,
    ].join('/');
    return { relativeFilePath, safeFileName, company, user, yyyy, mm };
}

/**
 * Resolve relative path under media root; throws on traversal / absolute / UNC.
 */
export function resolveSafeMediaAbsolute(relativeFilePath) {
    const rel = String(relativeFilePath || '').replace(/\\/g, '/');
    if (!rel || rel.includes('\0')) throw new Error('Invalid media path');
    if (path.isAbsolute(rel) || /^[a-zA-Z]:/.test(rel) || rel.startsWith('//') || rel.startsWith('\\\\')) {
        throw new Error('Absolute media paths are not allowed');
    }
    if (rel.includes('..')) throw new Error('Path traversal blocked');
    const normalized = rel.replace(/^\/+/, '');
    if (!normalized.startsWith(`${WHATSAPP_MEDIA_ROOT_REL}/`)) {
        throw new Error('Media path outside allowed root');
    }
    const rootAbs = getWhatsAppMediaRootAbs();
    const abs = path.resolve(process.cwd(), normalized);
    const rootResolved = path.resolve(rootAbs);
    if (!abs.startsWith(rootResolved + path.sep) && abs !== rootResolved) {
        throw new Error('Media path escaped storage root');
    }
    return abs;
}

export function mediaFileExists(relativeFilePath) {
    try {
        const abs = resolveSafeMediaAbsolute(relativeFilePath);
        return fs.existsSync(abs) && fs.statSync(abs).isFile() && fs.statSync(abs).size > 0;
    } catch {
        return false;
    }
}

/** Atomic write: temp → rename. Returns { relativeFilePath, fileSize, checksum }. */
export async function writeMediaBufferAtomic({
    buffer,
    companyId,
    sessionUserId,
    messageId,
    mimeType,
    originalFileName,
    when,
    existingRelativePath = '',
} = {}) {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
        throw new Error('Empty media buffer');
    }
    if (existingRelativePath && mediaFileExists(existingRelativePath)) {
        const abs = resolveSafeMediaAbsolute(existingRelativePath);
        const st = fs.statSync(abs);
        const checksum = crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex');
        return {
            relativeFilePath: existingRelativePath.replace(/\\/g, '/'),
            safeFileName: path.basename(existingRelativePath),
            fileSize: st.size,
            checksum,
            reused: true,
        };
    }

    const { relativeFilePath, safeFileName } = buildRelativeMediaPath({
        companyId,
        sessionUserId,
        messageId,
        mimeType,
        originalFileName,
        when,
    });
    const abs = resolveSafeMediaAbsolute(relativeFilePath);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    const tmp = `${abs}.tmp-${process.pid}-${Date.now()}`;
    fs.writeFileSync(tmp, buffer);
    const st = fs.statSync(tmp);
    if (!st.size) {
        try { fs.unlinkSync(tmp); } catch { /* ignore */ }
        throw new Error('Media write produced empty file');
    }
    fs.renameSync(tmp, abs);
    const checksum = crypto.createHash('sha256').update(buffer).digest('hex');
    return {
        relativeFilePath: relativeFilePath.replace(/\\/g, '/'),
        safeFileName,
        fileSize: st.size,
        checksum,
        reused: false,
    };
}

export function createReadStreamSafe(relativeFilePath) {
    const abs = resolveSafeMediaAbsolute(relativeFilePath);
    if (!fs.existsSync(abs)) throw new Error('Media file not found');
    return fs.createReadStream(abs);
}

export function readMediaBufferSafe(relativeFilePath) {
    const abs = resolveSafeMediaAbsolute(relativeFilePath);
    if (!fs.existsSync(abs)) throw new Error('Media file not found');
    return fs.readFileSync(abs);
}

/**
 * Extract minimal media crypto fields for retry (no session secrets).
 * Buffers stored as base64 for Mongo Mixed safety.
 */
export function extractMediaMetaFromEnvelope(envelope = {}) {
    const msg = envelope?.message || envelope;
    if (!msg || typeof msg !== 'object') return null;
    const unwrap = (raw, depth = 0) => {
        if (!raw || depth > 8) return raw;
        const keys = [
            'ephemeralMessage', 'viewOnceMessage', 'viewOnceMessageV2',
            'viewOnceMessageV2Extension', 'documentWithCaptionMessage',
            'editedMessage', 'deviceSentMessage',
        ];
        for (const k of keys) {
            if (raw[k]?.message) return unwrap(raw[k].message, depth + 1);
        }
        return raw;
    };
    const content = unwrap(msg);
    const typeKey = [
        'imageMessage', 'videoMessage', 'documentMessage',
        'audioMessage', 'stickerMessage',
    ].find((k) => content?.[k]);
    if (!typeKey) return null;
    const media = content[typeKey];
    const toB64 = (v) => {
        if (!v) return '';
        if (Buffer.isBuffer(v)) return v.toString('base64');
        if (v?.type === 'Buffer' && Array.isArray(v.data)) {
            return Buffer.from(v.data).toString('base64');
        }
        if (typeof v === 'string') return v;
        if (v?.buffer) return Buffer.from(v.buffer).toString('base64');
        try {
            return Buffer.from(v).toString('base64');
        } catch {
            return '';
        }
    };
    return {
        contentType: typeKey,
        mimetype: media.mimetype || '',
        fileName: media.fileName || '',
        fileLength: Number(media.fileLength || 0) || 0,
        caption: media.caption || '',
        url: media.url || '',
        directPath: media.directPath || '',
        mediaKeyB64: toB64(media.mediaKey),
        fileEncSha256B64: toB64(media.fileEncSha256),
        fileSha256B64: toB64(media.fileSha256),
        mediaKeyTimestamp: media.mediaKeyTimestamp || null,
        messageKey: envelope?.key || null,
    };
}

/** Rebuild Buffers after Mongo Mixed / JSON round-trip. */
export function reviveMediaBuffersInEnvelope(rawMessage) {
    if (!rawMessage || typeof rawMessage !== 'object') return rawMessage;
    const revive = (obj) => {
        if (obj == null) return obj;
        if (Buffer.isBuffer(obj)) return obj;
        if (obj instanceof Uint8Array) return Buffer.from(obj);
        if (obj?.type === 'Buffer' && Array.isArray(obj.data)) {
            return Buffer.from(obj.data);
        }
        if (obj?._bsontype === 'Binary' && obj.buffer) {
            return Buffer.from(obj.buffer);
        }
        if (Array.isArray(obj)) return obj.map(revive);
        if (typeof obj === 'object') {
            const out = {};
            for (const [k, v] of Object.entries(obj)) {
                out[k] = revive(v);
            }
            return out;
        }
        return obj;
    };
    return revive(rawMessage);
}

export function rebuildEnvelopeFromMediaMeta(mediaMeta, fallbackRaw) {
    if (fallbackRaw?.message) {
        return reviveMediaBuffersInEnvelope(fallbackRaw);
    }
    if (!mediaMeta?.contentType || !mediaMeta.mediaKeyB64) return null;
    const media = {
        mimetype: mediaMeta.mimetype,
        fileName: mediaMeta.fileName,
        fileLength: mediaMeta.fileLength,
        caption: mediaMeta.caption,
        url: mediaMeta.url,
        directPath: mediaMeta.directPath,
        mediaKey: Buffer.from(mediaMeta.mediaKeyB64, 'base64'),
        fileEncSha256: mediaMeta.fileEncSha256B64
            ? Buffer.from(mediaMeta.fileEncSha256B64, 'base64')
            : undefined,
        fileSha256: mediaMeta.fileSha256B64
            ? Buffer.from(mediaMeta.fileSha256B64, 'base64')
            : undefined,
        mediaKeyTimestamp: mediaMeta.mediaKeyTimestamp,
    };
    return {
        key: mediaMeta.messageKey || {},
        message: { [mediaMeta.contentType]: media },
    };
}
