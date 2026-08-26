/**
 * Extract original Chinese business fields from public HTML. Never invents values.
 */
import {
    CJK_RE,
    MANUFACTURER_EVIDENCE_NEEDLES,
    PAGE_KIND,
    PRIORITY_LINK_TEXT,
    PRIORITY_PATH_HINTS,
} from './constants.js';
import { extractPublicEmail, extractPublicPhone, extractPublicWeChat } from '../simpleLeadSearch/chinaBilingual.util.js';

export function htmlToVisibleText(html) {
    return String(html || '')
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/\s+/g, ' ')
        .trim();
}

export function isLikelyChineseBusinessText(text) {
    const s = String(text || '');
    if (!CJK_RE.test(s)) return false;
    if (/[\u3040-\u30ff]/.test(s) && !/有限公司|厂家|模组/.test(s)) return false;
    return /有限公司|股份有限|厂家|制造商|模组|模块|供应商|深圳|东莞|广州|杭州|宁波|生产厂家|科技有限/.test(s);
}

export function hasChineseOriginal(text) {
    return CJK_RE.test(String(text || ''));
}

export function classifyPageKind(url, linkText = '') {
    const path = (() => {
        try { return new URL(url).pathname.toLowerCase(); } catch { return String(url || '').toLowerCase(); }
    })();
    const blob = `${path} ${linkText}`.toLowerCase();
    if (/contact|lxwm|lianxi|联系/.test(blob)) return PAGE_KIND.CONTACT;
    if (/about|gsjj|gsjs|公司简介|关于我们/.test(blob)) return PAGE_KIND.ABOUT;
    if (/certif|zizhi|rongyu|资质|证书|荣誉/.test(blob)) return PAGE_KIND.CERTIFICATION;
    if (/factory|manufactur|生产|工厂|制造/.test(blob)) return PAGE_KIND.FACTORY;
    if (/product-detail|\/item|产品详情/.test(blob)) return PAGE_KIND.PRODUCT_DETAIL;
    if (/product|chanpin|产品/.test(blob)) return PAGE_KIND.PRODUCTS;
    if (path === '/' || path === '') return PAGE_KIND.HOME;
    return PAGE_KIND.OTHER;
}

export function extractChineseCompanyName(html, pageUrl = '') {
    const text = htmlToVisibleText(html);
    const title = (() => {
        const m = String(html || '').match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        return m ? htmlToVisibleText(m[1]) : '';
    })();
    const labelled = text.match(/(?:公司名称|企业名称|版权所有)\s*[:：]?\s*([\u3400-\u9fffA-Za-z0-9·（）()]{4,80}(?:股份)?有限公司)/);
    if (labelled?.[1] && CJK_RE.test(labelled[1])) return labelled[1].trim().slice(0, 180);

    const copyrights = [...text.matchAll(/©[^\u3400-\u9fff©\n]{0,24}([\u3400-\u9fff]{4,40}(?:股份)?有限公司)/g)];
    if (copyrights.length) return copyrights[copyrights.length - 1][1].trim().slice(0, 180);

    const titleCo = title.match(/([\u3400-\u9fff]{2,40}(?:股份)?有限公司)/);
    if (titleCo?.[1]) return titleCo[1].trim().slice(0, 180);

    return '';
}

export function extractManufacturerEvidenceSnippet(text) {
    const s = String(text || '');
    for (const needle of MANUFACTURER_EVIDENCE_NEEDLES) {
        const idx = s.toLowerCase().indexOf(String(needle).toLowerCase());
        if (idx >= 0) {
            const start = Math.max(0, idx - 24);
            return s.slice(start, start + 160).replace(/\s+/g, ' ').trim();
        }
    }
    return '';
}

export function extractChinaContacts(html) {
    const text = htmlToVisibleText(html);
    const wechat = extractPublicWeChat(text);
    const labelledPhone = text.match(/(?:电话|手机|联系电话|Tel(?:ephone)?|Phone)[:：\s]*((?:\+?86[-\s]?)?1[3-9]\d{9}|0\d{2,3}[-\s]?\d{7,8})/i);
    const phone = labelledPhone ? labelledPhone[1].replace(/\s+/g, '') : '';
    const email = extractPublicEmail(text);
    const person = (() => {
        const m = text.match(/联系人[:：]\s*([\u3400-\u9fffA-Za-z·]{2,20})/);
        return m ? m[1].trim() : '';
    })();
    const address = (() => {
        const m = text.match(/(?:公司地址|地址)[:：]\s*([\u3400-\u9fffA-Za-z0-9#\-号室楼层区市镇乡路街巷]{8,120})/);
        return m ? m[1].trim() : '';
    })();
    return { wechat, phone, email, person, address };
}

export function discoverPriorityLinks(html, baseUrl, max = 12) {
    const found = [];
    const re = /<a\s[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let m;
    const s = String(html || '');
    while ((m = re.exec(s)) !== null) {
        let href = m[1].trim();
        const label = htmlToVisibleText(m[2]).slice(0, 80);
        if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) continue;
        let abs;
        try {
            abs = new URL(href, baseUrl);
        } catch {
            continue;
        }
        if (!['http:', 'https:'].includes(abs.protocol)) continue;
        const path = abs.pathname.toLowerCase();
        const labelLow = label.toLowerCase();
        const pathHit = PRIORITY_PATH_HINTS.some((h) => path.includes(h.replace(/^\//, '')) || path === h);
        const textHit = PRIORITY_LINK_TEXT.some((t) => labelLow.includes(String(t).toLowerCase()));
        if (!pathHit && !textHit) continue;
        const kind = classifyPageKind(abs.href, label);
        const score = (kind === PAGE_KIND.CONTACT ? 50 : 0)
            + (kind === PAGE_KIND.ABOUT ? 40 : 0)
            + (kind === PAGE_KIND.PRODUCTS ? 30 : 0)
            + (kind === PAGE_KIND.FACTORY ? 35 : 0)
            + (kind === PAGE_KIND.CERTIFICATION ? 25 : 0)
            + (textHit ? 10 : 0);
        found.push({ url: `${abs.origin}${abs.pathname}`, label, kind, score });
    }
    found.sort((a, b) => b.score - a.score);
    const seen = new Set();
    const out = [];
    for (const item of found) {
        const key = item.url.replace(/\/$/, '').toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(item);
        if (out.length >= max) break;
    }
    return out;
}

export function extractChinaPage(html, pageUrl) {
    const text = htmlToVisibleText(html).slice(0, 20000);
    const companyNameOriginal = extractChineseCompanyName(html, pageUrl);
    const contacts = extractChinaContacts(html);
    const manufacturerEvidence = extractManufacturerEvidenceSnippet(text);
    const kind = classifyPageKind(pageUrl);
    return {
        pageKind: kind,
        companyNameOriginal,
        hasChineseOriginal: hasChineseOriginal(`${companyNameOriginal} ${text.slice(0, 400)}`),
        evidenceOriginal: CJK_RE.test(text) ? text.slice(0, 400) : '',
        manufacturerEvidence,
        ...contacts,
        candidateLinks: discoverPriorityLinks(html, pageUrl),
    };
}
