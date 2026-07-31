import { AiClassificationBatchJob } from '../../../models/aiClassificationBatchJob.model.js';
import { ExtractedLead } from '../../../models/extractedLead.model.js';
import { DiscoveryJob } from '../../../models/discoveryJob.model.js';
import { ApiError } from '../../../utils/ApiError.js';
import { classifyOneRecord } from './classificationStore.service.js';

function rejectTenantOverrides(payload = {}) {
    if (payload.companyId != null || payload.tenantId != null) {
        throw new ApiError(400, 'companyId/tenantId overrides are rejected');
    }
}

function audit(job, action, detail = {}) {
    job.auditLog = [...(job.auditLog || []), { at: new Date().toISOString(), action, ...detail }].slice(-200);
}

async function resolveTargets(companyId, payload = {}) {
    if (Array.isArray(payload.extractedLeadIds) && payload.extractedLeadIds.length) {
        const ids = payload.extractedLeadIds;
        const owned = await ExtractedLead.find({ _id: { $in: ids }, companyId }).select('_id').lean();
        const ownedSet = new Set(owned.map((x) => String(x._id)));
        const filtered = ids.filter((id) => ownedSet.has(String(id)));
        if (!filtered.length) throw new ApiError(400, 'No owned classification targets provided');
        return filtered.map((id) => ({ type: 'lead', extractedLeadId: id }));
    }
    if (payload.discoveryJobId != null && Array.isArray(payload.previewIndexes) && payload.previewIndexes.length) {
        const job = await DiscoveryJob.findOne({ _id: payload.discoveryJobId, companyId, isDeleted: { $ne: true } }).lean();
        if (!job) throw new ApiError(404, 'Discovery job not found');
        return payload.previewIndexes.map((idx) => ({
            type: 'preview',
            discoveryJobId: payload.discoveryJobId,
            previewIndex: Number(idx),
        }));
    }
    if (payload.discoveryJobId && payload.scope === 'all_unprocessed') {
        const job = await DiscoveryJob.findOne({ _id: payload.discoveryJobId, companyId, isDeleted: { $ne: true } }).lean();
        if (!job) throw new ApiError(404, 'Discovery job not found');
        const preview = job.metadata?.previewRecords || [];
        return preview.map((_, idx) => ({
            type: 'preview',
            discoveryJobId: payload.discoveryJobId,
            previewIndex: idx,
        }));
    }
    if (payload.scope === 'all_unprocessed_leads') {
        const leads = await ExtractedLead.find({
            companyId,
            status: { $in: ['draft', 'reviewed', 'approved'] },
            'rawExtractedData.industryClassification': { $exists: false },
        }).select('_id').limit(500).lean();
        return leads.map((l) => ({ type: 'lead', extractedLeadId: l._id }));
    }
    throw new ApiError(400, 'No classification targets provided');
}

export async function createClassificationBatch(companyId, userId, payload = {}) {
    rejectTenantOverrides(payload);
    const targets = await resolveTargets(companyId, payload);
    const idempotencyKey = String(payload.idempotencyKey || '').trim();
    if (idempotencyKey) {
        const existing = await AiClassificationBatchJob.findOne({ companyId, idempotencyKey, isDeleted: { $ne: true } });
        if (existing) return existing.toObject();
    }

    const job = await AiClassificationBatchJob.create({
        companyId,
        financialYear: payload.financialYear || '',
        status: 'QUEUED',
        mode: payload.mode || 'rule_based',
        scope: payload.scope || 'selected',
        discoveryJobId: payload.discoveryJobId || null,
        recordIds: targets.filter((t) => t.extractedLeadId).map((t) => t.extractedLeadId),
        previewIndexes: targets.filter((t) => t.previewIndex != null).map((t) => t.previewIndex),
        total: targets.length,
        cursor: 0,
        successCount: 0,
        failedCount: 0,
        skippedCount: 0,
        lockedSkippedCount: 0,
        processedCount: 0,
        pauseReason: '',
        idempotencyKey,
        createdBy: userId,
        updatedBy: userId,
        results: targets.map((t) => ({ ...t, status: 'pending' })),
        auditLog: [{ at: new Date().toISOString(), action: 'created', total: targets.length }],
    });
    return job.toObject();
}

export async function getClassificationBatch(companyId, id) {
    const job = await AiClassificationBatchJob.findOne({ _id: id, companyId, isDeleted: { $ne: true } }).lean();
    if (!job) throw new ApiError(404, 'Batch job not found');
    return job;
}

export async function listClassificationBatches(companyId, query = {}) {
    const q = { companyId, isDeleted: { $ne: true } };
    if (query.status) q.status = query.status;
    const limit = Math.min(50, Math.max(1, Number(query.limit) || 20));
    const results = await AiClassificationBatchJob.find(q).sort({ createdAt: -1 }).limit(limit).lean();
    return { results };
}

