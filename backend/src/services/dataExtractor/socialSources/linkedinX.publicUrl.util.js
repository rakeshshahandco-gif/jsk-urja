/**
 * No-login public URL test records for LinkedIn / X.
 * Uses existing classification. Does not log in or harvest private contacts.
 */
import { ApiError } from '../../../utils/ApiError.js';
import { isExternalBusinessWebsite } from './directLogin.quality.util.js';
import { classifyLinkedInUrl, classifyXUrl, xPostToProfileEvidence } from './linkedinX.classify.util.js';

export const PUBLIC_URL_TEST_MODE = 'public_url_test';
export const SYNTHETIC_X_TEST_HANDLE = 'jsk4c_x_fixture';

export function isSyntheticSocialTestUrl(rawUrl = '') {
    try {
        const u = new URL(String(rawUrl || '').trim());
        const host = u.hostname.replace(/^www\./, '').toLowerCase();
        if (host !== 'x.com' && host !== 'twitter.com' && host !== 'mobile.twitter.com') return false;
        const handle = (u.pathname || '/').split('/').filter(Boolean)[0] || '';
        return handle.toLowerCase() === SYNTHETIC_X_TEST_HANDLE;
    } catch {
        return false;
    }
}

export function buildPublicUrlTestCandidate({
    platform,
    publicUrl,
    website = '',
    keyword = '',
    location = '',
    title = '',
    snippet = '',
    testOnly,
} = {}) {
    const p = String(platform || '').toLowerCase() === 'twitter' ? 'x' : String(platform || '').toLowerCase();
    if (p !== 'linkedin' && p !== 'x') {
        throw new ApiError(400, 'Test Public URL is only available for LinkedIn and X');
    }
    const raw = String(publicUrl || '').trim();
    if (!raw) throw new ApiError(400, 'Public URL is required');

    let classified = p === 'linkedin'
        ? classifyLinkedInUrl(raw, 'companies') || classifyLinkedInUrl(raw, 'professionals')
        : classifyXUrl(raw, 'profiles') || classifyXUrl(raw, 'posts');
    if (!classified) {
        throw new ApiError(400, 'URL is not a valid LinkedIn/X company, profile, or post. Navigation and system routes are rejected.');
    }

    let evidenceUrl = classified.pageUrl;
    let extraNotes = '';
    if (p === 'x' && classified.urlKind === 'post') {
        const mapped = xPostToProfileEvidence(classified, { snippet });
        if (!mapped) throw new ApiError(400, 'X post could not be mapped to an author profile');
        extraNotes = `postEvidence=${mapped.evidenceUrl}`;
        evidenceUrl = mapped.evidenceUrl;
        classified = mapped;
    }

    const site = String(website || '').trim();
    if (site && !isExternalBusinessWebsite(site)) {
        throw new ApiError(400, 'Known company website must be an external business URL, not a social/platform URL');
    }

    const synthetic = testOnly === true || isSyntheticSocialTestUrl(raw) || isSyntheticSocialTestUrl(classified.pageUrl);
    const displayTitle = String(title || classified.handle || '').slice(0, 500);
    const displaySnippet = synthetic
        ? String(snippet || 'Phase 4C pipeline fixture. Not a genuine business record.').slice(0, 2000)
        : String(snippet || '').slice(0, 2000);

    const notes = [
        `source=${p}`,
        `mode=${PUBLIC_URL_TEST_MODE}`,
        `searchType=${classified.urlKind || classified.resultTypeHint}`,
        keyword ? `keyword=${keyword}` : '',
        location ? `location=${location}` : '',
        `evidenceUrl=${evidenceUrl}`,
        `originalUrl=${raw}`,
        site ? `website=${site}` : '',
        extraNotes,
        synthetic ? 'testOnly=true' : '',
        `extractedAt=${new Date().toISOString()}`,
    ].filter(Boolean).join('; ').slice(0, 2000);

    const rec = {
        title: displayTitle,
        snippet: displaySnippet,
        resultUrl: classified.pageUrl,
        resultTypeHint: classified.resultTypeHint,
        sourceRecordId: `${p}:${classified.handle}`.slice(0, 300),
        notes,
        testOnly: synthetic,
    };
    if (site) rec.website = site;
    return rec;
}
