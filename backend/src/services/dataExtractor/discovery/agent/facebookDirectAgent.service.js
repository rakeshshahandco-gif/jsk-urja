/**
 * Facebook Direct Login via local JSK Extraction Agent.
 * Never opens a server Facebook browser session. Never stores Facebook cookies on the CRM.
 */
import crypto from 'crypto';
import { DiscoveryAgentJob } from '../../../../models/discoveryAgentJob.model.js';
import { DiscoveryAgentToken } from '../../../../models/discoveryAgentToken.model.js';
import { SearchCampaign } from '../../../../models/searchCampaign.model.js';
import { User } from '../../../../models/user.model.js';
import { ApiError } from '../../../../utils/ApiError.js';
import { ingestRawCaptures } from '../../searchCampaign/rawCapture/rawCapture.ingestion.service.js';
import { ensureSimpleLeadSearchQuery } from '../../searchCampaign/searchQuery/searchQuery.service.js';
import { normalizeNameForIndex } from '../../searchCampaign/normalize.util.js';
import { findUserAgentToken, reportSourceStatus, sourceStatusFromToken } from './sourceConnect.service.js';
import {
    FACEBOOK_DIRECT_AGENT_SOURCE_MODE,
    assignmentFromToken,
    assertTokenMayClaimFacebookDirectJob,
    bindFacebookDirectClaimIdentity,
    fallbackLegacyDeviceId,
    isAgentTokenOnline,
    normalizeDeviceId,
    tokenMayClaimFacebookDirectJob,
    tokenOwnerId,
} from './agentDevice.util.js';
import { assertNoBrowserSecrets } from './agentIngest.service.js';

export const FACEBOOK_DIRECT_AGENT_BATCH_MAX = 10;
export const FACEBOOK_SESSION_EXPIRED_CODE = 'FACEBOOK_SESSION_EXPIRED';

export function isFacebookDirectAgentSearchType(searchType) {
    return String(searchType || '').trim().toLowerCase() === 'pages';
}

export function isFacebookDirectAgentJob(job) {
    return String(job?.sourceMode) === FACEBOOK_DIRECT_AGENT_SOURCE_MODE
        || String(job?.metadata?.extractionMode || '').toUpperCase() === 'DIRECT_AGENT';
}

function actorId(user) {
    return user?._id || user?.id || null;
}

function waitMessage(deviceName) {
    const name = String(deviceName || 'assigned PC').trim() || 'assigned PC';
    return `Waiting for assigned PC — ${name}`;
}

function expiredMessage(deviceName) {
    const name = String(deviceName || 'this PC').trim() || 'this PC';
    return `Facebook session expired — Reconnect Facebook on ${name}`;
}

function mapToRawCaptureRecords(records = [], { keyword, location } = {}) {
    const kw = String(keyword || '').trim();
    const loc = String(location || '').trim();
    return (Array.isArray(records) ? records : []).slice(0, 100).map((rec, idx) => {
        const title = String(rec.title || rec.name || rec.companyName || '').trim().slice(0, 300);
        const resultUrl = String(rec.resultUrl || rec.sourceUrl || rec.facebookUrl || rec.url || '').trim();
        const snippet = String(rec.snippet || rec.description || rec.category || '').trim().slice(0, 2000);
        const notes = [
            kw ? `keyword=${kw}` : '',
            loc ? `location=${loc}` : '',
            'source=facebook',
            'extractionMode=direct-agent',
            rec.website ? `website=${String(rec.website).slice(0, 300)}` : '',
            rec.phone ? `phone=${String(rec.phone).slice(0, 80)}` : '',
            rec.email ? `email=${String(rec.email).slice(0, 120)}` : '',
            rec.location && !loc ? `place=${String(rec.location).slice(0, 160)}` : '',
            rec.pageType ? `pageType=${String(rec.pageType).slice(0, 80)}` : '',
        ].filter(Boolean).join('; ').slice(0, 2000);
        return {
            title: title || resultUrl || 'Facebook Page',
            snippet,
            resultUrl,
            resultPosition: idx + 1,
            sourceRecordId: String(rec.sourceRecordId || resultUrl || '').slice(0, 240),
            resultTypeHint: 'facebook_page',
            notes,
        };
    }).filter((r) => r.resultUrl);
}

