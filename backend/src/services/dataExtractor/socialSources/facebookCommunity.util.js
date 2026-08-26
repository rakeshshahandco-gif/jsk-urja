/**
 * Facebook Community Intelligence helpers.
 * Displayed member/follower counts are never treated as extracted totals.
 * 10 is an operational batch size, not a product total cap.
 */

export const FACEBOOK_COMMUNITY_BATCH_SIZE = 10;

/** Controlled People-tab review cap per Analyze Group run. Not a Facebook total. */
export const FACEBOOK_PEOPLE_TAB_MAX_REVIEW_PER_RUN = 12;

const FACEBOOK_PEOPLE_RESERVED = /^(pages|groups|search|events|watch|people|hashtag|reel|photo|photos|videos|help|home|marketplace|login|friends|stories|reels|notifications|messages|settings|gaming|ads|bookmarks|saved|permalink\.php|photo\.php)$/i;

export function normalizeFacebookGroupUrl(raw = '') {
    const s = String(raw || '').trim();
    if (!s) return '';
    try {
        const href = /^https?:\/\//i.test(s) ? s : `https://${s.replace(/^\/+/, '')}`;
        const u = new URL(href);
        const host = u.hostname.replace(/^www\./, '').toLowerCase();
        if (!['facebook.com', 'm.facebook.com', 'fb.com'].includes(host)) return '';
        const segs = u.pathname.split('/').filter(Boolean);
        if (segs[0]?.toLowerCase() !== 'groups' || !segs[1]) return '';
        if (['search', 'feed', 'joins', 'discover'].includes(String(segs[1]).toLowerCase())) return '';
        return `https://www.facebook.com/groups/${segs[1]}`;
    } catch {
        return '';
    }
}

export function facebookGroupIdFromUrl(raw = '') {
    const url = normalizeFacebookGroupUrl(raw);
    if (!url) return '';
    return String(url.split('/groups/')[1] || '').replace(/\/$/, '');
}

/** Internal publish batch only. Not a joined-groups total cap. */
export const JOINED_GROUP_DISCOVERY_BATCH = 20;
export const JOINED_GROUP_SCROLL_SAFETY = 80;
export const JOINED_GROUP_IDLE_STOP = 5;

export function parseExactFacebookGroupSeek(query = '') {
    const q = String(query || '').trim();
    if (/^\d{6,}$/.test(q)) return q;
    const fromUrl = q.match(/facebook\.com\/groups\/(\d{6,})/i);
    return fromUrl ? fromUrl[1] : '';
}

/** Numeric Group ID or exact Facebook group URL → canonical URL. Does not search by name. */
export function canonicalFacebookGroupFromInput(raw = '') {
    const s = String(raw || '').trim();
    if (!s) return { groupUrl: '', groupId: '' };
    if (/^\d{6,}$/.test(s)) {
        return { groupUrl: `https://www.facebook.com/groups/${s}`, groupId: s };
    }
    const groupUrl = normalizeFacebookGroupUrl(s);
    return { groupUrl, groupId: facebookGroupIdFromUrl(groupUrl) };
}

const FACEBOOK_CHROME_TITLES = /^(chats|notifications|menu|home|facebook|search|feeds|watch|marketplace|friends|groups)$/i;

export function cleanFacebookGroupDisplayName(raw = '') {
    return String(raw || '')
        .replace(/^\(\d+\+?\)\s*/, '')
        .replace(/\s*\|\s*Facebook.*$/i, '')
        .trim();
}

export function resolveExactFacebookGroupName(landing = {}) {
    const candidates = [landing.ogTitle, landing.title, landing.h1]
        .map((v) => cleanFacebookGroupDisplayName(v))
        .filter(Boolean);
    return candidates.find((name) => !FACEBOOK_CHROME_TITLES.test(name)) || candidates[0] || '';
}

