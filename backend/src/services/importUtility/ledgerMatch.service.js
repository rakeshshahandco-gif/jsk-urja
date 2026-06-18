/**
 * Shared ledger/party matching: GSTIN -> PAN -> exact name -> fuzzy name.
 */

export function normalizeGstin(value) {
    return String(value || '').trim().toUpperCase().replace(/\s+/g, '');
}

export function panFromGstin(gstin) {
    const g = normalizeGstin(gstin);
    if (g.length !== 15) return '';
    return g.substring(2, 12);
}

const esc = (s) => String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function stripLegalSuffix(name) {
    return String(name || '')
        .replace(/\b(private|pvt|limited|ltd|llp|inc|corp|company|co)\b\.?/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

export async function matchPartyByPriority(opts) {
    const gst = normalizeGstin(opts.gstin);
    const name = String(opts.name || '').trim();

    if (gst && opts.findByGstin) {
        const byGst = await opts.findByGstin(gst);
        if (byGst) return { entity: byGst.entity ?? byGst, matchMethod: byGst.matchMethod || 'gstin' };
    }

    if (gst && opts.findByPan) {
        const pan = panFromGstin(gst);
        if (pan) {
            const byPan = await opts.findByPan(pan);
            if (byPan) return { entity: byPan.entity ?? byPan, matchMethod: byPan.matchMethod || 'pan' };
        }
    }

    if (name && opts.findByExactName) {
        const byExact = await opts.findByExactName(name);
        if (byExact) return { entity: byExact.entity ?? byExact, matchMethod: byExact.matchMethod || 'name_exact' };
    }

    if (name && opts.findByFuzzyName) {
        const byFuzzy = await opts.findByFuzzyName(name);
        if (byFuzzy) return { entity: byFuzzy.entity ?? byFuzzy, matchMethod: byFuzzy.matchMethod || 'name_fuzzy' };
    }

    return { entity: null, matchMethod: null };
}

export function buildRegexExact(str) {
    return new RegExp(`^${esc(str)}$`, 'i');
}

export function buildRegexContains(core) {
    return new RegExp(esc(core), 'i');
}
