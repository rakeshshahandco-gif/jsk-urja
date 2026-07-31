import { AiProductRecommendationBatchJob } from '../../../models/aiProductRecommendationBatchJob.model.js';
import { ExtractedLead } from '../../../models/extractedLead.model.js';
import { AiIndustryClassification } from '../../../models/aiIndustryClassification.model.js';
import { ApiError } from '../../../utils/ApiError.js';
import { recommendOne } from './recommendationStore.service.js';

function rejectTenantOverrides(payload = {}) {
    if (payload.companyId != null || payload.tenantId != null) {
        throw new ApiError(400, 'companyId/tenantId overrides are rejected');
    }
}

function audit(job, action, detail = {}) {
    job.auditLog = [...(job.auditLog || []), { at: new Date().toISOString(), action, ...detail }].slice(-200);
}

async function resolveTargets(companyId, payload = {}) {
    if (Array.isArray(payload.classificationIds) && payload.classificationIds.length) {
        const owned = await AiIndustryClassification.find({
            _id: { $in: payload.classificationIds },
            companyId,
            isDeleted: { $ne: true },
        }).select('_id').lean();
        const set = new Set(owned.map((x) => String(x._id)));
        const filtered = payload.classificationIds.filter((id) => set.has(String(id)));
        if (!filtered.length) throw new ApiError(400, 'No owned classification targets');
        return filtered.map((id) => ({ type: 'classification', classificationId: id }));
    }
    if (Array.isArray(payload.extractedLeadIds) && payload.extractedLeadIds.length) {
        const owned = await ExtractedLead.find({ _id: { $in: payload.extractedLeadIds }, companyId }).select('_id').lean();
        const set = new Set(owned.map((x) => String(x._id)));
        const filtered = payload.extractedLeadIds.filter((id) => set.has(String(id)));
        if (!filtered.length) throw new ApiError(400, 'No owned lead targets');
        return filtered.map((id) => ({ type: 'lead', extractedLeadId: id }));
    }
    if (payload.scope === 'all_unprocessed_classifications') {
        const rows = await AiIndustryClassification.find({
            companyId,
            isDeleted: { $ne: true },
            status: { $in: ['CLASSIFIED', 'LOW_CONFIDENCE', 'MANUAL_REVIEW_REQUIRED', 'MULTIPLE_POSSIBILITIES'] },
        }).select('_id').limit(500).lean();
        return rows.map((r) => ({ type: 'classification', classificationId: r._id }));
    }
    throw new ApiError(400, 'No recommendation targets provided');
}

export async function createRecommendationBatch(companyId, userId, payload = {}) {
    rejectTenantOverrides(payload);
    const targets = await resolveTargets(companyId, payload);
    const idempotencyKey = String(payload.idempotencyKey || '').trim();
    if (idempotencyKey) {
        const existing = await AiProductRecommendationBatchJob.findOne({ companyId, idempotencyKey, isDeleted: { $ne: true } });
        if (existing) return existing.toObject();
    }
    const job = await AiProductRecommendationBatchJob.create({
        companyId,
        financialYear: payload.financialYear || '',
        status: 'QUEUED',
        mode: payload.mode || 'rule_based',
        scope: payload.scope || 'selected',
        total: targets.length,
        cursor: 0,
        idempotencyKey,
        createdBy: userId,
        updatedBy: userId,
        results: targets.map((t) => ({ ...t, status: 'pending' })),
        auditLog: [{ at: new Date().toISOString(), action: 'created', total: targets.length }],
    });
    return job.toObject();
}

export async function getRecommendationBatch(companyId, id) {
    const job = await AiProductRecommendationBatchJob.findOne({ _id: id, companyId, isDeleted: { $ne: true } }).lean();
    if (!job) throw new ApiError(404, 'Batch job not found');
    return job;
}

export async function listRecommendationBatches(companyId, query = {}) {
    const q = { companyId, isDeleted: { $ne: true } };
    if (query.status) q.status = query.status;
    const results = await AiProductRecommendationBatchJob.find(q).sort({ createdAt: -1 }).limit(50).lean();
    return { results };
}

export async function controlRecommendationBatch(companyId, userId, id, action, options = {}) {
    const job = await AiProductRecommendationBatchJob.findOne({ _id: id, companyId, isDeleted: { $ne: true } });
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
        audit(job, 'stopped');
    } else if (action === 'retry_failed') {
        const results = [...(job.results || [])];
        let first = -1;
        for (let i = 0; i < results.length; i++) {
            if (results[i].status === 'failed') {
                results[i] = { ...results[i], status: 'pending', error: undefined };
                if (first < 0) first = i;
            }
        }
        job.results = results;
        job.cursor = first >= 0 ? first : results.length;
        job.status = 'QUEUED';
        job.completedAt = null;
        audit(job, 'retry_failed', { cursor: job.cursor });
    } else {
        throw new ApiError(400, 'Invalid batch action');
    }
    job.updatedBy = userId;
    await job.save();
    return job.toObject();
}

export async function processRecommendationBatchChunk(companyId, userId, id, { maxItems = 10 } = {}) {
    const job = await AiProductRecommendationBatchJob.findOne({ _id: id, companyId, isDeleted: { $ne: true } });
    if (!job) throw new ApiError(404, 'Batch job not found');
    if (job.status === 'PAUSED' || job.status === 'STOPPED' || job.status === 'COMPLETED') return job.toObject();

    job.status = 'RUNNING';
    if (!job.startedAt) job.startedAt = new Date();
    await job.save();

    const results = [...(job.results || [])];
    let processed = 0;
    for (let i = job.cursor; i < results.length && processed < maxItems; i++) {
        const fresh = await AiProductRecommendationBatchJob.findById(job._id).select('status').lean();
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
            const out = await recommendOne(companyId, userId, {
                classificationId: item.classificationId,
                extractedLeadId: item.extractedLeadId,
                mode: job.mode,
                financialYear: job.financialYear,
            });
            if (out.skipped) {
                results[i] = { ...item, status: 'skipped', reason: out.reason };
                job.skippedCount += 1;
                if (out.reason === 'locked' || out.reason === 'manual_approved') job.lockedSkippedCount = (job.lockedSkippedCount || 0) + 1;
            } else {
                results[i] = {
                    ...item,
                    status: 'success',
                    recommendationId: out.recommendation?._id,
                    productName: out.recommendation?.primaryRecommendation?.productName,
                    opportunityScore: out.recommendation?.opportunityScore,
                };
                job.successCount += 1;
            }
        } catch (err) {
            results[i] = { ...item, status: 'failed', error: err?.message || 'failed' };
            job.failedCount += 1;
            job.errors = [...(job.errors || []), { at: new Date().toISOString(), index: i, message: err?.message || 'failed' }].slice(-100);
        }
        job.processedCount += 1;
        job.cursor = i + 1;
        processed += 1;
        job.results = results;
        job.updatedBy = userId;
        await job.save();
    }

    job.results = results;
    if (job.cursor >= results.length) {
        job.status = 'COMPLETED';
        job.completedAt = new Date();
        audit(job, 'completed', { successCount: job.successCount, failedCount: job.failedCount, skippedCount: job.skippedCount });
    } else {
        job.status = 'QUEUED';
    }
    job.updatedBy = userId;
    await job.save();
    return job.toObject();
}
