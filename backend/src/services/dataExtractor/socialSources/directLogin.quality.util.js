/**
 * Phase 3C — Direct Login quality gates.
 * Deterministic source-level filtering only. Does not change Phase 2 AI.
 */

export const INSTAGRAM_RESERVED_PATHS = Object.freeze([
    'explore', 'popular', 'reels', 'stories', 'accounts', 'direct', 'about', 'legal',
    'directory', 'web', 'emails', 'challenge', 'nametag', 'privacy', 'help', 'lite',
    'session', 'qr', 'p', 'reel', 'tv', 'igtv', 'accounts_center', 'settings',
]);

export const FACEBOOK_NAV_PATH_RE = /\/(login|logout|recover|checkpoint|share|sharer|dialog|plugins|marketplace|watch|gaming|ads|privacy|policies|messages|notifications|bookmarks|friends|settings|stories|reels|reel|saved|memories|fundraisers|help|composer|pages\/create|friends\/requests)\b/i;

const SOCIAL_HOST_RE = /(^|\.)(facebook|fb|instagram|meta|whatsapp|messenger|linkedin)\.com$|(^|\.)(x\.com|twitter\.com)$/i;

const GENERIC_BUSINESS_HINT = /\b(works?\s+at|owner|founder|integrator|company|pvt\.?|ltd\.?|llp|enterprise|solutions|systems|official|business|dealer|distributor|installer|contractor|architect|interior|category|website|www\.|http|\.com\b|\.in\b|\.co\b)\b/i;

export function unwrapSocialHref(href) {
    try {
        const u = new URL(String(href || '').trim());
        if (/l\.facebook\.com|lm\.facebook\.com/i.test(u.hostname) || u.pathname === '/l.php') {
            const dest = u.searchParams.get('u');
            if (dest) return decodeURIComponent(dest);
        }
        return u.href;
    } catch {
        return String(href || '');
    }
}

export function isFacebookNavigationUrl(rawUrl) {
    const raw = unwrapSocialHref(rawUrl);
    try {
        const u = new URL(raw);
        const host = u.hostname.replace(/^www\./, '').toLowerCase();
        if (host !== 'facebook.com' && host !== 'm.facebook.com' && host !== 'fb.com') return true;
        const lower = (u.pathname || '/').toLowerCase();
        if (FACEBOOK_NAV_PATH_RE.test(lower)) return true;
        if (lower.startsWith('/search')) return true;
        if (lower === '/' || lower === '') return true;
        return false;
    } catch {
        return true;
    }
}

export function isInstagramReservedUrl(rawUrl) {
    const raw = unwrapSocialHref(rawUrl);
    try {
        const u = new URL(raw);
        const host = u.hostname.replace(/^www\./, '').toLowerCase();
        if (host !== 'instagram.com') return true;
        const lower = (u.pathname || '/').toLowerCase();
        if (lower === '/' || lower === '') return true;
        if (lower === '/explore' || lower === '/explore/' || lower.startsWith('/explore/')) {
            return !lower.includes('/explore/tags/');
        }
        if (lower.startsWith('/accounts') || lower.startsWith('/direct') || lower.startsWith('/reels') || lower.startsWith('/stories')) return true;
        const handle = lower.split('/').filter(Boolean)[0] || '';
        return INSTAGRAM_RESERVED_PATHS.includes(handle);
    } catch {
        return true;
    }
}

export function isFacebookProfilePhp(rawUrl) {
    try {
        const u = new URL(unwrapSocialHref(rawUrl));
        return /profile\.php/i.test(u.pathname || '');
    } catch {
        return false;
    }
}

export function isExternalBusinessWebsite(rawUrl) {
    try {
        const u = new URL(String(rawUrl || '').trim());
        if (!/^https?:$/i.test(u.protocol)) return false;
        const host = u.hostname.replace(/^www\./, '').toLowerCase();
        if (!host || SOCIAL_HOST_RE.test(host)) return false;
        if (/(^|\.)(google|gstatic|youtube|youtu\.be|bing|microsoft|apple|linktr\.ee|bit\.ly|wa\.me|maps\.app|meta\.ai|threads\.com|threads\.net)\b/i.test(host)) return false;
        return true;
    } catch {
        return false;
    }
}

