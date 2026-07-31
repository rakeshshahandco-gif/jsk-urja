import { DiscoveryAgentJob, AGENT_SOURCES } from '../../../../models/discoveryAgentJob.model.js';
import { DiscoveryJob } from '../../../../models/discoveryJob.model.js';
import { DiscoverySourceTask } from '../../../../models/discoverySourceTask.model.js';
import { ApiError } from '../../../../utils/ApiError.js';
import { getOrCreateExtractorSettings } from '../../extractor.service.js';
import { DISCLAIMER } from '../providerTypes.js';

function clamp(n, min, max, fallback) {
    const v = Number(n);
    if (!Number.isFinite(v)) return fallback;
    return Math.min(max, Math.max(min, v));
}

function agentEnabled(settings) {
    const d = settings?.sourceConnectors?.discovery || {};
    return d.browserAssistedEnabled === true;
}

export async function createAgentJob({
    companyId, userId, financialYear, sourceMode,
    keyword = '', city = '', state = '', country = 'India',
    maxPages = 3, maxCompanies = 10, delayMsMin = 2500, delayMsMax = 6000,
    maxConcurrentTabs = 1, websiteEnrichment = false,
}) {
    if (!financialYear) throw new ApiError(400, 'financialYear is required');
    if (!AGENT_SOURCES.includes(sourceMode)) throw new ApiError(400, 'Invalid sourceMode');
    const settings = await getOrCreateExtractorSettings(companyId);
    if (!settings.moduleEnabled) throw new ApiError(403, 'Data Extractor module is not enabled');
    if (!agentEnabled(settings)) {
        throw new ApiError(403, 'Browser-assisted Discovery Agent is disabled for this company. Enable it in Discovery settings.');
    }

    const discoveryJob = await DiscoveryJob.create({
        companyId,
        financialYear,
        createdBy: userId,
        keyword: String(keyword || sourceMode).trim() || sourceMode,
        city: String(city || '').trim(),
        state: String(state || '').trim(),
        country: String(country || 'India').trim(),
        targetCompanies: clamp(maxCompanies, 1, 200, 10),
        batchSize: 10,
        selectedSources: ['browser_assisted', sourceMode],
        status: 'DRAFT',
        metadata: {
            previewOnly: true,
            previewRecords: [],
            disclaimer: DISCLAIMER,
            browserAssisted: true,
            sourceMode,
            auditLog: [],
        },
    });
    await DiscoverySourceTask.create({
        jobId: discoveryJob._id,
        companyId,
        providerId: 'browser_assisted',
        status: 'PENDING',
    });

    const agentJob = await DiscoveryAgentJob.create({
        companyId,
        financialYear,
        createdBy: userId,
        discoveryJobId: discoveryJob._id,
        sourceMode,
        status: 'WAITING_CONNECT',
        keyword: String(keyword || '').trim(),
        city: String(city || '').trim(),
        state: String(state || '').trim(),
        country: String(country || 'India').trim(),
        maxPages: clamp(maxPages, 1, 50, 3),
        maxCompanies: clamp(maxCompanies, 1, 200, 10),
        delayMsMin: clamp(delayMsMin, 500, 60000, 2500),
        delayMsMax: clamp(delayMsMax, 500, 120000, 6000),
        maxConcurrentTabs: clamp(maxConcurrentTabs, 1, 2, 1),
        websiteEnrichment: !!websiteEnrichment,
        cursor: { page: 0, processedUrls: [] },
        auditLog: [{ at: new Date().toISOString(), action: 'created' }],
    });

    return { agentJob, discoveryJobId: String(discoveryJob._id) };
}

export async function listAgentJobs(companyId, query = {}) {
    const q = { companyId, isDeleted: { $ne: true } };
    if (query.status) q.status = query.status;
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 30));
    const rows = await DiscoveryAgentJob.find(q).sort({ createdAt: -1 }).limit(limit).lean();
    return { results: rows };
}

export async function getAgentJob(companyId, id) {
    const job = await DiscoveryAgentJob.findOne({ _id: id, companyId, isDeleted: { $ne: true } }).lean();
    if (!job) throw new ApiError(404, 'Agent job not found');
    return job;
}

