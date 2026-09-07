import { runAssistedPortalCapture } from './assistedPortalCapture.js';

function assert360Url(raw) {
    const u = new URL(String(raw || ''));
    const host = String(u.hostname || '').toLowerCase();
    const ok = host === 'so.com' || host === 'www.so.com';
    if (!ok || !u.pathname.startsWith('/s')) {
        throw new Error('Only 360 Search URLs are allowed for assisted 360 capture');
    }
}

export function detect360PageKind(html, url = '') {
    const s = String(html || '').toLowerCase();
    const u = String(url || '').toLowerCase();
    if (/captcha|waf|滑动验证|请输入验证码|seccode|verifycode/.test(s) || /captcha|waf/.test(u)) {
        return 'captcha';
    }
    if (/login|登录|passport/.test(s) && !/res-list|res-title/.test(s)) return 'login';
    if (s.includes('res-list') || s.includes('res-title') || s.includes('id="main"')) {
        return 'organic';
    }
    return 'unsupported';
}

export function build360ExtractionScript() {
    return () => {
        const out = [];
        const seen = new Set();
        const nodes = document.querySelectorAll('.res-list, li.res-list, #main .result, .result');
        nodes.forEach((card, idx) => {
            const a = card.querySelector('h3 a, .res-title a, a[data-mdurl], a[href]');
            if (!a) return;
            const title = (a.textContent || '').trim();
            let href = a.getAttribute('data-mdurl') || a.href || a.getAttribute('href') || '';
            if (!title || title.length < 2) return;
            if (!href || /javascript:/i.test(href) || /so\.com\/s\?/i.test(href)) return;
            if (seen.has(href)) return;
            seen.add(href);
            const sn = card.querySelector('.res-desc, .res-rich, p, [class*="desc"]');
            const snippet = ((sn && sn.textContent) || '').trim().slice(0, 5000);
            let resultTypeHint = 'unknown';
            const blob = `${title} ${snippet} ${href}`.toLowerCase();
            if (/1688\.com|alibaba/.test(blob)) resultTypeHint = 'marketplace_supplier';
            else if (/tianyancha|qcc\.com|baike/.test(blob)) resultTypeHint = 'directory';
            else if (/zhihu|tieba|bbs/.test(blob)) resultTypeHint = 'article';
            else if (/news|sohu|sina/.test(blob)) resultTypeHint = 'article';
            else if (/job|zhipin|51job/.test(blob)) resultTypeHint = 'job';
            else if (/产品|模组|模块|detail/.test(blob)) resultTypeHint = 'product_listing';
            else if (/公司|科技|厂家|工厂|供应商/.test(blob)) resultTypeHint = 'company';
            out.push({
                title: title.slice(0, 500),
                snippet,
                resultUrl: href,
                resultPosition: idx + 1,
                resultTypeHint,
            });
        });
        return {
            pageKind: out.length ? 'organic' : 'unsupported',
            parserStatus: out.length ? 'completed' : 'unsupported_layout',
            results: out,
            message: out.length ? '' : 'No 360 Search organic result cards found',
        };
    };
}

export async function runAssisted360Capture(page, session, opts = {}) {
    return runAssistedPortalCapture(page, session, {
        ...opts,
        sourceLabel: '360 Search',
        assertUrl: assert360Url,
        detectPageKind: detect360PageKind,
        extractScript: build360ExtractionScript(),
    });
}
