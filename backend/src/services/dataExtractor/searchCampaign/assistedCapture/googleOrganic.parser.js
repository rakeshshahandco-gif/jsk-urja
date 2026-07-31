/**
 * Google organic SERP parser for Assisted Capture (HTML string, no live network).
 * Keeps sponsored / PAA / related / map / shopping exclusions strict.
 */

function stripScriptsStyles(html) {
    return String(html || '')
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ');
}

function decodeHtml(s = '') {
    return String(s)
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/\s+/g, ' ')
        .trim();
}

function decodeHref(value) {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
}

function looksBlockedContainer(s = '') {
    const x = String(s || '').toLowerCase();
    return x.includes('data-sponsored="1"')
        || x.includes("data-sponsored='1'")
        || x.includes('ads-ad')
        || x.includes('commercial-unit')
        || x.includes('data-paa="1"')
        || x.includes("data-paa='1'")
        || x.includes('people also ask')
        || x.includes('data-related="1"')
        || x.includes("data-related='1'")
        || x.includes('data-kp="1"')
        || x.includes("data-kp='1'")
        || x.includes('knowledge-panel')
        || x.includes('data-local="1"')
        || x.includes("data-local='1'")
        || x.includes('map-pack')
        || x.includes('data-video="1"')
        || x.includes("data-video='1'")
        || x.includes('data-news="1"')
        || x.includes("data-news='1'")
        || x.includes('data-shopping="1"')
        || x.includes("data-shopping='1'");
}

function extractBalancedDivs(html, openRx) {
    const out = [];
    const rx = openRx;
    let m;
    while ((m = rx.exec(html)) != null) {
        const attrs = m[1] || '';
        const contentStart = rx.lastIndex;
        let depth = 1;
        let i = contentStart;
        while (i < html.length && depth > 0) {
            const slice = html.slice(i);
            const nextOpen = slice.search(/<div\b/i);
            const nextClose = slice.search(/<\/div>/i);
            if (nextClose < 0) break;
            if (nextOpen >= 0 && nextOpen < nextClose) {
                depth += 1;
                i += nextOpen + 4;
                continue;
            }
            depth -= 1;
            if (depth === 0) {
                out.push({ attrs, inner: html.slice(contentStart, i + nextClose) });
                break;
            }
            i += nextClose + 6;
        }
        if (out.length >= 300) break;
    }
    return out;
}