export async function setAgentControl(companyId, id, command, { message } = {}) {
    const allowed = ['pause', 'resume', 'stop', 'continue_after_manual'];
    if (!allowed.includes(command)) throw new ApiError(400, 'Invalid control command');
    const job = await DiscoveryAgentJob.findOne({ _id: id, companyId, isDeleted: { $ne: true } });
    if (!job) throw new ApiError(404, 'Agent job not found');
    job.controlCommand = command;
    if (command === 'pause') job.status = 'PAUSED';
    if (command === 'stop') job.status = 'STOPPED';
    if (command === 'resume' && job.status === 'PAUSED') job.status = 'RUNNING';
    if (command === 'continue_after_manual') {
        job.status = 'RUNNING';
        job.manualActionMessage = '';
    }
    if (message) job.manualActionMessage = String(message).slice(0, 500);
    job.auditLog = [...(job.auditLog || []), { at: new Date().toISOString(), action: 'control_' + command }].slice(-200);
    await job.save();
    return job.toObject();
}

export async function agentConnect(companyId, agentTokenId, { agentInstanceId = '' } = {}) {
    return {
        ok: true,
        status: 'WAITING_FOR_TASK',
        companyId: String(companyId),
        agentTokenId: String(agentTokenId),
        agentInstanceId: String(agentInstanceId || '').slice(0, 120),
        serverTime: new Date().toISOString(),
        policy: {
            cookiesUploadForbidden: true,
            passwordsForbidden: true,
            captchaBypassForbidden: true,
            maxConcurrentTabs: 2,
            aggressiveMode: false,
            draftsOnly: true,
            autoLeadCreation: false,
        },
    };
}

export async function agentHeartbeat(companyId, id, payload = {}) {
    const job = await DiscoveryAgentJob.findOne({ _id: id, companyId, isDeleted: { $ne: true } });
    if (!job) throw new ApiError(404, 'Agent job not found');

    job.lastHeartbeatAt = new Date();
    if (payload.agentInstanceId) job.agentInstanceId = String(payload.agentInstanceId).slice(0, 120);
    if (payload.currentPageUrl) job.currentPageUrl = String(payload.currentPageUrl).slice(0, 2000);
    if (payload.extractedCount != null) job.extractedCount = Number(payload.extractedCount) || job.extractedCount;
    if (payload.cursor && typeof payload.cursor === 'object') {
        job.cursor = { ...(job.cursor || {}), ...payload.cursor };
    }

    const command = job.controlCommand || 'none';

    if (payload.status === 'MANUAL_ACTION_REQUIRED') {
        job.status = 'MANUAL_ACTION_REQUIRED';
        job.manualActionMessage = String(payload.manualActionMessage || 'Manual action required (e.g. CAPTCHA)').slice(0, 500);
    } else if (payload.status === 'RUNNING' && ['WAITING_CONNECT', 'DRAFT', 'PAUSED'].includes(job.status)) {
        job.status = 'RUNNING';
    } else if (payload.status === 'COMPLETED') {
        job.status = 'COMPLETED';
    } else if (payload.status === 'FAILED') {
        job.status = 'FAILED';
        if (payload.error) job.errorSummary = [...(job.errorSummary || []), String(payload.error)].slice(-20);
    }

    let issued = command;
    if (command !== 'none') {
        job.controlCommand = 'none';
    }
    await job.save();
    return {
        jobId: String(job._id),
        status: job.status,
        controlCommand: issued,
        manualActionMessage: job.manualActionMessage,
        maxPages: job.maxPages,
        maxCompanies: job.maxCompanies,
        delayMsMin: job.delayMsMin,
        delayMsMax: job.delayMsMax,
        maxConcurrentTabs: job.maxConcurrentTabs,
        websiteEnrichment: job.websiteEnrichment,
        cursor: job.cursor,
        extractedCount: job.extractedCount,
    };
}

export async function claimAgentJob(companyId, id, agentTokenId, agentInstanceId) {
    const job = await DiscoveryAgentJob.findOne({ _id: id, companyId, isDeleted: { $ne: true } });
    if (!job) throw new ApiError(404, 'Agent job not found');
    if (['STOPPED', 'COMPLETED', 'CANCELLED'].includes(job.status)) {
        throw new ApiError(400, 'Job is already ' + job.status);
    }
    job.agentTokenId = agentTokenId;
    job.agentInstanceId = String(agentInstanceId || '').slice(0, 120);
    job.status = 'RUNNING';
    job.lastHeartbeatAt = new Date();
    job.auditLog = [...(job.auditLog || []), { at: new Date().toISOString(), action: 'claimed' }].slice(-200);
    await job.save();
    return job.toObject();
}