export function extractExternalWebsite(textOrUrls = '') {
    const blob = Array.isArray(textOrUrls) ? textOrUrls.join(' ') : String(textOrUrls || '');
    const found = blob.match(/https?:\/\/[^\s"'<>]+/gi) || [];
    for (const raw of found) {
        const cleaned = unwrapSocialHref(raw.replace(/[),.;]+$/, ''));
        if (isExternalBusinessWebsite(cleaned)) return cleaned.split('?')[0];
    }
    const domain = blob.match(/\b(?:www\.)?[a-z0-9][a-z0-9.-]+\.(?:com|in|co|net|org|io|biz)(?:\/[^\s]*)?/i);
    if (domain) {
        const guess = domain[0].startsWith('http') ? domain[0] : `https://${domain[0]}`;
        if (isExternalBusinessWebsite(guess)) return guess.split('?')[0];
    }
    return '';
}

export function extractVisibleEmail(text = '') {
    const m = String(text || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    return m ? m[0] : '';
}

export function extractVisiblePhone(text = '') {
    const m = String(text || '').match(/(?:\+?\d[\d\s().-]{8,16}\d)/);
    return m ? m[0].replace(/\s+/g, ' ').trim() : '';
}

export function keywordEvidenceTerms(keyword = '') {
    const kw = String(keyword || '').trim().toLowerCase();
    const terms = new Set();
    if (kw) terms.add(kw);
    kw.split(/[\s,/|+]+/).filter((t) => t.length > 2).forEach((t) => terms.add(t));
    if (/automat|smart.?home|knx|dali|lighting|smarthome/i.test(kw)) {
        ['home automation', 'smart home', 'smart lighting', 'knx', 'dali', 'building automation',
            'automation integrator', 'system integrator', 'av automation', 'smart switch', 'iot',
            'automation company', 'smart switches'].forEach((t) => terms.add(t));
    }
    return [...terms];
}

export function textHasKeywordEvidence(text = '', keyword = '') {
    const t = String(text || '').toLowerCase();
    const kw = String(keyword || '').trim().toLowerCase();
    if (!t.trim() || !kw) return false;
    if (t.includes(kw)) return true;
    const collapsed = kw.replace(/\s+/g, '');
    if (collapsed.length > 4 && t.includes(collapsed)) return true;
    const tokens = kw.split(/[\s,/|+]+/).filter((x) => x.length > 3);
    if (tokens.length >= 2 && tokens.every((tok) => t.includes(tok))) return true;
    if (tokens.length === 1 && t.includes(tokens[0])) return true;
    return keywordEvidenceTerms(keyword)
        .filter((term) => term !== kw && (term.includes(' ') || term.length >= 4))
        .some((term) => t.includes(term));
}

export function hasVisibleBusinessEvidence(text = '', { keyword = '', requireKeyword = false } = {}) {
    const t = String(text || '');
    if (!t.trim()) return false;
    const hasBiz = GENERIC_BUSINESS_HINT.test(t) || Boolean(extractExternalWebsite(t)) || Boolean(extractVisibleEmail(t));
    const hasKw = textHasKeywordEvidence(t, keyword);
    if (requireKeyword) return hasKw && (hasBiz || t.length > 40);
    return hasBiz || hasKw;
}

export function shouldKeepProfilePhp({ cardText = '', profileText = '', keyword = '' } = {}) {
    const blob = `${cardText}\n${profileText}`;
    return hasVisibleBusinessEvidence(blob, { keyword, requireKeyword: false })
        && (textHasKeywordEvidence(blob, keyword) || GENERIC_BUSINESS_HINT.test(blob));
}

export function shouldKeepInstagramAccount({
    handle = '',
    displayName = '',
    bio = '',
    category = '',
    keyword = '',
    loggedInUsername = '',
} = {}) {
    const h = String(handle || '').replace(/^@/, '').toLowerCase();
    if (!h || INSTAGRAM_RESERVED_PATHS.includes(h)) return false;
    if (loggedInUsername && h === String(loggedInUsername).replace(/^@/, '').toLowerCase()) {
        const blob = `${displayName} ${bio} ${category}`;
        if (!textHasKeywordEvidence(blob, keyword)) return false;
    }
    const blob = `${handle} ${displayName} ${bio} ${category}`;
    return textHasKeywordEvidence(blob, keyword) || hasVisibleBusinessEvidence(blob, { keyword });
}

export function shouldKeepGroupParticipant({
    name = '',
    cardText = '',
    profileText = '',
    website = '',
    keyword = '',
} = {}) {
    const blob = `${name}\n${cardText}\n${profileText}\n${website}`;
    if (!blob.trim()) return false;
    return textHasKeywordEvidence(blob, keyword) && (
        GENERIC_BUSINESS_HINT.test(blob)
        || Boolean(extractExternalWebsite(blob))
        || /knx|dali|integrator|architect|interior|\bav\b|security|lighting|automation/i.test(blob)
    );
}

export function detectPlatformChallenge(pageText = '', pageUrl = '') {
    const t = `${pageUrl}\n${pageText}`.toLowerCase();
    if (/\/checkpoint|confirm you.?re human|unusual activity|temporarily blocked|suspicious activity|enter the characters|security check|captcha|we suspended/i.test(t)) {
        return 'platform_challenge';
    }
    return '';
}

export function instagramHashtagCandidates(keyword = '') {
    const kw = String(keyword || '').trim().toLowerCase().replace(/^#/, '');
    const collapsed = kw.replace(/\s+/g, '');
    const out = new Set();
    if (collapsed) out.add(collapsed);
    if (/home\s*automation/i.test(kw)) {
        out.add('homeautomation');
        out.add('smarthome');
        out.add('homeautomationindia');
    }
    return [...out].slice(0, 4);
}

export function displayNameFromSocialText(text = '', fallback = '') {
    const lines = String(text || '').split('\n').map((l) => l.trim()).filter(Boolean);
    for (const line of lines) {
        if (/^\(\d+\+?\)/.test(line)) continue;
        if (/^(facebook|instagram|home|watch|marketplace|groups|explore)$/i.test(line)) continue;
        if (/followers?|following|^message$|^follow$|^join$/i.test(line)) continue;
        if (line.length >= 3 && line.length <= 90) return line.slice(0, 200);
    }
    const cleaned = String(fallback || '')
        .replace(/^\(\d+\+?\)\s*/i, '')
        .replace(/\s*\|\s*Facebook$/i, '')
        .replace(/\s*\(@.+\)\s*$/i, '')
        .trim();
    return (!cleaned || /^facebook$/i.test(cleaned)) ? '' : cleaned.slice(0, 200);
}

export function facebookGroupNameCloseness(name = '', keyword = '') {
    const n = String(name || '').toLowerCase().replace(/\s+/g, ' ').trim();
    const kw = String(keyword || '').toLowerCase().replace(/\s+/g, ' ').trim();
    if (!kw || !n) return 0;
    if (n === kw) return 40;
    if (n === `${kw} group` || n === `${kw} groups`) return 32;
    if (n.startsWith(`${kw} `) || n.startsWith(kw)) return 22;
    if (n.includes(kw)) return 10;
    return 0;
}

export function facebookGroupGeoPenalty(name = '', keyword = '') {
    const n = String(name || '').toLowerCase();
    const kw = String(keyword || '').toLowerCase();
    const extras = ['uk', 'usa', 'u.s.', 'india', 'australia', 'canada', 'europe'];
    let penalty = 0;
    for (const geo of extras) {
        if (new RegExp(`\\b${geo.replace('.', '\\.')}\\b`, 'i').test(n) && !new RegExp(`\\b${geo.replace('.', '\\.')}\\b`, 'i').test(kw)) {
            penalty += 18;
        }
    }
    return penalty;
}

export function rankFacebookGroups(groups = [], keyword = '') {
    const scored = (groups || []).map((g) => {
        const blob = `${g.name || ''} ${g.cardText || ''} ${g.pageUrl || ''}`.toLowerCase();
        let score = facebookGroupNameCloseness(g.name, keyword);
        if (textHasKeywordEvidence(blob, keyword)) score += 3;
        if (/home automation|smart home|knx|dali|smarthome/i.test(blob)) score += 2;
        if (/public group/i.test(blob)) score += 2;
        score -= facebookGroupGeoPenalty(g.name, keyword);
        const memberRaw = String(g.cardText || '').match(/([\d.,]+[KkMm]?)\s*members?/i);
        if (memberRaw) {
            const raw = String(memberRaw[1]).replace(/,/g, '');
            const mm = raw.match(/^([\d.]+)([KkMm])?$/);
            if (mm) {
                const n = Number(mm[1]) * ((mm[2] === 'K' || mm[2] === 'k') ? 1000 : (mm[2] === 'M' || mm[2] === 'm') ? 1e6 : 1);
                score += Math.min(6, n / 2000);
            }
        }
        if (/private|secret/i.test(blob) && !/public/i.test(blob)) score -= 1;
        return { group: g, score };
    }).sort((a, b) => b.score - a.score);
    return scored.filter((s) => s.score > 0).map((s) => s.group);
}

export function pickRelevantFacebookGroup(groups = [], keyword = '') {
    const ranked = rankFacebookGroups(groups, keyword);
    return ranked[0] || groups[0] || null;
}

export function pickRelevantFacebookPage(pages = [], keyword = '') {
    const kw = String(keyword || '').toLowerCase();
    const scored = (pages || []).map((p) => {
        const blob = `${p.name || ''} ${p.cardText || ''} ${p.pageUrl || ''} ${p.title || ''}`.toLowerCase();
        let score = 0;
        if (kw && blob.includes(kw)) score += 3;
        if (/home automation|smart home|nuos|knx|dali/i.test(blob)) score += 3;
        if (/nuos/i.test(blob)) score += 4;
        return { page: p, score };
    }).sort((a, b) => b.score - a.score);
    return scored[0]?.score > 0 ? scored[0].page : (pages[0] || null);
}