export async function controlClassificationBatch(companyId, userId, id, action, options = {}) {
    const job = await AiClassificationBatchJob.findOne({ _id: id, companyId, isDeleted: { $ne: true } });
    if (!job) throw new ApiError(404, 'Batch job not found');
    if (action === 'pause') {
        if (!['RUNNING', 'QUEUED'].includes(job.status)) throw new ApiError(400, 'Cannot pause');
        job.status = 'PAUSED';
        job.pauseReason = String(options.reason || 'User paused');
        audit(job, 'paused', { reason: job.pauseReason, cursor: job.cursor });
    } else if (action === 'resume') {
        if (job.status !== 'PAUSED') throw new ApiError(400, 'Cannot resume');
        job.status = 'QUEUED';
        job.pauseReason = '';
        audit(job, 'resumed', { cursor: job.cursor });
    } else if (action === 'stop') {
        job.status = 'STOPPED';
        job.completedAt = new Date();
        audit(job, 'stopped', { cursor: job.cursor });
    } else if (action === 'retry_failed') {
        const results = [...(job.results || [])];
        let firstPending = -1;
        for (let i = 0; i < results.length; i++) {
            if (results[i].status === 'failed') {
                results[i] = { ...results[i], status: 'pending', error: undefined };
                if (firstPending < 0) firstPending = i;
            }
        }
        job.results = results;
        job.cursor = firstPending >= 0 ? firstPending : results.length;
        job.status = 'QUEUED';
        job.completedAt = null;
        job.pauseReason = '';
        audit(job, 'retry_failed', { cursor: job.cursor });
    } else {
        throw new ApiError(400, 'Invalid batch action');
    }
    job.updatedBy = userId;
    await job.save();
    return job.toObject();
}

/** Process a limited chunk so pause/resume works; MongoDB is source of truth. */
export async function processClassificationBatchChunk(companyId, userId, id, { maxItems = 10 } = {}) {
    const job = await AiClassificationBatchJob.findOne({ _id: id, companyId, isDeleted: { $ne: true } });
    if (!job) throw new ApiError(404, 'Batch job not found');
    if (job.status === 'PAUSED' || job.status === 'STOPPED' || job.status === 'COMPLETED') {
        return job.toObject();
    }

    job.status = 'RUNNING';
    if (!job.startedAt) job.startedAt = new Date();
    await job.save();

    const results = [...(job.results || [])];
    let processed = 0;
    for (let i = job.cursor; i < results.length && processed < maxItems; i++) {
        const fresh = await AiClassificationBatchJob.findById(job._id).select('status').lean();
        if (fresh?.status === 'PAUSED' || fresh?.status === 'STOPPED') {
            job.status = fresh.status;
            job.cursor = i;
            await job.save();
            return job.toObject();
        }
        const item = results[i];
        if (item.status === 'success' || item.status === 'skipped') {
            job.cursor = i + 1;
            continue;
        }
        try {
            const out = await classifyOneRecord(companyId, userId, {
                extractedLeadId: item.extractedLeadId,
                discoveryJobId: item.discoveryJobId,
                previewIndex: item.previewIndex,
                mode: job.mode,
                financialYear: job.financialYear,
            });
            if (out.skipped) {
                results[i] = { ...item, status: 'skipped', reason: out.reason };
                job.skippedCount += 1;
                if (out.reason === 'locked' || out.reason === 'manual_approved') {
                    job.lockedSkippedCount = (job.lockedSkippedCount || 0) + 1;
                }
            } else {
                results[i] = {
                    ...item,
                    status: 'success',
                    classificationId: out.classification?._id,
                    classificationStatus: out.classification?.status,
                    fallbackUsed: !!out.classification?.fallbackUsed,
                    engineUsed: out.classification?.engineUsed,
                };
                job.successCount += 1;
            }
        } catch (err) {
            results[i] = { ...item, status: 'failed', error: err?.message || 'failed' };
            job.failedCount += 1;
            job.errors = [...(job.errors || []), { at: new Date().toISOString(), index: i, message: err?.message || 'failed' }].slice(-100);
            // Continue batch — do not stop
        }
        job.processedCount += 1;
        job.cursor = i + 1;
        processed += 1;
        job.results = results;
        job.updatedBy = userId;
        await job.save(); // persist cursor after each item (restart-safe)
    }

    job.results = results;
    if (job.cursor >= results.length) {
        job.status = 'COMPLETED';
        job.completedAt = new Date();
        audit(job, 'completed', {
            successCount: job.successCount,
            failedCount: job.failedCount,
            skippedCount: job.skippedCount,
            lockedSkippedCount: job.lockedSkippedCount,
        });
    } else {
        job.status = 'QUEUED';
    }
    job.updatedBy = userId;
    await job.save();
    return job.toObject();
}
