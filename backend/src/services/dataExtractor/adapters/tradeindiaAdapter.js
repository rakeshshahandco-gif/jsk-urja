const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function isTradeindiaConfigured() {
    const userId = String(process.env.TRADEINDIA_USER_ID || '').trim();
    const profileId = String(process.env.TRADEINDIA_PROFILE_ID || '').trim();
    const apiKey = String(process.env.TRADEINDIA_API_KEY || '').trim();
    return !!(userId && profileId && apiKey);
}

export function getTradeindiaConfigMessage() {
    if (isTradeindiaConfigured()) {
        return 'TradeIndia My Inquiry API is configured (syncs your seller account inquiries).';
    }
    return 'TradeIndia is not configured. Add TRADEINDIA_USER_ID, TRADEINDIA_PROFILE_ID, and TRADEINDIA_API_KEY from tradeindia.com → Inquiries → My Inquiry API.';
}

function formatTiDate(d) {
    const day = String(d.getDate()).padStart(2, '0');
    const mon = MONTHS[d.getMonth()];
    const year = d.getFullYear();
    return `${day}-${mon}-${year}`;
}

function normalizeText(s) {
    return String(s || '').replace(/\s+/g, ' ').trim();
}

function decodeXmlEntities(text) {
    return String(text || '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
        .trim();
}

function extractXmlTag(block, tag) {
    const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
    const m = block.match(re);
    return m ? decodeXmlEntities(m[1]) : '';
}

export function parseTradeIndiaInquiryXml(xmlText) {
    const text = String(xmlText || '').trim();
    if (!text || text.startsWith('<!DOCTYPE html') || text.startsWith('<html')) {
        return { rows: [], error: 'TradeIndia API returned HTML (check credentials or API access).' };
    }

    const rows = [];
    const itemPatterns = [
        /<inquiry\b[^>]*>([\s\S]*?)<\/inquiry>/gi,
        /<record\b[^>]*>([\s\S]*?)<\/record>/gi,
        /<lead\b[^>]*>([\s\S]*?)<\/lead>/gi,
    ];

    for (const pattern of itemPatterns) {
        let match;
        pattern.lastIndex = 0;
        while ((match = pattern.exec(text)) !== null) {
            const block = match[1];
            rows.push({
                rfi_id: extractXmlTag(block, 'rfi_id') || extractXmlTag(block, 'enquiry_id') || extractXmlTag(block, 'id'),
                sender_name: extractXmlTag(block, 'sender_name') || extractXmlTag(block, 'name'),
                sender_co: extractXmlTag(block, 'sender_co') || extractXmlTag(block, 'company_name') || extractXmlTag(block, 'sender_company'),
                sender_email: extractXmlTag(block, 'sender_email') || extractXmlTag(block, 'email'),
                sender_mobile: extractXmlTag(block, 'sender_mobile') || extractXmlTag(block, 'mobile') || extractXmlTag(block, 'phone'),
                sender_city: extractXmlTag(block, 'sender_city') || extractXmlTag(block, 'city'),
                sender_state: extractXmlTag(block, 'sender_state') || extractXmlTag(block, 'state'),
                sender_country: extractXmlTag(block, 'sender_country') || extractXmlTag(block, 'country'),
                product_name: extractXmlTag(block, 'product_name') || extractXmlTag(block, 'subject'),
                message: extractXmlTag(block, 'message') || extractXmlTag(block, 'inquiry_message') || extractXmlTag(block, 'description'),
                inquiry_date: extractXmlTag(block, 'inquiry_date') || extractXmlTag(block, 'date') || extractXmlTag(block, 'generated_date'),
            });
        }
        if (rows.length) break;
    }

    return { rows, error: '' };
}

function matchesKeyword(row, keyword) {
    if (!keyword) return true;
    const k = keyword.toLowerCase();
    const hay = [
        row.product_name,
        row.message,
        row.sender_co,
        row.sender_name,
    ].map((x) => normalizeText(x).toLowerCase()).join(' ');
    return hay.includes(k);
}

function matchesCity(row, city) {
    if (!city) return true;
    return normalizeText(row.sender_city).toLowerCase().includes(city.toLowerCase());
}

function matchesState(row, state) {
    if (!state) return true;
    return normalizeText(row.sender_state).toLowerCase().includes(state.toLowerCase());
}

export function mapTradeindiaInquiry(row, searchKeyword) {
    const companyName = normalizeText(row.sender_co) || normalizeText(row.sender_name) || 'TradeIndia Inquiry';
    const product = normalizeText(row.product_name);

    return {
        companyName,
        website: '',
        normalizedDomain: '',
        sourcePlatform: 'tradeindia',
        sourceUrl: 'https://www.tradeindia.com/',
        sourceReference: String(row.rfi_id || ''),
        email: normalizeText(row.sender_email),
        phone: normalizeText(row.sender_mobile),
        mobile: normalizeText(row.sender_mobile),
        address: '',
        city: normalizeText(row.sender_city),
        stateProvince: normalizeText(row.sender_state),
        country: normalizeText(row.sender_country) || 'India',
        businessDescription: normalizeText(row.message),
        productCategories: product ? [product] : [],
        keywords: [searchKeyword, product].filter(Boolean),
        natureOfBusiness: 'buyer_inquiry',
        extractedAt: row.inquiry_date ? new Date(row.inquiry_date) : new Date(),
        confidenceScore: 75,
        rawExtractedData: {
            adapter: 'tradeindia_my_inquiry_api',
            rfiId: row.rfi_id,
            inquiryDate: row.inquiry_date,
        },
    };
}

async function pullTradeindiaApi({ fromDate, toDate, timeoutMs }) {
    const userId = String(process.env.TRADEINDIA_USER_ID || '').trim();
    const profileId = String(process.env.TRADEINDIA_PROFILE_ID || '').trim();
    const apiKey = String(process.env.TRADEINDIA_API_KEY || '').trim();

    const url = new URL('https://www.tradeindia.com/utils/my_inquiry.html');
    url.searchParams.set('userid', userId);
    url.searchParams.set('profile_id', profileId);
    url.searchParams.set('key', apiKey);
    url.searchParams.set('from_date', fromDate);
    url.searchParams.set('to_date', toDate);

    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(timeoutMs) });
    const text = await res.text();
    if (!res.ok) {
        return { rows: [], error: `TradeIndia HTTP ${res.status}: ${text.slice(0, 180)}` };
    }
    return parseTradeIndiaInquiryXml(text);
}

