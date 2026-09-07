import { runAssistedPortalCapture } from './assistedPortalCapture.js';

function assertSogouUrl(raw) {
    const u = new URL(String(raw || ''));
    const host = String(u.hostname || '').toLowerCase();
    const ok = host === 'sogou.com' || host === 'www.sogou.com';
    if (!ok || !u.pathname.startsWith('/web')) {
        throw new Error('Only Sogou Search URLs are allowed for assisted Sogou capture');
    }
}

export function detectSogouPageKind(html, url = '') {
    const s = String(html || '').toLowerCase();
    const u = String(url || '').toLowerCase();
    if (/antispider|seccode|captcha|滑动验证|请输入验证码|waf/.test(s) || /antispider|seccode/.test(u)) {
        return 'captcha';
    }
    if (/login|登录|passport/.test(s) && !/vrwrap|results/.test(s)) return 'login';
    if (s.includes('vrwrap') || s.includes('vr-title') || s.includes('class="rb"') || s.includes('id="main"')) {
        return 'organic';
    }
    return 'unsupported';
}

export function buildSogouExtractionScript() {
    return () => {
        const out = [];
        const seen = new Set();
        const nodes = document.querySelectorAll('.vrwrap, .rb, #main .vrwrap, .results .rb, .result');
        nodes.forEach((card, idx) => {
            const a = card.querySelector('h3 a, .vr-title a, .vrTitle a, a[href]');
            if (!a) return;
            const title = (a.textContent || '').trim();
            let href = a.href || a.getAttribute('href') || '';
            if (!title || title.length < 2) return;
            if (!href || /javascript:/i.test(href) || /sogou\.com\/(web|sogou)/i.test(href)) return;
            if (seen.has(href)) return;
            seen.add(href);
            const sn = card.querySelector('.str-info, .str_info, .fz-mid, [class*="str-text"], p');
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
            message: out.length ? '' : 'No Sogou organic result cards found',
        };
    };
}

export async function runAssistedSogouCapture(page, session, opts = {}) {
    return runAssistedPortalCapture(page, session, {
        ...opts,
        sourceLabel: 'Sogou',
        assertUrl: assertSogouUrl,
        detectPageKind: detectSogouPageKind,
        extractScript: buildSogouExtractionScript(),
    });
}
