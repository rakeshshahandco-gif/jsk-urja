import { ApiError } from '../../../../utils/ApiError.js';
import { normalizeExtractedRecord } from '../../companyNormalizer.service.js';
import { mergePreviewList } from '../mergeNormalize.service.js';
import { enrichRecordsWithDuplicates } from '../../duplicateChecker.service.js';
import { DiscoveryJob } from '../../../../models/discoveryJob.model.js';
import { DiscoveryAgentJob } from '../../../../models/discoveryAgentJob.model.js';

const FORBIDDEN_RECORD_KEYS = [
    'cookies', 'cookie', 'password', 'passwords', 'sessionStorage', 'localStorage',
    'authToken', 'browserProfile', 'storageState', 'setCookie', 'credentials',
];

export function assertNoBrowserSecrets(payload = {}) {
    const blob = JSON.stringify(payload || {});
    if (/"cookies"\s*:/i.test(blob) || /"password"\s*:/i.test(blob) || /"storageState"\s*:/i.test(blob) || /"sessionStorage"\s*:/i.test(blob)) {
        throw new ApiError(400, 'Browser cookies/passwords/storageState must never be uploaded to CRM');
    }
    for (const key of FORBIDDEN_RECORD_KEYS) {
        if (Object.prototype.hasOwnProperty.call(payload, key) && payload[key] != null && payload[key] !== '') {
            throw new ApiError(400, 'Browser secrets are not allowed: ' + key);
        }
    }
}

function sanitizeRecord(raw = {}) {
    const clean = { ...raw };
    for (const k of FORBIDDEN_RECORD_KEYS) delete clean[k];
    if (clean.rawExtractedData && typeof clean.rawExtractedData === 'object') {
        const r = { ...clean.rawExtractedData };
        for (const k of FORBIDDEN_RECORD_KEYS) delete r[k];
        clean.rawExtractedData = r;
    }
    return clean;
}

export async function ingestAgentRecords(companyId, agentJobId, { records = [], currentPageUrl = '', extractedCount } = {}) {
    assertNoBrowserSecrets({ records, currentPageUrl });
    const agentJob = await DiscoveryAgentJob.findOne({ _id: agentJobId, companyId, isDeleted: { $ne: true } });
    if (!agentJob) throw new ApiError(404, 'Agent job not found');

    const list = Array.isArray(records) ? records.slice(0, 100) : [];
    const normalized = [];
    const seenUrls = new Set((agentJob.cursor?.processedUrls || []).map((u) => String(u).toLowerCase()));

    for (const raw of list) {
        assertNoBrowserSecrets(raw);
        const clean = sanitizeRecord(raw);
        const sourceUrl = String(clean.sourceUrl || clean.website || '').trim();
        if (sourceUrl && seenUrls.has(sourceUrl.toLowerCase())) continue;
        if (sourceUrl) seenUrls.add(sourceUrl.toLowerCase());

        normalized.push(normalizeExtractedRecord({
            ...clean,
            sourcePlatform: clean.sourcePlatform || ('browser_' + agentJob.sourceMode),
            sourceUrl: sourceUrl || clean.sourceUrl || '',
            confidenceScore: clean.confidenceScore != null ? clean.confidenceScore : 40,
            rawExtractedData: {
                ...(clean.rawExtractedData || {}),
                discoveryAgentJobId: String(agentJob._id),
                discoveryJobId: agentJob.discoveryJobId ? String(agentJob.discoveryJobId) : undefined,
                sourceProvider: 'browser_assisted',
                sourceProviders: ['browser_assisted', agentJob.sourceMode],
                browserAssisted: true,
                cookiesUploaded: false,
            },
        }));
    }

    let previewAdded = 0;
    if (agentJob.discoveryJobId) {
        const job = await DiscoveryJob.findOne({ _id: agentJob.discoveryJobId, companyId, isDeleted: { $ne: true } });
        if (job) {
            let preview = [...(job.metadata?.previewRecords || []), ...normalized];
            preview = mergePreviewList(preview);
            preview = await enrichRecordsWithDuplicates(companyId, preview);
            job.metadata = {
                ...(job.metadata || {}),
                previewRecords: preview,
                previewOnly: true,
            };
            job.totalRawResults = (job.totalRawResults || 0) + list.length;
            job.totalUniqueResults = preview.length;
            job.lastProcessedAt = new Date();
            await job.save();
            previewAdded = normalized.length;
        }
    }

    const processedUrls = [...seenUrls].slice(-5000);
    agentJob.cursor = { ...(agentJob.cursor || {}), processedUrls };
    agentJob.extractedCount = Number(extractedCount != null ? extractedCount : (agentJob.extractedCount || 0) + normalized.length);
    if (currentPageUrl) agentJob.currentPageUrl = String(currentPageUrl).slice(0, 2000);
    agentJob.lastHeartbeatAt = new Date();
    agentJob.auditLog = [...(agentJob.auditLog || []), {
        at: new Date().toISOString(),
        action: 'records_ingested',
        count: normalized.length,
        skippedDuplicates: Math.max(0, list.length - normalized.length),
    }].slice(-200);
    await agentJob.save();

    return {
        accepted: normalized.length,
        previewAdded,
        extractedCount: agentJob.extractedCount,
        status: agentJob.status,
        note: 'Records saved as discovery drafts/preview only. No automatic Lead creation.',
    };
}
