/**
 * Classify public Facebook / Instagram URLs for source adapters.
 * Does not log in and does not enumerate private members/followers.
 */

function safeUrl(raw) {
    try {
        return new URL(String(raw || '').trim());
    } catch {
        return null;
    }
}

export function classifyFacebookUrl(rawUrl, searchType = 'pages') {
    const u = safeUrl(rawUrl);
    if (!u) return null;
    const host = u.hostname.replace(/^www\./, '').toLowerCase();
    if (host !== 'facebook.com' && host !== 'm.facebook.com' && host !== 'fb.com') return null;
    const path = u.pathname || '/';
    const lower = path.toLowerCase();

    if (/\/(login|share|sharer|dialog|plugins|marketplace|watch|gaming|ads|privacy|policies)\b/.test(lower)) return null;

    if (lower.includes('/groups/')) {
        if (!['groups', 'group_intelligence'].includes(searchType)) return null;
        const slug = path.split('/').filter(Boolean)[1] || '';
        return {
            platform: 'facebook',
            resultTypeHint: 'facebook_group',
            handle: slug,
            pageUrl: `https://www.facebook.com${path.split('/').slice(0, 3).join('/')}`,
        };
    }

    if (['posts'].includes(searchType) && (/\/posts\//.test(lower) || /\/permalink/.test(lower))) {
        return {
            platform: 'facebook',
            resultTypeHint: 'facebook_page',
            handle: path.split('/').filter(Boolean)[0] || '',
            pageUrl: u.href.split('?')[0],
        };
    }

    const reserved = new Set(['pages', 'groups', 'search', 'events', 'watch', 'people', 'hashtag', 'reel']);
    const handle = path.split('/').filter(Boolean)[0] || '';
    if (!handle || reserved.has(handle.toLowerCase())) return null;
    if (!/^[A-Za-z0-9._-]{2,80}$/.test(handle)) return null;
    return {
        platform: 'facebook',
        resultTypeHint: 'facebook_page',
        handle,
        pageUrl: `https://www.facebook.com/${handle}`,
    };
}

export function classifyInstagramUrl(rawUrl, searchType = 'business_profiles') {
    const u = safeUrl(rawUrl);
    if (!u) return null;
    const host = u.hostname.replace(/^www\./, '').toLowerCase();
    if (host !== 'instagram.com') return null;
    const path = u.pathname || '/';
    const lower = path.toLowerCase();
    const segments = path.split('/').filter(Boolean);

    if (/\/(accounts|direct|legal|developer|about)\b/.test(lower)) return null;

    if (lower.includes('/explore/tags/')) {
        const tag = segments[2] || '';
        if (!tag) return null;
        return {
            platform: 'instagram',
            resultTypeHint: 'instagram_hashtag',
            handle: tag,
            pageUrl: `https://www.instagram.com/explore/tags/${tag}/`,
        };
    }

    if (['/p/', '/reel/', '/reels/', '/tv/', '/stories/'].some((p) => lower.includes(p))) return null;
    if (segments.length !== 1) return null;
    const handle = segments[0];
    if (!/^[a-zA-Z0-9._]{1,30}$/.test(handle)) return null;
    return {
        platform: 'instagram',
        resultTypeHint: 'instagram_profile',
        handle,
        pageUrl: `https://www.instagram.com/${handle}/`,
    };
}

export function facebookPublicQueries({ keyword, location, searchType }) {
    const loc = String(location || '').trim();
    const kw = String(keyword || '').trim();
    const base = [kw, loc].filter(Boolean).join(' ');
    if (searchType === 'groups' || searchType === 'group_intelligence') {
        return [
            `site:facebook.com/groups ${base}`,
            `site:facebook.com ${base} group`,
        ];
    }
    if (searchType === 'posts') {
        return [`site:facebook.com ${base} posts`, `site:facebook.com ${base}`];
    }
    return [
        `site:facebook.com ${base} pages`,
        `site:facebook.com ${base}`,
    ];
}

export function instagramPublicQueries({ keyword, location, searchType }) {
    const loc = String(location || '').trim();
    const kw = String(keyword || '').trim();
    const base = [kw, loc].filter(Boolean).join(' ');
    if (searchType === 'hashtag_topic') {
        return [`site:instagram.com/explore/tags ${kw}`, `site:instagram.com ${kw}`];
    }
    if (searchType === 'community_intelligence') {
        return [`site:instagram.com ${base} community`, `site:instagram.com ${base}`];
    }
    return [`site:instagram.com ${base}`, `site:instagram.com ${kw} business`];
}
