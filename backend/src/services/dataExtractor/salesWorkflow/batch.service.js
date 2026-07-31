import { AiSalesWorkflowBatchJob } from '../../../models/aiSalesWorkflowBatchJob.model.js';
import { Lead } from '../../../models/lead.model.js';
import { AiCrmEnrichmentDraft } from '../../../models/aiCrmEnrichmentDraft.model.js';
import { ApiError } from '../../../utils/ApiError.js';
import { prepareDraft, applyDraft } from './draft.service.js';
import { getSalesWorkflowSettings } from './settings.service.js';

function rejectTenantOverrides(payload = {}) {
    if (payload.companyId != null || payload.tenantId != null) {
        throw new ApiError(400, 'companyId/tenantId overrides are rejected');
    }
}

function audit(job, action, detail = {}) {
    job.auditLog = [...(job.auditLog || []), { at: new Date().toISOString(), action, ...detail }].slice(-200);
}

async function resolveTargets(companyId, payload = {}) {
    if (Array.isArray(payload.crmLeadIds) && payload.crmLeadIds.length) {
        const owned = await Lead.find({
            _id: { $in: payload.crmLeadIds },
            companyId,
        }).select('_id').lean();
        const set = new Set(owned.map((x) => String(x._id)));
        return payload.crmLeadIds
            .filter((id) => set.has(String(id)))
            .map((id) => ({ type: 'lead', crmLeadId: id }));
    }
    if (Array.isArray(payload.phase13DraftIds) && payload.phase13DraftIds.length) {
        const owned = await AiCrmEnrichmentDraft.find({
            _id: { $in: payload.phase13DraftIds },
            companyId,
            isDeleted: { $ne: true },
            convertedCrmLeadId: { $ne: null },
        }).select('_id convertedCrmLeadId').lean();
        return owned.map((x) => ({
            type: 'phase13',
            phase13DraftId: x._id,
            crmLeadId: x.convertedCrmLeadId,
        }));
    }
    if (Array.isArray(payload.draftIds) && payload.draftIds.length) {
        return payload.draftIds.map((id) => ({ type: 'draft', draftId: id }));
    }
    throw new ApiError(400, 'No sales workflow batch targets provided');
}

export async function createSalesWorkflowBatch(companyId, userId, payload = {}) {
    rejectTenantOverrides(payload);
    const settings = await getSalesWorkflowSettings(companyId);
    const jobType = String(payload.jobType || 'prepare_recommendations');

    if (jobType === 'batch_apply') {
        if (!settings.allowBatchApply) {
            throw new ApiError(400, 'Batch apply is disabled in settings');
        }
        if (payload.batchApplyConfirmed !== true) {
            throw new ApiError(400, 'batchApplyConfirmed required for batch_apply');
        }
    } else if (jobType !== 'prepare_recommendations') {
        // Default / safe path is prepare only
        if (!['prepare_recommendations', 'prepare_drafts'].includes(jobType)) {
            throw new ApiError(400, 'jobType must be prepare_recommendations (or batch_apply when allowed)');
        }
    }

    if (jobType !== 'batch_apply' && settings.allowBatchPrepare === false) {
        throw new ApiError(400, 'Batch prepare is disabled in settings');
    }

    const targets = await resolveTargets(companyId, payload);
    if (jobType === 'batch_apply') {
        const max = Math.max(1, Number(settings.maximumBatchApply) || 25);
        if (targets.length > max) {
            throw new ApiError(400, `Batch apply limited to ${max} items`);
        }
    }

    const idempotencyKey = String(payload.idempotencyKey || '').trim();
    if (idempotencyKey) {
        const existing = await AiSalesWorkflowBatchJob.findOne({
            companyId, idempotencyKey, isDeleted: { $ne: true },
        });
        if (existing) return existing.toObject();
    }

    const job = await AiSalesWorkflowBatchJob.create({
        companyId,
        financialYear: payload.financialYear || '',
        status: 'QUEUED',
        jobType: jobType === 'prepare_drafts' ? 'prepare_recommendations' : jobType,
        scope: payload.scope || 'selected',
        total: targets.length,
        cursor: 0,
        batchApplyConfirmed: payload.batchApplyConfirmed === true,
        idempotencyKey,
        createdBy: userId,
        updatedBy: userId,
        results: targets.map((t) => ({ ...t, status: 'pending' })),
        auditLog: [{ at: new Date().toISOString(), action: 'created', total: targets.length, jobType }],
    });
    return job.toObject();
}

