import { ApiError } from '../../../utils/ApiError.js';
import { checkUserPermission } from '../../../utils/permissionUtils.js';
import { AiMarketingCampaignBatchJob } from '../../../models/aiMarketingCampaignBatchJob.model.js';
import { rejectTenantOverrides } from './normalize.util.js';
import {
    buildAudience, generateCampaignMessage, recommendCampaignContent, markOutdatedIfNeeded,
} from './campaign.service.js';

function requirePerm(user, key) {
    if (!checkUserPermission(user, key) && !checkUserPermission(user, 'data_extractor.marketing_intelligence.manage')) {
        throw new ApiError(403, `Missing permission: ${key}`);
    }
}

export async function createBatch(companyId, userId, payload = {}, user = null) {
    rejectTenantOverrides(payload);
    requirePerm(user, 'data_extractor.marketing_intelligence.batch');
    const jobType = String(payload.jobType || 'build_audience');
    const idempotencyKey = String(payload.idempotencyKey || '').trim();
    if (idempotencyKey) {
        const existing = await AiMarketingCampaignBatchJob.findOne({ companyId, idempotencyKey, isDeleted: { $ne: true } });
        if (existing) return existing.toObject();
    }
    const job = await AiMarketingCampaignBatchJob.create({
        companyId,
        campaignDraftId: payload.campaignDraftId || null,
        jobType,
        status: 'QUEUED',
        total: 1,
        results: [{ status: 'pending', campaignDraftId: payload.campaignDraftId }],
        idempotencyKey,
        createdBy: userId,
    });
    return job.toObject();
}

export async function listBatches(companyId, query = {}) {
    const q = { companyId, isDeleted: { $ne: true } };
    if (query.status) q.status = query.status;
    if (query.campaignDraftId) q.campaignDraftId = query.campaignDraftId;
    return AiMarketingCampaignBatchJob.find(q).sort({ createdAt: -1 }).limit(50).lean();
}

export async function getBatch(companyId, id) {
    const job = await AiMarketingCampaignBatchJob.findOne({ _id: id, companyId, isDeleted: { $ne: true } }).lean();
    if (!job) throw new ApiError(404, 'Batch not found');
    return job;
}

export async function controlBatch(companyId, userId, id, action, user = null) {
    requirePerm(user, 'data_extractor.marketing_intelligence.batch');
    const job = await AiMarketingCampaignBatchJob.findOne({ _id: id, companyId, isDeleted: { $ne: true } });
    if (!job) throw new ApiError(404, 'Batch not found');
    if (action === 'pause' && job.status === 'RUNNING') job.status = 'PAUSED';
    else if (action === 'resume' && job.status === 'PAUSED') job.status = 'QUEUED';
    else if (action === 'stop') job.status = 'STOPPED';
    else if (action === 'retry-failed' && ['FAILED', 'COMPLETED_WITH_ERRORS'].includes(job.status)) {
        job.status = 'QUEUED';
        job.results = (job.results || []).map((r) => (r.status === 'failed' ? { ...r, status: 'pending' } : r));
        job.failedCount = 0;
        job.completedAt = null;
    } else {
        throw new ApiError(400, `Cannot ${action} batch in status ${job.status}`);
    }
    job.lastHeartbeatAt = new Date();
    await job.save();
    return job.toObject();
}

/**
 * Process one batch chunk — preparation only, never sends communication.
 */
export async function processBatchChunk(companyId, userId, id, payload = {}, user = null) {
    rejectTenantOverrides(payload);
    requirePerm(user, 'data_extractor.marketing_intelligence.batch');
    const job = await AiMarketingCampaignBatchJob.findOne({ _id: id, companyId, isDeleted: { $ne: true } });
    if (!job) throw new ApiError(404, 'Batch not found');
    if (['PAUSED', 'STOPPED', 'COMPLETED'].includes(job.status)) {
        return job.toObject();
    }

    job.status = 'RUNNING';
    job.startedAt = job.startedAt || new Date();
    job.lastHeartbeatAt = new Date();
    await job.save();

    const maxItems = Math.min(20, Math.max(1, Number(payload.maxItems) || 5));
    let processed = 0;
    const results = [...(job.results || [])];

    for (let i = job.cursor || 0; i < results.length && processed < maxItems; i += 1) {
        const item = results[i];
        if (item.status && item.status !== 'pending' && item.status !== 'failed') continue;
        try {
            if (job.jobType === 'build_audience' && job.campaignDraftId) {
                // eslint-disable-next-line no-await-in-loop
                await buildAudience(companyId, userId, job.campaignDraftId, { confirmLargeAudience: true }, user);
            } else if (job.jobType === 'generate_message' && job.campaignDraftId) {
                // eslint-disable-next-line no-await-in-loop
                await generateCampaignMessage(companyId, userId, job.campaignDraftId, {}, user);
            } else if (job.jobType === 'recommend_content' && job.campaignDraftId) {
                // eslint-disable-next-line no-await-in-loop
                await recommendCampaignContent(companyId, userId, job.campaignDraftId, {}, user);
            } else if (job.jobType === 'refresh_outdated' && job.campaignDraftId) {
                // eslint-disable-next-line no-await-in-loop
                await markOutdatedIfNeeded(companyId, job.campaignDraftId, payload.reasons || ['OUTDATED_AUDIENCE']);
            }
            results[i] = { ...item, status: 'success' };
            job.successCount = (job.successCount || 0) + 1;
        } catch (e) {
            results[i] = { ...item, status: 'failed', error: String(e.message || e).slice(0, 300) };
            job.failedCount = (job.failedCount || 0) + 1;
            // continue — fail one without stopping batch
        }
        processed += 1;
        job.cursor = i + 1;
        job.processed = (job.processed || 0) + 1;
        job.lastHeartbeatAt = new Date();
    }

    job.results = results;
    const pending = results.some((r) => !r.status || r.status === 'pending' || r.status === 'failed');
    if (job.cursor >= results.length) {
        job.status = job.failedCount > 0 ? 'COMPLETED_WITH_ERRORS' : 'COMPLETED';
        job.completedAt = new Date();
    } else if (!pending && job.cursor >= results.length) {
        job.status = 'COMPLETED';
        job.completedAt = new Date();
    }
    await job.save();
    return job.toObject();
}