export async function testTradeindiaConnection() {
    if (!isTradeindiaConfigured()) {
        return { ok: false, message: getTradeindiaConfigMessage() };
    }
    const today = formatTiDate(new Date());
    const { rows, error } = await pullTradeindiaApi({ fromDate: today, toDate: today, timeoutMs: 20000 });
    if (error) return { ok: false, message: error };
    return {
        ok: true,
        message: `Connected — ${rows.length} inquiry(ies) today`,
        sampleCount: rows.length,
    };
}

export async function searchTradeindia(input, settings) {
    if (!isTradeindiaConfigured()) {
        return {
            records: [],
            errors: [getTradeindiaConfigMessage()],
            metadata: { sourceStatus: 'not_configured', adapterId: 'tradeindia' },
        };
    }

    const keyword = String(input.keyword || '').trim();
    const city = String(input.city || '').trim();
    const state = String(input.state || '').trim();
    const maxResults = Math.min(50, Math.max(1, Number(input.maxResults) || 10));
    const timeoutMs = settings?.searchTimeoutMs || 20000;

    const end = new Date();
    const start = new Date(end.getTime() - 6 * 86400000);
    const { rows, error } = await pullTradeindiaApi({
        fromDate: formatTiDate(start),
        toDate: formatTiDate(end),
        timeoutMs,
    });

    const errors = error ? [error] : [];
    const seen = new Set();
    const records = [];

    for (const row of rows) {
        if (!matchesKeyword(row, keyword)) continue;
        if (!matchesCity(row, city)) continue;
        if (!matchesState(row, state)) continue;

        const uid = String(row.rfi_id || '');
        if (uid && seen.has(uid)) continue;
        if (uid) seen.add(uid);

        records.push(mapTradeindiaInquiry(row, keyword));
        if (records.length >= maxResults) break;
    }

    return {
        records,
        errors,
        metadata: {
            sourceStatus: records.length ? 'ok' : (errors.length ? 'error' : 'no_results'),
            adapterId: 'tradeindia',
            apiType: 'my_inquiry_pull',
            note: 'Official TradeIndia My Inquiry API — your seller account inquiries (not public directory search).',
            fetchedCount: rows.length,
            filteredCount: records.length,
            previewOnly: true,
        },
    };
}