function extractOrganicMarkerCards(html) {
    return extractBalancedDivs(
        html,
        /<div\b([^>]*\bdata-organic\s*=\s*(["'])1\2[^>]*)>/gi,
    );
}

function extractLiveGCards(html) {
    return extractBalancedDivs(
        html,
        /<div\b([^>]*\bclass\s*=\s*(["'])[^"']*\bg\b[^"']*\2[^>]*)>/gi,
    );
}

/** Modern SERP wrappers that often omit classic class="g". */
function extractModernResultCards(html) {
    return extractBalancedDivs(
        html,
        /<div\b([^>]*(?:\bdata-hveid\s*=|\bclass\s*=\s*(["'])[^"']*\b(?:MjjYud|hlcw0c|N54PNb)\b[^"']*\2)[^>]*)>/gi,
    );
}

function pickCardAnchorAndTitle(innerHtml) {
    const anchorRx = /<a\b[^>]*href\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi;
    let m;
    while ((m = anchorRx.exec(innerHtml || '')) != null) {
        const href = decodeHtml(m[2] || '');
        const body = m[3] || '';
        const h3 = /<h3\b[^>]*>([\s\S]*?)<\/h3>/i.exec(body);
        if (!h3) continue;
        const title = decodeHtml((h3[1] || '').replace(/<[^>]+>/g, ' '));
        return { href, title };
    }
    return null;
}

function pickSnippet(innerHtml) {
    const patterns = [
        /<(?:div|span)[^>]*data-snippet\s*=\s*(["'])1\1[^>]*>([\s\S]*?)<\/(?:div|span)>/i,
        /<(?:div|span)[^>]*class\s*=\s*(["'])[^"']*\b(?:VwiC3b|IsZvec|aCOpRe)\b[^"']*\1[^>]*>([\s\S]*?)<\/(?:div|span)>/i,
    ];
    for (const rx of patterns) {
        const m = rx.exec(innerHtml || '');
        if (m) return decodeHtml((m[2] || '').replace(/<[^>]+>/g, ' ')).slice(0, 5000);
    }
    return '';
}

function normalizeResultUrl(rawHref) {
    const href = String(rawHref || '').trim();
    if (!href) return '';
    if (/^javascript:/i.test(href)) return '';
    if (href.startsWith('/url?')) {
        try {
            const u = new URL(`https://www.google.com${href}`);
            const q = u.searchParams.get('q');
            if (q) return normalizeResultUrl(decodeHref(q));
        } catch {
            return '';
        }
        return '';
    }
    if (!/^https?:\/\//i.test(href)) return '';
    try {
        const u = new URL(href);
        const host = u.hostname.toLowerCase();
        if (
            host === 'google.com'
            || host.endsWith('.google.com')
            || host === 'google.co.in'
            || host.endsWith('.google.co.in')
        ) {
            return '';
        }
        return u.toString();
    } catch {
        return '';
    }
}

function pushResult(results, seen, { title, snippet, resultUrl }) {
    const url = String(resultUrl || '');
    if (!url || seen.has(url)) return false;
    const cleanTitle = String(title || '').trim();
    if (!cleanTitle || cleanTitle.length < 2) return false;
    if (/^cached$|^similar$/i.test(cleanTitle)) return false;
    seen.add(url);
    results.push({
        title: cleanTitle.slice(0, 500),
        snippet: String(snippet || '').slice(0, 5000),
        resultUrl: url,
        resultPosition: results.length + 1,
        resultTypeHint: 'unknown',
    });
    return true;
}

function harvestCards(cards, results, seen, stats) {
    for (const card of cards) {
        stats.candidateCards += 1;
        const blob = `${card.attrs || ''} ${card.inner || ''}`;
        if (looksBlockedContainer(blob)) {
            stats.excludedBlocked += 1;
            continue;
        }
        if (/data-organic\s*=\s*(["'])0\1/i.test(card.attrs || '')) {
            stats.excludedOrganicOff += 1;
            continue;
        }
        const picked = pickCardAnchorAndTitle(card.inner);
        if (!picked) {
            stats.excludedNoTitleAnchor += 1;
            continue;
        }
        const url = normalizeResultUrl(picked.href);
        if (!url) {
            stats.excludedBadUrl += 1;
            continue;
        }
        const ok = pushResult(results, seen, {
            title: picked.title,
            snippet: pickSnippet(card.inner),
            resultUrl: url,
        });
        if (ok) stats.accepted += 1;
        else stats.excludedDedupeOrTitle += 1;
        if (results.length >= 100) break;
    }
}

/**
 * Captcha must be a real interstitial — NOT mere presence of "recaptcha" scripts
 * that appear on normal Google SERP pages.
 */
export function detectPageKind(html) {
    const s = String(html || '').toLowerCase();
    if (!s.trim()) return 'unsupported';

    const hasOrganicMarkers = s.includes('id="search"')
        || s.includes("id='search'")
        || s.includes('id="rso"')
        || s.includes("id='rso'")
        || s.includes('data-organic="1"')
        || (s.includes('class="g"') && s.includes('<h3'))
        || (s.includes('/url?q=') && s.includes('<h3'));

    if (s.includes('consent.google') || s.includes('before you continue')) return 'consent';

    const hardCaptcha = s.includes('our systems have detected unusual traffic')
        || s.includes('/sorry/index')
        || s.includes('id="captcha-form"')
        || (s.includes('/sorry/') && (s.includes('unusual traffic') || s.includes('captcha')));
    if (hardCaptcha && !hasOrganicMarkers) return 'captcha';

    if (
        (s.includes('accounts.google.com') && (s.includes('signin') || s.includes('sign in')))
        || s.includes('sign in to continue')
    ) {
        if (!hasOrganicMarkers) return 'login';
    }

    if (hasOrganicMarkers) return 'organic';
    if (hardCaptcha) return 'captcha';
    return 'unsupported';
}

export function parseGoogleOrganicResults(html) {
    const pageKind = detectPageKind(html);
    const stats = {
        pageKind,
        candidateCards: 0,
        excludedBlocked: 0,
        excludedOrganicOff: 0,
        excludedNoTitleAnchor: 0,
        excludedBadUrl: 0,
        excludedDedupeOrTitle: 0,
        accepted: 0,
    };

    if (pageKind !== 'organic') {
        return {
            results: [],
            status: 'unsupported_layout',
            message: `Page kind: ${pageKind}`,
            pageKind,
            diagnostics: stats,
        };
    }

    const results = [];
    const seen = new Set();
    const safeHtml = stripScriptsStyles(html);

    harvestCards(extractOrganicMarkerCards(safeHtml), results, seen, stats);

    if (!results.length) {
        harvestCards(extractLiveGCards(safeHtml), results, seen, stats);
    }

    if (!results.length) {
        harvestCards(extractModernResultCards(safeHtml), results, seen, stats);
    }

    if (!results.length) {
        return {
            results: [],
            status: 'unsupported_layout',
            message: 'No organic results extracted',
            pageKind,
            diagnostics: stats,
        };
    }
    return {
        results,
        status: 'completed',
        message: 'Organic results parsed',
        pageKind,
        diagnostics: stats,
    };
}

export const extractVisibleOrganicFromDocumentHtml = parseGoogleOrganicResults;
