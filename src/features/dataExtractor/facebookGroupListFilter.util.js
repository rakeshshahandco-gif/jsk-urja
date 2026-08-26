/**
 * Client-side filter for Facebook Find Groups / My Joined Groups tables.
 * Does not start extraction. Identity stays group ID / canonical URL.
 */
export function parseExactFacebookGroupSeek(query = '', { minDigits = 6 } = {}) {
    const q = String(query || '').trim();
    const n = Math.max(6, Number(minDigits) || 6);
    if (new RegExp(`^\\d{${n},}$`).test(q)) return q;
    const fromUrl = q.match(/facebook\.com\/groups\/(\d{6,})/i);
    return fromUrl ? fromUrl[1] : '';
}

export function filterFacebookGroupRows(groups = [], query = '') {
    const q = String(query || '').trim().toLowerCase();
    const rows = Array.isArray(groups) ? groups : [];
    if (!q) return rows;
    const matched = rows.filter((g) => {
        const name = String(g.groupName || '').toLowerCase();
        const id = String(g.groupId || '').toLowerCase();
        const url = String(g.groupUrl || '').toLowerCase();
        return name.includes(q) || id.includes(q) || url.includes(q);
    });
    const exactId = matched.filter((g) => String(g.groupId || '').toLowerCase() === q);
    if (exactId.length) return exactId;
    const exactName = matched.filter((g) => String(g.groupName || '').trim().toLowerCase() === q);
    if (exactName.length) return exactName;
    return matched;
}

export function exactLookupSucceeded(data) {
    const id = String(data?.group?.groupId || data?.groupId || '').trim();
    return Boolean((data?.found === true || data?.ok === true) && id && data?.startedExtract !== true);
}

export function selectedGroupFromExactLookup(data = {}) {
    const g = data.group || {};
    const peopleTabAvailable = g.peopleTabAvailable ?? data.peopleTabAvailable;
    return {
        groupUrl: g.groupUrl || data.canonicalUrl || data.groupUrl || '',
        groupName: g.groupName || data.groupName || '',
        groupId: String(g.groupId || data.groupId || ''),
        members: g.members || data.displayedMembers || '',
        privacy: g.privacy || data.privacy || '',
        joinedStatus: g.joinedStatus || data.membership || 'Unknown',
        canAnalyzeMembers: g.canAnalyzeMembers !== false,
        peopleTabAvailable: Boolean(peopleTabAvailable),
        peopleTabStatus: g.peopleTabStatus
            || (peopleTabAvailable ? 'Available' : 'Unavailable'),
    };
}

export function formatExactGroupLookupError(data = {}, httpMessage = '') {
    const reason = String(data.reason || '').trim();
    const detail = String(data.error || data.note || httpMessage || '').trim()
        || 'Exact group lookup failed.';
    return reason && reason !== detail ? `${reason} — ${detail}` : detail;
}
