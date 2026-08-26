/**
 * Facebook Group Member Collector — operational batch sizes and campaign checkpoint.
 * Checkpoint is stored on SearchCampaign.facebookMemberCollector (same collection).
 * Seen member URLs live in RawCapture rows. No per-group Mongo collection.
 */

export const FACEBOOK_MEMBER_DISCOVERY_BATCH = 20;
export const FACEBOOK_MEMBER_REVIEW_BATCH = 8;
export const FACEBOOK_MEMBER_STUCK_SCROLLS = 5;
export const FACEBOOK_MEMBER_SCROLL_MAX_PER_RUN = 40;
export const FACEBOOK_MEMBER_FULL_SCROLL_SAFETY = 5000;

export const FACEBOOK_MEMBER_COLLECTOR_MODES = Object.freeze({
    NEXT_BATCH: 'next_batch',
    FULL_DISCOVERY: 'full_discovery',
    FULL_AUTOMATIC: 'full_automatic',
    REVIEW_NEXT: 'review_next',
    REVIEW_ALL: 'review_all',
});

export const FACEBOOK_MEMBER_CAMPAIGN_STATES = Object.freeze({
    DISCOVERING: 'DISCOVERING',
    DISCOVERY_PAUSED: 'DISCOVERY_PAUSED',
    DISCOVERY_COMPLETE: 'DISCOVERY_COMPLETE',
    REVIEWING: 'REVIEWING',
    REVIEW_PAUSED: 'REVIEW_PAUSED',
    COMPLETE: 'COMPLETE',
    SOURCE_EXHAUSTED: 'SOURCE_EXHAUSTED',
    SESSION_EXPIRED: 'SESSION_EXPIRED',
    TECHNICAL_FAILURE: 'TECHNICAL_FAILURE',
    PERSISTENCE_FAILURE: 'PERSISTENCE_FAILURE',
});

export const FACEBOOK_MEMBER_RUN_STATUS = Object.freeze({
    RUNNING: 'running',
    LOADING_MORE: 'loading_more',
    PAUSED: 'paused',
    STOPPED: 'stopped',
    SOURCE_EXHAUSTED: 'source_exhausted',
    SESSION_EXPIRED: 'session_expired',
    TECHNICAL_FAILURE: 'technical_failure',
    BATCH_COMPLETE: 'batch_complete',
});

export function campaignStateFromStop({ collectorMode = '', stopReason = '', paused = false } = {}) {
    const reason = String(stopReason || '');
    const mode = String(collectorMode || '');
    if (paused || reason === 'manual_stop') {
        return mode.startsWith('review')
            ? FACEBOOK_MEMBER_CAMPAIGN_STATES.REVIEW_PAUSED
            : FACEBOOK_MEMBER_CAMPAIGN_STATES.DISCOVERY_PAUSED;
    }
    if (reason === 'source_exhausted') return FACEBOOK_MEMBER_CAMPAIGN_STATES.SOURCE_EXHAUSTED;
    if (reason === 'session_expired' || reason === 'session_attention_required') {
        return FACEBOOK_MEMBER_CAMPAIGN_STATES.SESSION_EXPIRED;
    }
    if (reason === 'technical_failure' || reason === 'persistence_failure') {
        return FACEBOOK_MEMBER_CAMPAIGN_STATES.PERSISTENCE_FAILURE;
    }
    if (reason === 'batch_complete' && mode === FACEBOOK_MEMBER_COLLECTOR_MODES.FULL_DISCOVERY) {
        return FACEBOOK_MEMBER_CAMPAIGN_STATES.DISCOVERING;
    }
    if (reason === 'batch_complete') return FACEBOOK_MEMBER_CAMPAIGN_STATES.DISCOVERY_PAUSED;
    if (mode.startsWith('review')) return FACEBOOK_MEMBER_CAMPAIGN_STATES.REVIEWING;
    return FACEBOOK_MEMBER_CAMPAIGN_STATES.DISCOVERING;
}

/** Full mode must not treat an operational batch size as a campaign ceiling. */
export function isOperationalBatchNotCampaignCap(batchSize, campaignTotal) {
    return Number(campaignTotal) > Number(batchSize);
}

/**
 * Run Next Batch discovery must not classify/open profiles unless the
 * "Automatically review profiles after member discovery" checkbox is on.
 * Review Next Batch / Review All use collectorMode, not this helper.
 */
