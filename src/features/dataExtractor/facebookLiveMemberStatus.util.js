/**
 * Live member-row status. Same row updates; never invent names.
 */
export function liveMemberStatus(row = {}) {
    if (row.liveStatus) return row.liveStatus;
    const review = String(row.reviewStatus || '').toLowerCase();
    const rel = String(row.businessProfessional || row.relevance || '').toLowerCase();
    const hasPhone = Boolean(row.phone && row.phone !== '—');
    const hasWhatsApp = Boolean(row.whatsapp && row.whatsapp !== '—');
    const hasEmail = Boolean(row.email && row.email !== '—');
    const hasWebsite = Boolean(row.website && row.website !== '—');
    if (hasPhone || hasWhatsApp || hasEmail) return 'Contactable';
    if (hasWebsite) return 'Website Found';
    if (/not_relevant|excluded/.test(rel) || /not_relevant|excluded/.test(review)) return 'Not Relevant';
    if (/relevant/.test(rel) && !/possibly/.test(rel)) return 'Relevant';
    if (/reviewed/.test(review) && !/not_reviewed/.test(review)) return 'Reviewed';
    if (/reviewing/.test(review)) return 'Reviewing';
    return 'Discovered';
}

export function liveMemberDetail(row = {}) {
    const ticks = [
        row.phone && row.phone !== '—' ? 'Phone ✓' : '',
        row.whatsapp && row.whatsapp !== '—' ? 'WhatsApp ✓' : '',
        row.email && row.email !== '—' ? 'Email ✓' : '',
        row.website && row.website !== '—' ? 'Website ✓' : '',
    ].filter(Boolean);
    const status = liveMemberStatus(row);
    return ticks.length ? `${status} | ${ticks.join(' | ')}` : status;
}

export function mergeFacebookGroupRows(prev = [], incoming = []) {
    const map = new Map();
    for (const g of prev) {
        if (g?.groupUrl) map.set(g.groupUrl, g);
    }
    for (const g of incoming) {
        if (!g?.groupUrl) continue;
        map.set(g.groupUrl, { ...(map.get(g.groupUrl) || {}), ...g });
    }
    return [...map.values()];
}

export function mergeLiveMemberRows(prev = [], incoming = []) {
    const map = new Map();
    const keyOf = (r) => r.rawCaptureId || r.facebookUrl || r.profileUrl || r.name;
    for (const r of prev) {
        const k = keyOf(r);
        if (k) map.set(k, r);
    }
    for (const r of incoming) {
        const k = keyOf(r);
        if (!k) continue;
        map.set(k, { ...(map.get(k) || {}), ...r });
    }
    return [...map.values()];
}

export function formatActivityTime(t) {
    const d = t instanceof Date ? t : new Date(t);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
