import crypto from 'crypto';
import { ApiError } from '../../../../utils/ApiError.js';
import {
    RAW_CAPTURE_NOTES_MAX,
    RAW_CAPTURE_SNIPPET_MAX,
    RAW_CAPTURE_SOURCE_RECORD_ID_MAX,
    RAW_CAPTURE_TITLE_MAX,
    RAW_CAPTURE_URL_MAX,
} from './constants.js';

const TRACKING_PARAMS = new Set([
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_id',
    'gclid', 'fbclid', 'mc_cid', 'mc_eid', 'msclkid', '_ga', 'ref',
]);

const PRIVATE_HOSTS = new Set(['localhost', 'metadata.google.internal']);

export function collapseWhitespace(value = '') {
    return String(value || '').replace(/\s+/g, ' ').trim();
}

export function stripControlChars(value = '') {
    return String(value || '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
}

/** Safe plain-text from HTML fragments (no DOM / fetch). */
export function htmlToPlainText(value = '') {
    let s = stripControlChars(String(value || ''));
    s = s.replace(/<script[\s\S]*?<\/script>/gi, ' ');
    s = s.replace(/<style[\s\S]*?<\/style>/gi, ' ');
    s = s.replace(/<[^>]+>/g, ' ');
    s = s.replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>');
    s = s.replace(/&quot;/gi, '"').replace(/&#39;/gi, "'");
    return collapseWhitespace(s);
}

export function normalizeTitle(raw) {
    const s = htmlToPlainText(raw);
    if (s.length > RAW_CAPTURE_TITLE_MAX) {
        throw new ApiError(400, `title must be at most ${RAW_CAPTURE_TITLE_MAX} characters`);
    }
    return s;
}

export function normalizeSnippet(raw) {
    const s = htmlToPlainText(raw);
    if (s.length > RAW_CAPTURE_SNIPPET_MAX) {
        throw new ApiError(400, `snippet must be at most ${RAW_CAPTURE_SNIPPET_MAX} characters`);
    }
    return s;
}

export function normalizeTitleKey(raw = '') {
    return collapseWhitespace(raw).toLowerCase();
}

export function normalizeNotes(raw) {
    if (raw == null || raw === '') return '';
    const s = collapseWhitespace(stripControlChars(String(raw)));
    if (s.length > RAW_CAPTURE_NOTES_MAX) {
        throw new ApiError(400, `notes must be at most ${RAW_CAPTURE_NOTES_MAX} characters`);
    }
    return s;
}

export function normalizeSourceRecordId(raw) {
    if (raw == null || raw === '') return '';
    const s = collapseWhitespace(String(raw));
    if (s.length > RAW_CAPTURE_SOURCE_RECORD_ID_MAX) {
        throw new ApiError(400, `sourceRecordId must be at most ${RAW_CAPTURE_SOURCE_RECORD_ID_MAX} characters`);
    }
    return s;
}

function isPrivateIpv4(host) {
    const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
    if (!m) return false;
    const a = m.slice(1).map(Number);
    if (a.some((n) => n > 255)) return true;
    if (a[0] === 10) return true;
    if (a[0] === 127) return true;
    if (a[0] === 0) return true;
    if (a[0] === 169 && a[1] === 254) return true;
    if (a[0] === 172 && a[1] >= 16 && a[1] <= 31) return true;
    if (a[0] === 192 && a[1] === 168) return true;
    if (a[0] === 100 && a[1] >= 64 && a[1] <= 127) return true; // CGNAT / metadata-ish
    return false;
}

/**
 * Validate and normalize a result URL.
 * Returns { original, normalized, displayDomain } or throws.
 */
export function normalizeResultUrl(raw) {
    if (raw == null || raw === '') {
        return { original: '', normalized: '', displayDomain: '' };
    }
    const original = String(raw).trim();
    if (original.length > RAW_CAPTURE_URL_MAX) {
        throw new ApiError(400, `resultUrl must be at most ${RAW_CAPTURE_URL_MAX} characters`);
    }
    if (/^(javascript|data|file|ftp|vbscript):/i.test(original)) {
        throw new ApiError(400, 'resultUrl protocol not allowed');
    }
    let parsed;
    try {
        parsed = new URL(original);
    } catch {
        throw new ApiError(400, 'resultUrl is malformed');
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new ApiError(400, 'resultUrl must be http or https');
    }
    if (parsed.username || parsed.password) {
        throw new ApiError(400, 'resultUrl must not contain credentials');
    }
    const host = parsed.hostname.toLowerCase();
    if (!host || host.includes(' ') || PRIVATE_HOSTS.has(host) || host.endsWith('.local') || host.endsWith('.localhost')) {
        throw new ApiError(400, 'resultUrl host is not allowed');
    }
    if (host === '::1' || host === '[::1]' || isPrivateIpv4(host)) {
        throw new ApiError(400, 'resultUrl private/local host is not allowed');
    }
    if (host === '169.254.169.254' || host === 'metadata' || host.startsWith('metadata.')) {
        throw new ApiError(400, 'resultUrl metadata host is not allowed');
    }

    // Normalized: lowercase host, drop hash, drop tracking params, drop default ports
    const norm = new URL(parsed.href);
    norm.hash = '';
    norm.hostname = host;
    if ((norm.protocol === 'http:' && norm.port === '80') || (norm.protocol === 'https:' && norm.port === '443')) {
        norm.port = '';
    }
    const kept = new URLSearchParams();
    for (const [k, v] of norm.searchParams.entries()) {
        if (TRACKING_PARAMS.has(k.toLowerCase())) continue;
        if (k.toLowerCase().startsWith('utm_')) continue;
        kept.append(k, v);
    }
    norm.search = kept.toString() ? `?${kept.toString()}` : '';
    // Prefer trailing-slash consistency: keep pathname as-is except empty → /
    if (!norm.pathname) norm.pathname = '/';

    const displayDomain = host.replace(/^www\./, '');
    return {
        original,
        normalized: norm.toString(),
        displayDomain,
    };
}

/**
 * Capture identity priority (scoped additionally by unique index company/campaign/queryScopeKey/source):
 * 1) normalized result URL
 * 2) sourceRecordId when URL absent
 * 3) normalized title + snippet fallback
 * resultPosition is NEVER part of identity.
 */
export function buildCaptureFingerprint({
    source,
    queryScopeKey,
    resultUrlNormalized,
    sourceRecordId,
    titleNormalized,
    snippetNormalized,
}) {
    let material;
    if (resultUrlNormalized) {
        material = `url|${source}|${queryScopeKey}|${resultUrlNormalized}`;
    } else if (sourceRecordId) {
        material = `sid|${source}|${queryScopeKey}|${String(sourceRecordId).toLowerCase()}`;
    } else {
        material = `text|${source}|${queryScopeKey}|${titleNormalized || ''}|${snippetNormalized || ''}`;
    }
    return crypto.createHash('sha256').update(material).digest('hex');
}

/** Canonical SHA-256 of an ingest request (server-only). */
export function buildRequestFingerprint({
    companyId,
    campaignId,
    queryScopeKey,
    source,
    captureMethod,
    records = [],
}) {
    const canonRecords = (records || []).map((r) => ({
        title: r.title || '',
        snippet: r.snippet || '',
        resultUrlNormalized: r.resultUrlNormalized || '',
        resultPosition: r.resultPosition == null ? null : r.resultPosition,
        sourceRecordId: r.sourceRecordId || '',
        resultTypeHint: r.resultTypeHint || 'unknown',
    }));
    const payload = {
        companyId: String(companyId),
        campaignId: String(campaignId),
        queryScopeKey: String(queryScopeKey),
        source: String(source),
        captureMethod: String(captureMethod),
        records: canonRecords,
    };
    return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export function looksLikeBinaryOrBase64(value = '') {
    const s = String(value || '');
    if (s.length < 80) return false;
    if (/^data:[^;]+;base64,/i.test(s)) return true;
    // Long base64-like blob without spaces
    if (s.length >= 200 && /^[A-Za-z0-9+/=\s]+$/.test(s) && s.replace(/\s/g, '').length >= 200) {
        const compact = s.replace(/\s/g, '');
        if (compact.length >= 200 && compact.length % 4 === 0) return true;
    }
    // High ratio of non-printable
    const nonPrint = (s.match(/[^\x09\x0A\x0D\x20-\x7E\u00A0-\uFFFF]/g) || []).length;
    return nonPrint / s.length > 0.05;
}
