/**
 * Present/filter helpers so Contactable Prospects can isolate Facebook Group Member
 * rows from Public Discovery / web results. Does not change extraction.
 */

export const CONTACTABLE_SOURCE_OPTIONS = Object.freeze([
    { id: '', label: 'All' },
    { id: 'public_discovery', label: 'Public Discovery' },
    { id: 'facebook_group_member', label: 'Facebook Group Member' },
    { id: 'facebook_page', label: 'Facebook Page' },
    { id: 'instagram', label: 'Instagram' },
    { id: 'web', label: 'Google/Web' },
    { id: 'linkedin', label: 'LinkedIn' },
    { id: 'x', label: 'X' },
    { id: 'indiamart', label: 'IndiaMART' },
    { id: 'justdial', label: 'Justdial' },
    { id: 'tradeindia', label: 'TradeIndia' },
]);

function refBlob(ident = {}) {
    const refs = ident.sourceRefs || [];
    const prov = ident.provenance || [];
    return [
        ...(ident.platforms || []),
        ident.social?.facebookUrl || '',
        ...refs.map((r) => `${r.kind || ''} ${r.source || ''} ${r.title || ''} ${r.snippet || ''} ${r.sourceUrl || ''}`),
        ...prov.map((p) => (typeof p === 'string' ? p : JSON.stringify(p || {}))),
    ].join(' | ');
}

export function facebookParentGroupFromIdentity(ident = {}) {
    const blob = refBlob(ident);
    const name = (blob.match(/parentGroup=([^|;]+)/i) || blob.match(/groupName=([^|;]+)/i) || [])[1] || '';
    const id = (blob.match(/groupId=(\d{6,})/i) || blob.match(/facebook\.com\/groups\/(\d+)/i) || [])[1] || '';
    return {
        parentGroup: String(name || '').trim(),
        parentGroupId: String(id || '').trim(),
    };
}

export function isFacebookGroupMemberIdentity(ident = {}) {
    const blob = refBlob(ident);
    if (/sourceSurface=facebook_people_tab|discoveryType=group_people_tab|facebook_group_member/i.test(blob)) {
        return true;
    }
    if (/parentGroup=/i.test(blob) && /facebook\.com\/groups\//i.test(blob)) return true;
    if (/groupUrl=https?:\/\/(www\.)?facebook\.com\/groups\//i.test(blob) && !/discoveryType=related_group/i.test(blob)) {
        return true;
    }
    return false;
}

export function classifyContactableSourceKind(ident = {}) {
    if (isFacebookGroupMemberIdentity(ident)) return 'facebook_group_member';
    const platforms = (ident.platforms || []).map((p) => String(p || '').toLowerCase());
    const blob = refBlob(ident);
    if (platforms.includes('instagram') || /instagram\.com/i.test(blob)) return 'instagram';
    if (platforms.includes('linkedin') || /linkedin\.com/i.test(blob)) return 'linkedin';
    if (platforms.includes('x') || /twitter\.com|\bx\.com\b/i.test(blob)) return 'x';
    if (platforms.includes('indiamart') || /indiamart/i.test(blob)) return 'indiamart';
    if (platforms.includes('justdial') || /justdial/i.test(blob)) return 'justdial';
    if (platforms.includes('tradeindia') || /tradeindia/i.test(blob)) return 'tradeindia';
    if (/discovery_preview|web_search|public_web|sourcePlatform=web/i.test(blob) || platforms.includes('web')) {
        if (platforms.includes('facebook') || /facebook\.com\/(pages|people|profile)/i.test(blob)) return 'facebook_page';
        return 'public_discovery';
    }
    if (platforms.includes('facebook') || /facebook\.com/i.test(blob)) {
        if (/facebook\.com\/groups\//i.test(blob) && !/\/user\//i.test(blob)) return 'public_discovery';
        return 'facebook_page';
    }
    if (platforms.length) return platforms[0];
    return 'public_discovery';
}

export function sourceKindLabel(kind = '') {
    const found = CONTACTABLE_SOURCE_OPTIONS.find((o) => o.id === kind);
    return found?.label || kind || '—';
}

export function facebookMemberDisplay(ident = {}, person = {}) {
    const parent = facebookParentGroupFromIdentity(ident);
    const refs = ident.sourceRefs || [];
    const memberRef = refs.find((r) => /facebook_people_tab|group_people_tab|memberName=/i.test(`${r.snippet || ''} ${r.source || ''}`))
        || refs.find((r) => /facebook\.com\//i.test(r.sourceUrl || '') && !/facebook\.com\/groups\/\d+\/?$/i.test(r.sourceUrl || ''));
    const memberName = String(person.name || ident.contactPerson?.name || memberRef?.title || '').trim();
    const facebookProfileUrl = String(
        ident.social?.facebookUrl
        || memberRef?.sourceUrl
        || '',
    ).trim();
    const review = (`${refBlob(ident)}`.match(/reviewStatus=([a-z_]+)/i) || [])[1] || '';
    return {
        ...parent,
        sourceKind: classifyContactableSourceKind(ident),
        memberName,
        facebookProfileUrl,
        reviewStatus: review || (person.name ? 'reviewed' : ''),
    };
}

export function matchesContactableSource(row = {}, source = '') {
    const want = String(source || '').trim();
    if (!want) return true;
    if (want === 'facebook') {
        return row.sourceKind === 'facebook_group_member' || row.sourceKind === 'facebook_page'
            || (row.sources || []).includes('facebook');
    }
    if (want === 'google' || want === 'google_web') return row.sourceKind === 'web' || row.sourceKind === 'public_discovery';
    return row.sourceKind === want || (row.sources || []).includes(want);
}

export function matchesParentGroup(row = {}, parentGroupId = '', parentGroup = '') {
    const id = String(parentGroupId || '').trim();
    const name = String(parentGroup || '').trim().toLowerCase();
    if (id) return String(row.parentGroupId || '') === id;
    if (name) return String(row.parentGroup || '').trim().toLowerCase() === name;
    return true;
}
