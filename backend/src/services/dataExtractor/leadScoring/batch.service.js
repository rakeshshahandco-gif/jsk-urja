import { AiLeadScoreBatchJob } from '../../../models/aiLeadScoreBatchJob.model.js';
import { ExtractedLead } from '../../../models/extractedLead.model.js';
import { ApiError } from '../../../utils/ApiError.js';
import { scoreOne } from './scoreStore.service.js';

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
        const owned = await ExtractedLead.find({ _id: { $in: payload.extractedLeadIds }, companyId }).select('_id').lean();
        const set = new Set(owned.map((x) => String(x._id)));
        const filtered = payload.extractedLeadIds.filter((id) => set.has(String(id)));
        if (!filtered.length) throw new ApiError(400, 'No owned scoring targets');
        return filtered.map((id) => ({ type: 'lead', extractedLeadId: id }));
    }
    if (payload.scope === 'all_unprocessed_leads') {
        const leads = await ExtractedLead.find({
            companyId,
            status: { $in: ['draft', 'reviewed', 'approved'] },
        }).select('_id').limit(500).lean();
        return leads.map((l) => ({ type: 'lead', extractedLeadId: l._id }));
    }
    throw new ApiError(400, 'No scoring targets provided');
}

export async function createScoreBatch(companyId, userId, payload = {}) {
    rejectTenantOverrides(payload);
    const targets = await resolveTargets(companyId, payload);
    const idempotencyKey = String(payload.idempotencyKey || '').trim();
    if (idempotencyKey) {
        const existing = await AiLeadScoreBatchJob.findOne({ companyId, idempotencyKey, isDeleted: { $ne: true } });
        if (existing) return existing.toObject();
    }
    const job = await AiLeadScoreBatchJob.create({
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

export async function getScoreBatch(companyId, id) {
    const job = await AiLeadScoreBatchJob.findOne({ _id: id, companyId, isDeleted: { $ne: true } }).lean();
    if (!job) throw new ApiError(404, 'Batch job not found');
    return job;
}

export async function listScoreBatches(companyId, query = {}) {
    const q = { companyId, isDeleted: { $ne: true } };
    if (query.status) q.status = query.status;
    const results = await AiLeadScoreBatchJob.find(q).sort({ createdAt: -1 }).limit(50).lean();
    return { results };
}

export async function controlScoreBatch(companyId, userId, id, action, options = {}) {
    const job = await AiLeadScoreBatchJob.findOne({ _id: id, companyId, isDeleted: { $ne: true } });
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

export async function processScoreBatchChunk(companyId, userId, id, { maxItems = 10 } = {}) {
    const job = await AiLeadScoreBatchJob.findOne({ _id: id, companyId, isDeleted: { $ne: true } });
    if (!job) throw new ApiError(404, 'Batch job not found');
    if (['PAUSED', 'STOPPED', 'COMPLETED'].includes(job.status)) return job.toObject();

    job.status = 'RUNNING';
    if (!job.startedAt) job.startedAt = new Date();
    await job.save();

    const results = [...(job.results || [])];
    let processed = 0;
    for (let i = job.cursor; i < results.length && processed < maxItems; i++) {
        const fresh = await AiLeadScoreBatchJob.findById(job._id).select('status').lean();
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
            const out = await scoreOne(companyId, userId, {
                extractedLeadId: item.extractedLeadId,
                financialYear: job.financialYear,
                mode: job.mode,
            });
            if (out.skipped) {
                results[i] = { ...item, status: 'skipped', reason: out.reason };
                job.skippedCount += 1;
                if (out.reason === 'locked') job.lockedSkippedCount = (job.lockedSkippedCount || 0) + 1;
                if (out.reason === 'unchanged') job.unchangedSkippedCount = (job.unchangedSkippedCount || 0) + 1;
            } else {
                results[i] = {
                    ...item,
                    status: 'success',
                    scoreId: out.score?._id,
                    finalScore: out.score?.finalScore,
                    priority: out.score?.priority,
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