async function ensureCampaign({ companyId, user, keyword, location }) {
    const name = `Facebook · ${keyword}${location ? ` · ${location}` : ''}`;
    const nameNormalized = normalizeNameForIndex(name);
    let campaign = await SearchCampaign.findOne({
        companyId,
        nameNormalized,
        status: { $in: ['draft', 'active', 'paused'] },
    });
    if (!campaign) {
        campaign = await SearchCampaign.create({
            name,
            nameNormalized,
            targetIndustry: keyword,
            targetProducts: [keyword],
            includeKeywords: [keyword],
            city: location || '',
            sources: ['facebook'],
            selectedSources: ['facebook'],
            minimumQualificationScore: 60,
            companyId,
            status: 'active',
            createdBy: actorId(user),
            updatedBy: actorId(user),
        });
    } else if (campaign.status === 'paused') {
        campaign.status = 'active';
        campaign.updatedBy = actorId(user);
        await campaign.save();
    }
    return campaign;
}

export async function startFacebookDirectAgentExtraction({
    companyId,
    user,
    headers = {},
    keyword,
    location = '',
    searchType = 'pages',
}) {
    const userId = actorId(user);
    const token = await findUserAgentToken(companyId, userId);
    if (!token) {
        throw new ApiError(409, 'Connect This PC first. JSK Extraction Agent is not paired for this user.');
    }
    const fb = sourceStatusFromToken(token, 'facebook');
    if (fb.status === 'expired') {
        throw new ApiError(409, expiredMessage(token.deviceName || token.hostname));
    }
    if (fb.status !== 'connected') {
        throw new ApiError(409, 'Connect Facebook on this PC first.');
    }

    const assignment = assignmentFromToken(token);
    const deviceName = assignment.assignedDeviceName || 'Windows-PC';
    const online = isAgentTokenOnline(token, Date.now());
    const campaign = await ensureCampaign({ companyId, user, keyword, location });
    const query = await ensureSimpleLeadSearchQuery({
        companyId,
        user,
        campaignId: campaign._id,
        queryText: `${keyword}${location ? ` ${location}` : ''}`.trim(),
        sourceHint: 'facebook',
        priorityScore: 100,
        selectedCriteria: { socialMode: 'direct_login', socialSearchType: searchType, extractionMode: 'DIRECT_AGENT' },
    });

    const existing = await DiscoveryAgentJob.findOne({
        companyId,
        createdBy: userId,
        sourceMode: FACEBOOK_DIRECT_AGENT_SOURCE_MODE,
        status: { $in: ['WAITING_CONNECT', 'RUNNING', 'PAUSED'] },
        'metadata.campaignId': String(campaign._id),
        isDeleted: { $ne: true },
    }).sort({ createdAt: -1 });

    const financialYear = String(headers['x-financial-year'] || headers['X-Financial-Year'] || '').trim() || 'NA';
    const job = existing || await DiscoveryAgentJob.create({
        companyId,
        financialYear,
        createdBy: userId,
        assignedDeviceId: assignment.assignedDeviceId,
        agentTokenId: token._id,
        sourceMode: FACEBOOK_DIRECT_AGENT_SOURCE_MODE,
        status: 'WAITING_CONNECT',
        keyword: String(keyword || '').trim(),
        city: String(location || '').trim(),
        maxCompanies: FACEBOOK_DIRECT_AGENT_BATCH_MAX,
        maxPages: 1,
        cursor: { page: 0, processedUrls: [] },
        metadata: {
            source: 'facebook',
            extractionMode: 'DIRECT_AGENT',
            searchType,
            keyword,
            location,
            businessType: keyword,
            campaignId: String(campaign._id),
            queryId: String(query._id),
            userId: String(userId),
            assignedDeviceId: assignment.assignedDeviceId,
            assignedDeviceName: deviceName,
            usedServerPuppeteer: false,
        },
        auditLog: [{ at: new Date().toISOString(), action: 'facebook_direct_agent_created' }],
    });

    if (existing && existing.status === 'PAUSED') {
        existing.status = 'WAITING_CONNECT';
        existing.controlCommand = 'resume';
        existing.auditLog = [...(existing.auditLog || []), { at: new Date().toISOString(), action: 'facebook_direct_agent_resume' }].slice(-200);
        await existing.save();
    }

    return {
        started: true,
        extractionMode: 'DIRECT_AGENT',
        usedServerPuppeteer: false,
        waitingForDevice: !online,
        agentJobId: String(job._id),
        campaignId: String(campaign._id),
        queryId: String(query._id),
        deviceId: assignment.assignedDeviceId,
        deviceName,
        ingested: Number(job.extractedCount || 0),
        records: [],
        errors: [],
        processingUrl: '/data-extractor/facebook',
        message: online ? `Facebook Direct job queued for ${deviceName}` : waitMessage(deviceName),
        note: online
            ? `JSK Extraction Agent on ${deviceName} will open Facebook locally. Cookies stay on this PC.`
            : waitMessage(deviceName),
    };
}