export function presentExactFacebookGroupLookup({ requestedUrl = '', landing = {} } = {}) {
    const groupUrl = normalizeFacebookGroupUrl(landing.pageUrl || requestedUrl);
    const groupId = facebookGroupIdFromUrl(groupUrl);
    const blob = `${landing.bodyText || ''} ${(landing.controls || []).join(' ')}`;
    const joinedStatus = parseFacebookGroupMembership({ text: blob, controls: landing.controls || [] });
    const privacy = landing.isPublicGroup || /public group/i.test(String(landing.bodyText || ''))
        ? 'Public'
        : (/private group/i.test(String(landing.bodyText || '')) ? 'Private' : '');
    const detected = detectFacebookGroupPeopleUi(landing);
    const peopleTabAvailable = Boolean(detected.peopleTabVisible || landing.peopleTabLabelVisible);
    const access = facebookGroupAnalyzeAccess({ privacy, joinedStatus });
    const groupName = resolveExactFacebookGroupName(landing);
    return {
        groupName,
        groupId,
        groupUrl,
        privacy: privacy || '—',
        members: String(landing.displayedMemberCount || '').trim(),
        joinedStatus: joinedStatus || 'Unknown',
        peopleTabAvailable,
        peopleTabStatus: peopleTabAvailable ? 'Available' : 'Unavailable',
        canAnalyzeMembers: Boolean(access.canAnalyzeMembers),
        ok: Boolean(groupUrl && groupId),
    };
}

export function classifyExactFacebookGroupFailure({ error = '', attentionRequired = false } = {}) {
    const raw = String(error || '').trim();
    const lower = raw.toLowerCase();
    if (/connect direct facebook|session expired|disconnected/i.test(lower)) {
        return { reason: 'session expired', message: raw || 'Connect Direct Facebook Login first.' };
    }
    if (attentionRequired || /\/login|log in to facebook|redirected to login/i.test(lower)) {
        return { reason: 'redirected to login', message: raw || 'Facebook redirected to login.' };
    }
    if (/could not open|did not open|timeout|net::|navigation/i.test(lower)) {
        return { reason: 'Facebook page did not open', message: raw || 'Facebook page did not open.' };
    }
    if (/unavailable|isn.?t available|content isn/i.test(lower)) {
        return { reason: 'group unavailable', message: raw || 'The Facebook group is unavailable.' };
    }
    if (/people tab/i.test(lower) && /unavailab/i.test(lower)) {
        return { reason: 'People tab unavailable', message: raw };
    }
    if (/different page|recognizable|parsing/i.test(lower)) {
        return { reason: 'parsing failed', message: raw || 'The exact group page could not be parsed.' };
    }
    return { reason: 'parsing failed', message: raw || 'Exact group lookup failed.' };
}

export function shapeExactFacebookGroupLookupResponse({
    group = null,
    built = {},
    error = '',
    attentionRequired = false,
} = {}) {
    if (group?.ok && group.groupId) {
        return {
            found: true,
            ok: true,
            startedExtract: false,
            groupName: group.groupName,
            groupId: group.groupId,
            canonicalUrl: group.groupUrl,
            groupUrl: group.groupUrl,
            membership: group.joinedStatus,
            privacy: group.privacy,
            displayedMembers: group.members,
            peopleTabAvailable: Boolean(group.peopleTabAvailable),
            peopleTabStatus: group.peopleTabStatus,
            group,
            seekGroupId: built.groupId || group.groupId,
            note: 'Exact group verified. Confirm Selected Group, then press Run Full Group Automatically. Collection was not started.',
        };
    }
    const classified = classifyExactFacebookGroupFailure({ error, attentionRequired });
    return {
        found: false,
        ok: false,
        startedExtract: false,
        group: null,
        groupName: '',
        groupId: '',
        canonicalUrl: built.groupUrl || '',
        groupUrl: built.groupUrl || '',
        membership: '',
        privacy: '',
        displayedMembers: '',
        peopleTabAvailable: false,
        seekGroupId: built.groupId || '',
        error: classified.message,
        reason: classified.reason,
        attentionRequired: Boolean(attentionRequired),
        note: classified.message,
    };
}

export function shouldStopJoinedGroupDiscovery({
    exactFound = false,
    idlePasses = 0,
    idleStop = JOINED_GROUP_IDLE_STOP,
    scrollPass = 0,
    scrollSafety = JOINED_GROUP_SCROLL_SAFETY,
    sessionAttention = false,
    technicalFailure = false,
} = {}) {
    if (exactFound || sessionAttention || technicalFailure) return true;
    if (Number(scrollPass) >= Number(scrollSafety)) return true;
    if (Number(idlePasses) >= Number(idleStop)) return true;
    return false;
}