export async function getSalesWorkflowBatch(companyId, id) {
    const job = await AiSalesWorkflowBatchJob.findOne({
        _id: id, companyId, isDeleted: { $ne: true },
    }).lean();
    if (!job) throw new ApiError(404, 'Batch job not found');
    return job;
}

export async function listSalesWorkflowBatches(companyId, query = {}) {
    const q = { companyId, isDeleted: { $ne: true } };
    if (query.status) q.status = query.status;
    const results = await AiSalesWorkflowBatchJob.find(q).sort({ createdAt: -1 }).limit(50).lean();
    return { results };
}

export async function controlSalesWorkflowBatch(companyId, userId, id, action, options = {}) {
    const job = await AiSalesWorkflowBatchJob.findOne({
        _id: id, companyId, isDeleted: { $ne: true },
    });
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

/**
 * Process a chunk of the batch. Fail-continue with per-item idempotency.
 * Default jobType prepare_recommendations only prepares drafts.
 * batch_apply requires jobType + batchApplyConfirmed + settings.allowBatchApply.
 */
export async function processSalesWorkflowBatchChunk(companyId, userId, id, {
    maxItems = 5,
    user = null,
} = {}) {
    const job = await AiSalesWorkflowBatchJob.findOne({
        _id: id, companyId, isDeleted: { $ne: true },
    });
    if (!job) throw new ApiError(404, 'Batch job not found');
    if (['PAUSED', 'STOPPED', 'COMPLETED'].includes(job.status)) return job.toObject();

    const settings = await getSalesWorkflowSettings(companyId);

    if (job.jobType === 'batch_apply') {
        if (!settings.allowBatchApply) {
            throw new ApiError(400, 'Batch apply is disabled in settings');
        }
        if (!job.batchApplyConfirmed) {
            throw new ApiError(400, 'batchApplyConfirmed required for batch_apply');
        }
    } else if (job.jobType !== 'prepare_recommendations') {
        throw new ApiError(400, 'Batch job type must be prepare_recommendations (or batch_apply when allowed)');
    }

    job.status = 'RUNNING';
    if (!job.startedAt) job.startedAt = new Date();
    await job.save();

    const results = [...(job.results || [])];
    let processed = 0;

    for (let i = job.cursor; i < results.length && processed < maxItems; i++) {
        const fresh = await AiSalesWorkflowBatchJob.findById(job._id).select('status').lean();
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
            if (job.jobType === 'batch_apply') {
                if (!item.draftId) throw new Error('draftId required for batch_apply item');
                const out = await applyDraft(companyId, userId, item.draftId, {
                    reason: 'batch_apply',
                }, user);
                results[i] = {
                    ...item,
                    status: out.idempotent ? 'skipped' : 'success',
                    reason: out.idempotent ? 'already_processed' : undefined,
                    draftId: out.draft?._id || item.draftId,
                    transactionId: out.transaction?._id,
                };
                if (out.idempotent) {
                    job.skippedCount += 1;
                    job.alreadyProcessedSkippedCount = (job.alreadyProcessedSkippedCount || 0) + 1;
                } else {
                    job.successCount += 1;
                }
            } else {
                const out = await prepareDraft(companyId, userId, {
                    crmLeadId: item.crmLeadId,
                    phase13DraftId: item.phase13DraftId,
                    financialYear: job.financialYear,
                    idempotencyKey: item.idempotencyKey || undefined,
                });
                if (out.skipped) {
                    results[i] = {
                        ...item,
                        status: 'skipped',
                        reason: out.reason,
                        draftId: out.draft?._id,
                    };
                    job.skippedCount += 1;
                    if (out.reason === 'locked') job.lockedSkippedCount = (job.lockedSkippedCount || 0) + 1;
                    if (out.reason === 'already_processed') {
                        job.alreadyProcessedSkippedCount = (job.alreadyProcessedSkippedCount || 0) + 1;
                    }
                } else {
                    results[i] = {
                        ...item,
                        status: 'success',
                        draftId: out.draft?._id,
                        eligibilityStatus: out.draft?.eligibilityStatus,
                    };
                    job.successCount += 1;
                }
            }
        } catch (err) {
            results[i] = { ...item, status: 'failed', error: err?.message || 'failed' };
            job.failedCount += 1;
            job.errors = [
                ...(job.errors || []),
                { at: new Date().toISOString(), index: i, message: err?.message || 'failed' },
            ].slice(-100);
            // fail-continue
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
        audit(job, 'completed', {
            successCount: job.successCount,
            failedCount: job.failedCount,
            skippedCount: job.skippedCount,
        });
    } else {
        job.status = 'QUEUED';
    }
    job.updatedBy = userId;
    await job.save();
    return job.toObject();
}
