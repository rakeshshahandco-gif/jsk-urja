import { ApiError } from '../../../utils/ApiError.js';
import { assertPublicHttpUrl } from './ssrfGuard.js';
import { classifyPublicSocialUrl } from '../adapters/socialPublicPageAdapter.js';
import { isIndiamartUrl, classifyIndiamartUrl } from './indiamartDiscovery.service.js';

const FACEBOOK_RESERVED = new Set([
    'pages', 'groups', 'events', 'watch', 'marketplace', 'login', 'help',
    'policies', 'privacy', 'business', 'ads', 'gaming', 'share', 'sharer',
    'profile.php', 'people', 'hashtag', 'reel', 'notes', 'l.php',
]);

const INSTAGRAM_BLOCKED = new Set([
    'p', 'reel', 'reels', 'tv', 'stories', 'explore', 'accounts', 'direct',
]);

/**
 * Map classification category to importDiscoveryUrls item.type values.
 */
function categoryToType(category, platform) {
    if (category === 'indiamart') return 'indiamart';
    if (category === 'facebook_public' || platform === 'facebook_page') return 'facebook_page';
    if (category === 'instagram_public' || platform === 'instagram_business') return 'instagram_profile';
    if (category === 'trade_listing') return 'trade_listing';
    return 'website';
}

function asAccepted(classified) {
    const type = classified.type || categoryToType(classified.category, classified.platform);
    const url = classified.url || classified.normalizedUrl || '';
    return {
        ...classified,
        type,
        url,
        normalizedUrl: classified.normalizedUrl || url,
        category: classified.category || type,
    };
}

/**
 * Normalize a public Facebook Page URL. Returns canonical URL or null for non-FB hosts.
 * Throws when the URL is Facebook but not a public business Page (e.g. groups).
 */
export function normalizeFacebookPageUrl(rawUrl) {
    let url;
    try {
        url = new URL(String(rawUrl || '').trim());
    } catch {
        return null;
    }
    const host = url.hostname.replace(/^www\./, '').toLowerCase();
    if (host !== 'facebook.com' && host !== 'm.facebook.com' && host !== 'fb.com') {
        return null;
    }
    const segments = url.pathname.split('/').filter(Boolean);
    if (!segments.length) {
        throw new Error('Only public Facebook business Page URLs are allowed');
    }
    let handle = segments[0];
    if (handle.toLowerCase() === 'pages' && segments.length >= 2) {
        handle = segments[segments.length - 1];
    }
    if (FACEBOOK_RESERVED.has(handle.toLowerCase())) {
        throw new Error('Only public Facebook business Page URLs are allowed');
    }
    if (!/^[A-Za-z0-9._-]{2,80}$/.test(handle)) {
        throw new Error('Only public Facebook business Page URLs are allowed');
    }
    return 'https://www.facebook.com/' + handle;
}

/**
 * Normalize a public Instagram profile URL. Returns canonical URL or null for non-IG hosts.
 * Throws when the URL is Instagram but not a public professional profile (e.g. reels).
 */
export function normalizeInstagramProfileUrl(rawUrl) {
    let url;
    try {
        url = new URL(String(rawUrl || '').trim());
    } catch {
        return null;
    }
    const host = url.hostname.replace(/^www\./, '').toLowerCase();
    if (host !== 'instagram.com') return null;
    const segments = url.pathname.split('/').filter(Boolean);
    if (!segments.length) {
        throw new Error('Only public Instagram professional profiles are allowed');
    }
    const first = segments[0].toLowerCase();
    if (INSTAGRAM_BLOCKED.has(first) || segments.length !== 1) {
        throw new Error('Only public Instagram professional profiles are allowed');
    }
    const handle = segments[0];
    if (!/^[a-zA-Z0-9._]{1,30}$/.test(handle)) {
        throw new Error('Only public Instagram professional profiles are allowed');
    }
    return 'https://www.instagram.com/' + handle + '/';
}

/**
 * Classify a public import URL into a discovery category.
 * Always includes type + url aliases expected by importDiscoveryUrls.
 */
