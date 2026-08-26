/**
 * China bilingual helpers — original Chinese is never discarded.
 * English is a copy via glossary/heuristics. Optional OpenAI is not required.
 * Translation failure must never drop a captured result.
 */
import { classifyDestinationType } from '../chinaWebsiteCrawler/destinationType.util.js';

const GLOSSARY = Object.freeze([
    ['科技有限公司', 'Technology Co., Ltd.'],
    ['有限公司', 'Co., Ltd.'],
    ['股份有限公司', 'Co., Ltd.'],
    ['电子厂', 'Electronics Factory'],
    ['模组', 'module'],
    ['模块', 'module'],
    ['供应商', 'supplier'],
    ['制造商', 'manufacturer'],
    ['生产厂家', 'manufacturer'],
    ['厂家', 'factory'],
    ['工厂', 'factory'],
    ['经销商', 'distributor'],
    ['代理商', 'agent'],
    ['批发', 'wholesale'],
    ['涂鸦', 'Tuya'],
    ['蓝牙', 'Bluetooth'],
    ['深圳市', 'Shenzhen '],
    ['东莞市', 'Dongguan '],
    ['广州市', 'Guangzhou '],
    ['杭州市', 'Hangzhou '],
    ['宁波市', 'Ningbo '],
    ['广东省', 'Guangdong '],
    ['浙江省', 'Zhejiang '],
    ['宝安区', "Bao'an District "],
    ['南山区', 'Nanshan District '],
    ['龙华区', 'Longhua District '],
    ['龙岗区', 'Longgang District '],
    ['福田区', 'Futian District '],
    ['长安镇', "Chang'an Town "],
    ['深圳', 'Shenzhen'],
    ['东莞', 'Dongguan'],
    ['广州', 'Guangzhou'],
    ['杭州', 'Hangzhou'],
    ['宁波', 'Ningbo'],
]);

const MODEL_RE = /\b(BT2S|ZT2S|BTC|ZTC|BT\d[A-Z0-9]{0,6}|ZT\d[A-Z0-9]{0,6})\b/gi;

export function containsCjk(text) {
    return /[\u3400-\u9fff]/.test(String(text || ''));
}

export function translateChinaText(raw) {
    const original = String(raw || '').replace(/\s+/g, ' ').trim();
    if (!original) return '';
    if (!containsCjk(original)) return original;
    try {
        let out = original;
        for (const [zh, en] of GLOSSARY) {
            if (out.includes(zh)) out = out.split(zh).join(en);
        }
        out = out.replace(/\s+/g, ' ').trim();
        if (!out || out === original) return original;
        return out.slice(0, 500);
    } catch {
        return original;
    }
}

export function extractMatchedModels(text, relatedKeyword = '') {
    const found = new Set();
    const rel = String(relatedKeyword || '').trim();
    if (rel) found.add(rel.toUpperCase());
    const blob = String(text || '');
    let m;
    const re = new RegExp(MODEL_RE.source, 'gi');
    while ((m = re.exec(blob))) {
        found.add(String(m[1] || '').toUpperCase());
    }
    return [...found];
}

export function extractPublicWeChat(text) {
    const s = String(text || '');
    const m = s.match(/(?:微信|微信号|WeChat|wechat)[:：\s]*([A-Za-z][A-Za-z0-9_-]{4,19})/i);
    if (!m) return '';
    const id = String(m[1] || '').trim();
    if (/^1[3-9]\d{9}$/.test(id)) return '';
    if (/^(email|whatsapp|wechat|phone|contact|tel|fax|id|login|register)$/i.test(id)) return '';
    return id;
}

export function extractPublicPhone(text) {
    const s = String(text || '');
    const mobile = s.match(/1[3-9]\d{9}/);
    if (mobile) return mobile[0];
    const land = s.match(/0\d{2,3}-?\d{7,8}/);
    return land ? land[0] : '';
}

