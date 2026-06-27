const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function isIndiamartConfigured() {
    return !!String(process.env.INDIAMART_GLUSR_CRM_KEY || '').trim();
}

export function getIndiamartConfigMessage() {
    if (isIndiamartConfigured()) {
        return 'IndiaMART Lead Manager Pull API is configured (syncs your seller inbox leads).';
    }
    return 'IndiaMART is not configured. Add INDIAMART_GLUSR_CRM_KEY from seller.indiamart.com → Lead Manager → Pull API.';
}

function formatImDate(d) {
    const day = String(d.getDate()).padStart(2, '0');
    const mon = MONTHS[d.getMonth()];
    const year = d.getFullYear();
    return `${day}-${mon}-${year}`;
}

function normalizeText(s) {
    return String(s || '').replace(/\\n/g, ' ').replace(/\\t/g, ' ').replace(/\s+/g, ' ').trim();
}

function matchesKeyword(row, keyword) {
    if (!keyword) return true;
    const k = keyword.toLowerCase();
    const hay = [
        row.QUERY_PRODUCT_NAME,
        row.QUERY_MCAT_NAME,
        row.QUERY_MESSAGE,
        row.SUBJECT,
        row.SENDER_COMPANY,
    ].map((x) => normalizeText(x).toLowerCase()).join(' ');
    return hay.includes(k);
}

function matchesCity(row, city) {
    if (!city) return true;
    const c = city.toLowerCase();
    return normalizeText(row.SENDER_CITY).toLowerCase().includes(c)
        || normalizeText(row.SENDER_ADDRESS).toLowerCase().includes(c);
}

function matchesState(row, state) {
    if (!state) return true;
    return normalizeText(row.SENDER_STATE).toLowerCase().includes(state.toLowerCase());
}

export function mapIndiamartLead(row, searchKeyword) {
    const companyName = normalizeText(row.SENDER_COMPANY) || normalizeText(row.SENDER_NAME) || 'IndiaMART Lead';
    const product = normalizeText(row.QUERY_PRODUCT_NAME);
    const mcat = normalizeText(row.QUERY_MCAT_NAME);

    return {
        companyName,
        website: '',
        normalizedDomain: '',
        sourcePlatform: 'indiamart',
        sourceUrl: `https://seller.indiamart.com/`,
        sourceReference: String(row.UNIQUE_QUERY_ID || ''),
        email: normalizeText(row.SENDER_EMAIL || row.SENDER_EMAIL_ALT),
        phone: normalizeText(row.SENDER_MOBILE || row.SENDER_PHONE),
        mobile: normalizeText(row.SENDER_MOBILE_ALT || row.SENDER_PHONE_ALT),
        address: normalizeText(row.SENDER_ADDRESS),
        city: normalizeText(row.SENDER_CITY),
        stateProvince: normalizeText(row.SENDER_STATE),
        country: row.SENDER_COUNTRY_ISO === 'IN' ? 'India' : normalizeText(row.SENDER_COUNTRY_ISO),
        pincode: normalizeText(row.SENDER_PINCODE),
        businessDescription: normalizeText(row.QUERY_MESSAGE || row.SUBJECT),
        productCategories: [product, mcat].filter(Boolean),
        keywords: [searchKeyword, product, mcat].filter(Boolean),
        natureOfBusiness: 'buyer_inquiry',
        extractedAt: row.QUERY_TIME ? new Date(row.QUERY_TIME) : new Date(),
        confidenceScore: 75,
        rawExtractedData: {
            adapter: 'indiamart_pull_api',
            queryType: row.QUERY_TYPE,
            queryTime: row.QUERY_TIME,
            uniqueQueryId: row.UNIQUE_QUERY_ID,
        },
    };
}

async function pullIndiamartApi({ startTime, endTime, timeoutMs }) {
    const key = String(process.env.INDIAMART_GLUSR_CRM_KEY || '').trim();
    const url = new URL('https://mapi.indiamart.com/wservce/crm/crmListing/v2/');
    url.searchParams.set('glusr_crm_key', key);
    if (startTime && endTime) {
        url.searchParams.set('start_time', startTime);
        url.searchParams.set('end_time', endTime);
    }

    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(timeoutMs) });
    const text = await res.text();
    let data;
    try {
        data = JSON.parse(text);
    } catch {
        return { rows: [], error: `IndiaMART API invalid JSON: ${text.slice(0, 200)}` };
    }

    if (data.CODE && Number(data.CODE) !== 200) {
        return { rows: [], error: data.MESSAGE || data.STATUS || `IndiaMART API error code ${data.CODE}` };
    }

    const rows = Array.isArray(data.RESPONSE) ? data.RESPONSE : [];
    return { rows, error: '' };
}

export async function testIndiamartConnection() {
    if (!isIndiamartConfigured()) {
        return { ok: false, message: getIndiamartConfigMessage() };
    }
    const { rows, error } = await pullIndiamartApi({ timeoutMs: 20000 });
    if (error) return { ok: false, message: error };
    return { ok: true, message: `Connected — ${rows.length} lead(s) in last sync window`, sampleCount: rows.length };
}

export async function searchIndiamart(input, settings) {
    if (!isIndiamartConfigured()) {
        return {
            records: [],
            errors: [getIndiamartConfigMessage()],
            metadata: { sourceStatus: 'not_configured', adapterId: 'indiamart' },
        };
    }

    const keyword = String(input.keyword || '').trim();
    const city = String(input.city || '').trim();
    const state = String(input.state || '').trim();
    const maxResults = Math.min(50, Math.max(1, Number(input.maxResults) || 10));
    const timeoutMs = settings?.searchTimeoutMs || 20000;

    const end = new Date();
    const start = new Date(end.getTime() - 6 * 86400000);
    const { rows, error } = await pullIndiamartApi({
        startTime: formatImDate(start),
        endTime: formatImDate(end),
        timeoutMs,
    });

    const errors = error ? [error] : [];
    const seen = new Set();
    const records = [];

    for (const row of rows) {
        if (!matchesKeyword(row, keyword)) continue;
        if (!matchesCity(row, city)) continue;
        if (!matchesState(row, state)) continue;

        const uid = String(row.UNIQUE_QUERY_ID || '');
        if (uid && seen.has(uid)) continue;
        if (uid) seen.add(uid);

        records.push(mapIndiamartLead(row, keyword));
        if (records.length >= maxResults) break;
    }

    return {
        records,
        errors,
        metadata: {
            sourceStatus: records.length ? 'ok' : (errors.length ? 'error' : 'no_results'),
            adapterId: 'indiamart',
            apiType: 'lead_manager_pull',
            note: 'Official IndiaMART Pull API — your seller inbox leads (not public supplier search).',
            fetchedCount: rows.length,
            filteredCount: records.length,
            previewOnly: true,
        },
    };
}
