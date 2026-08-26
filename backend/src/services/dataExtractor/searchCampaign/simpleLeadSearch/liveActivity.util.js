/**
 * Live Processing Activity — map existing capture/enrich/qual/gen docs to
 * owner-facing stages. Presentation only; does not change pipeline decisions.
 */

export const LIVE_STAGES = Object.freeze({
    FOUND: 'FOUND',
    CAPTURED: 'CAPTURED',
    ENRICHING: 'ENRICHING',
    ENRICHED: 'ENRICHED',
    QUALIFYING: 'QUALIFYING',
    QUALIFIED: 'QUALIFIED',
    VERIFYING: 'VERIFYING',
    VERIFIED: 'VERIFIED',
    REVIEW_REQUIRED: 'REVIEW_REQUIRED',
    REJECTED: 'REJECTED',
    DIRECTORY: 'DIRECTORY',
    DUPLICATE: 'DUPLICATE',
    FAILED: 'FAILED',
});

export const LIVE_FILTERS = Object.freeze(['all', 'processing', 'verified', 'review', 'rejected', 'failed']);

const ENRICH_DONE = new Set(['completed', 'partial', 'review_required']);
const REJECTED_QUAL = new Set(['rejected', 'rejected_unusable', 'not_relevant']);
const VERIFIED_GEN = new Set(['verified_genuine', 'likely_genuine']);

function firstPhone(list) {
    if (!Array.isArray(list) || !list.length) return '';
    const p = list[0];
    return String(typeof p === 'string' ? p : (p?.normalized || p?.original || p?.value || '')).trim();
}

function firstEmail(list) {
    if (!Array.isArray(list) || !list.length) return '';
    const e = list[0];
    return String(typeof e === 'string' ? e : (e?.value || e?.address || '')).trim();
}

function hasPhone(en) {
    return Boolean(firstPhone(en?.phones) || firstPhone(en?.whatsappNumbers));
}

function hasEmail(en) {
    return Boolean(firstEmail(en?.emails));
}

export function sourceLabel(cap = {}) {
    const s = String(cap.source || cap.querySourceHint || cap.sourceHint || 'google').toLowerCase();
    if (s === 'google' || s === 'web') return 'Google';
    if (s === '1688') return '1688';
    if (s === 'baidu') return 'Baidu';
    if (s === 'sogou') return 'Sogou';
    if (s === 'so360') return '360 Search';
    if (s) return s.replace(/_/g, ' ');
    return 'Google';
}