export function extractPublicEmail(text) {
    const m = String(text || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    return m ? m[0] : '';
}

export function inferChinaPlace(text) {
    const s = String(text || '');
    const cities = [
        ['深圳', 'Shenzhen', 'Guangdong'],
        ['东莞', 'Dongguan', 'Guangdong'],
        ['广州', 'Guangzhou', 'Guangdong'],
        ['杭州', 'Hangzhou', 'Zhejiang'],
        ['宁波', 'Ningbo', 'Zhejiang'],
        ['Shenzhen', 'Shenzhen', 'Guangdong'],
        ['Dongguan', 'Dongguan', 'Guangdong'],
    ];
    for (const [needle, city, province] of cities) {
        if (s.includes(needle)) return { city, province };
    }
    return { city: '', province: '' };
}

export function classifyChinaResultType({ url = '', title = '', snippet = '', source = '' } = {}) {
    const u = String(url || '').toLowerCase();
    const blob = `${title} ${snippet}`;
    if (/1688\.com|alibaba\.com|made-in-china\.com/.test(u)) return 'marketplace_supplier';
    if (/tianyancha|qcc\.com|qichacha|aiqicha|baike/.test(u)) return 'directory';
    if (/zhihu\.com|tieba\.baidu|bbs\.|forum/.test(u)) return 'article';
    if (/news|sohu\.com|sina\.com|163\.com\/news/.test(u)) return 'article';
    if (/job|zhipin|51job|liepin/.test(u)) return 'job';
    if (/\/product|item\.|detail\./.test(u) || /模组|模块|产品/.test(blob)) return 'product_listing';
    if (/公司|科技|厂家|工厂|供应商/.test(blob)) return 'company';
    if (String(source || '').toLowerCase() === '1688') return 'marketplace_supplier';
    return 'unknown';
}

export function matchQuality({ title = '', snippet = '', relatedKeyword = '' } = {}) {
    const blob = `${title} ${snippet}`;
    const models = extractMatchedModels(blob, '');
    const rel = String(relatedKeyword || '').trim().toUpperCase();
    if (rel && models.includes(rel)) return 'exact_model';
    if (models.length) return 'exact_model';
    if (/涂鸦|tuya/i.test(blob) && /模组|模块|module/i.test(blob)) return 'related_tuya';
    return 'other';
}

/**
 * Compact bilingual payload for RawCapture.notes (max 2000).
 * Original Chinese stays in title/snippet fields.
 */
export function packChinaNotes(payload = {}) {
    const obj = {
        v: 1,
        lang: 'zh',
        src: String(payload.sourceName || '').slice(0, 12),
        o: String(payload.companyNameOriginal || payload.titleOriginal || '').slice(0, 180),
        e: String(payload.companyNameEnglish || '').slice(0, 180),
        so: String(payload.evidenceOriginal || payload.snippetOriginal || '').slice(0, 240),
        se: String(payload.evidenceEnglish || '').slice(0, 240),
        ao: String(payload.addressOriginal || '').slice(0, 160),
        ae: String(payload.addressEnglish || '').slice(0, 160),
        m: Array.isArray(payload.matchedModels) ? payload.matchedModels.slice(0, 6) : [],
        q: String(payload.sourceQuery || '').slice(0, 80),
        wx: String(payload.wechat || '').slice(0, 40),
        ph: String(payload.phone || '').slice(0, 24),
        em: String(payload.email || '').slice(0, 80),
        city: String(payload.city || '').slice(0, 40),
        prov: String(payload.province || '').slice(0, 40),
        mq: String(payload.matchQuality || '').slice(0, 24),
        cls: String(payload.resultClass || '').slice(0, 32),
        vs: String(payload.verificationStatus || '').slice(0, 48),
        cf: Number.isFinite(Number(payload.confidence)) ? Number(payload.confidence) : 0,
        uc: String(payload.uscc || '').slice(0, 18),
        dd: String(payload.destinationDomain || '').slice(0, 80),
        dt: String(payload.destinationType || '').slice(0, 40),
        cs: String(payload.crawlStatus || '').slice(0, 24),
        hc: payload.hasChineseOriginal ? 1 : 0,
        pc: Number(payload.pagesCrawled || 0),
        thru: String(payload.discoveredThrough || payload.sourceName || '').slice(0, 16),
    };
    try {
        return JSON.stringify(obj).slice(0, 2000);
    } catch {
        return '';
    }
}

export function unpackChinaNotes(notes) {
    const raw = String(notes || '').trim();
    if (!raw.startsWith('{')) return null;
    try {
        const obj = JSON.parse(raw);
        if (!obj || obj.v !== 1) return null;
        return {
            companyNameOriginal: obj.o || '',
            companyNameEnglish: obj.e || '',
            evidenceOriginal: obj.so || '',
            evidenceEnglish: obj.se || '',
            addressOriginal: obj.ao || '',
            addressEnglish: obj.ae || '',
            matchedModels: Array.isArray(obj.m) ? obj.m : [],
            sourceQuery: obj.q || '',
            sourceName: obj.src || '',
            wechat: obj.wx || '',
            phone: obj.ph || '',
            email: obj.em || '',
            city: obj.city || '',
            province: obj.prov || '',
            matchQuality: obj.mq || '',
            resultClass: obj.cls || '',
            verificationStatus: obj.vs || '',
            confidence: Number(obj.cf || 0),
            uscc: obj.uc || '',
            destinationDomain: obj.dd || '',
            destinationType: obj.dt || '',
            crawlStatus: obj.cs || '',
            hasChineseOriginal: Boolean(obj.hc),
            pagesCrawled: Number(obj.pc || 0),
            discoveredThrough: obj.thru || obj.src || '',
        };
    } catch {
        return null;
    }
}

export function attachBilingualToRecord(record = {}, { sourceName = '', sourceQuery = '', relatedKeyword = '' } = {}) {
    const title = String(record.title || '').trim();
    const snippet = String(record.snippet || '').trim();
    const url = String(record.resultUrl || '');
    const originalName = title;
    const englishName = containsCjk(title) ? translateChinaText(title) : title;
    const evidenceEn = containsCjk(snippet) ? translateChinaText(snippet) : snippet;
    const place = inferChinaPlace(`${title} ${snippet}`);
    const models = extractMatchedModels(`${title} ${snippet} ${sourceQuery}`, relatedKeyword);
    const wechat = extractPublicWeChat(`${title} ${snippet}`);
    const phone = extractPublicPhone(`${title} ${snippet}`);
    const email = extractPublicEmail(`${title} ${snippet}`);
    const resultTypeHint = record.resultTypeHint && record.resultTypeHint !== 'unknown'
        ? record.resultTypeHint
        : classifyChinaResultType({ url, title, snippet, source: sourceName });
    const mq = matchQuality({ title, snippet, relatedKeyword });
    const uscc = extractUscc(`${title} ${snippet}`);
    const verificationStatus = classifyChinaSupplier({
        url, title, snippet, source: sourceName, uscc,
    });
    const confidence = scoreChinaSupplierConfidence({
        url, title, snippet, source: sourceName, models, uscc, phone, email, wechat, mq, verificationStatus,
    });
    const notes = packChinaNotes({
        sourceName,
        sourceQuery,
        companyNameOriginal: originalName,
        companyNameEnglish: englishName === originalName && containsCjk(originalName) ? '' : englishName,
        evidenceOriginal: snippet,
        evidenceEnglish: evidenceEn === snippet && containsCjk(snippet) ? '' : evidenceEn,
        matchedModels: models,
        wechat,
        phone,
        email,
        city: place.city,
        province: place.province,
        matchQuality: mq,
        resultClass: resultTypeHint,
        verificationStatus,
        confidence,
        uscc,
        destinationType: classifyDestinationType(url, { title, snippet }),
        discoveredThrough: sourceName,
        hasChineseOriginal: containsCjk(`${title} ${snippet}`),
    });
    return {
        ...record,
        title,
        snippet,
        resultTypeHint,
        notes,
        _china: {
            companyNameOriginal: originalName,
            companyNameEnglish: englishName,
            matchedModels: models,
            matchQuality: mq,
            wechat,
            phone,
            email,
            city: place.city,
            province: place.province,
            verificationStatus,
            confidence,
            uscc,
        },
    };
}

export const CHINA_SUPPLIER_STATUSES = Object.freeze([
    'VERIFIED_MANUFACTURER',
    'VERIFIED_TRADING_COMPANY',
    'VERIFIED_DISTRIBUTOR',
    'REGISTERED_BUSINESS_MANUFACTURING_NOT_PROVEN',
    'MARKETPLACE_SELLER_ONLY',
    'UNVERIFIED',
]);

const USCC_RE = /[0-9A-HJ-NPQRTUWXY]{2}\d{6}[0-9A-HJ-NPQRTUWXY]{10}/;

export function extractUscc(text) {
    const m = String(text || '').toUpperCase().match(USCC_RE);
    return m ? m[0] : '';
}

function isMarketplaceHost(url, source) {
    const u = String(url || '').toLowerCase();
    const src = String(source || '').toLowerCase();
    return /1688\.com|alibaba\.com|made-in-china\.com|globalsources\.com/.test(u)
        || src === '1688';
}

function isEnterpriseRegistryHost(url) {
    const u = String(url || '').toLowerCase();
    return /gsxt\.gov|aiqicha\.baidu|qcc\.com|qichacha|tianyancha\.com/.test(u);
}

/**
 * Evidence-based only. A marketplace listing never proves manufacturer status.
 * VERIFIED_* requires a Unified Social Credit Code on an enterprise-information page.
 */
export function classifyChinaSupplier({ url = '', title = '', snippet = '', source = '', uscc = '', businessScope = '' } = {}) {
    const blob = `${title} ${snippet} ${businessScope || ''}`;
    const code = uscc || extractUscc(blob);
    const registry = isEnterpriseRegistryHost(url);
    const marketplace = isMarketplaceHost(url, source);
    const mfg = /生产|制造|加工|工厂|厂家|manufacturer|factory/i.test(blob);
    const dist = /经销商|代理商|distributor/i.test(blob);
    const supplier = /供应商|supplier/i.test(blob);

    if (code && registry && mfg) return 'VERIFIED_MANUFACTURER';
    if (code && registry) return 'REGISTERED_MANUFACTURER';
    if (marketplace) return 'MARKETPLACE_SELLER_ONLY';
    if (mfg) return 'POTENTIAL_MANUFACTURER';
    if (dist) return 'DISTRIBUTOR';
    if (supplier) return 'SUPPLIER';
    return 'UNVERIFIED';
}

export function chinaSupplierStatusLabel(status) {
    return ({
        VERIFIED_MANUFACTURER: 'Verified Manufacturer',
        REGISTERED_MANUFACTURER: 'Registered Manufacturer',
        POTENTIAL_MANUFACTURER: 'Potential Manufacturer',
        DISTRIBUTOR: 'Distributor',
        SUPPLIER: 'Supplier',
        MARKETPLACE_SELLER_ONLY: 'Marketplace Seller Only',
        UNVERIFIED: 'Unverified',
        VERIFIED_TRADING_COMPANY: 'Verified Trading Company',
        VERIFIED_DISTRIBUTOR: 'Verified Distributor',
        REGISTERED_BUSINESS_MANUFACTURING_NOT_PROVEN: 'Registered Manufacturer',
    }[String(status || '')] || 'Unverified');
}

export function scoreChinaSupplierConfidence({
    url = '', title = '', snippet = '', source = '', models = [], uscc = '',
    phone = '', email = '', wechat = '', mq = '', verificationStatus = '',
} = {}) {
    let score = 10;
    if (mq === 'exact_model' || (Array.isArray(models) && models.length)) score += 20;
    if (uscc || extractUscc(`${title} ${snippet}`)) score += 18;
    if (isEnterpriseRegistryHost(url)) score += 12;
    if (/生产|制造|工厂|厂家|manufacturer|factory/i.test(`${title} ${snippet}`)) score += 8;
    if (inferChinaPlace(`${title} ${snippet}`).city) score += 6;
    if (phone || email || wechat) score += 6;
    const src = String(source || '').toLowerCase();
    if (src === '1688' || src === 'baidu' || src === 'sogou' || src === 'so360') score += 6;
    if (verificationStatus === 'VERIFIED_MANUFACTURER') score += 12;
    if (isMarketplaceHost(url, source) && !uscc) score -= 10;
    if (/tianyancha|qcc\.com|aiqicha|baike|directory/i.test(String(url || '')) && !uscc) score -= 8;
    if (mq === 'other') score -= 12;
    return Math.max(0, Math.min(100, score));
}
