/**
 * Phase 5 identity persistence. Does not mutate RawCapture or genuineness.
 */
import { ExtractorCompanyIdentity } from '../../../../models/extractorCompanyIdentity.model.js';
import { DiscoveryJob } from '../../../../models/discoveryJob.model.js';
import { RawCapture } from '../../../../models/rawCapture.model.js';
import { DiscoveryMergeReview } from '../../../../models/discoveryMergeReview.model.js';
import { ApiError } from '../../../../utils/ApiError.js';
import { checkDuplicateForRecord } from '../../duplicateChecker.service.js';
import { clusterEvidence } from './cluster.util.js';
import { isTestOnlyRecord, previewRecordToEvidence, rawCaptureToEvidence } from './identityEvidence.util.js';

function identityMatchFilter(companyId, ident) {
    const or = [];
    if (ident.domain) or.push({ domain: ident.domain });
    const phone = String(ident.primaryPhone || '').replace(/\D/g, '').slice(-10);
    if (phone.length >= 8) or.push({ primaryPhone: new RegExp(`${phone}$`) });
    if (ident.canonicalName && ident.city) {
        or.push({ canonicalName: ident.canonicalName, city: ident.city });
    }
    if (!or.length) or.push({ canonicalName: ident.canonicalName || '__none__' });
    return { companyId, isDeleted: { $ne: true }, testOnly: { $ne: true }, mergedIntoId: null, $or: or };
}

function detectChanges(prev, next) {
    const changes = [];
    const pairs = [
        ['website', 'Company website newly found'],
        ['primaryEmail', 'New email discovered'],
        ['primaryPhone', 'Phone changed'],
        ['social.facebookUrl', 'New Facebook page found'],
        ['social.linkedinCompanyUrl', 'New LinkedIn found'],
        ['address', 'Address changed'],
    ];
    const get = (obj, path) => path.split('.').reduce((o, k) => o?.[k], obj);
    for (const [path, label] of pairs) {
        const a = String(get(prev, path) || '').trim().toLowerCase();
        const b = String(get(next, path) || '').trim().toLowerCase();
        if (!b || a === b) continue;
        if (!a && b) changes.push({ field: path, label, from: '', to: get(next, path) });
        else if (a && b && a !== b && !['primaryPhone'].includes(path.split('.').pop())) {
            changes.push({ field: path, label, from: get(prev, path), to: get(next, path) });
        } else if (path === 'primaryPhone' && a && b && a.replace(/\D/g, '').slice(-10) !== b.replace(/\D/g, '').slice(-10)) {
            changes.push({ field: path, label: 'Phone changed', from: get(prev, path), to: get(next, path) });
        }
    }
    return changes;
}