export function classifyPublicUrl(rawUrl) {
    const trimmed = String(rawUrl || '').trim();
    if (!trimmed) return { ok: false, reason: 'empty', category: null, type: null, normalizedUrl: '', url: '' };

    try {
        assertPublicHttpUrl(trimmed);
    } catch (err) {
        return {
            ok: false,
            reason: err?.message || 'ssrf_blocked',
            category: null,
            type: null,
            normalizedUrl: '',
            url: '',
        };
    }

    // IndiaMART public company/listing URLs (before generic website)
    if (isIndiamartUrl(trimmed)) {
        try {
            const c = classifyIndiamartUrl(trimmed);
            return asAccepted({
                ok: true,
                category: 'indiamart',
                type: 'indiamart',
                normalizedUrl: c.url,
                url: c.url,
                platform: 'indiamart',
                indiamartKind: c.type,
            });
        } catch (err) {
            return {
                ok: false,
                reason: err?.message || 'indiamart_rejected',
                category: null,
                type: null,
                normalizedUrl: '',
                url: '',
            };
        }
    }

    try {
        const fb = normalizeFacebookPageUrl(trimmed);
        if (fb) {
            return asAccepted({
                ok: true,
                category: 'facebook_public',
                type: 'facebook_page',
                normalizedUrl: fb,
                url: fb,
                platform: 'facebook_page',
            });
        }
    } catch (err) {
        return {
            ok: false,
            reason: err?.message || 'not_a_public_business_page',
            category: null,
            type: null,
            normalizedUrl: '',
            url: '',
        };
    }

    try {
        const ig = normalizeInstagramProfileUrl(trimmed);
        if (ig) {
            return asAccepted({
                ok: true,
                category: 'instagram_public',
                type: 'instagram_profile',
                normalizedUrl: ig,
                url: ig,
                platform: 'instagram_business',
            });
        }
    } catch (err) {
        return {
            ok: false,
            reason: err?.message || 'not_a_professional_profile',
            category: null,
            type: null,
            normalizedUrl: '',
            url: '',
        };
    }

    const social = classifyPublicSocialUrl(trimmed);
    if (social) {
        const category = social.platform === 'facebook_page' ? 'facebook_public' : 'instagram_public';
        return asAccepted({
            ok: true,
            category,
            normalizedUrl: social.pageUrl,
            url: social.pageUrl,
            platform: social.platform,
        });
    }

    try {
        const url = new URL(trimmed.startsWith('http') ? trimmed : ('https://' + trimmed));
        const host = url.hostname.replace(/^www\./i, '').toLowerCase();
        if (host.includes('facebook.') || host.includes('instagram.') || host.includes('fb.com')) {
            return {
                ok: false,
                reason: 'not_a_public_business_page',
                category: null,
                type: null,
                normalizedUrl: '',
                url: '',
            };
        }
        return asAccepted({
            ok: true,
            category: 'website',
            type: 'website',
            normalizedUrl: url.toString(),
            url: url.toString(),
            platform: 'manual_url',
        });
    } catch {
        return { ok: false, reason: 'invalid_url', category: null, type: null, normalizedUrl: '', url: '' };
    }
}

/**
 * Validate a list of import URLs. Returns accepted + rejected with reasons.
 */
export function validateImportUrls(urls = [], { maxUrls = 50 } = {}) {
    const list = [...new Set((urls || []).map((u) => String(u || '').trim()).filter(Boolean))];
    if (!list.length) {
        throw new ApiError(400, 'At least one URL is required');
    }
    if (list.length > maxUrls) {
        throw new ApiError(400, `Maximum ${maxUrls} URLs per import`);
    }
    const accepted = [];
    const rejected = [];
    for (const raw of list) {
        const classified = classifyPublicUrl(raw);
        if (classified.ok) {
            accepted.push({ rawUrl: raw, ...classified });
        } else {
            rejected.push({ rawUrl: raw, reason: classified.reason || 'rejected' });
        }
    }
    return { accepted, rejected };
}
