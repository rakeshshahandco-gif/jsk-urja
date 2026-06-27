/** Normalize URL and extract hostname for duplicate checks. */
export function normalizeExtractorUrl(raw) {
    const s = String(raw || '').trim();
    if (!s) return { url: '', domain: '' };
    let url = s;
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    try {
        const u = new URL(url);
        const domain = u.hostname.replace(/^www\./i, '').toLowerCase();
        return { url: u.href, domain };
    } catch {
        return { url: s, domain: '' };
    }
}

/** Score 0–100 from populated public fields. */
export function scoreExtractorConfidence(fields) {
    let score = 0;
    if (fields.companyName) score += 25;
    if (fields.email) score += 20;
    if (fields.phone || fields.mobile) score += 20;
    if (fields.businessDescription) score += 15;
    if (fields.city || fields.country) score += 10;
    if (fields.website) score += 10;
    return Math.min(100, score);
}

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_RE = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}/g;

export function extractEmailsFromText(text) {
    const matches = String(text || '').match(EMAIL_RE) || [];
    return [...new Set(matches.map((e) => e.toLowerCase()))];
}

export function extractPhonesFromText(text) {
    const matches = String(text || '').match(PHONE_RE) || [];
    return [...new Set(matches.map((p) => p.replace(/\s+/g, ' ').trim()).filter((p) => p.replace(/\D/g, '').length >= 8))];
}

export function parseTitleFromHtml(html) {
    const m = String(html || '').match(/<title[^>]*>([^<]+)<\/title>/i);
    return m ? m[1].trim().replace(/\s+/g, ' ') : '';
}

export function parseMetaDescription(html) {
    const m = String(html || '').match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)
        || String(html || '').match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);
    return m ? m[1].trim() : '';
}

export function parseMetaKeywords(html) {
    const m = String(html || '').match(/<meta[^>]+name=["']keywords["'][^>]+content=["']([^"']+)["']/i)
        || String(html || '').match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']keywords["']/i);
    if (!m) return [];
    return m[1].split(/[,;|]/).map((k) => k.trim()).filter(Boolean).slice(0, 15);
}

export function extractJsonLdBlocks(html) {
    const blocks = [];
    const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let m;
    while ((m = re.exec(String(html || ''))) !== null) {
        try {
            blocks.push(JSON.parse(m[1]));
        } catch {
            /* skip invalid json-ld */
        }
    }
    return blocks;
}

export function extractOrgFromJsonLd(blocks) {
    const flat = [];
    const walk = (node) => {
        if (!node) return;
        if (Array.isArray(node)) {
            node.forEach(walk);
            return;
        }
        if (typeof node === 'object') {
            const type = String(node['@type'] || '').toLowerCase();
            if (type.includes('organization') || type.includes('localbusiness') || type.includes('corporation')) {
                flat.push(node);
            }
            Object.values(node).forEach(walk);
        }
    };
    blocks.forEach(walk);
    return flat[0] || null;
}

export function extractProductsFromHtml(html) {
    const products = new Set();
    const kw = parseMetaKeywords(html);
    kw.forEach((k) => products.add(k));

    const ogProduct = String(html || '').match(/<meta[^>]+property=["']product:[^"']+["'][^>]+content=["']([^"']+)["']/i);
    if (ogProduct) products.add(ogProduct[1].trim());

    const h2h3 = String(html || '').match(/<h[23][^>]*>([^<]{3,80})<\/h[23]>/gi) || [];
    for (const tag of h2h3.slice(0, 8)) {
        const text = tag.replace(/<[^>]+>/g, '').trim();
        if (/product|solution|service|range|catalog/i.test(text)) products.add(text);
    }
    return [...products].slice(0, 10);
}

export const EXCEL_COLUMN_ALIASES = {
    companyName: ['company', 'company name', 'companyname', 'business name', 'firm name', 'name'],
    website: ['website', 'web', 'url', 'site'],
    email: ['email', 'e-mail', 'mail'],
    phone: ['phone', 'telephone', 'tel', 'landline'],
    mobile: ['mobile', 'cell', 'whatsapp', 'whatsapp number'],
    address: ['address', 'street'],
    city: ['city', 'town'],
    stateProvince: ['state', 'province', 'region'],
    country: ['country', 'nation'],
    pincode: ['pincode', 'pin', 'zip', 'postal'],
    businessDescription: ['description', 'about', 'business description', 'details'],
    natureOfBusiness: ['nature', 'business type', 'category'],
    sourceUrl: ['source url', 'source', 'link', 'profile url'],
};

export function mapExcelRowToLead(row, columnMapping = {}) {
    const keys = Object.keys(row || {});
    const lowerMap = {};
    for (const k of keys) {
        lowerMap[String(k).trim().toLowerCase()] = row[k];
    }

    const get = (field) => {
        const mapped = columnMapping[field];
        if (mapped && row[mapped] != null) return String(row[mapped]).trim();
        const aliases = EXCEL_COLUMN_ALIASES[field] || [];
        for (const alias of aliases) {
            if (lowerMap[alias] != null && String(lowerMap[alias]).trim()) {
                return String(lowerMap[alias]).trim();
            }
        }
        return '';
    };

    const website = get('website');
    const sourceUrl = get('sourceUrl') || website;
    const { url, domain } = normalizeExtractorUrl(website || sourceUrl);

    return {
        companyName: get('companyName'),
        website: url || website,
        normalizedDomain: domain,
        sourceUrl: sourceUrl || url,
        email: get('email'),
        phone: get('phone'),
        mobile: get('mobile'),
        address: get('address'),
        city: get('city'),
        stateProvince: get('stateProvince'),
        country: get('country'),
        pincode: get('pincode'),
        businessDescription: get('businessDescription'),
        natureOfBusiness: get('natureOfBusiness'),
    };
}