async function resolveFacebookDirectClaimToken(token) {
    if (!token) return token;
    if (token.userId || token.createdBy) return token;
    const deviceId = normalizeDeviceId(token.deviceId) || fallbackLegacyDeviceId(token);
    if (!deviceId || !token.companyId) return token;
    const siblings = await DiscoveryAgentToken.find({
        companyId: token.companyId,
        deviceId,
        isActive: true,
        revokedAt: null,
        _id: { $ne: token._id },
        $or: [{ userId: { $ne: null } }, { createdBy: { $ne: null } }],
    }).select('companyId userId createdBy deviceId').lean();
    const bound = bindFacebookDirectClaimIdentity(token, siblings);
    if ((bound.userId || bound.createdBy) && !(token.userId || token.createdBy)) {
        await DiscoveryAgentToken.updateOne(
            { _id: token._id, companyId: token.companyId },
            { $set: { userId: bound.userId, createdBy: bound.createdBy || bound.userId } },
        );
    }
    return bound;
}

export async function pollFacebookDirectAgentJob(companyId, token) {
    const claimToken = await resolveFacebookDirectClaimToken(token);
    const rows = await DiscoveryAgentJob.find({
        companyId,
        sourceMode: FACEBOOK_DIRECT_AGENT_SOURCE_MODE,
        status: { $in: ['WAITING_CONNECT', 'RUNNING', 'PAUSED'] },
        isDeleted: { $ne: true },
    }).sort({ createdAt: 1 }).limit(20);

    const now = Date.now();
    const staleMs = 45 * 1000;
    for (const job of rows) {
        if (!tokenMayClaimFacebookDirectJob(claimToken, job)) continue;
        if (job.status === 'RUNNING') {
            const hb = job.lastHeartbeatAt ? new Date(job.lastHeartbeatAt).getTime() : 0;
            const sameToken = job.agentTokenId && String(job.agentTokenId) === String(claimToken._id || token._id);
            if (sameToken || (hb && now - hb > staleMs)) return job.toObject();
            continue;
        }
        return job.toObject();
    }
    return null;
}

export async function claimFacebookDirectAgentJob(companyId, jobId, token, agentInstanceId) {
    const job = await DiscoveryAgentJob.findOne({ _id: jobId, companyId, isDeleted: { $ne: true } });
    if (!job) throw new ApiError(404, 'Agent job not found');
    if (!isFacebookDirectAgentJob(job)) {
        throw new ApiError(400, 'Not a Facebook Direct Agent job');
    }
    if (['STOPPED', 'COMPLETED', 'CANCELLED'].includes(job.status)) {
        throw new ApiError(400, 'Job is already ' + job.status);
    }
    const claimToken = await resolveFacebookDirectClaimToken(token);
    assertTokenMayClaimFacebookDirectJob(claimToken, job);
    job.agentTokenId = token._id;
    job.agentInstanceId = String(agentInstanceId || '').slice(0, 120);
    job.status = 'RUNNING';
    job.lastHeartbeatAt = new Date();
    job.auditLog = [...(job.auditLog || []), { at: new Date().toISOString(), action: 'facebook_direct_claimed' }].slice(-200);
    await job.save();
    return job.toObject();
}

