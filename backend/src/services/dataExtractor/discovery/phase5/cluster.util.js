/**
 * Phase 5 — cluster evidence into company identities using Phase 2 scoreMergePair.
 * Does not delete source evidence. testOnly must be filtered before calling.
 */
import { DEFAULT_THRESHOLDS } from '../phase2/constants.js';
import { scoreMergePair } from '../phase2/smartMerge.util.js';
import { blockingKeys, collapseUrlDuplicates, isTestOnlyRecord, toPhase2Record } from './identityEvidence.util.js';
import { buildIdentityFromMembers } from './fieldSelect.util.js';

function candidatePairs(records) {
    const buckets = new Map();
    records.forEach((rec, idx) => {
        const { name, phone, domain } = blockingKeys(rec);
        const keys = [];
        if (name) keys.push(`n:${name}`);
        if (phone) keys.push(`p:${phone}`);
        if (domain) keys.push(`d:${domain}`);
        if (!keys.length) keys.push(`i:${idx}`);
        for (const k of keys) {
            if (!buckets.has(k)) buckets.set(k, []);
            buckets.get(k).push(idx);
        }
    });
    const seen = new Set();
    const pairs = [];
    for (const idxs of buckets.values()) {
        if (idxs.length < 2) continue;
        for (let i = 0; i < idxs.length; i += 1) {
            for (let j = i + 1; j < idxs.length; j += 1) {
                const a = Math.min(idxs[i], idxs[j]);
                const b = Math.max(idxs[i], idxs[j]);
                const key = `${a}:${b}`;
                if (seen.has(key)) continue;
                seen.add(key);
                pairs.push([a, b]);
            }
        }
    }
    return pairs;
}

export function classifyIncremental(previousKeys, identity) {
    const domain = identity.domain || '';
    const phone = (identity.primaryPhone || '').replace(/\D/g, '').slice(-10);
    const name = String(identity.canonicalName || '').toLowerCase();
    const hit = previousKeys.has(`d:${domain}`) || previousKeys.has(`p:${phone}`) || previousKeys.has(`n:${name}`);
    if (!hit) return 'new';
    return 'known';
}

export function clusterEvidence(evidenceList = [], { keepSeparateKeys = new Set() } = {}) {
    const filtered = collapseUrlDuplicates((evidenceList || []).filter((e) => e && !isTestOnlyRecord(e)));
    const parent = filtered.map((_, i) => i);
    const find = (i) => {
        while (parent[i] !== i) i = parent[i] = parent[parent[i]];
        return i;
    };
    const union = (a, b) => {
        const pa = find(a);
        const pb = find(b);
        if (pa === pb) return;
        parent[pb] = pa;
    };

    const reviewPairs = [];
    const autoMerged = [];
    const keptSeparate = [];

    for (const [ia, ib] of candidatePairs(filtered)) {
        const pairKey = [filtered[ia].evidenceId, filtered[ib].evidenceId].sort().join('|');
        if (keepSeparateKeys.has(pairKey)) {
            keptSeparate.push({ ia, ib, reason: 'manual_keep_separate' });
            continue;
        }
        const scored = scoreMergePair(toPhase2Record(filtered[ia]), toPhase2Record(filtered[ib]));
        if (scored.decision === 'auto_merge') {
            union(ia, ib);
            autoMerged.push({ ia, ib, ...scored });
        } else if (scored.decision === 'review') {
            reviewPairs.push({
                ia,
                ib,
                mergeConfidence: scored.mergeConfidence,
                reasons: scored.reasons,
                checks: scored.checks,
                evidenceA: filtered[ia],
                evidenceB: filtered[ib],
            });
        } else {
            keptSeparate.push({ ia, ib, ...scored });
        }
    }

    const groups = new Map();
    filtered.forEach((_, i) => {
        const p = find(i);
        if (!groups.has(p)) groups.set(p, []);
        groups.get(p).push(i);
    });

    const identities = [];
    for (const membersIdx of groups.values()) {
        const members = membersIdx.map((i) => filtered[i]);
        const conf = members.length > 1
            ? Math.max(...autoMerged.filter((m) => membersIdx.includes(m.ia) && membersIdx.includes(m.ib)).map((m) => m.mergeConfidence), DEFAULT_THRESHOLDS.autoMergeMin)
            : 100;
        identities.push(buildIdentityFromMembers(members, {
            mergeConfidence: members.length > 1 ? conf : 100,
            decision: members.length > 1 ? 'auto_merge' : 'single',
        }));
    }

    return {
        identities,
        reviewPairs,
        autoMerged,
        keptSeparate,
        evidenceCount: evidenceList.length,
        collapsedEvidenceCount: filtered.length,
        testOnlyExcluded: (evidenceList || []).filter(isTestOnlyRecord).length,
    };
}

export function mergeTwoIdentities(a, b, { userId, reason, confidence } = {}) {
    const members = [...(a.sourceMembers || a._members || []), ...(b.sourceMembers || b._members || [])];
    const fromRefs = [...(a.sourceRefs || []), ...(b.sourceRefs || [])];
    const built = buildIdentityFromMembers(
        members.length ? members : fromRefs.map((r) => ({
            ...r,
            companyName: r.title,
            sourcePlatform: r.source,
            sourceUrl: r.sourceUrl,
            kind: r.kind,
        })),
        { mergeConfidence: Number(confidence) || 100, decision: 'manual_merge' },
    );
    built.mergeHistory = [
        ...(a.mergeHistory || []),
        ...(b.mergeHistory || []),
        {
            action: 'manually_merged',
            at: new Date().toISOString(),
            by: userId ? String(userId) : '',
            reason: reason || 'manual merge',
            confidence: Number(confidence) || 100,
            fromIds: [a._id, b._id].map((x) => (x ? String(x) : '')).filter(Boolean),
        },
    ].slice(-50);
    return built;
}

export function campaignNeedIsBatchOnly(job = {}) {
    const unlimited = job.metadata?.unlimitedCollection !== false;
    const batch = Math.max(1, Number(job.batchSize) || 10);
    return { unlimited, batchSize: batch, targetHint: Number(job.targetCompanies) || batch };
}
