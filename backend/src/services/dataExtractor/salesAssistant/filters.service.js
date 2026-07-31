const STATE_PATTERNS = [
    [/maharashtra/i, 'Maharashtra'],
    [/gujarat/i, 'Gujarat'],
    [/karnataka/i, 'Karnataka'],
    [/tamil\s*nadu/i, 'Tamil Nadu'],
    [/delhi/i, 'Delhi'],
    [/rajasthan/i, 'Rajasthan'],
    [/telangana/i, 'Telangana'],
    [/andhra\s*pradesh/i, 'Andhra Pradesh'],
    [/west\s*bengal/i, 'West Bengal'],
    [/punjab/i, 'Punjab'],
    [/haryana/i, 'Haryana'],
    [/madhya\s*pradesh/i, 'Madhya Pradesh'],
    [/uttar\s*pradesh/i, 'Uttar Pradesh'],
];

function matchState(text) {
    for (const [re, name] of STATE_PATTERNS) {
        if (re.test(text)) return name;
    }
    return null;
}

function parseRelativeDates(text, now = new Date()) {
    const t = text.toLowerCase();
    const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
    if (/\bdue today\b|\btoday\b/.test(t) && /follow|due|task/.test(t)) {
        const s = startOfDay(now);
        const e = new Date(s); e.setDate(e.getDate() + 1);
        return { from: s.toISOString(), to: e.toISOString(), label: 'today' };
    }
    if (/\bthis week\b/.test(t)) {
        const s = startOfDay(now);
        const day = s.getDay();
        s.setDate(s.getDate() - ((day + 6) % 7));
        const e = new Date(s); e.setDate(e.getDate() + 7);
        return { from: s.toISOString(), to: e.toISOString(), label: 'this_week' };
    }
    if (/\bthis month\b/.test(t)) {
        const s = new Date(now.getFullYear(), now.getMonth(), 1);
        const e = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        return { from: s.toISOString(), to: e.toISOString(), label: 'this_month' };
    }
    if (/\bcurrent financial year\b|\bcurrent fy\b|\bthis fy\b/.test(t)) {
        const y = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
        return { financialYear: `${y}-${String(y + 1).slice(-2)}`, label: 'current_fy' };
    }
    if (/\boverdue\b/.test(t)) {
        return { to: startOfDay(now).toISOString(), overdue: true, label: 'overdue' };
    }
    return null;
}

/**
 * Extract safe filters/entities from natural language.
 * Merges session context filters when the question is a refinement.
 */
export function extractFiltersAndEntities(question, sessionContext = {}) {
    const text = String(question || '');
    const filters = { ...(sessionContext?.filters || {}) };
    const entities = { ...(sessionContext?.entities || {}) };

    const state = matchState(text);
    if (state) filters.state = state;
    if (/\bonly\s+gujarat\b/i.test(text)) filters.state = 'Gujarat';

    const cityMatch = text.match(/\bin\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/);
    if (cityMatch && !state) {
        const maybe = cityMatch[1];
        if (!/Maharashtra|Gujarat|India|Priority/i.test(maybe)) filters.city = maybe;
    }

    if (/\bled\b/i.test(text)) filters.product = filters.product || 'LED';
    if (/\bdali\b/i.test(text)) filters.product = 'DALI';
    if (/\bmanufacturer/i.test(text)) filters.customerType = filters.customerType || 'manufacturer';
    if (/\bled lighting/i.test(text)) filters.industry = 'LED lighting';

    if (/\bhigh[- ]priority|critical|top leads|best prospects\b/i.test(text)) {
        filters.priority = 'HIGH';
        filters.priorityMin = 'HIGH';
    }
    const scoreMatch = text.match(/score\s*(above|over|>=|>)\s*(\d{1,3})/i);
    if (scoreMatch) filters.minScore = Number(scoreMatch[2]);

    if (/\bwithout verified decision[- ]makers?\b/i.test(text)) filters.noDecisionMaker = true;
    if (/\bwithout email\b/i.test(text)) filters.noEmail = true;
    if (/\bwithout phone\b/i.test(text)) filters.noPhone = true;
    if (/\bready for enrichment\b/i.test(text)) filters.crmStatus = 'READY';
    if (/\bready for handoff\b/i.test(text)) filters.campaignStatus = 'READY_FOR_HANDOFF';
    if (/\bmanual review\b/i.test(text)) filters.manualReview = true;
    if (/\boutdated\b/i.test(text)) filters.outdated = true;
    if (/\bapproved\b/i.test(text) && /crm|enrichment/i.test(text)) filters.approvalStatus = 'APPROVED';
    if (/\bpending\b/i.test(text) && /workflow|draft/i.test(text)) filters.workflowStatus = 'PENDING';

    const dates = parseRelativeDates(text);
    if (dates) filters.dateRange = dates;
    if (dates?.financialYear) filters.financialYear = dates.financialYear;

    const companyMatch = text.match(/(?:about|summarize|similar to|company)\s+([A-Z][A-Za-z0-9&.'\-\s]{2,60})/);
    if (companyMatch) entities.companyName = companyMatch[1].trim();

    const ordinal = text.match(/\b(first|second|third|#?(\d+))(st|nd|rd|th)?\s+company\b/i);
    if (ordinal) {
        const map = { first: 1, second: 2, third: 3 };
        entities.resultIndex = map[ordinal[1]?.toLowerCase()] || Number(ordinal[2]) || null;
    }

    return { filters, entities };
}