export async function ingestFacebookDirectAgentRecords(companyId, jobId, payload = {}) {
    assertNoBrowserSecrets(payload);
    const job = await DiscoveryAgentJob.findOne({ _id: jobId, companyId, isDeleted: { $ne: true } });
    if (!job) throw new ApiError(404, 'Agent job not found');
    if (!isFacebookDirectAgentJob(job)) {
        throw new ApiError(400, 'Not a Facebook Direct Agent job');
    }
    const user = await User.findById(job.createdBy);
    if (!user) throw new ApiError(404, 'Job owner not found');
    const campaignId = job.metadata?.campaignId;
    const queryId = job.metadata?.queryId;
    if (!campaignId || !queryId) throw new ApiError(400, 'Facebook Direct job is missing campaign/query');

    const mapped = mapToRawCaptureRecords(payload.records, {
        keyword: job.keyword || job.metadata?.keyword,
        location: job.city || job.metadata?.location,
    });
    if (!mapped.length) {
        return { accepted: 0, extractedCount: job.extractedCount || 0, status: job.status };
    }

    const ingest = await ingestRawCaptures({
        companyId,
        user,
        campaignId,
        body: {
            queryId: String(queryId),
            source: 'facebook',
            querySourceHint: 'facebook',
            captureMethod: 'assisted_visible',
            idempotencyKey: `facebook-direct-agent-${String(job._id)}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
            records: mapped,
        },
    });

    const accepted = Number(ingest?.acceptedCount || mapped.length);
    job.extractedCount = Number(job.extractedCount || 0) + accepted;
    if (payload.currentPageUrl) job.currentPageUrl = String(payload.currentPageUrl).slice(0, 2000);
    job.lastHeartbeatAt = new Date();
    job.auditLog = [...(job.auditLog || []), {
        at: new Date().toISOString(),
        action: 'facebook_direct_records',
        count: accepted,
    }].slice(-200);
    await job.save();
    return {
        accepted,
        extractedCount: job.extractedCount,
        status: job.status,
        campaignId: String(campaignId),
        queryId: String(queryId),
        note: 'Records saved to existing Raw Capture pipeline. Facebook cookies were not uploaded.',
    };
}

export async function markFacebookDirectAgentExpired(companyId, jobId, token) {
    const job = await DiscoveryAgentJob.findOne({ _id: jobId, companyId, isDeleted: { $ne: true } });
    if (!job) throw new ApiError(404, 'Agent job not found');
    const claimToken = await resolveFacebookDirectClaimToken(token);
    assertTokenMayClaimFacebookDirectJob(claimToken, job);
    const deviceName = job.metadata?.assignedDeviceName || claimToken.deviceName || token.deviceName || 'this PC';
    job.status = 'PAUSED';
    job.manualActionMessage = expiredMessage(deviceName);
    job.errorSummary = [...(job.errorSummary || []), FACEBOOK_SESSION_EXPIRED_CODE].slice(-20);
    job.lastHeartbeatAt = new Date();
    job.auditLog = [...(job.auditLog || []), { at: new Date().toISOString(), action: 'facebook_session_expired' }].slice(-200);
    await job.save();
    await reportSourceStatus({
        companyId,
        agentToken: token,
        source: 'facebook',
        patch: { status: 'expired', note: job.manualActionMessage },
    }).catch(() => {});
    if (job.metadata?.campaignId) {
        await SearchCampaign.updateOne(
            { _id: job.metadata.campaignId, companyId },
            { $set: { status: 'paused' } },
        );
    }
    return {
        status: 'PAUSED',
        code: FACEBOOK_SESSION_EXPIRED_CODE,
        message: job.manualActionMessage,
        usedServerPuppeteer: false,
    };
}

export async function getFacebookDirectAgentProgress({ companyId, userId }) {
    if (!companyId || !userId) return null;
    const job = await DiscoveryAgentJob.findOne({
        companyId,
        createdBy: userId,
        sourceMode: FACEBOOK_DIRECT_AGENT_SOURCE_MODE,
        isDeleted: { $ne: true },
    }).sort({ updatedAt: -1, createdAt: -1 }).lean();
    if (!job) return null;
    const deviceName = job.metadata?.assignedDeviceName || '';
    const expired = (job.errorSummary || []).includes(FACEBOOK_SESSION_EXPIRED_CODE);
    const waiting = job.status === 'WAITING_CONNECT';
    return {
        agentJobId: String(job._id),
        status: job.status,
        ingested: Number(job.extractedCount || 0),
        deviceName,
        waitingForDevice: waiting,
        expired,
        usedServerPuppeteer: false,
        message: expired
            ? expiredMessage(deviceName)
            : (waiting ? waitMessage(deviceName) : (job.manualActionMessage || '')),
        waitMessage: waiting ? waitMessage(deviceName) : '',
        campaignId: job.metadata?.campaignId || '',
        queryId: job.metadata?.queryId || '',
    };
}

export {
    FACEBOOK_DIRECT_AGENT_SOURCE_MODE,
    tokenMayClaimFacebookDirectJob,
    normalizeDeviceId,
    fallbackLegacyDeviceId,
    tokenOwnerId,
};
