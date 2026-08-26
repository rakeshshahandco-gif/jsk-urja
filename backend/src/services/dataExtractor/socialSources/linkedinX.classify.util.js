/**
 * Classify public LinkedIn / X URLs for source adapters.
 * Does not log in and does not harvest private contact data.
 */

function safeUrl(raw) {
    try {
        return new URL(String(raw || '').trim());
    } catch {
        return null;
    }
}

export const LINKEDIN_NAV_PATHS = Object.freeze([
    'feed', 'messaging', 'notifications', 'jobs', 'learning', 'search', 'settings',
    'login', 'signup', 'uas', 'checkpoint', 'preload', 'help', 'legal', 'sales',
    'talent', 'advertising', 'games', 'mynetwork',
]);

export const X_RESERVED_PATHS = Object.freeze([
    'home', 'explore', 'notifications', 'messages', 'i', 'settings', 'compose',
    'search', 'login', 'logout', 'tos', 'privacy', 'about', 'help', 'intent',
    'share', 'hashtag', 'topics', 'jobs', 'settings', 'account',
]);

export function classifyLinkedInUrl(rawUrl, searchType = 'companies') {
    const u = safeUrl(rawUrl);
    if (!u) return null;
    const host = u.hostname.replace(/^www\./, '').toLowerCase();
    if (host !== 'linkedin.com' && host !== 'lnkd.in') return null;
    const segs = (u.pathname || '/').split('/').filter(Boolean);
    const first = (segs[0] || '').toLowerCase();
    if (!first || LINKEDIN_NAV_PATHS.includes(first)) return null;
    if (first === 'company' || first === 'school' || first === 'showcase') {
        const slug = segs[1] || '';
        if (!slug || ['search', 'setup', 'admin'].includes(slug.toLowerCase())) return null;
        return {
            platform: 'linkedin',
            resultTypeHint: 'linkedin_company',
            urlKind: 'company',
            handle: slug,
            pageUrl: `https://www.linkedin.com/company/${slug}`,
        };
    }
    if (first === 'in') {
        const slug = segs[1] || '';
        if (!slug) return null;
        return {
            platform: 'linkedin',
            resultTypeHint: 'linkedin_profile',
            urlKind: 'professional',
            handle: slug,
            pageUrl: `https://www.linkedin.com/in/${slug}`,
        };
    }
    return null;
}

export function classifyXUrl(rawUrl, searchType = 'profiles') {
    const u = safeUrl(rawUrl);
    if (!u) return null;
    const host = u.hostname.replace(/^www\./, '').toLowerCase();
    if (host !== 'x.com' && host !== 'twitter.com' && host !== 'mobile.twitter.com') return null;
    const segs = (u.pathname || '/').split('/').filter(Boolean);
    const first = (segs[0] || '').toLowerCase();
    if (!first || X_RESERVED_PATHS.includes(first)) return null;
    if (first === 'i') return null;
    if (segs[1] && /status|statuses/i.test(segs[1])) {
        const id = segs[2] || '';
        return {
            platform: 'x',
            resultTypeHint: 'x_post',
            urlKind: 'post',
            handle: first,
            pageUrl: `https://x.com/${first}/status/${id}`,
            authorUrl: `https://x.com/${first}`,
        };
    }
    if (segs.length > 1 && !['with_replies', 'highlights', 'media', 'likes'].includes((segs[1] || '').toLowerCase())) {
        return null;
    }
    if (!/^[A-Za-z0-9_]{1,15}$/.test(first)) return null;
    return {
        platform: 'x',
        resultTypeHint: 'x_profile',
        urlKind: 'profile',
        handle: first,
        pageUrl: `https://x.com/${first}`,
    };
}

export function linkedinPublicQueries({ keyword, location, searchType }) {
    const loc = String(location || '').trim();
    const kw = String(keyword || '').trim();
    const quoted = `"${kw}"`;
    if (searchType === 'professionals') {
        return [
            `site:linkedin.com/in ${quoted} ${loc}`.trim(),
            `site:linkedin.com/in ${quoted} India`,
            `site:linkedin.com/in ${quoted}`,
        ].filter((q, i, arr) => q && arr.indexOf(q) === i);
    }
    return [
        `site:linkedin.com/company ${quoted} ${loc}`.trim(),
        `site:linkedin.com/company ${quoted} India`,
        `site:linkedin.com/company ${quoted}`,
    ].filter((q, i, arr) => q && arr.indexOf(q) === i);
}

export function xPublicQueries({ keyword, location, searchType }) {
    const loc = String(location || '').trim();
    const kw = String(keyword || '').trim();
    const quoted = `"${kw}"`;
    if (searchType === 'posts') {
        return [
            `site:x.com ${quoted} ${loc}`.trim(),
            `site:twitter.com ${quoted} ${loc}`.trim(),
            `site:x.com ${quoted}`,
        ].filter((q, i, arr) => q && arr.indexOf(q) === i);
    }
    return [
        `site:x.com ${quoted} ${loc}`.trim(),
        `site:x.com ${quoted} India`,
        `site:twitter.com ${quoted} ${loc}`.trim(),
    ].filter((q, i, arr) => q && arr.indexOf(q) === i);
}

export function xPostToProfileEvidence(classified, item = {}) {
    if (!classified || classified.urlKind !== 'post') return null;
    return {
        platform: 'x',
        resultTypeHint: 'x_profile',
        urlKind: 'profile',
        handle: classified.handle,
        pageUrl: classified.authorUrl || `https://x.com/${classified.handle}`,
        evidenceUrl: classified.pageUrl,
        snippet: String(item.snippet || item.title || '').slice(0, 2000),
    };
}