export async function consolidateCompanyIdentities({
    companyId,
    userId,
    financialYear = '',
    includeRawCaptures = true,
    includeDiscoveryPreview = true,
    limit = 400,
} = {}) {
    const evidence = [];
    if (includeRawCaptures) {
        const caps = await RawCapture.find({ companyId }).sort({ updatedAt: -1 }).limit(limit).lean();
        for (const cap of caps) {
            const ev = rawCaptureToEvidence(cap);
            if (ev) evidence.push(ev);
        }
    }
    if (includeDiscoveryPreview) {
        const jobs = await DiscoveryJob.find({ companyId, isDeleted: { $ne: true } }).sort({ updatedAt: -1 }).limit(20).lean();
        for (const job of jobs) {
            const preview = job.metadata?.previewRecords || [];
            preview.forEach((rec, idx) => {
                if (rec?.phase2Merge?.mergedIntoPreviewIndex != null) return;
                const ev = previewRecordToEvidence(rec, { jobId: job._id, previewIndex: idx });
                if (ev) evidence.push(ev);
            });
        }
    }

    const clustered = clusterEvidence(evidence);
    const incremental = { new: 0, known: 0, updated: 0 };
    const saved = [];

    for (const ident of clustered.identities) {
        const existing = await ExtractorCompanyIdentity.findOne(identityMatchFilter(companyId, ident)).lean();
        if (!existing) {
            const doc = await ExtractorCompanyIdentity.create({
                ...ident,
                companyId,
                financialYear,
                createdBy: userId,
                updatedBy: userId,
                firstDiscoveredAt: ident.firstDiscoveredAt || new Date(),
                lastSeenAt: ident.lastSeenAt || new Date(),
                foundCount: 1,
                crmStatus: 'New',
            });
            incremental.new += 1;
            saved.push(doc.toObject());
            continue;
        }
        const changes = detectChanges(existing, ident);
        const nextRefs = [...(existing.sourceRefs || [])];
        const seen = new Set(nextRefs.map((r) => `${r.kind}|${r.sourceUrl}|${r.rawCaptureId}`));
        for (const ref of ident.sourceRefs || []) {
            const key = `${ref.kind}|${ref.sourceUrl}|${ref.rawCaptureId}`;
            if (seen.has(key)) continue;
            seen.add(key);
            nextRefs.push(ref);
        }
        const keywords = [...new Set([...(existing.keywords || []), ...(ident.keywords || [])])];
        const {
            _id: _identId,
            companyId: _identCompany,
            crmStatus: _crmStatus,
            crmMatchRefs: _crmMatchRefs,
            promotedExtractedLeadId: _promoted,
            createdBy: _createdBy,
            firstDiscoveredAt: _first,
            foundCount: _found,
            testOnly: _testOnly,
            isDeleted: _deleted,
            mergedIntoId: _merged,
            ...identFields
        } = ident;
        void _identId; void _identCompany; void _crmStatus; void _crmMatchRefs; void _promoted;
        void _createdBy; void _first; void _found; void _testOnly; void _deleted; void _merged;
        await ExtractorCompanyIdentity.updateOne({ _id: existing._id }, {
            $set: {
                ...identFields,
                sourceRefs: nextRefs,
                keywords,
                firstDiscoveredAt: existing.firstDiscoveredAt || ident.firstDiscoveredAt,
                lastSeenAt: new Date(),
                lastDiscoveredAt: new Date(),
                foundCount: (existing.foundCount || 1) + 1,
                changeLog: [...(existing.changeLog || []), ...changes.map((c) => ({ ...c, at: new Date().toISOString() }))].slice(-80),
                updatedBy: userId,
                companyId,
                crmStatus: existing.crmStatus || 'New',
                crmMatchRefs: existing.crmMatchRefs,
                promotedExtractedLeadId: existing.promotedExtractedLeadId,
                testOnly: existing.testOnly === true,
            },
        });
        if (changes.length) incremental.updated += 1;
        else incremental.known += 1;
        saved.push({ ...existing, ...ident, _id: existing._id, changeLog: changes });
    }

    for (const pair of clustered.reviewPairs) {
        const existing = await DiscoveryMergeReview.findOne({
            companyId,
            status: 'open',
            reviewKind: 'cross_source_identity',
            'candidateRef.pairKey': [pair.evidenceA.evidenceId, pair.evidenceB.evidenceId].sort().join('|'),
            isDeleted: { $ne: true },
        }).lean();
        if (existing) continue;
        await DiscoveryMergeReview.create({
            companyId,
            financialYear,
            status: 'open',
            decision: 'POSSIBLE_SAME_COMPANY',
            matchScore: pair.mergeConfidence,
            reasons: pair.reasons,
            recordA: {
                companyName: pair.evidenceA.companyName,
                website: pair.evidenceA.website,
                email: pair.evidenceA.email,
                phone: pair.evidenceA.phone,
                city: pair.evidenceA.city,
                sourceUrl: pair.evidenceA.sourceUrl,
            },
            recordB: {
                companyName: pair.evidenceB.companyName,
                website: pair.evidenceB.website,
                email: pair.evidenceB.email,
                phone: pair.evidenceB.phone,
                city: pair.evidenceB.city,
                sourceUrl: pair.evidenceB.sourceUrl,
            },
            candidateRef: {
                reviewKind: 'cross_source_identity',
                pairKey: [pair.evidenceA.evidenceId, pair.evidenceB.evidenceId].sort().join('|'),
                evidenceIdA: pair.evidenceA.evidenceId,
                evidenceIdB: pair.evidenceB.evidenceId,
            },
            reviewKind: 'cross_source_identity',
            auditLog: [{ at: new Date().toISOString(), action: 'created_phase5_review' }],
        });
    }

    return {
        evidenceCount: clustered.evidenceCount,
        uniqueCompanies: clustered.identities.length,
        testOnlyExcluded: clustered.testOnlyExcluded,
        incremental,
        reviewPairs: clustered.reviewPairs.length,
        autoMerged: clustered.autoMerged.length,
        identities: saved.slice(0, 50),
    };
}