export function isFacebookPeopleTabMemberHref(href = '') {
    const h = String(href || '').trim();
    if (!h || !/facebook\.com/i.test(h)) return false;
    const path = h.split('?')[0];
    if (/\/groups\/[^/]+\/user\/\d{5,}/i.test(path)) return true;
    if (/profile\.php\?id=\d{5,}/i.test(h)) return true;
    if (/\/people\/[^/]+\/\d{5,}/i.test(path)) return true;
    const m = path.match(/https?:\/\/(?:www\.)?facebook\.com\/([^/?#]+)\/?$/i);
    if (m && !FACEBOOK_PEOPLE_RESERVED.test(m[1]) && /^[A-Za-z0-9._-]{2,80}$/.test(m[1])) return true;
    return false;
}

export function parseFacebookGroupMembership({ text = '', controls = [] } = {}) {
    const blob = String(text || '');
    const stamped = blob.match(/joinedStatus=([A-Za-z ]+)/i);
    if (stamped) {
        const v = stamped[1].trim();
        if (['Joined', 'Managed', 'Not Joined', 'Pending', 'Unknown'].includes(v)) return v;
    }
    const labels = (Array.isArray(controls) ? controls : [])
        .map((c) => String(c || '').trim().split('\n')[0].trim())
        .filter(Boolean);
    const exact = (re) => labels.some((l) => re.test(l));
    if (exact(/^(joined|you.?re a member|you are a member)$/i)) return 'Joined';
    if (exact(/^(manage|manage group|admin)$/i)) return 'Managed';
    if (exact(/^pending$/i)) return 'Pending';
    if (exact(/^(join group|request to join)$/i)) return 'Not Joined';
    if (exact(/^join$/i) && !exact(/^joined$/i)) return 'Not Joined';
    if (/\byou.?re a member\b|\byou are a member\b/i.test(blob)) return 'Joined';
    if (/\bjoined\b/i.test(blob) && !/\bjoin group\b/i.test(blob)) return 'Joined';
    return 'Unknown';
}

export function parseFacebookGroupCardMeta(snippet = '', controls = []) {
    const text = String(snippet || '');
    const privacy = /private group/i.test(text) ? 'Private' : (/public group/i.test(text) ? 'Public' : '');
    const members = (text.match(/([\d,.]+[KkMm]?)\s*members?/i) || [])[1] || '';
    const joinedStatus = parseFacebookGroupMembership({ text, controls });
    const access = facebookGroupAnalyzeAccess({ privacy, joinedStatus });
    return {
        privacy,
        members,
        joinedStatus,
        canAnalyzeMembers: access.canAnalyzeMembers,
    };
}

/** Visible Facebook card/session only. Never auto-join. Unknown is not Not Joined. */
export function facebookGroupAnalyzeAccess({ privacy = '', joinedStatus = '' } = {}) {
    const p = String(privacy || '');
    const j = String(joinedStatus || '');
    if (j === 'Joined' || j === 'Managed') return { canAnalyzeMembers: true };
    if (j === 'Pending') return { canAnalyzeMembers: false };
    if (j === 'Not Joined' && p === 'Private') return { canAnalyzeMembers: false };
    return { canAnalyzeMembers: true };
}

export function presentFacebookGroupSearchRow(rec = {}) {
    const url = normalizeFacebookGroupUrl(rec.resultUrl || rec.groupUrl || '');
    const meta = parseFacebookGroupCardMeta(`${rec.snippet || ''}\n${rec.notes || ''}`, rec.controls || []);
    return {
        groupName: rec.title || rec.groupName || '',
        groupUrl: url,
        groupId: facebookGroupIdFromUrl(url),
        privacy: meta.privacy || '—',
        members: meta.members || '—',
        joinedStatus: meta.joinedStatus || 'Unknown',
        canAnalyzeMembers: Boolean(meta.canAnalyzeMembers),
        snippet: rec.snippet || '',
    };
}

export function stripFacebookIdentityMetadata(text = '') {
    return String(text || '')
        .replace(/parentGroupId=\d+/gi, ' ')
        .replace(/(?:groupUrl|parentUrl|facebookUrl|evidenceUrl)=https?:\/\/[^\s;]+/gi, ' ')
        .replace(/https?:\/\/(?:www\.)?facebook\.com\/groups\/\d+/gi, ' ')
        .replace(/https?:\/\/(?:www\.)?facebook\.com\/groups\/[^/\s]+\/user\/\d+/gi, ' ')
        .replace(/profile\.php\?id=\d+/gi, ' ');
}

export function facebookIdentityDigitsFromText(text = '', extra = {}) {
    const ids = new Set();
    const add = (raw) => {
        const d = String(raw || '').replace(/\D/g, '');
        if (d.length >= 6) ids.add(d);
    };
    add(extra.parentGroupId);
    add(facebookGroupIdFromUrl(extra.groupUrl || ''));
    const blob = String(text || '');
    for (const m of blob.matchAll(/parentGroupId=(\d{6,})/gi)) add(m[1]);
    for (const m of blob.matchAll(/facebook\.com\/groups\/(\d{6,})/gi)) add(m[1]);
    for (const m of blob.matchAll(/\/user\/(\d{6,})/gi)) add(m[1]);
    for (const m of blob.matchAll(/profile\.php\?id=(\d{6,})/gi)) add(m[1]);
    add(extra.profileId);
    return [...ids];
}

export function isGenuinePublicPhone(raw = '', ignoreDigits = []) {
    let s = String(raw || '').replace(/\s+/g, ' ').trim();
    if (!s) return '';
    // Facebook About/intro often appends a tiny counter (" 1", " 2") after a real number.
    const withoutTrail = s.replace(/\s+\d{1,2}$/, '').trim();
    const trailDigits = withoutTrail.replace(/\D/g, '');
    if (/\s+\d{1,2}$/.test(s) && trailDigits.length >= 10 && trailDigits.length <= 15) {
        s = withoutTrail;
    }
    const digits = s.replace(/\D/g, '');
    if (digits.length < 10 || digits.length > 15) return '';
    const ignore = new Set((ignoreDigits || []).map((x) => String(x || '').replace(/\D/g, '')).filter(Boolean));
    if (ignore.has(digits)) return '';
    return s;
}

export function extractPublicContactFields({ text = '', hrefs = [], tel = '', mail = '', website = '', ignoreDigits = [] } = {}) {
    const blob = stripFacebookIdentityMetadata(
        [text, Array.isArray(hrefs) ? hrefs.join(' ') : '', tel, mail, website].filter(Boolean).join('\n'),
    );
    const instagram = (() => {
        const m = blob.match(/https?:\/\/(?:www\.)?instagram\.com\/([A-Za-z0-9._]+)\/?/i);
        if (!m) return '';
        const handle = m[1];
        if (['p', 'reel', 'reels', 'stories', 'explore', 'accounts', 'direct'].includes(handle.toLowerCase())) return '';
        return `https://www.instagram.com/${handle}/`;
    })();
    const email = mail || (blob.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i) || [])[0] || '';
    const waMe = blob.match(/https?:\/\/(?:wa\.me|api\.whatsapp\.com\/send\?phone=)\/?(\+?\d{10,15})/i);
    const rawPhone = tel
        || (waMe ? waMe[1] : '')
        || (blob.match(/(?:\+?\d[\d\s().-]{8,16}\d)/) || [])[0]
        || '';
    const phone = isGenuinePublicPhone(rawPhone, ignoreDigits);
    const waDigits = waMe ? isGenuinePublicPhone(waMe[1], ignoreDigits).replace(/\D/g, '') : '';
    const phoneDigits = phone.replace(/\D/g, '');
    const whatsapp = waDigits || (phoneDigits.length >= 10 && phoneDigits.length <= 15 ? phoneDigits : '');
    return {
        instagramUrl: instagram,
        email: String(email || '').trim(),
        phone,
        whatsapp,
        website: String(website || '').trim(),
    };
}

export const FACEBOOK_COMMUNITY_SEARCH_TYPES = Object.freeze([
    'group_intelligence',
    'page_audience',
    'page_engagement',
    'related_pages',
]);

export const FACEBOOK_DISCOVERY_TYPES = Object.freeze({
    GROUP_INTELLIGENCE: 'group_intelligence',
    GROUP_PEOPLE_TAB: 'group_people_tab',
    PAGE_AUDIENCE: 'page_audience',
    PAGE_ENGAGEMENT: 'page_engagement',
    RELATED_PAGE: 'related_page',
    RELATED_GROUP: 'related_group',
    PUBLIC_POST: 'public_post',
});

export const FACEBOOK_STOP_REASONS = Object.freeze({
    SOURCE_EXHAUSTED: 'source_exhausted',
    MANUAL_STOP: 'manual_stop',
    BATCH_COMPLETE: 'batch_complete',
    SESSION_EXPIRED: 'session_expired',
    SESSION_ATTENTION_REQUIRED: 'session_attention_required',
    SAFETY_PAUSE: 'safety_pause',
    TECHNICAL_FAILURE: 'technical_failure',
    PERSISTENCE_FAILURE: 'persistence_failure',
});

const RELEVANT_CATEGORY_RE = /\b(home automation|smart home|smarthome|system integrator|system integration|dali|lighting automation|led|lighting|electrical|electrician|architect|interior designer|builder|developer|oem|dealer|distributor|installer|contractor|electronics manufacturer|knx|av automation|hotel automation|smart control panel|ai hardware)\b/i;

export function parseDisplayedCount(raw = '') {
    const s = String(raw || '').trim().replace(/,/g, '');
    if (!s) return null;
    const m = s.match(/^([\d.]+)\s*([KkMm])?$/);
    if (!m) {
        const n = Number(s.replace(/[^\d.]/g, ''));
        return Number.isFinite(n) && n > 0 ? n : null;
    }
    const n = Number(m[1]);
    if (!Number.isFinite(n)) return null;
    const mul = m[2] === 'K' || m[2] === 'k' ? 1000 : (m[2] === 'M' || m[2] === 'm' ? 1000000 : 1);
    return Math.round(n * mul);
}

export function displayedCountIsNotExtractedCount(displayedRaw, extractedCount) {
    const displayed = parseDisplayedCount(displayedRaw);
    const extracted = Number(extractedCount) || 0;
    if (displayed == null) return true;
    return displayed !== extracted;
}

export function facebookCaptureKey(record = {}) {
    const url = String(record.resultUrlNormalized || record.resultUrlOriginal || record.resultUrl || record.pageUrl || '')
        .trim().toLowerCase().replace(/\/+$/, '');
    if (url) return url;
    return String(record.sourceRecordId || '').trim().toLowerCase();
}

export function isAlreadySeen(seen, record) {
    const key = facebookCaptureKey(record);
    return Boolean(key && seen.has(key));
}

export function addSeenKey(seen, record) {
    const key = facebookCaptureKey(record);
    if (key) seen.add(key);
    return key;
}

export function nextUnseenBatch(candidates = [], seen, batchSize = FACEBOOK_COMMUNITY_BATCH_SIZE) {
    const size = Math.max(1, Number(batchSize) || FACEBOOK_COMMUNITY_BATCH_SIZE);
    const batch = [];
    let alreadyKnown = 0;
    for (const rec of candidates) {
        if (isAlreadySeen(seen, rec)) {
            alreadyKnown += 1;
            continue;
        }
        batch.push(rec);
        if (batch.length >= size) break;
    }
    return { batch, alreadyKnown, batchSize: size };
}

export function splitIntoBatches(records = [], batchSize = FACEBOOK_COMMUNITY_BATCH_SIZE) {
    const size = Math.max(1, Number(batchSize) || FACEBOOK_COMMUNITY_BATCH_SIZE);
    const batches = [];
    for (let i = 0; i < records.length; i += size) {
        batches.push({
            index: batches.length + 1,
            records: records.slice(i, i + size),
            newCount: Math.min(size, records.length - i),
        });
    }
    return batches;
}

export function resolveFacebookStopReason({
    stopRequested = false,
    sessionExpired = false,
    challenge = '',
    technicalError = '',
    queueEmpty = false,
    queriesExhausted = false,
} = {}) {
    if (stopRequested) return FACEBOOK_STOP_REASONS.MANUAL_STOP;
    if (sessionExpired) return FACEBOOK_STOP_REASONS.SESSION_EXPIRED;
    if (technicalError) return FACEBOOK_STOP_REASONS.TECHNICAL_FAILURE;
    if (challenge) {
        if (/checkpoint|confirm you.?re human|unusual activity|temporarily blocked|suspicious activity/i.test(String(challenge))) {
            return FACEBOOK_STOP_REASONS.SESSION_ATTENTION_REQUIRED;
        }
        return FACEBOOK_STOP_REASONS.SAFETY_PAUSE;
    }
    if (queueEmpty || queriesExhausted) return FACEBOOK_STOP_REASONS.SOURCE_EXHAUSTED;
    return '';
}

export function facebookCompanyFirst(text = '', fallbackName = '') {
    const blob = String(text || '').replace(/[—–]/g, '-');
    const person = String(fallbackName || '').trim();
    const patterns = [
        /(?:director|managing director|founder|owner|ceo|proprietor|partner|manager)\s*(?:at|of|:|—|–|-)\s*([A-Z][A-Za-z0-9&.''\s]{2,80})/i,
        /works?\s+at\s+([A-Z][A-Za-z0-9&.''\s]{2,80})/i,
        /(?:director|founder|owner|ceo)\s+([A-Z][A-Za-z0-9&.''\s]{2,80})/i,
    ];
    for (const re of patterns) {
        const m = blob.match(re);
        if (m?.[1]) {
            const companyName = m[1].replace(/[,|].*$/, '').replace(/\s+/g, ' ').trim().slice(0, 120);
            if (companyName && companyName.toLowerCase() !== person.toLowerCase()) {
                return { companyName, personEvidence: person, companyFirst: true };
            }
        }
    }
    return { companyName: person, personEvidence: '', companyFirst: false };
}

export function classifyFacebookCommunityRelevance({
    name = '',
    cardText = '',
    profileText = '',
    website = '',
    keyword = '',
    inaccessible = false,
} = {}) {
    if (inaccessible) return 'private_unavailable';
    const blob = `${name}\n${cardText}\n${profileText}\n${website}`;
    if (!blob.trim()) return 'private_unavailable';
    const kw = String(keyword || '').trim().toLowerCase();
    const lower = blob.toLowerCase();
    const hasKw = Boolean(kw && lower.includes(kw))
        || /\b(home automation|smart home|smarthome|knx|dali|lighting|integrator)\b/i.test(blob);
    const hasBiz = RELEVANT_CATEGORY_RE.test(blob)
        || /\b(works?\s+at|owner|founder|company|pvt|ltd|llp|enterprise|official|business|dealer|distributor|installer|contractor|architect|interior)\b/i.test(blob)
        || Boolean(website);
    if (hasKw && hasBiz) return 'relevant';
    if (hasKw || hasBiz) return 'possibly_relevant';
    return 'not_relevant';
}

export function shouldIngestFacebookCommunity(relevance) {
    return relevance === 'relevant' || relevance === 'possibly_relevant';
}

export function stripFacebookGroupChrome(text = '', groupTitle = '') {
    let s = String(text || '');
    const title = String(groupTitle || '').trim();
    if (title) {
        const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        s = s.replace(new RegExp(escaped, 'ig'), ' ');
    }
    s = s.replace(/\b(public group|private group|find a member|discussion|featured)\b/ig, ' ');
    return s.replace(/\s+/g, ' ').trim();
}

export function detectFacebookGroupPeopleUi({ bodyText = '', hrefs = [], pathname = '' } = {}) {
    const body = String(bodyText || '');
    const path = String(pathname || '');
    const links = Array.isArray(hrefs) ? hrefs : [];
    const isPublicGroup = /public group/i.test(body)
        || /\bpublic\b[^\n]{0,48}\bmembers?\b/i.test(body);
    const peopleTabVisible = /\bPeople\b/.test(body)
        || links.some((h) => /\/groups\/[^/]+\/(members|people)\b/i.test(String(h || '')));
    const peopleTabLikelyActive = /\/groups\/[^/]+\/(members|people)\b/i.test(path)
        || /find a member/i.test(body);
    return { isPublicGroup, peopleTabVisible, peopleTabLikelyActive };
}

export function emptyGroupAnalytics() {
    return {
        kind: 'group',
        groupTitle: '',
        groupUrl: '',
        displayedMemberCount: '',
        displayedMemberCountParsed: null,
        membersEnumerated: false,
        isPublicGroup: false,
        peopleTabAvailable: false,
        peopleTabOpened: false,
        peopleTabStatus: '',
        peopleUrl: '',
        visibleCards: 0,
        reviewed: 0,
        newUnseen: 0,
        scrollPass: 0,
        scrollHeight: 0,
        overlayDetected: false,
        stopNote: '',
        accessiblePeopleTabProfilesLoaded: 0,
        peopleTabFirstLoadCount: 0,
        peopleTabAfterScrollCount: 0,
        accessiblePostsReviewed: 0,
        accessibleProfilesReviewed: 0,
        relevant: 0,
        possiblyRelevant: 0,
        notRelevant: 0,
        privateUnavailable: 0,
        alreadyKnown: 0,
        newUniqueCompanies: 0,
        websites: 0,
        emails: 0,
        phones: 0,
        instagrams: 0,
        relatedGroupsFound: 0,
        relatedGroups: [],
        followerListAccessible: false,
        stopReason: '',
    };
}

export function emptyPageAnalytics() {
    return {
        kind: 'page',
        parentPage: '',
        parentUrl: '',
        displayedFollowerCount: '',
        displayedFollowerCountParsed: null,
        followerListAccessible: false,
        followerListNote: '',
        relatedPagesAccessible: false,
        engagementAccessible: false,
        accessibleProfilesReviewed: 0,
        relevant: 0,
        possiblyRelevant: 0,
        notRelevant: 0,
        privateUnavailable: 0,
        alreadyKnown: 0,
        newUniqueCompanies: 0,
        websites: 0,
        emails: 0,
        phones: 0,
        stopReason: '',
    };
}

export function summarizeFacebookCommunityRun({
    batchSize = FACEBOOK_COMMUNITY_BATCH_SIZE,
    batches = [],
    newThisRun = 0,
    alreadyKnown = 0,
    totalCaptured = 0,
    stopReason = '',
    analytics = null,
} = {}) {
    return {
        batchSize,
        batches: batches.map((b) => ({
            index: b.index,
            newCount: b.newCount ?? (b.records || []).length,
        })),
        newThisRun,
        alreadyKnown,
        totalCaptured,
        stopReason: stopReason || FACEBOOK_STOP_REASONS.SOURCE_EXHAUSTED,
        analytics: analytics || emptyGroupAnalytics(),
    };
}

export function deriveFacebookLiveMemberStatus(row = {}) {
    const review = String(row.reviewStatus || '').toLowerCase();
    const rel = String(row.relevance || row.businessProfessional || '').toLowerCase();
    const hasPhone = Boolean(row.phone && row.phone !== '—');
    const hasWhatsApp = Boolean(row.whatsapp && row.whatsapp !== '—');
    const hasEmail = Boolean(row.email && row.email !== '—');
    const hasWebsite = Boolean(row.website && row.website !== '—');
    if (hasPhone || hasWhatsApp || hasEmail) return 'Contactable';
    if (hasWebsite) return 'Website Found';
    if (/not_relevant|excluded/.test(rel) || /not_relevant|excluded/.test(review)) return 'Not Relevant';
    if (/relevant/.test(rel) && !/possibly/.test(rel)) return 'Relevant';
    if (/reviewed/.test(review) && !/not_reviewed/.test(review)) return 'Reviewed';
    if (/reviewing/.test(review) || /reviewing/.test(String(row.status || ''))) return 'Reviewing';
    return 'Discovered';
}

export function presentFacebookCommunityRow(capture = {}, identity = null) {
    const notes = String(capture.notes || '');
    const map = {};
    for (const part of notes.split(';')) {
        const idx = part.indexOf('=');
        if (idx < 1) continue;
        const k = part.slice(0, idx).trim();
        const v = part.slice(idx + 1).trim();
        if (k && v && map[k] == null) map[k] = v;
    }
    const snippet = String(capture.snippet || '');
    const parentGroupId = map.parentGroupId || facebookGroupIdFromUrl(map.groupUrl || map.parentUrl || '');
    const ignoreDigits = facebookIdentityDigitsFromText(`${notes}\n${capture.resultUrlNormalized || ''}`, {
        parentGroupId,
        groupUrl: map.groupUrl || map.parentUrl || '',
    });
    const contacts = extractPublicContactFields({
        text: snippet,
        website: map.website || capture.website || '',
        tel: map.phone || '',
        mail: map.email || '',
        hrefs: [map.instagramUrl].filter(Boolean),
        ignoreDigits,
    });
    const email = map.email || contacts.email || '';
    const phone = isGenuinePublicPhone(map.phone || contacts.phone || '', ignoreDigits);
    const instagramUrl = map.instagramUrl || contacts.instagramUrl || '';
    const phoneDigits = phone.replace(/\D/g, '');
    let whatsapp = isGenuinePublicPhone(map.whatsapp || contacts.whatsapp || phone, ignoreDigits).replace(/\D/g, '');
    if (phoneDigits && whatsapp.startsWith(phoneDigits) && whatsapp.length === phoneDigits.length + 1) {
        whatsapp = phoneDigits;
    }
    const isRelatedGroup = map.discoveryType === FACEBOOK_DISCOVERY_TYPES.RELATED_GROUP;
    const profileUrl = capture.resultUrlNormalized || capture.resultUrlOriginal || map.facebookUrl || map.evidenceUrl || '';
    const reviewStatus = map.reviewStatus || (map.relevance ? 'reviewed' : 'not_reviewed');
    const relevantLabel = /not_reviewed/i.test(reviewStatus) || !map.relevance
        ? 'Pending'
        : (map.relevance === 'relevant' ? 'Yes' : (map.relevance === 'not_relevant' ? 'No' : (map.relevance === 'possibly_relevant' ? 'Possibly' : 'Pending')));
    return {
        rawCaptureId: String(capture._id || ''),
        name: capture.title || map.companyName || '—',
        profileUrl,
        facebookUrl: map.facebookUrl || (isRelatedGroup ? '' : profileUrl),
        parentGroupId: parentGroupId || '—',
        instagramUrl: instagramUrl || '—',
        whatsapp: whatsapp || '—',
        businessProfessional: isRelatedGroup
            ? 'Related group'
            : (map.relevance === 'relevant' ? 'Business/Professional' : (map.relevance === 'possibly_relevant' ? 'Possibly relevant' : '—')),
        category: map.category || '—',
        parentGroup: map.parentGroup || map.groupName || '—',
        relevance: map.relevance || '',
        relevantLabel,
        parentPage: map.parentPage || '—',
        discoveryType: map.discoveryType || map.searchType || '—',
        website: map.website || capture.website || contacts.website || '—',
        phone: phone || '—',
        email: email || '—',
        isRelatedGroup,
        relatedGroupPrivacy: map.privacy || '',
        relatedGroupMembers: map.displayedMemberCount || '',
        company: map.companyName || (identity?.companyName) || '—',
        role: map.designation || map.personEvidence || '—',
        reviewStatus,
        city: map.city || '—',
        state: map.state || '—',
        country: map.country || '—',
        address: map.address || '—',
        businessCategory: map.category || map.businessCategory || '—',
        capturedAt: map.capturedAt || '',
        contactability: [phone, email, whatsapp, map.website].filter((x) => x && x !== '—').length ? 'contactable' : '—',
        liveStatus: deriveFacebookLiveMemberStatus({
            reviewStatus: map.reviewStatus || (map.relevance ? 'reviewed' : 'not_reviewed'),
            relevance: map.relevance,
            businessProfessional: map.relevance === 'relevant' ? 'Business/Professional' : '',
            phone,
            whatsapp,
            email,
            website: map.website || contacts.website || '',
            contactability: [phone, email, whatsapp, map.website].filter((x) => x && x !== '—').length ? 'contactable' : '—',
        }),
        aiScore: identity?.qualificationScore ?? '—',
        qualification: identity?.qualificationCategory || capture.qualificationStatus || '—',
        sourcePlatforms: 'Facebook',
        verification: identity?.verificationSummary?.status || 'Unverified',
        crmStatus: identity?.crmStatus || (capture.promotedExtractedLeadId ? 'Lead' : 'New'),
        notes,
        snippet,
        workflow: {
            enrichment: capture.enrichmentStatus || '',
            qualification: capture.qualificationStatus || '',
        },
    };
}
