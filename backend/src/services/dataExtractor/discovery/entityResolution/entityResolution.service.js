import { ExtractedLead } from '../../../../models/extractedLead.model.js';
import { Lead } from '../../../../models/lead.model.js';
import Customer from '../../../../models/customer.model.js';
import { Supplier } from '../../../../models/supplier.model.js';
import { DiscoveryJob } from '../../../../models/discoveryJob.model.js';
import { compareTwoRecords, pickBestComparison } from './compareRecords.js';
import { decisionToDuplicateStatus } from './decisionLevels.js';
import { collectRecordKeys } from './matchUtils.js';

function escapeRegex(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function loadCrmCandidates(companyId, record) {
    const keys = collectRecordKeys(record);
    const candidates = [];

    const queries = [];

    if (keys.domain) {
        queries.push(
            ExtractedLead.find({
                companyId,
                normalizedDomain: keys.domain,
                status: { $nin: ['rejected'] },
            }).select('_id companyName website email phone mobile city stateProvince gstin sourceUrl socialLinks rawExtractedData duplicateStatus status').limit(5).lean()
                .then((rows) => rows.forEach((r) => candidates.push({ type: 'extracted_lead', id: r._id, label: r.companyName, record: r }))),
        );
    }
    if (keys.email) {
        queries.push(
            ExtractedLead.find({ companyId, email: keys.email, status: { $nin: ['rejected'] } }).select('_id companyName website email phone mobile city stateProvince gstin sourceUrl socialLinks rawExtractedData').limit(5).lean()
                .then((rows) => rows.forEach((r) => candidates.push({ type: 'extracted_lead', id: r._id, label: r.companyName, record: r }))),
        );
        queries.push(
            Lead.find({ companyId, customerEmail: new RegExp('^' + escapeRegex(keys.email) + '$', 'i') }).select('_id customerName customerEmail customerMobile city state website').limit(5).lean()
                .then((rows) => rows.forEach((r) => candidates.push({
                    type: 'lead',
                    id: r._id,
                    label: r.customerName,
                    record: {
                        companyName: r.customerName,
                        email: r.customerEmail,
                        phone: r.customerMobile,
                        city: r.city,
                        stateProvince: r.state,
                        website: r.website,
                    },
                }))),
        );
        queries.push(
            Customer.find({
                companyId,
                $or: [{ companyEmail: keys.email }, { 'contactPersons.email': keys.email }],
            }).select('_id customerName companyEmail mobileNumber city state website gstNumber').limit(5).lean()
                .then((rows) => rows.forEach((r) => candidates.push({
                    type: 'customer',
                    id: r._id,
                    label: r.customerName,
                    record: {
                        companyName: r.customerName,
                        email: r.companyEmail,
                        phone: r.mobileNumber,
                        city: r.city,
                        stateProvince: r.state,
                        website: r.website,
                        gstin: r.gstNumber,
                    },
                }))),
        );
        queries.push(
            Supplier.find({ companyId, email: keys.email, isDeleted: { $ne: true } }).select('_id supplierName email phone city state website gstin').limit(5).lean()
                .then((rows) => rows.forEach((r) => candidates.push({
                    type: 'supplier',
                    id: r._id,
                    label: r.supplierName,
                    record: {
                        companyName: r.supplierName,
                        email: r.email,
                        phone: r.phone,
                        city: r.city,
                        stateProvince: r.state,
                        website: r.website,
                        gstin: r.gstin,
                    },
                }))),
        );
    }
    if (keys.phone) {
        const tail = keys.phone.slice(-8);
        queries.push(
            Lead.find({ companyId, customerMobile: new RegExp(escapeRegex(tail)) }).select('_id customerName customerEmail customerMobile city state website').limit(5).lean()
                .then((rows) => rows.forEach((r) => candidates.push({
                    type: 'lead',
                    id: r._id,
                    label: r.customerName,
                    record: {
                        companyName: r.customerName,
                        email: r.customerEmail,
                        phone: r.customerMobile,
                        city: r.city,
                        stateProvince: r.state,
                        website: r.website,
                    },
                }))),
        );
    }
    if (keys.gstin) {
        queries.push(
            Customer.find({ companyId, gstNumber: keys.gstin }).select('_id customerName companyEmail mobileNumber city state website gstNumber').limit(5).lean()
                .then((rows) => rows.forEach((r) => candidates.push({
                    type: 'customer',
                    id: r._id,
                    label: r.customerName,
                    record: {
                        companyName: r.customerName,
                        email: r.companyEmail,
                        phone: r.mobileNumber,
                        city: r.city,
                        stateProvince: r.state,
                        website: r.website,
                        gstin: r.gstNumber,
                    },
                }))),
        );
    }

    await Promise.all(queries);
    return candidates;
}

async function loadDiscoveryJobCandidates(companyId, record, { excludeJobId = null } = {}) {
    const keys = collectRecordKeys(record);
    const q = { companyId, isDeleted: { $ne: true } };
    if (excludeJobId) q._id = { $ne: excludeJobId };
    const jobs = await DiscoveryJob.find(q).sort({ createdAt: -1 }).limit(25).select('_id keyword metadata.previewRecords').lean();
    const out = [];
    for (const job of jobs) {
        const preview = job.metadata?.previewRecords || [];
        for (let i = 0; i < preview.length; i++) {
            const row = preview[i];
            const rk = collectRecordKeys(row);
            const hit = (keys.domain && keys.domain === rk.domain)
                || (keys.email && keys.email === rk.email)
                || (keys.phone && keys.phone && keys.phone === rk.phone)
                || (keys.gstin && keys.gstin === rk.gstin)
                || (keys.companyKey && keys.companyKey === rk.companyKey && keys.city && keys.city === rk.city);
            if (!hit) continue;
            out.push({
                type: 'discovery_preview',
                id: String(job._id) + ':' + i,
                label: (row.companyName || 'Preview') + ' @ job ' + job.keyword,
                record: row,
                discoveryJobId: job._id,
                previewIndex: i,
            });
            if (out.length >= 15) return out;
        }
    }
    return out;
}

function compareWithinJob(record, peers = []) {
    const comparisons = [];
    for (const peer of peers) {
        if (peer === record) continue;
        if (peer._previewIndex != null && record._previewIndex != null && peer._previewIndex === record._previewIndex) continue;
        const cmp = compareTwoRecords(record, peer, {
            candidateType: 'same_job_preview',
            candidateId: peer._previewIndex,
            candidateLabel: peer.companyName,
        });
        if (cmp.matchScore >= 40) comparisons.push(cmp);
    }
    return comparisons;
}

/**
 * Full entity resolution for one record against CRM + discovery history + optional same-job peers.
 */
export async function resolveEntityDuplicates(companyId, record, options = {}) {
    const { sameJobPeers = [], excludeJobId = null } = options;
    const comparisons = [];

    comparisons.push(...compareWithinJob(record, sameJobPeers));

    const [crmCandidates, discoveryCandidates] = await Promise.all([
        loadCrmCandidates(companyId, record),
        loadDiscoveryJobCandidates(companyId, record, { excludeJobId }),
    ]);

    // Dedupe candidate ids
    const seen = new Set();
    for (const c of [...crmCandidates, ...discoveryCandidates]) {
        const key = c.type + ':' + String(c.id);
        if (seen.has(key)) continue;
        seen.add(key);
        const cmp = compareTwoRecords(record, c.record, {
            candidateType: c.type,
            candidateId: c.id,
            candidateLabel: c.label,
        });
        if (cmp.matchScore >= 40) comparisons.push(cmp);
    }

    const best = pickBestComparison(comparisons);
    const duplicateStatus = decisionToDuplicateStatus(best.decision);
    const duplicateMatchRefs = (best.candidates || []).map((c) => ({
        type: c.type,
        refId: ['extracted_lead', 'lead', 'customer', 'supplier'].includes(c.type) ? c.id : undefined,
        matchScore: c.matchScore,
        matchField: (c.reasons || [])[0]?.field || 'composite',
        decision: c.decision,
        reasons: c.reasons,
    }));

    return {
        duplicateStatus,
        duplicateMatchRefs,
        entityResolution: {
            decision: best.decision,
            matchScore: best.matchScore,
            reasons: best.reasons,
            candidates: best.candidates,
            sideBySide: best.sideBySide,
            requiresManualReview: best.requiresManualReview,
            autoMergeAllowed: false,
            resolvedAt: null,
            resolutionAction: null,
            checkedAt: new Date().toISOString(),
            version: 'phase4-v1',
        },
        _isDuplicate: duplicateStatus !== 'none',
        _duplicateLabel: null, // filled by mapDuplicateDisplayLabel later
    };
}

export async function enrichRecordsWithEntityResolution(companyId, records, options = {}) {
    const list = Array.isArray(records) ? records : [];
    const withIndex = list.map((r, i) => ({ ...r, _previewIndex: r._previewIndex != null ? r._previewIndex : i }));
    const enriched = [];
    for (const rec of withIndex) {
        const peers = withIndex.filter((p) => p._previewIndex !== rec._previewIndex);
        const result = await resolveEntityDuplicates(companyId, rec, {
            sameJobPeers: peers,
            excludeJobId: options.excludeJobId || rec.rawExtractedData?.discoveryJobId || null,
        });
        enriched.push({
            ...rec,
            duplicateStatus: result.duplicateStatus,
            duplicateMatchRefs: result.duplicateMatchRefs,
            entityResolution: result.entityResolution,
            _isDuplicate: result._isDuplicate,
        });
    }
    return enriched;
}

export { compareTwoRecords, decisionToDuplicateStatus, collectRecordKeys };
export { decideFromScoreAndReasons } from './decisionLevels.js';
