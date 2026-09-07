import { runAssistedPortalCapture } from './assistedPortalCapture.js';

function assertBaiduUrl(raw) {
    const u = new URL(String(raw || ''));
    const host = String(u.hostname || '').toLowerCase();
    const ok = host === 'baidu.com' || host === 'www.baidu.com' || host === 'm.baidu.com';
    if (!ok || !u.pathname.includes('/s')) {
        throw new Error('Only Baidu Search URLs are allowed for assisted Baidu capture');
    }
}

export function detectBaiduPageKind(html, url = '') {
    const s = String(html || '').toLowerCase();
    const u = String(url || '').toLowerCase();
    if (/wappass\.baidu|\/passport|安全验证|请输入验证码|id="captcha/.test(s) || /wappass\.baidu/.test(u)) {
        return 'captcha';
    }
    if (/login|登录|passport\.baidu/.test(s) && !s.includes('content_left')) return 'login';
    if (s.includes('content_left') || s.includes('result-op') || s.includes('c-container')) return 'organic';
    return 'unsupported';
}

export function buildBaiduExtractionScript() {
    return () => {
        const out = [];
        const seen = new Set();
        const nodes = document.querySelectorAll('#content_left .result, #content_left .c-container, .result-op');
        nodes.forEach((card, idx) => {
            const a = card.querySelector('h3 a, a[data-click], .t a');
            if (!a) return;
            const title = (a.textContent || '').trim();
            let href = a.href || a.getAttribute('href') || '';
            if (!title || title.length < 2) return;
            if (!href || /javascript:/i.test(href)) return;
            if (seen.has(href)) return;
            seen.add(href);
            const sn = card.querySelector('.c-abstract, .content-right_8ZsFk, [class*="abstract"]');
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
            message: out.length ? '' : 'No Baidu organic result cards found',
        };
    };
}

export async function runAssistedBaiduCapture(page, session, opts = {}) {
    return runAssistedPortalCapture(page, session, {
        ...opts,
        sourceLabel: 'Baidu',
        assertUrl: assertBaiduUrl,
        detectPageKind: detectBaiduPageKind,
        extractScript: buildBaiduExtractionScript(),
    });
}