function ts(value) {
    if (!value) return null;
    const d = value instanceof Date ? value : new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function domainOf(cap, enrich) {
    return String(enrich?.canonicalDomain || cap?.displayDomain || '').replace(/^www\./i, '').toLowerCase();
}

function inSet(set, id) {
    if (!set || !id) return false;
    return set.has(String(id));
}

function domainHit(jobs, key, domain) {
    const d = String(domain || '').toLowerCase();
    if (!d || !jobs?.[key]) return false;
    if (String(jobs[key].currentDomain || '').toLowerCase() === d) return true;
    return Boolean(jobs[key].domains?.has?.(d));
}

function isDirectoryEntity(enrich, gen, qual) {
    if (enrich?.isDirectorySource) return true;
    if (String(gen?.systemDecision || '') === 'directory_or_marketplace_only') return true;
    if (qual?.businessType === 'directory_marketplace') return true;
    const et = String(enrich?.entityType || '').toUpperCase();
    return ['DIRECTORY', 'MARKETPLACE', 'CATEGORY_PAGE', 'ASSOCIATION'].includes(et);
}

function contactFoundLabel(enrich) {
    if (!enrich) return '';
    const bits = [];
    if (hasPhone(enrich)) bits.push('Phone');
    if (firstPhone(enrich.whatsappNumbers) && !hasPhone(enrich)) bits.push('WhatsApp');
    else if (firstPhone(enrich.whatsappNumbers)) bits.push('WhatsApp');
    if (hasEmail(enrich)) bits.push('Email');
    if (enrich.websiteUrl || enrich.canonicalDomain) bits.push('Website');
    if (!bits.length) return 'Website scanned';
    const uniq = [...new Set(bits)];
    return `${uniq.join(' + ')} found`;
}

function locationLabel(qual) {
    if (!qual) return '';
    const match = String(qual.locationMatch || '');
    const state = String(qual.selectedState || qual.state || '').trim();
    if (match === 'match') return state ? `${state} match` : 'Location match';
    if (match === 'mismatch') return 'Location mismatch';
    if (match === 'unknown' || match === 'partial') return 'Location not confirmed';
    return '';
}

function qualifyResultLabel(qual) {
    if (!qual) return '';
    const dec = String(qual.systemDecision || '');
    if (REJECTED_QUAL.has(dec)) return 'Not relevant';
    const bt = String(qual.businessType || qual.matchedBusinessType || '').replace(/_/g, ' ');
    const loc = locationLabel(qual);
    const prod = String(qual.productMatchStrength || '');
    const parts = [];
    if (/manufacturer/i.test(bt)) parts.push('Manufacturer');
    else if (bt && bt !== 'unknown') parts.push(bt);
    if (loc) parts.push(loc);
    if (/strong/i.test(prod)) parts.push('Strong product match');
    if (dec === 'possible_match' && !parts.length) parts.push('Possible match');
    if (dec === 'strong_match' && !parts.length) parts.push('Relevant');
    if (dec === 'human_review_required') parts.push('Needs review');
    return parts.join(' · ') || 'Qualified';
}

function verifyResultLabel(gen) {
    const d = String(gen?.systemDecision || gen?.genuinenessDecision || '');
    if (d === 'verified_genuine') return 'Genuine company';
    if (d === 'likely_genuine') return 'Likely genuine';
    if (d === 'human_review_required') return 'Needs owner review';
    if (d === 'directory_or_marketplace_only') return 'Discovery source';
    if (d === 'suspected_unreliable') return 'Suspected unreliable';
    if (d === 'rejected_unusable') return 'Rejected';
    return d.replace(/_/g, ' ') || 'Verified';
}

/**
 * Derive the current owner-facing stage for one RawCapture join.
 */
export function mapLiveActivityRow({ cap, enrich = null, qual = null, gen = null, jobs = {} } = {}) {
    const captureId = String(cap?._id || '');
    const enrichId = enrich?._id ? String(enrich._id) : '';
    const qualId = qual?._id ? String(qual._id) : '';
    const domain = domainOf(cap, enrich);
    const companyName = String(
        enrich?.canonicalCompanyName || enrich?.companyName || gen?.companyName || cap?.title || 'Untitled result',
    ).replace(/\s+/g, ' ').trim();

    const enrichingNow = String(cap?.enrichmentStatus || '') === 'processing'
        || inSet(jobs.enriching?.captureIds, captureId)
        || domainHit(jobs, 'enriching', domain);
    const qualifyingNow = Boolean(enrich)
        && !qual
        && (inSet(jobs.qualifying?.enrichmentIds, enrichId) || domainHit(jobs, 'qualifying', domain));
    const verifyingNow = Boolean(qual)
        && !gen
        && (inSet(jobs.verifying?.qualificationIds, qualId) || domainHit(jobs, 'verifying', domain));

    let stage = LIVE_STAGES.CAPTURED;
    let result = 'Processing';
    const directory = isDirectoryEntity(enrich, gen, qual);

    if (gen) {
        if (gen.verificationStatus === 'failed') {
            stage = LIVE_STAGES.FAILED;
            result = gen.errorReason || gen.verificationReason || 'Failed';
        } else if (gen.systemDecision === 'human_review_required') {
            stage = LIVE_STAGES.REVIEW_REQUIRED;
            result = verifyResultLabel(gen);
        } else if (directory || gen.systemDecision === 'directory_or_marketplace_only') {
            stage = LIVE_STAGES.DIRECTORY;
            result = 'Directory / marketplace discovery source';
        } else if (VERIFIED_GEN.has(String(gen.systemDecision || ''))
            || gen.ownerReviewStatus === 'approved') {
            stage = LIVE_STAGES.VERIFIED;
            result = verifyResultLabel(gen);
        } else if (['rejected_unusable', 'suspected_unreliable'].includes(String(gen.systemDecision || ''))) {
            stage = LIVE_STAGES.REJECTED;
            result = verifyResultLabel(gen);
        } else {
            stage = LIVE_STAGES.VERIFIED;
            result = verifyResultLabel(gen);
        }
    } else if (verifyingNow) {
        stage = LIVE_STAGES.VERIFYING;
        result = 'Genuineness check running';
    } else if (qual && REJECTED_QUAL.has(String(qual.systemDecision || ''))) {
        stage = LIVE_STAGES.REJECTED;
        result = qual.decisionReason || 'Not relevant';
    } else if (qual) {
        stage = LIVE_STAGES.QUALIFIED;
        result = verifyingNow ? 'Genuineness check running' : (qualifyResultLabel(qual) || 'Waiting for verification');
        if (!gen && !verifyingNow) result = `${qualifyResultLabel(qual) || 'Qualified'} · waiting for verification`;
    } else if (qualifyingNow) {
        stage = LIVE_STAGES.QUALIFYING;
        result = 'Product / location / business-type check';
    } else if (enrich && ENRICH_DONE.has(String(enrich.enrichmentStatus || ''))) {
        stage = LIVE_STAGES.ENRICHED;
        result = contactFoundLabel(enrich);
    } else if (enrichingNow || (enrich && String(enrich.enrichmentStatus) === 'processing')) {
        stage = LIVE_STAGES.ENRICHING;
        result = 'Opening website / extracting contacts';
    } else if (['failed', 'blocked'].includes(String(cap?.enrichmentStatus || ''))) {
        const reason = String(cap?.enrichmentBlockedReason || enrich?.errorReason || '');
        if (/no website|directory|missing.?url/i.test(reason)) {
            stage = LIVE_STAGES.REJECTED;
            result = reason.slice(0, 160) || 'Skipped';
        } else {
            stage = LIVE_STAGES.FAILED;
            result = reason.slice(0, 160) || 'Failed';
        }
    } else {
        stage = LIVE_STAGES.CAPTURED;
        result = 'Waiting for enrichment';
    }

    const duplicateStatus = String(cap?.duplicateStatus || 'unchecked');
    const duplicateSource = duplicateStatus === 'duplicate' || duplicateStatus === 'possible';

    const phone = firstPhone(enrich?.phones);
    const email = firstEmail(enrich?.emails);
    const whatsapp = firstPhone(enrich?.whatsappNumbers);
    const website = String(enrich?.websiteUrl || '').trim();

    const contactBits = [];
    if (phone) contactBits.push(phone.replace(/^\+91/, ''));
    if (email) contactBits.push(email);
    const contact = contactBits.join(' · ') || '—';

    const lastActivity = [
        cap?.updatedAt, cap?.lastSeenAt, cap?.firstSeenAt, cap?.createdAt,
        enrich?.updatedAt, enrich?.lastEnrichedAt, enrich?.createdAt,
        qual?.updatedAt, qual?.qualifiedAt, qual?.createdAt,
        gen?.updatedAt, gen?.verifiedAt, gen?.createdAt,
    ].map(ts).filter(Boolean).sort().at(-1) || null;

    const journey = buildJourney({ cap, enrich, qual, gen, stage });

    return {
        captureId,
        companyName,
        source: sourceLabel(cap),
        sourceUrl: cap?.resultUrlOriginal || cap?.resultUrlNormalized || website || '',
        canonicalDomain: domain,
        stage,
        stageLabel: stage.replace(/_/g, ' '),
        result,
        contact,
        phone: phone || '',
        email: email || '',
        whatsapp: whatsapp || '',
        website,
        businessType: String(qual?.businessType || enrich?.businessType || ''),
        locationMatch: String(qual?.locationMatch || ''),
        locationLabel: locationLabel(qual),
        productMatchStrength: String(qual?.productMatchStrength || ''),
        duplicateSource,
        duplicateStatus,
        consolidatedInto: '',
        isDirectory: directory,
        filterKey: filterKeyForStage(stage),
        lastActivity,
        capturedAt: ts(cap?.firstSeenAt || cap?.createdAt),
        journey,
    };
}

function pushStep(list, at, stage, label) {
    if (!at) return;
    list.push({ at, stage, label });
}

function buildJourney({ cap, enrich, qual, gen, stage }) {
    const steps = [];
    const foundAt = ts(cap?.firstSeenAt || cap?.createdAt);
    pushStep(steps, foundAt, LIVE_STAGES.FOUND, `Found from ${sourceLabel(cap)}`);
    pushStep(steps, ts(cap?.createdAt || cap?.firstSeenAt), LIVE_STAGES.CAPTURED, 'Raw capture stored');
    if (enrich) {
        const enrichAt = ts(enrich.lastEnrichedAt || enrich.updatedAt || enrich.createdAt);
        const enriching = String(enrich.enrichmentStatus) === 'processing' || stage === LIVE_STAGES.ENRICHING;
        if (enriching && !ENRICH_DONE.has(String(enrich.enrichmentStatus || ''))) {
            pushStep(steps, enrichAt || foundAt, LIVE_STAGES.ENRICHING, 'Enriching website / contacts');
        } else {
            pushStep(steps, enrichAt, LIVE_STAGES.ENRICHED, contactFoundLabel(enrich) || 'Website enriched');
        }
    } else if (stage === LIVE_STAGES.ENRICHING) {
        pushStep(steps, ts(cap?.updatedAt), LIVE_STAGES.ENRICHING, 'Enriching website / contacts');
    }
    if (qual) {
        pushStep(
            steps,
            ts(qual.qualifiedAt || qual.updatedAt || qual.createdAt),
            LIVE_STAGES.QUALIFIED,
            qualifyResultLabel(qual) || 'Qualification completed',
        );
    } else if (stage === LIVE_STAGES.QUALIFYING) {
        pushStep(steps, ts(enrich?.updatedAt), LIVE_STAGES.QUALIFYING, 'Qualification running');
    }
    if (gen) {
        const label = stage === LIVE_STAGES.REVIEW_REQUIRED
            ? 'Review required'
            : stage === LIVE_STAGES.DIRECTORY
                ? 'Directory / discovery source'
                : stage === LIVE_STAGES.REJECTED
                    ? (verifyResultLabel(gen) || 'Rejected')
                    : (verifyResultLabel(gen) || 'Verification completed');
        pushStep(steps, ts(gen.verifiedAt || gen.updatedAt || gen.createdAt), stage, label);
    } else if (stage === LIVE_STAGES.VERIFYING) {
        pushStep(steps, ts(qual?.updatedAt), LIVE_STAGES.VERIFYING, 'Genuineness check running');
    }
    const reason = gen?.verificationReason || qual?.decisionReason || cap?.enrichmentBlockedReason || '';
    if (reason) {
        steps.push({ at: steps.at(-1)?.at || foundAt, stage: 'EVIDENCE', label: String(reason).slice(0, 400) });
    }
    return steps;
}

export function filterKeyForStage(stage) {
    if (stage === LIVE_STAGES.VERIFIED) return 'verified';
    if (stage === LIVE_STAGES.REVIEW_REQUIRED) return 'review';
    if (stage === LIVE_STAGES.REJECTED || stage === LIVE_STAGES.DIRECTORY) return 'rejected';
    if (stage === LIVE_STAGES.FAILED) return 'failed';
    return 'processing';
}

export function applyLiveFilter(rows = [], filter = 'all') {
    const f = String(filter || 'all').toLowerCase();
    if (!f || f === 'all') return rows;
    return rows.filter((r) => r.filterKey === f);
}

/** Same canonical domain among verified/qualified rows → later rows marked duplicate source. */
export function markDuplicateSourceRows(rows = []) {
    const byDomain = new Map();
    for (const r of rows) {
        const d = String(r.canonicalDomain || '').toLowerCase();
        if (!d || r.isDirectory) continue;
        if (!byDomain.has(d)) byDomain.set(d, []);
        byDomain.get(d).push(r);
    }
    for (const [, group] of byDomain) {
        if (group.length < 2) continue;
        const primary = group.find((g) => g.stage === LIVE_STAGES.VERIFIED) || group[0];
        for (const r of group) {
            if (r.captureId === primary.captureId) continue;
            r.duplicateSource = true;
            r.consolidatedInto = primary.companyName;
        }
    }
    return rows;
}

export function buildCurrentHeadline(rows = [], jobs = {}) {
    const inflight = rows.find((r) => (
        r.stage === LIVE_STAGES.VERIFYING
        || r.stage === LIVE_STAGES.QUALIFYING
        || r.stage === LIVE_STAGES.ENRICHING
    ));
    if (inflight?.stage === LIVE_STAGES.VERIFYING) {
        return `Currently: Verifying ${inflight.companyName}`;
    }
    if (inflight?.stage === LIVE_STAGES.QUALIFYING) {
        return `Currently: Qualifying ${inflight.companyName}`;
    }
    if (inflight?.stage === LIVE_STAGES.ENRICHING) {
        return `Currently: Enriching ${inflight.companyName}`;
    }
    const domain = String(jobs.verifying?.currentDomain || jobs.qualifying?.currentDomain || jobs.enriching?.currentDomain || '').trim();
    if (domain && jobs.verifying?.currentDomain) return `Currently: Verifying ${domain}`;
    if (domain && jobs.qualifying?.currentDomain) return `Currently: Qualifying ${domain}`;
    if (domain && jobs.enriching?.currentDomain) return `Currently: Enriching ${domain}`;

    const latestFinal = [...rows]
        .filter((r) => ['VERIFIED', 'REVIEW_REQUIRED', 'REJECTED', 'DIRECTORY', 'FAILED'].includes(r.stage))
        .sort((a, b) => String(b.lastActivity || '').localeCompare(String(a.lastActivity || '')))[0];
    if (latestFinal?.stage === LIVE_STAGES.VERIFIED) {
        return `Verified: ${latestFinal.companyName}`;
    }
    if (latestFinal?.stage === LIVE_STAGES.REVIEW_REQUIRED) {
        return `Review required: ${latestFinal.companyName}`;
    }
    if (latestFinal) {
        return `${latestFinal.stageLabel}: ${latestFinal.companyName}`;
    }
    const latest = rows[0];
    if (latest) return `Currently: ${latest.stageLabel} — ${latest.companyName}`;
    return '';
}

export function clampLiveLimit(raw, fallback = 50) {
    const n = Number(raw);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(100, Math.max(1, Math.floor(n)));
}
