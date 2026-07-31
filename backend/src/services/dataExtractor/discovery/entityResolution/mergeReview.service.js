import { DiscoveryMergeReview } from '../../../../models/discoveryMergeReview.model.js';
import { DiscoveryJob } from '../../../../models/discoveryJob.model.js';
import { ApiError } from '../../../../utils/ApiError.js';
import { preferNonEmpty } from '../mergeNormalize.service.js';
import { computeDataQuality } from '../normalization/dataQuality.service.js';

function audit(doc, action, detail = {}) {
    doc.auditLog = [...(doc.auditLog || []), { at: new Date().toISOString(), action, ...detail }].slice(-100);
}

export async function syncMergeReviewsFromJob(companyId, jobId, userId = null) {
    const job = await DiscoveryJob.findOne({ _id: jobId, companyId, isDeleted: { $ne: true } });
    if (!job) throw new ApiError(404, 'Discovery job not found');
    const preview = job.metadata?.previewRecords || [];
    let created = 0;
    for (let i = 0; i < preview.length; i++) {
        const rec = preview[i];
        const er = rec.entityResolution;
        if (!er?.requiresManualReview && !['HIGH_PROBABILITY_DUPLICATE', 'POSSIBLE_DUPLICATE', 'MANUAL_REVIEW_REQUIRED', 'EXACT_DUPLICATE'].includes(er?.decision)) {
            continue;
        }
        const top = (er.candidates || [])[0];
        if (!top) continue;
        const existing = await DiscoveryMergeReview.findOne({
            companyId,
            discoveryJobId: jobId,
            previewIndex: i,
            status: 'open',
            isDeleted: { $ne: true },
        });
        if (existing) continue;
        await DiscoveryMergeReview.create({
            companyId,
            financialYear: job.financialYear,
            discoveryJobId: jobId,
            previewIndex: i,
            status: 'open',
            decision: er.decision,
            matchScore: er.matchScore || top.matchScore || 0,
            reasons: er.reasons || top.reasons || [],
            recordA: top.sideBySide?.a || {
                companyName: rec.companyName,
                website: rec.website,
                email: rec.email,
                phone: rec.phone || rec.mobile,
                city: rec.city,
            },
            recordB: top.sideBySide?.b || top,
            candidateRef: {
                type: top.type,
                id: top.id,
                label: top.label,
            },
            auditLog: [{ at: new Date().toISOString(), action: 'created_from_job', by: userId }],
        });
        created += 1;
    }
    return { created, jobId: String(jobId) };
}

export async function listMergeReviews(companyId, query = {}) {
    const q = { companyId, isDeleted: { $ne: true } };
    if (query.status) q.status = query.status;
    if (query.discoveryJobId) q.discoveryJobId = query.discoveryJobId;
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 50));
    const rows = await DiscoveryMergeReview.find(q).sort({ createdAt: -1 }).limit(limit).lean();
    return { results: rows };
}

export async function getMergeReview(companyId, id) {
    const doc = await DiscoveryMergeReview.findOne({ _id: id, companyId, isDeleted: { $ne: true } }).lean();
    if (!doc) throw new ApiError(404, 'Merge review not found');
    return doc;
}

function mergeSelected(a = {}, b = {}, fields = []) {
    const out = { ...a };
    for (const f of fields) {
        if (Object.prototype.hasOwnProperty.call(b, f) && b[f] != null && b[f] !== '') {
            out[f] = b[f];
        }
    }
    // Always keep provenance note
    out._mergeNote = 'Manual field merge — high-risk auto-merge disabled';
    return out;
}

function snapshotForAudit(record = {}) {
    return {
        companyName: record.companyName || '',
        website: record.website || '',
        email: record.email || '',
        phone: record.phone || record.mobile || '',
        address: record.address || '',
        city: record.city || '',
        stateProvince: record.stateProvince || record.state || '',
        gstin: record.gstin || '',
        rawExtractedData: {
            discoveredWebsites: record.rawExtractedData?.discoveredWebsites || [],
            discoveredDomains: record.rawExtractedData?.discoveredDomains || [],
            publicPhones: record.rawExtractedData?.publicPhones || [],
            publicEmails: record.rawExtractedData?.publicEmails || [],
        },
    };
}

