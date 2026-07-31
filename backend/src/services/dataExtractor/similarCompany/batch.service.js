import { AiSimilarCompanyBatchJob } from '../../../models/aiSimilarCompanyBatchJob.model.js';
import { ExtractedLead } from '../../../models/extractedLead.model.js';
import { AiLeadScore } from '../../../models/aiLeadScore.model.js';
import { ApiError } from '../../../utils/ApiError.js';
import { findSimilarForSeed } from './store.service.js';
import { runMarketIntelligence } from './marketStore.service.js';
import { getSimilaritySettings } from './settings.service.js';

function rejectTenantOverrides(payload = {}) {
    if (payload.companyId != null || payload.tenantId != null) {
        throw new ApiError(400, 'companyId/tenantId overrides are rejected');
    }
}

function audit(job, action, detail = {}) {
    job.auditLog = [...(job.auditLog || []), { at: new Date().toISOString(), action, ...detail }].slice(-200);
}

async function resolveTargets(companyId, payload = {}) {
    if (Array.isArray(payload.seedExtractedLeadIds) && payload.seedExtractedLeadIds.length) {
        const owned = await ExtractedLead.find({ _id: { $in: payload.seedExtractedLeadIds }, companyId }).select('_id').lean();
        const set = new Set(owned.map((x) => String(x._id)));
        const filtered = payload.seedExtractedLeadIds.filter((id) => set.has(String(id)));
        if (!filtered.length) throw new ApiError(400, 'No owned seed targets');
        return filtered.map((id) => ({ type: 'seed', seedExtractedLeadId: id }));
    }
    if (payload.scope === 'high_score') {
        const scores = await AiLeadScore.find({
            companyId,
            isDeleted: { $ne: true },
            finalScore: { $gte: Number(payload.minScore) || 75 },
            extractedLeadId: { $ne: null },
        }).select('extractedLeadId').limit(100).lean();
        const ids = [...new Set(scores.map((s) => String(s.extractedLeadId)).filter(Boolean))];
        return ids.map((id) => ({ type: 'seed', seedExtractedLeadId: id }));
    }
    if (payload.jobType === 'market_intelligence' || payload.scope === 'market_intelligence') {
        return [{ type: 'market_intelligence' }];
    }
    throw new ApiError(400, 'No similar-company batch targets provided');
}

export async function createSimilarBatch(companyId, userId, payload = {}) {
    rejectTenantOverrides(payload);
    if (payload.executePaidProvider === true && payload.confirmPaidProvider !== true) {
        throw new ApiError(400, 'Paid provider requires explicit confirmation');
    }
    const settings = await getSimilaritySettings(companyId);
    const targets = await resolveTargets(companyId, payload);
    const idempotencyKey = String(payload.idempotencyKey || '').trim();
    if (idempotencyKey) {
        const existing = await AiSimilarCompanyBatchJob.findOne({ companyId, idempotencyKey, isDeleted: { $ne: true } });
        if (existing) return existing.toObject();
    }
    const job = await AiSimilarCompanyBatchJob.create({
        companyId,
        financialYear: payload.financialYear || '',
        status: 'QUEUED',
        mode: payload.mode || settings.similarityMode || 'rule_based',
        jobType: payload.jobType || 'similar_companies',
        scope: payload.scope || 'selected',
        total: targets.length,
        cursor: 0,
        maxProviderCalls: Number(payload.maxProviderCalls ?? settings.maximumProviderCallsPerJob) || 0,
        paidProviderConfirmed: payload.confirmPaidProvider === true,
        idempotencyKey,
        createdBy: userId,
        updatedBy: userId,
        results: targets.map((t) => ({ ...t, status: 'pending' })),
        auditLog: [{ at: new Date().toISOString(), action: 'created', total: targets.length }],
    });
    return job.toObject();
}

export async function getSimilarBatch(companyId, id) {
    const job = await AiSimilarCompanyBatchJob.findOne({ _id: id, companyId, isDeleted: { $ne: true } }).lean();
    if (!job) throw new ApiError(404, 'Batch job not found');
    return job;
}

export async function listSimilarBatches(companyId, query = {}) {
    const q = { companyId, isDeleted: { $ne: true } };
    if (query.status) q.status = query.status;
    const results = await AiSimilarCompanyBatchJob.find(q).sort({ createdAt: -1 }).limit(50).lean();
    return { results };
}

export async function controlSimilarBatch(companyId, userId, id, action, options = {}) {
    const job = await AiSimilarCompanyBatchJob.findOne({ _id: id, companyId, isDeleted: { $ne: true } });
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

export async function processSimilarBatchChunk(companyId, userId, id, { maxItems = 5 } = {}) {
    const job = await AiSimilarCompanyBatchJob.findOne({ _id: id, companyId, isDeleted: { $ne: true } });
    if (!job) throw new ApiError(404, 'Batch job not found');
    if (['PAUSED', 'STOPPED', 'COMPLETED'].includes(job.status)) return job.toObject();

    job.status = 'RUNNING';
    if (!job.startedAt) job.startedAt = new Date();
    await job.save();

    const results = [...(job.results || [])];
    let processed = 0;
    for (let i = job.cursor; i < results.length && processed < maxItems; i++) {
        const fresh = await AiSimilarCompanyBatchJob.findById(job._id).select('status').lean();
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
            if (item.type === 'market_intelligence') {
                const out = await runMarketIntelligence(companyId, userId, {
                    confirmPaidProvider: job.paidProviderConfirmed,
                });
                results[i] = { ...item, status: 'success', savedCount: out.savedCount };
                job.successCount += 1;
            } else {
                // Respect provider call budget (paid discovery never auto-run)
                if (job.maxProviderCalls > 0 && job.providerCallCount >= job.maxProviderCalls) {
                    results[i] = { ...item, status: 'skipped', reason: 'provider_call_limit' };
                    job.skippedCount += 1;
                } else {
                    const out = await findSimilarForSeed(companyId, userId, {
                        seedExtractedLeadId: item.seedExtractedLeadId,
                        financialYear: job.financialYear,
                        mode: job.mode,
                        confirmPaidProvider: job.paidProviderConfirmed,
                    });
                    results[i] = {
                        ...item,
                        status: 'success',
                        candidateCount: out.candidateCount,
                        seedCompanyName: out.seedCompanyName,
                    };
                    job.successCount += 1;
                    job.providerCallCount = (job.providerCallCount || 0) + (out.providerCallCount || 0);
                }
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
