/**
 * Classify public Facebook / Instagram URLs for source adapters.
 * Does not log in and does not enumerate private members/followers.
 */
import { FACEBOOK_NAV_PATH_RE, INSTAGRAM_RESERVED_PATHS, unwrapSocialHref } from './directLogin.quality.util.js';

function safeUrl(raw) {
    try {
        return new URL(unwrapSocialHref(raw));
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

    if (FACEBOOK_NAV_PATH_RE.test(lower)) return null;
    if (lower.startsWith('/search')) return null;

    const segs = path.split('/').filter(Boolean);
    if (segs[0]?.toLowerCase() === 'groups') {
        if (!['groups', 'group_intelligence'].includes(searchType)) return null;
        const slug = segs[1] || '';
        if (!slug || ['search', 'feed', 'joins', 'discover'].includes(slug.toLowerCase())) return null;
        return {
            platform: 'facebook',
            resultTypeHint: 'facebook_group',
            urlKind: 'group',
            handle: slug,
            pageUrl: `https://www.facebook.com/groups/${slug}`,
        };
    }

    if (/profile\.php/i.test(path)) {
        const id = u.searchParams.get('id') || '';
        if (!id) return null;
        return {
            platform: 'facebook',
            resultTypeHint: 'facebook_page',
            urlKind: 'profile_php',
            needsBusinessEvidence: true,
            handle: id,
            pageUrl: `https://www.facebook.com/profile.php?id=${id}`,
        };
    }

    if (['posts', 'group_intelligence'].includes(searchType) && (/\/posts\//.test(lower) || /\/permalink/.test(lower))) {
        return {
            platform: 'facebook',
            resultTypeHint: 'facebook_page',
            urlKind: 'post',
            handle: path.split('/').filter(Boolean)[0] || '',
            pageUrl: u.href.split('?')[0],
        };
    }

    const reserved = new Set(['pages', 'groups', 'search', 'events', 'watch', 'people', 'hashtag', 'reel', 'photo.php', 'help', 'home']);
    const handle = path.split('/').filter(Boolean)[0] || '';
    if (!handle || reserved.has(handle.toLowerCase())) return null;
    if (!/^[A-Za-z0-9._-]{2,80}$/.test(handle)) return null;
    return {
        platform: 'facebook',
        resultTypeHint: 'facebook_page',
        urlKind: 'page',
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

    if (lower === '/explore' || lower === '/explore/' || (lower.startsWith('/explore/') && !lower.includes('/explore/tags/'))) return null;
    if (lower.startsWith('/accounts') || lower.startsWith('/direct') || lower.startsWith('/reels') || lower.startsWith('/stories')) return null;
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
    if (INSTAGRAM_RESERVED_PATHS.includes(handle.toLowerCase())) return null;
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
    const quoted = `"${kw}"`;
    if (searchType === 'hashtag_topic') {
        const tag = kw.replace(/\s+/g, '').replace(/^#/, '');
        return [
            `site:instagram.com/explore/tags/${tag}`,
            `site:instagram.com ${quoted}`,
        ];
    }
    if (searchType === 'community_intelligence' || searchType === 'related_accounts') {
        return [
            `site:instagram.com ${quoted} ${loc}`.trim(),
            `site:instagram.com ${quoted}`,
        ];
    }
    return [
        `site:instagram.com ${quoted} ${loc}`.trim(),
        loc ? `site:instagram.com ${quoted} ${loc === 'Mumbai' ? 'India' : loc}` : `site:instagram.com ${quoted} India`,
        `site:instagram.com ${kw.replace(/\s+/g, '')} ${loc}`.trim(),
    ].filter((q, i, arr) => q && arr.indexOf(q) === i);
}
