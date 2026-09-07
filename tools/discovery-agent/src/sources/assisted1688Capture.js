import { runAssistedPortalCapture } from './assistedPortalCapture.js';

function assert1688Url(raw) {
    const u = new URL(String(raw || ''));
    const host = String(u.hostname || '').toLowerCase();
    if (!host.includes('1688.com')) {
        throw new Error('Only 1688 URLs are allowed for assisted 1688 capture');
    }
}

export function detect1688PageKind(html, url = '') {
    const s = String(html || '').toLowerCase();
    const u = String(url || '').toLowerCase();
    if (/punish|nc_wrapper|滑块|请完成验证|captcha|_____tmd_____|x5sec/.test(s)) return 'captcha';
    if (/login\.1688|login\.taobao|login\.alibaba|passport/.test(u) || /请登录|login-form/.test(s)) {
        if (!/offer|product|s\.html/.test(s)) return 'login';
    }
    if (/offer|space-offer|list-item|s\.html|1688\.com/.test(s)) return 'organic';
    return 'unsupported';
}

export function build1688ExtractionScript() {
    return () => {
        const out = [];
        const seen = new Set();
        const cards = document.querySelectorAll(
            'a[href*="detail.1688.com"], a[href*="offer"], .space-offer-card, .offer-list-row, [class*="offer-item"]',
        );
        cards.forEach((el, idx) => {
            const a = el.tagName === 'A' ? el : el.querySelector('a[href]');
            if (!a) return;
            const href = a.href || a.getAttribute('href') || '';
            if (!href || seen.has(href)) return;
            if (!/1688\.com/i.test(href)) return;
            seen.add(href);
            const titleEl = el.querySelector('.title, .offer-title, [class*="title"]') || a;
            const title = (titleEl.textContent || a.getAttribute('title') || '').trim();
            if (!title || title.length < 2) return;
            const shopEl = el.querySelector('.company-name, .seller-name, [class*="company"], [class*="shop"]');
            const shop = ((shopEl && shopEl.textContent) || '').trim();
            const locEl = el.querySelector('[class*="address"], [class*="location"], .area');
            const loc = ((locEl && locEl.textContent) || '').trim();
            const snippet = [shop, loc, title].filter(Boolean).join(' · ').slice(0, 5000);
            out.push({
                title: (shop || title).slice(0, 500),
                snippet,
                resultUrl: href,
                resultPosition: idx + 1,
                resultTypeHint: 'marketplace_supplier',
                sourceRecordId: href.slice(0, 300),
            });
        });
        return {
            pageKind: out.length ? 'organic' : 'unsupported',
            parserStatus: out.length ? 'completed' : 'unsupported_layout',
            results: out.slice(0, 100),
            message: out.length ? '' : 'No visible 1688 offer cards found',
        };
    };
}

export async function runAssisted1688Capture(page, session, opts = {}) {
    return runAssistedPortalCapture(page, session, {
        ...opts,
        sourceLabel: '1688',
        assertUrl: assert1688Url,
        detectPageKind: detect1688PageKind,
        extractScript: build1688ExtractionScript(),
    });
}
