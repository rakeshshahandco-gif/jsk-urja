/**
 * Instagram → existing Phase 1 website enrichment bridge.
 * Display/extract helpers only. Does not crawl by itself.
 */
import { assertPublicHttpUrl } from '../discovery/ssrfGuard.js';
import {
    extractExternalWebsite,
    isExternalBusinessWebsite,
    unwrapSocialHref,
} from './directLogin.quality.util.js';

const REJECT_HOST_RE = /(^|\.)(instagram|facebook|fb|meta|threads\.net|threads\.com|whatsapp|messenger|linkedin|twitter|x\.com|linktr\.ee|bit\.ly|wa\.me|maps\.app)\b/i;
const DOMAIN_RE = /\b((?:www\.)?[a-z0-9][a-z0-9.-]+\.(?:com|in|co|net|org|io|biz|cn|cc|info|shop|store|ai))(?:\/[^\s"'<>]*)?/i;

export function parseNotesMap(notes = '') {
    const out = {};
    for (const part of String(notes || '').split(';')) {
        const idx = part.indexOf('=');
        if (idx < 1) continue;
        const key = part.slice(0, idx).trim();
        const value = part.slice(idx + 1).trim();
        if (!key || !value) continue;
        if (out[key] == null) out[key] = value;
    }
    return out;
}

export function canonicalExternalWebsite(rawUrl) {
    try {
        const u = new URL(String(rawUrl || '').trim());
        u.hash = '';
        u.hostname = u.hostname.toLowerCase();
        u.search = '';
        const path = u.pathname === '/' ? '' : u.pathname.replace(/\/$/, '');
        return `${u.protocol}//${u.hostname}${path}`;
    } catch {
        return '';
    }
}

export function normalizeInstagramExternalWebsite(raw) {
    let s = String(raw || '').trim();
    if (!s) return '';
    s = unwrapSocialHref(s.replace(/[),.;]+$/, ''));
    if (!s) return '';
    if (!/^https?:\/\//i.test(s)) s = `https://${s.replace(/^\/\//, '')}`;
    let candidate;
    try {
        const u = new URL(s);
        if (!/^https?:$/i.test(u.protocol)) return '';
        const host = u.hostname.replace(/^www\./, '').toLowerCase();
        if (!host || REJECT_HOST_RE.test(host) || REJECT_HOST_RE.test(u.hostname)) return '';
        if (/\/(login|logout|help|accounts|privacy|legal|challenge|direct)\b/i.test(u.pathname || '')) {
            if (REJECT_HOST_RE.test(host)) return '';
        }
        candidate = `${u.protocol}//${u.hostname}${u.pathname || '/'}`.split('?')[0];
    } catch {
        return '';
    }
    if (!isExternalBusinessWebsite(candidate)) return '';
    try {
        assertPublicHttpUrl(candidate);
    } catch {
        return '';
    }
    return canonicalExternalWebsite(candidate) || candidate;
}

export function extractWebsiteFromInstagramEvidence({
    snippet = '',
    notes = '',
    website = '',
    hrefs = [],
} = {}) {
    const ordered = [
        website,
        parseNotesMap(notes).website,
        extractExternalWebsite([...(hrefs || []), website, snippet, notes]),
    ];
    for (const item of ordered) {
        const ok = normalizeInstagramExternalWebsite(item);
        if (ok) return ok;
    }
    const blob = [snippet, notes, ...(hrefs || [])].join(' ');
    const domain = blob.match(DOMAIN_RE);
    if (domain) {
        const ok = normalizeInstagramExternalWebsite(domain[1] || domain[0]);
        if (ok) return ok;
    }
    return '';
}

export function websiteFromInstagramCapture(capture = {}) {
    return extractWebsiteFromInstagramEvidence({
        snippet: capture.snippet,
        notes: capture.notes,
        website: capture.website,
    });
}

export function mergeWebsiteIntoStoredNotes(notes, site) {
    const map = parseNotesMap(notes);
    const existing = map.website ? normalizeInstagramExternalWebsite(map.website) : '';
    let next = String(notes || '');
    if (!existing) {
        next = `${next}${next ? '; ' : ''}website=${site}`;
    }
    if (!map.websiteSource) {
        next = `${next}${next ? '; ' : ''}websiteSource=instagram`;
    }
    return next.slice(0, 2000);
}

export function stampInstagramWebsiteOnCandidate(rec = {}) {
    const snippetBefore = rec.snippet;
    const site = extractWebsiteFromInstagramEvidence(rec);
    if (site) {
        rec.website = site;
        rec.notes = mergeWebsiteIntoStoredNotes(rec.notes, site);
    }
    rec.snippet = snippetBefore;
    return rec;
}

/** Company city comes from profile/website evidence only — never from search location. */
export function companyCityFromEvidence({ profileCity = '', websiteCity = '' } = {}) {
    return String(websiteCity || profileCity || '').trim();
}