export async function listIdentities(companyId, query = {}) {
    const q = { companyId, isDeleted: { $ne: true }, mergedIntoId: null };
    if (query.includeTest !== 'true') q.testOnly = { $ne: true };
    if (query.city) q.city = new RegExp(String(query.city).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const extraOr = [];
    if (query.location) {
        const loc = new RegExp(String(query.location).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        extraOr.push({ $or: [{ city: loc }, { locations: loc }, { state: loc }] });
    }
    if (query.companyType) q.companyType = query.companyType;
    if (query.qualificationCategory) q.qualificationCategory = query.qualificationCategory;
    if (query.verification) q['verificationSummary.status'] = query.verification;
    if (query.hasEmail === 'true') q.primaryEmail = { $gt: '' };
    if (query.hasPhone === 'true') q.primaryPhone = { $gt: '' };
    if (query.hasWebsite === 'true') q.website = { $gt: '' };
    if (query.source) q.platforms = query.source;
    if (query.keyword) q.keywords = new RegExp(String(query.keyword).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    if (query.crmStatus) q.crmStatus = query.crmStatus;
    if (query.q) q.canonicalName = new RegExp(String(query.q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    if (query.jobId) q.extractionRunIds = String(query.jobId);
    if (query.from || query.to) {
        q.lastSeenAt = {};
        if (query.from) q.lastSeenAt.$gte = new Date(query.from);
        if (query.to) q.lastSeenAt.$lte = new Date(query.to);
    }
    if (query.converted === 'true') {
        extraOr.push({ $or: [{ crmStatus: 'Converted to Lead' }, { promotedExtractedLeadId: { $ne: null } }] });
    }
    if (query.converted === 'false') {
        q.crmStatus = { $ne: 'Converted to Lead' };
        q.promotedExtractedLeadId = null;
    }
    if (query.discoveryClass === 'new') q.foundCount = { $lte: 1 };
    if (query.discoveryClass === 'updated') q['changeLog.0'] = { $exists: true };
    if (query.discoveryClass === 'known') q.foundCount = { $gt: 1 };
    if (extraOr.length === 1) Object.assign(q, extraOr[0]);
    else if (extraOr.length > 1) q.$and = extraOr;
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(query.limit) || 20));
    const [results, total] = await Promise.all([
        ExtractorCompanyIdentity.find(q).sort({ lastSeenAt: -1, updatedAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
        ExtractorCompanyIdentity.countDocuments(q),
    ]);
    return { results, total, page, limit };
}

export async function getIdentity(companyId, id) {
    const doc = await ExtractorCompanyIdentity.findOne({ _id: id, companyId, isDeleted: { $ne: true } }).lean();
    if (!doc) throw new ApiError(404, 'Company identity not found');
    return doc;
}

export async function reevaluateIdentity(companyId, id, userId) {
    const doc = await getIdentity(companyId, id);
    void doc;
    return consolidateCompanyIdentities({ companyId, userId, limit: 400 });
}

export async function manualMergeIdentities(companyId, userId, { keepId, mergeId, reason = '' } = {}) {
    const keep = await ExtractorCompanyIdentity.findOne({ _id: keepId, companyId, isDeleted: { $ne: true } });
    const other = await ExtractorCompanyIdentity.findOne({ _id: mergeId, companyId, isDeleted: { $ne: true } });
    if (!keep || !other) throw new ApiError(404, 'Identity not found');
    if (String(keep._id) === String(other._id)) throw new ApiError(400, 'Cannot merge an identity into itself');
    const refs = [...(keep.sourceRefs || [])];
    const seen = new Set(refs.map((r) => `${r.kind}|${r.sourceUrl}`));
    for (const ref of other.sourceRefs || []) {
        const key = `${ref.kind}|${ref.sourceUrl}`;
        if (seen.has(key)) continue;
        seen.add(key);
        refs.push(ref);
    }
    keep.sourceRefs = refs;
    keep.keywords = [...new Set([...(keep.keywords || []), ...(other.keywords || [])])];
    keep.platforms = [...new Set([...(keep.platforms || []), ...(other.platforms || [])])];
    keep.sourcePlatformCount = keep.platforms.length;
    keep.evidenceRecordCount = (keep.evidenceRecordCount || 0) + (other.evidenceRecordCount || 0);
    keep.mergeHistory = [...(keep.mergeHistory || []), {
        action: 'manually_merged',
        at: new Date().toISOString(),
        by: userId ? String(userId) : '',
        reason,
        fromId: String(other._id),
        sourceIds: (other.sourceRefs || []).map((r) => r.rawCaptureId || r.sourceUrl),
    }].slice(-50);
    keep.updatedBy = userId;
    other.mergedIntoId = keep._id;
    other.mergeHistory = [...(other.mergeHistory || []), {
        action: 'merged_into',
        at: new Date().toISOString(),
        by: userId ? String(userId) : '',
        intoId: String(keep._id),
        reason,
    }].slice(-50);
    await keep.save();
    await other.save();
    return keep.toObject();
}

export async function undoMergeIdentity(companyId, userId, { id } = {}) {
    const child = await ExtractorCompanyIdentity.findOne({ _id: id, companyId, isDeleted: { $ne: true } });
    if (!child?.mergedIntoId) throw new ApiError(400, 'Identity is not merged');
    const parent = await ExtractorCompanyIdentity.findOne({ _id: child.mergedIntoId, companyId });
    const childUrls = new Set((child.sourceRefs || []).map((r) => r.sourceUrl));
    if (parent) {
        parent.sourceRefs = (parent.sourceRefs || []).filter((r) => !childUrls.has(r.sourceUrl));
        parent.mergeHistory = [...(parent.mergeHistory || []), {
            action: 'unmerged',
            at: new Date().toISOString(),
            by: userId ? String(userId) : '',
            restoredId: String(child._id),
        }].slice(-50);
        await parent.save();
    }
    child.mergedIntoId = null;
    child.mergeHistory = [...(child.mergeHistory || []), {
        action: 'unmerged',
        at: new Date().toISOString(),
        by: userId ? String(userId) : '',
    }].slice(-50);
    await child.save();
    return child.toObject();
}

export async function keepSeparateIdentities(companyId, userId, { idA, idB, reason = '' } = {}) {
    const a = await ExtractorCompanyIdentity.findOne({ _id: idA, companyId });
    const b = await ExtractorCompanyIdentity.findOne({ _id: idB, companyId });
    if (!a || !b) throw new ApiError(404, 'Identity not found');
    const key = [String(a._id), String(b._id)].sort().join('|');
    a.keepSeparateKeys = [...new Set([...(a.keepSeparateKeys || []), key])];
    b.keepSeparateKeys = [...new Set([...(b.keepSeparateKeys || []), key])];
    const entry = { action: 'kept_separate', at: new Date().toISOString(), by: String(userId || ''), reason, pair: key };
    a.mergeHistory = [...(a.mergeHistory || []), entry].slice(-50);
    b.mergeHistory = [...(b.mergeHistory || []), entry].slice(-50);
    await a.save();
    await b.save();
    return { ok: true, pair: key };
}

export async function removeSourceFromIdentity(companyId, userId, { id, sourceUrl } = {}) {
    const doc = await ExtractorCompanyIdentity.findOne({ _id: id, companyId, isDeleted: { $ne: true } });
    if (!doc) throw new ApiError(404, 'Identity not found');
    const url = String(sourceUrl || '').trim();
    doc.sourceRefs = (doc.sourceRefs || []).filter((r) => r.sourceUrl !== url);
    doc.mergeHistory = [...(doc.mergeHistory || []), {
        action: 'source_removed',
        at: new Date().toISOString(),
        by: String(userId || ''),
        sourceUrl: url,
    }].slice(-50);
    await doc.save();
    return doc.toObject();
}

export async function crmStatusForIdentity(companyId, ident) {
    const dup = await checkDuplicateForRecord(companyId, {
        website: ident.website,
        normalizedDomain: ident.domain,
        email: ident.primaryEmail,
        phone: ident.primaryPhone,
        companyName: ident.canonicalName,
    });
    if (ident.promotedExtractedLeadId || ident.crmStatus === 'Converted to Lead') {
        return { crmStatus: 'Converted to Lead', crmMatchRefs: dup.duplicateMatchRefs || ident.crmMatchRefs || [] };
    }
    let crmStatus = 'New';
    const types = new Set((dup.duplicateMatchRefs || []).map((r) => r.type));
    if (types.has('customer')) crmStatus = 'Existing Customer';
    else if (types.has('supplier')) crmStatus = 'Existing Supplier';
    else if (types.has('lead')) crmStatus = 'Existing Lead';
    else if (dup.duplicateStatus === 'possible_duplicate') crmStatus = 'Possible CRM Duplicate';
    return { crmStatus, crmMatchRefs: dup.duplicateMatchRefs || [] };
}

export { isTestOnlyRecord };
