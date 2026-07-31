/** Pure matching helpers for Phase 4 entity resolution. */

export function normalizeDomain(website) {
    try {
        const raw = String(website || '').trim();
        if (!raw) return '';
        const withProto = /^https?:\/\//i.test(raw) ? raw : ('https://' + raw);
        const u = new URL(withProto);
        return u.hostname.replace(/^www\./i, '').toLowerCase();
    } catch {
        return '';
    }
}

export function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
}

export function phoneDigits(phone) {
    return String(phone || '').replace(/\D/g, '');
}

export function phoneSuffix(phone, n = 10) {
    const d = phoneDigits(phone);
    return d.length >= 8 ? d.slice(-n) : '';
}

export function normalizeGstin(gstin) {
    return String(gstin || '').trim().toUpperCase().replace(/\s+/g, '');
}

export function normalizeCompanyKey(name) {
    return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function normalizeCompanyTokens(name) {
    return String(name || '')
        .toLowerCase()
        .replace(/\b(pvt|private|ltd|limited|llp|inc|corp|co|gmbh|plc)\b/g, ' ')
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((t) => t.length > 1);
}

export function tokenJaccard(aTokens, bTokens) {
    const a = new Set(aTokens || []);
    const b = new Set(bTokens || []);
    if (!a.size || !b.size) return 0;
    let inter = 0;
    for (const t of a) if (b.has(t)) inter += 1;
    const union = a.size + b.size - inter;
    return union ? inter / union : 0;
}

/** Simple Levenshtein ratio 0..1 */
export function stringSimilarity(a, b) {
    const s = String(a || '');
    const t = String(b || '');
    if (!s && !t) return 1;
    if (!s || !t) return 0;
    const m = s.length;
    const n = t.length;
    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            const cost = s[i - 1] === t[j - 1] ? 0 : 1;
            dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
        }
    }
    const dist = dp[m][n];
    return 1 - dist / Math.max(m, n);
}

export function normalizeUrlKey(url) {
    try {
        const u = new URL(String(url || '').trim());
        return (u.hostname.replace(/^www\./i, '').toLowerCase() + u.pathname.replace(/\/+$/, '')).toLowerCase();
    } catch {
        return String(url || '').trim().toLowerCase();
    }
}

export function collectRecordKeys(record = {}) {
    return {
        domain: record.normalizedDomain || normalizeDomain(record.website),
        website: normalizeUrlKey(record.website || ''),
        email: normalizeEmail(record.email),
        phone: phoneSuffix(record.phone || record.mobile, 10),
        gstin: normalizeGstin(record.gstin),
        companyKey: normalizeCompanyKey(record.companyName),
        companyTokens: normalizeCompanyTokens(record.companyName),
        city: String(record.city || '').trim().toLowerCase(),
        state: String(record.stateProvince || record.state || '').trim().toLowerCase(),
        address: String(record.address || '').trim().toLowerCase(),
        indiamart: normalizeUrlKey(record.rawExtractedData?.indiamartProfileUrl || (String(record.sourceUrl || '').includes('indiamart.com') ? record.sourceUrl : '')),
        facebook: normalizeUrlKey(record.socialLinks?.facebook || record.rawExtractedData?.facebookPageUrl || ''),
        instagram: normalizeUrlKey(record.socialLinks?.instagram || record.rawExtractedData?.instagramProfileUrl || ''),
        linkedin: normalizeUrlKey(record.socialLinks?.linkedin || ''),
        sourceProviders: record.rawExtractedData?.sourceProviders || [],
    };
}
