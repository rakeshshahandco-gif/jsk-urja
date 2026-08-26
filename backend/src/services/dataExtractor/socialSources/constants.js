/** Social Data Extractor sources. Isolated from WhatsApp sessions. */

export const SOCIAL_PLATFORMS = Object.freeze(['facebook', 'instagram', 'linkedin', 'x']);

export const FACEBOOK_MODES = Object.freeze(['public_search', 'direct_login', 'official_api']);
export const INSTAGRAM_MODES = Object.freeze(['public_search', 'direct_login', 'official_api']);
export const LINKEDIN_MODES = Object.freeze(['public_search', 'direct_login', 'official_api']);
export const X_MODES = Object.freeze(['public_search', 'direct_login', 'official_api']);

export const FACEBOOK_SEARCH_TYPES = Object.freeze([
    'pages',
    'groups',
    'group_intelligence',
    'posts',
    'page_audience',
    'page_engagement',
    'related_pages',
]);

export const INSTAGRAM_SEARCH_TYPES = Object.freeze([
    'business_profiles',
    'professional_accounts',
    'hashtag_topic',
    'related_accounts',
    'community_intelligence',
]);

export const LINKEDIN_SEARCH_TYPES = Object.freeze([
    'companies',
    'professionals',
]);

export const X_SEARCH_TYPES = Object.freeze([
    'profiles',
    'posts',
    'companies',
]);

export const SESSION_STATUSES = Object.freeze(['disconnected', 'connected', 'expired']);

export function officialApiStatus(platform) {
    const fb = String(process.env.EXTRACTOR_FACEBOOK_ACCESS_TOKEN || process.env.EXTRACTOR_META_ACCESS_TOKEN || '').trim();
    const ig = String(process.env.EXTRACTOR_INSTAGRAM_ACCESS_TOKEN || process.env.EXTRACTOR_META_ACCESS_TOKEN || '').trim();
    if (platform === 'facebook') {
        return fb
            ? { configured: true, mode: 'official_api', message: 'Meta token present. Group member lists are not available (Groups API deprecated April 2024).' }
            : { configured: false, mode: 'official_api', message: 'Official Meta/Facebook API is not configured. Use Public Search or Direct Login.' };
    }
    if (platform === 'linkedin') {
        return { configured: false, mode: 'official_api', message: 'Official LinkedIn API is not configured. Use Public Search or Direct Login.' };
    }
    if (platform === 'x') {
        return { configured: false, mode: 'official_api', message: 'Official X API is not configured. Use Public Search or Direct Login.' };
    }
    return ig
        ? { configured: true, mode: 'official_api', message: 'Instagram token present. Professional/business accounts only; follower dumps are not supported.' }
        : { configured: false, mode: 'official_api', message: 'Official Instagram API is not configured. Use Public Search or Direct Login.' };
}
