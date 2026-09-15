import path from 'path';

export const EXTRACTION_SOURCES = Object.freeze(['web', 'facebook', 'instagram']);

export function safeProfileUserId(userId) {
    const hex = String(userId || '').replace(/[^a-fA-F0-9]/g, '').toLowerCase();
    if (hex.length >= 24) return hex.slice(0, 24);
    return '';
}

export function normalizeExtractionSource(source) {
    const raw = String(source || '').trim().toLowerCase();
    if (raw === 'fb') return 'facebook';
    if (raw === 'ig') return 'instagram';
    if (raw === 'google' || raw === 'discovery' || raw === 'data') return 'web';
    return EXTRACTION_SOURCES.includes(raw) ? raw : '';
}

/**
 * Local profile identity: companyId is CRM-side; on disk we key by user + source.
 * Never use display names. Never share facebook ↔ instagram folders.
 */
export function isolatedSourceProfileDir(root, userId, source) {
    const uid = safeProfileUserId(userId);
    const src = normalizeExtractionSource(source);
    if (!uid) throw new Error('Isolated profile requires a stable user id');
    if (!src) throw new Error('Isolated profile requires a source');
    return path.join(String(root || ''), uid, src);
}