export async function resolveMergeReview(companyId, id, userId, payload = {}) {
    const action = payload.action;
    const allowed = ['keep_a', 'keep_b', 'merge_selected_fields', 'mark_separate', 'ignore', 'link_existing'];
    if (!allowed.includes(action)) throw new ApiError(400, 'Invalid resolution action');

    const doc = await DiscoveryMergeReview.findOne({ _id: id, companyId, isDeleted: { $ne: true } });
    if (!doc) throw new ApiError(404, 'Merge review not found');
    if (doc.status === 'resolved' && action !== 'ignore') {
        // allow re-open notes only via ignore already resolved? keep idempotent
    }

    doc.resolutionAction = action;
    doc.notes = String(payload.notes || doc.notes || '').slice(0, 2000);
    doc.resolvedBy = userId;
    doc.resolvedAt = new Date();
    doc.status = action === 'ignore' ? 'ignored' : 'resolved';
    if (action === 'merge_selected_fields') {
        doc.mergedFields = Array.isArray(payload.fields) ? payload.fields.map(String).slice(0, 30) : [];
    }
    if (action === 'link_existing') {
        doc.linkedRecord = {
            type: payload.linkedType || doc.candidateRef?.type,
            id: payload.linkedId || doc.candidateRef?.id,
        };
    }
    audit(doc, 'resolved', { action, by: userId });

    // Apply to discovery job preview when present — never auto without explicit action
    if (doc.discoveryJobId != null && doc.previewIndex != null) {
        const job = await DiscoveryJob.findOne({ _id: doc.discoveryJobId, companyId, isDeleted: { $ne: true } });
        if (job) {
            const preview = [...(job.metadata?.previewRecords || [])];
            const idx = Number(doc.previewIndex);
            if (preview[idx]) {
                const current = { ...preview[idx] };
                const beforeSnapshot = snapshotForAudit(current);
                if (action === 'keep_a') {
                    current.entityResolution = {
                        ...(current.entityResolution || {}),
                        resolutionAction: 'keep_a',
                        resolvedAt: new Date().toISOString(),
                        requiresManualReview: false,
                        decision: current.entityResolution?.decision || doc.decision,
                    };
                } else if (action === 'keep_b') {
                    const merged = { ...current, ...doc.recordB };
                    merged.entityResolution = {
                        ...(current.entityResolution || {}),
                        resolutionAction: 'keep_b',
                        resolvedAt: new Date().toISOString(),
                        requiresManualReview: false,
                    };
                    const dq = computeDataQuality(merged);
                    merged.dataQuality = dq;
                    merged.dataQualityScore = dq.score;
                    preview[idx] = merged;
                } else if (action === 'merge_selected_fields') {
                    const merged = mergeSelected(current, doc.recordB, doc.mergedFields);
                    // fill empties safely
                    for (const k of ['email', 'phone', 'mobile', 'website', 'address', 'city', 'gstin']) {
                        merged[k] = preferNonEmpty(merged[k], doc.recordB?.[k]);
                    }
                    merged.entityResolution = {
                        ...(current.entityResolution || {}),
                        resolutionAction: 'merge_selected_fields',
                        mergedFields: doc.mergedFields,
                        resolvedAt: new Date().toISOString(),
                        requiresManualReview: false,
                        autoMergeAllowed: false,
                    };
                    const dq = computeDataQuality(merged);
                    merged.dataQuality = dq;
                    merged.dataQualityScore = dq.score;
                    preview[idx] = merged;
                } else if (action === 'mark_separate') {
                    current.entityResolution = {
                        ...(current.entityResolution || {}),
                        decision: 'UNIQUE',
                        resolutionAction: 'mark_separate',
                        resolvedAt: new Date().toISOString(),
                        requiresManualReview: false,
                    };
                    current.duplicateStatus = 'none';
                    current.duplicateDisplayLabel = 'NEW';
                    preview[idx] = current;
                } else if (action === 'link_existing') {
                    current.entityResolution = {
                        ...(current.entityResolution || {}),
                        resolutionAction: 'link_existing',
                        linkedRecord: doc.linkedRecord,
                        resolvedAt: new Date().toISOString(),
                        requiresManualReview: false,
                    };
                    current.duplicateStatus = 'confirmed_duplicate';
                    preview[idx] = current;
                } else if (action === 'ignore') {
                    current.entityResolution = {
                        ...(current.entityResolution || {}),
                        resolutionAction: 'ignore',
                        resolvedAt: new Date().toISOString(),
                        requiresManualReview: false,
                    };
                    preview[idx] = current;
                } else {
                    preview[idx] = current;
                }
                const finalRecord = preview[idx] || current;
                const manualMergeHistory = [
                    ...((finalRecord.rawExtractedData || {}).manualMergeHistory || []),
                    {
                        at: new Date().toISOString(),
                        action,
                        reason: doc.notes || '',
                        userId: userId ? String(userId) : null,
                        before: beforeSnapshot,
                        after: snapshotForAudit(finalRecord),
                    },
                ].slice(-50);
                finalRecord.rawExtractedData = {
                    ...(finalRecord.rawExtractedData || {}),
                    manualMergeHistory,
                };
                preview[idx] = finalRecord;
                job.metadata = { ...(job.metadata || {}), previewRecords: preview };
                const log = Array.isArray(job.metadata.auditLog) ? job.metadata.auditLog : [];
                log.push({
                    at: new Date().toISOString(),
                    action: 'merge_review_' + action,
                    reviewId: String(doc._id),
                    previewIndex: idx,
                    reason: doc.notes || '',
                    userId: userId ? String(userId) : null,
                    before: beforeSnapshot,
                    after: snapshotForAudit(finalRecord),
                });
                job.metadata.auditLog = log.slice(-200);
                await job.save();
            }
        }
    }

    await doc.save();
    return doc.toObject();
}