export function shouldInlineReviewAfterDiscovery({ collectorMode = '', autoReviewAfterDiscovery } = {}) {
    const mode = String(collectorMode || FACEBOOK_MEMBER_COLLECTOR_MODES.NEXT_BATCH);
    if (mode === FACEBOOK_MEMBER_COLLECTOR_MODES.REVIEW_NEXT
        || mode === FACEBOOK_MEMBER_COLLECTOR_MODES.REVIEW_ALL
        || mode === FACEBOOK_MEMBER_COLLECTOR_MODES.FULL_DISCOVERY
        || mode === FACEBOOK_MEMBER_COLLECTOR_MODES.FULL_AUTOMATIC) {
        return false;
    }
    return autoReviewAfterDiscovery === true;
}

export function shouldContinueFullDiscovery({ collectorMode, stopReason, shouldStop } = {}) {
    if (shouldStop) return false;
    const mode = String(collectorMode || '');
    if (mode !== FACEBOOK_MEMBER_COLLECTOR_MODES.FULL_DISCOVERY && mode !== FACEBOOK_MEMBER_COLLECTOR_MODES.FULL_AUTOMATIC) {
        return false;
    }
    const reason = String(stopReason || '');
    if (!reason || reason === 'batch_complete') return true;
    return false;
}

export function emptyFacebookMemberCheckpoint({
    groupUrl = '',
    groupName = '',
    displayedMemberCount = '',
    privacy = '',
} = {}) {
    return {
        groupUrl: String(groupUrl || ''),
        groupName: String(groupName || ''),
        displayedMemberCount: String(displayedMemberCount || ''),
        privacy: String(privacy || ''),
        peopleTabStatus: '',
        peopleUrl: '',
        scrollPass: 0,
        lastScrollHeight: 0,
        uniqueMembersCollected: 0,
        profilesDiscovered: 0,
        profilesReviewed: 0,
        qualifiedProfiles: 0,
        relevant: 0,
        newCompanies: 0,
        websites: 0,
        phones: 0,
        emails: 0,
        alreadyKnown: 0,
        currentBatch: 0,
        lastSuccessfulAt: '',
        stopReason: '',
        status: '',
        campaignState: '',
        whatsapp: 0,
        contactable: 0,
        awaitingReview: 0,
    };
}

export function mergeFacebookMemberCheckpoint(prev = {}, patch = {}) {
    const base = { ...emptyFacebookMemberCheckpoint(prev), ...(prev || {}) };
    const next = { ...base, ...patch };
    delete next.profilesReviewedDelta;
    delete next.currentBatchDelta;
    next.lastSuccessfulAt = patch.lastSuccessfulAt || base.lastSuccessfulAt || new Date().toISOString();
    return next;
}

export function campaignNameForFacebookGroup({ groupName = '', groupUrl = '', keyword = '' } = {}) {
    const slug = String(groupUrl || '').replace(/\/$/, '').split('/').pop() || 'group';
    const title = String(groupName || keyword || 'Facebook group').slice(0, 80);
    return `Facebook · Members · ${title} · ${slug}`.slice(0, 160);
}

export function notesHaveGroupUrl(notes = '', groupUrl = '') {
    const want = String(groupUrl || '').replace(/\/$/, '').toLowerCase();
    if (!want) return false;
    const n = String(notes || '').toLowerCase();
    return n.includes(`groupurl=${want}`) || n.includes(`parenturl=${want}`);
}

export const FACEBOOK_MEMBER_EXPORT_HEADERS = [
    'Parent Group',
    'Person Name',
    'Company',
    'Designation',
    'Facebook URL',
    'Business Category',
    'Website',
    'Phone',
    'WhatsApp',
    'Email',
    'Address',
    'City',
    'State',
    'Country',
    'Relevance',
    'Qualification',
    'Contactability',
    'CRM Status',
    'Capture Date',
];

function dashOrEmpty(v) {
    const s = String(v ?? '').trim();
    if (!s || s === '—') return '';
    return s;
}

export function exportFacebookMemberRow(presented = {}) {
    const fb = presented.facebookCommunity || {};
    const wf = presented.workflow || {};
    return [
        dashOrEmpty(fb.parentGroup),
        dashOrEmpty(fb.name),
        dashOrEmpty(fb.company),
        dashOrEmpty(fb.role),
        dashOrEmpty(fb.facebookUrl || fb.profileUrl),
        dashOrEmpty(fb.businessCategory),
        dashOrEmpty(fb.website),
        dashOrEmpty(fb.phone),
        dashOrEmpty(fb.whatsapp),
        dashOrEmpty(fb.email),
        dashOrEmpty(fb.address),
        dashOrEmpty(fb.city),
        dashOrEmpty(fb.state),
        dashOrEmpty(fb.country),
        dashOrEmpty(fb.businessProfessional),
        dashOrEmpty(wf.qualificationLabel),
        dashOrEmpty(fb.contactability || wf.contactability),
        dashOrEmpty(fb.crmStatus || wf.crm),
        dashOrEmpty(fb.capturedAt),
    ];
}
