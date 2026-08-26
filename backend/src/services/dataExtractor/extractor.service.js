import { ExtractorSettings } from '../../models/extractorSettings.model.js';
import { ExtractorSearchJob } from '../../models/extractorSearchJob.model.js';
import { ExtractorImportBatch } from '../../models/extractorImportBatch.model.js';
import { ExtractedLead } from '../../models/extractedLead.model.js';
import { ApiError } from '../../utils/ApiError.js';
import ExcelJS from 'exceljs';
import { runManualUrlAdapter } from './adapters/manualUrlAdapter.js';
import { runExcelImportAdapter } from './adapters/excelImportAdapter.js';
import { runKeywordSearch, listKeywordSources, getProviderStatus } from './keywordSearch.service.js';
import { testPortalAdapter } from './adapters/portalAdapter.factory.js';
import { testWebSearchProvider } from './providers/searchProvider.factory.js';
import { ingestJustdialWebhook } from './adapters/justdialAdapter.js';
import { testSocialPublicConnection } from './adapters/socialPublicPageAdapter.js';
import { testGoogleBusinessConnection } from './adapters/googleBusinessAdapter.js';
import { testTradePortalSiteConnection } from './adapters/tradePortalSiteAdapter.js';
import {
    enrichRecordsWithAi,
    testAiConnection,
} from './extractorAi.service.js';
import {
    convertExtractedToCustomer,
    convertExtractedToLead,
    convertExtractedToSupplier,
    getExtractedRecordDuplicates,
    scheduleFollowupForExtracted,
} from './extractorConversion.service.js';
import { sanitizeExtractorSettingsForClient } from './providerSecrets.util.js';
import {
    assertDataExtractorEnabledForCompany,
    isDataExtractorEnabledForCompany,
    syncExtractorSettingsWithAllocation,
} from './dataExtractorEnablement.service.js';

export { listKeywordSources, getProviderStatus };
export {
    isDataExtractorEnabledForCompany,
    assertDataExtractorEnabledForCompany,
};

/**
 * Compatibility export for discovery.controller.js.
 * Case B: wraps sanitizeExtractorSettingsForClient (established client sanitizer).
 * Pure: no DB, no env reads, no mutation of the input object.
 */
export function sanitizeSettingsResponse(settings) {
    if (settings == null) {
        return {
            moduleEnabled: false,
            sourceConnectors: {},
        };
    }

    let plain = settings;
    if (typeof settings.toObject === 'function') {
        try {
            plain = settings.toObject({ depopulate: true, flattenMaps: true });
        } catch {
            plain = settings.toObject();
        }
    } else if (
        typeof settings.toJSON === 'function'
        && !Array.isArray(settings)
        && typeof settings !== 'string'
    ) {
        try {
            plain = settings.toJSON();
        } catch {
            plain = settings;
        }
    }

    if (!plain || typeof plain !== 'object' || Array.isArray(plain)) {
        return {
            moduleEnabled: false,
            sourceConnectors: {},
        };
    }

    // Existing util shallow-clones and masks known provider API keys (*Masked).
    const sanitized = sanitizeExtractorSettingsForClient(plain);

    const TOP_SAFE = [
        '_id',
        'companyId',
        'moduleEnabled',
        'maxUrlsPerJob',
        'maxJobsPerDay',
        'maxResultsPerSearch',
        'maxRecordsPerExport',
        'searchTimeoutMs',
        'enableSearchLogs',
        'allowedAdapters',
        'aiEnabled',
        'updatedBy',
        'createdAt',
        'updatedAt',
        '__v',
    ];
    const CONNECTOR_SAFE = [
        'discovery',
        'brave',
        'serpapi',
        'google',
        'controlledTestMode',
        'justdial',
    ];
    const SECRET_KEY_RE = /(?:^|_)(api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|password|passwd|private[_-]?key|session[_-]?token|cookie|cookies|authorization|bearer|credential|credentials|webhook[_-]?token|pairing[_-]?secret|encryption[_-]?key|mongo(db)?(_?uri)?|database[_-]?uri|proxy[_-]?(pass|password|user)|service[_-]?account)(?:$|_)/i;
    const MASKED_KEEP = new Set([
        'apiKeyMasked',
        'cseApiKeyMasked',
        'placesApiKeyMasked',
    ]);

    function dangerousKey(key) {
        return key === '__proto__' || key === 'constructor' || key === 'prototype';
    }

    function isSecretFieldName(key) {
        if (dangerousKey(key)) return true;
        if (MASKED_KEEP.has(key)) return false;
        const k = String(key);
        if (SECRET_KEY_RE.test(k)) return true;
        if (/password|passwd|secret|token|credential|privatekey|authorization|cookie/i.test(k)) {
            if (/masked$/i.test(k)) return false;
            return true;
        }
        return false;
    }

    function pickSafeObject(src, { allowNested = true } = {}) {
        if (!src || typeof src !== 'object' || Array.isArray(src)) return {};
        const out = {};
        for (const key of Object.keys(src)) {
            if (dangerousKey(key) || isSecretFieldName(key)) continue;
            const val = src[key];
            if (val != null && typeof val === 'object' && !Array.isArray(val) && !(val instanceof Date)) {
                if (!allowNested) continue;
                if (key === 'headers' || key === 'auth' || key === 'credentials' || key === 'proxy') continue;
                out[key] = pickSafeObject(val, { allowNested: true });
                continue;
            }
            out[key] = val;
        }
        return out;
    }

    const out = {};
    for (const key of TOP_SAFE) {
        if (dangerousKey(key)) continue;
        if (Object.prototype.hasOwnProperty.call(sanitized, key)) {
            out[key] = sanitized[key];
        }
    }

    const connectorsIn = sanitized.sourceConnectors && typeof sanitized.sourceConnectors === 'object'
        ? sanitized.sourceConnectors
        : {};
    const connectorsOut = {};
    for (const name of CONNECTOR_SAFE) {
        if (!Object.prototype.hasOwnProperty.call(connectorsIn, name)) continue;
        if (dangerousKey(name)) continue;
        const block = connectorsIn[name];
        if (!block || typeof block !== 'object' || Array.isArray(block)) {
            connectorsOut[name] = {};
            continue;
        }
        const safeBlock = pickSafeObject(block);
        for (const mk of MASKED_KEEP) {
            if (Object.prototype.hasOwnProperty.call(block, mk)) {
                safeBlock[mk] = block[mk];
            }
        }
        connectorsOut[name] = safeBlock;
    }
    out.sourceConnectors = connectorsOut;

    if (!Object.prototype.hasOwnProperty.call(out, 'moduleEnabled')) {
        out.moduleEnabled = false;
    }

    return out;
}

export async function testExtractorAdapter(adapterId, settings = null, companyId = null) {
    if (adapterId === 'web_search' || adapterId === 'google_cse') {
        return testWebSearchProvider(undefined, settings);
    }
    if (adapterId === 'social_public') {
        return testSocialPublicConnection(settings);
    }
    if (adapterId === 'google_business') {
        return testGoogleBusinessConnection(settings);
    }
    if (adapterId === 'exportersindia' || adapterId === 'alibaba' || adapterId === 'made_in_china') {
        return testTradePortalSiteConnection(adapterId, settings);
    }
    if (adapterId === 'ai') {
        return testAiConnection(settings || {});
    }
    return testPortalAdapter(adapterId, settings, companyId);
}

export async function handleJustdialWebhook(token, body, query, reqMeta) {
    return ingestJustdialWebhook(token, body, query, reqMeta);
}

export async function getOrCreateExtractorSettings(companyId) {
    // Allocation is master: create/repair settings.moduleEnabled to match Company Module Allocation.
    return syncExtractorSettingsWithAllocation(companyId);
}

export async function assertExtractorModuleEnabled(companyId) {
    const { settings } = await assertDataExtractorEnabledForCompany(companyId);
    return settings;
}

export async function updateExtractorSettings(companyId, payload, userId) {
    const existing = await ExtractorSettings.findOne({ companyId }).lean();
    const update = { ...payload, updatedBy: userId };

    if (payload.googleApiKeys && typeof payload.googleApiKeys === 'object') {
        const prevGoogle = existing?.sourceConnectors?.google || {};
        const keys = payload.googleApiKeys;
        const google = { ...prevGoogle };
        if (keys.cseApiKey != null && String(keys.cseApiKey).trim()) {
            google.cseApiKey = String(keys.cseApiKey).trim();
        }
        if (keys.cseCx != null && String(keys.cseCx).trim()) {
            google.cseCx = String(keys.cseCx).trim();
        }
        if (keys.placesApiKey != null && String(keys.placesApiKey).trim()) {
            google.placesApiKey = String(keys.placesApiKey).trim();
        }
        update.sourceConnectors = {
            ...(existing?.sourceConnectors || {}),
            google,
        };
        delete update.googleApiKeys;
    }

    const settings = await ExtractorSettings.findOneAndUpdate(
        { companyId },
        { $set: update },
        { new: true, upsert: true },
    ).lean();
    // Company Module Allocation remains master for moduleEnabled.
    return syncExtractorSettingsWithAllocation(companyId, { userId });
}

async function countJobsToday(companyId) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return ExtractorSearchJob.countDocuments({ companyId, createdAt: { $gte: start } });
}

async function saveExtractedRecords({
    records,
    companyId,
    financialYear,
    userId,
    searchJobId,
    importBatchId,
}) {
    const docs = records.map((r) => {
        const { _previewIndex, _isDuplicate, ...rest } = r;
        return {
            ...rest,
            companyId,
            financialYear,
            status: 'draft',
            duplicateStatus: rest.duplicateStatus || 'none',
            createdBy: userId,
            searchJobId: searchJobId || null,
            importBatchId: importBatchId || null,
            extractedAt: rest.extractedAt || new Date(),
        };
    });
    if (!docs.length) return [];
    const inserted = await ExtractedLead.insertMany(docs);
    return inserted;
}

export async function runManualUrlJob({
    companyId,
    financialYear,
    userId,
    urls,
}) {
    const settings = await assertExtractorModuleEnabled(companyId);
    if (!settings.allowedAdapters.includes('manual_url')) {
        throw new ApiError(403, 'Manual URL adapter is disabled');
    }

    const list = [...new Set((urls || []).map((u) => String(u).trim()).filter(Boolean))];
    if (!list.length) throw new ApiError(400, 'At least one URL is required');
    if (list.length > settings.maxUrlsPerJob) {
        throw new ApiError(400, `Maximum ${settings.maxUrlsPerJob} URLs per job`);
    }

    const jobsToday = await countJobsToday(companyId);
    if (jobsToday >= settings.maxJobsPerDay) {
        throw new ApiError(429, `Daily job limit (${settings.maxJobsPerDay}) reached`);
    }

    const job = await ExtractorSearchJob.create({
        companyId,
        financialYear,
        jobType: 'manual_url',
        adapterId: 'manual_url',
        status: 'running',
        inputSummary: `${list.length} URL(s)`,
        inputPayload: { urls: list },
        createdBy: userId,
    });

    try {
        const { records, errors } = await runManualUrlAdapter(list);
        const inserted = await saveExtractedRecords({
            records,
            companyId,
            financialYear,
            userId,
            searchJobId: job._id,
        });

        job.status = 'completed';
        job.recordCount = inserted.length;
        job.errorCount = errors.length;
        job.jobErrors = errors;
        job.completedAt = new Date();
        await job.save();

        return { job: job.toObject(), records: inserted, errors };
    } catch (err) {
        job.status = 'failed';
        job.jobErrors = [err?.message || 'Job failed'];
        job.completedAt = new Date();
        await job.save();
        throw err;
    }
}

export async function runExcelImportJob({
    companyId,
    financialYear,
    userId,
    buffer,
    fileName,
    columnMapping,
}) {
    const settings = await assertExtractorModuleEnabled(companyId);
    if (!settings.allowedAdapters.includes('excel_import')) {
        throw new ApiError(403, 'Excel import adapter is disabled');
    }

    const jobsToday = await countJobsToday(companyId);
    if (jobsToday >= settings.maxJobsPerDay) {
        throw new ApiError(429, `Daily job limit (${settings.maxJobsPerDay}) reached`);
    }

    const job = await ExtractorSearchJob.create({
        companyId,
        financialYear,
        jobType: 'excel_import',
        adapterId: 'excel_import',
        status: 'running',
        inputSummary: fileName || 'import',
        inputPayload: { fileName },
        createdBy: userId,
    });

    try {
        const { records, errors, rowCount } = await runExcelImportAdapter({
            buffer,
            fileName,
            columnMapping: columnMapping || {},
        });

        const batch = await ExtractorImportBatch.create({
            companyId,
            financialYear,
            fileName,
            columnMapping: columnMapping || {},
            rowCount,
            searchJobId: job._id,
            createdBy: userId,
        });

        const inserted = await saveExtractedRecords({
            records,
            companyId,
            financialYear,
            userId,
            searchJobId: job._id,
            importBatchId: batch._id,
        });

        job.status = 'completed';
        job.recordCount = inserted.length;
        job.errorCount = errors.length;
        job.jobErrors = errors;
        job.metadata = { rowCount };
        job.completedAt = new Date();
        await job.save();

        return { job: job.toObject(), batch, records: inserted, errors };
    } catch (err) {
        job.status = 'failed';
        job.jobErrors = [err?.message || 'Import failed'];
        job.completedAt = new Date();
        await job.save();
        throw err;
    }
}

export async function listSearchJobs(companyId, query = {}) {
    const { page = 1, limit = 20, jobType } = query;
    const q = { companyId, 'metadata.historyClearedAt': { $exists: false } };
    if (jobType) q.jobType = jobType;

    const skip = (Math.max(1, Number(page)) - 1) * Math.min(100, Number(limit) || 20);
    const take = Math.min(100, Number(limit) || 20);

    const [results, total] = await Promise.all([
        ExtractorSearchJob.find(q).sort({ createdAt: -1 }).skip(skip).limit(take).lean(),
        ExtractorSearchJob.countDocuments(q),
    ]);

    return { results, total, page: Number(page), limit: take };
}

export async function listExtractedLeads(companyId, query = {}) {
    const { status, searchJobId, page = 1, limit = 50 } = query;
    const q = { companyId };
    if (status) q.status = status;
    if (searchJobId) q.searchJobId = searchJobId;

    const skip = (Math.max(1, Number(page)) - 1) * Math.min(100, Number(limit) || 50);
    const take = Math.min(100, Number(limit) || 50);

    const [results, total] = await Promise.all([
        ExtractedLead.find(q).sort({ createdAt: -1 }).skip(skip).limit(take).lean(),
        ExtractedLead.countDocuments(q),
    ]);

    return { results, total, page: Number(page), limit: take };
}

export async function getExtractedLeadById(companyId, id) {
    const doc = await ExtractedLead.findOne({ _id: id, companyId }).lean();
    if (!doc) throw new ApiError(404, 'Record not found');
    return doc;
}

export async function getJobById(companyId, id) {
    const job = await ExtractorSearchJob.findOne({ _id: id, companyId }).lean();
    if (!job) throw new ApiError(404, 'Job not found');
    return job;
}

export async function deleteDraftRecord(companyId, id) {
    const doc = await ExtractedLead.findOne({ _id: id, companyId });
    if (!doc) throw new ApiError(404, 'Record not found');
    if (doc.status !== 'draft') throw new ApiError(400, 'Only draft records can be deleted');
    await doc.deleteOne();
    return { deleted: true };
}

export async function saveJobDrafts(companyId, jobId, userId, financialYear, { indices, all } = {}) {
    const job = await ExtractorSearchJob.findOne({ _id: jobId, companyId });
    if (!job) throw new ApiError(404, 'Job not found');

    const preview = job.metadata?.previewRecords || [];
    if (!preview.length) throw new ApiError(400, 'No preview records on this job');

    let selected = preview;
    if (!all && Array.isArray(indices) && indices.length) {
        const set = new Set(indices.map((i) => Number(i)));
        selected = preview.filter((_, idx) => set.has(idx));
    }
    if (!selected.length) throw new ApiError(400, 'No records selected');

    const inserted = await saveExtractedRecords({
        records: selected,
        companyId,
        financialYear: financialYear || job.financialYear,
        userId,
        searchJobId: job._id,
    });

    job.metadata = {
        ...(job.metadata || {}),
        savedCount: (job.metadata?.savedCount || 0) + inserted.length,
        lastSavedAt: new Date(),
    };
    await job.save();

    return { saved: inserted.length, records: inserted };
}

export async function approveRecord(companyId, id, userId) {
    const doc = await ExtractedLead.findOne({ _id: id, companyId });
    if (!doc) throw new ApiError(404, 'Record not found');
    if (doc.status === 'converted') throw new ApiError(400, 'Already converted');
    if (doc.status === 'rejected') throw new ApiError(400, 'Cannot approve rejected record');

    doc.status = 'approved';
    doc.approvedBy = userId;
    await doc.save();
    return doc.toObject();
}

export async function rejectRecord(companyId, id, userId, reason = '') {
    const doc = await ExtractedLead.findOne({ _id: id, companyId });
    if (!doc) throw new ApiError(404, 'Record not found');
    if (doc.status === 'converted') throw new ApiError(400, 'Cannot reject converted record');

    doc.status = 'rejected';
    doc.rejectedBy = userId;
    doc.rejectionReason = String(reason || '').trim();
    await doc.save();
    return doc.toObject();
}

export async function bulkActionRecords(companyId, ids, userId, action, opts = {}) {
    const uniqueIds = [...new Set((ids || []).map((id) => String(id).trim()).filter(Boolean))];
    if (!uniqueIds.length) throw new ApiError(400, 'Select at least one record');

    const result = { action, success: 0, failed: [] };

    for (const id of uniqueIds) {
        try {
            switch (action) {
                case 'approve':
                    await approveRecord(companyId, id, userId);
                    break;
                case 'reject':
                    await rejectRecord(companyId, id, userId, opts.reason);
                    break;
                case 'delete':
                    await deleteDraftRecord(companyId, id);
                    break;
                case 'convert':
                    await convertRecord(companyId, id, opts.entityType, userId);
                    break;
                default:
                    throw new ApiError(400, 'Invalid bulk action');
            }
            result.success += 1;
        } catch (err) {
            result.failed.push({ id, message: err?.message || 'Failed' });
        }
    }

    return result;
}

export async function exportRecords(companyId, query = {}) {
    const { format = 'csv', searchJobId, status } = query;
    const q = { companyId };
    if (searchJobId) q.searchJobId = searchJobId;
    if (status) q.status = status;

    const settings = await getOrCreateExtractorSettings(companyId);
    const limit = Math.min(settings.maxRecordsPerExport || 5000, 5000);
    const records = await ExtractedLead.find(q).sort({ createdAt: -1 }).limit(limit).lean();

    if (format === 'json') {
        return { format, records, contentType: 'application/json' };
    }

    const headers = [
        'Company', 'Website', 'Source URL', 'Email', 'Phone', 'Address', 'City', 'State', 'Country',
        'Description', 'Products', 'Keywords', 'Confidence', 'Lead Score', 'Duplicate', 'Status', 'Source',
    ];
    const rowData = records.map((r) => [
        r.companyName, r.website, r.sourceUrl, r.email, r.phone || r.mobile, r.address,
        r.city, r.stateProvince, r.country, r.businessDescription,
        (r.productCategories || []).join('; '), (r.keywords || []).join('; '),
        r.confidenceScore, r.leadScore, r.duplicateStatus !== 'none' ? 'Yes' : 'No',
        r.status, r.sourcePlatform,
    ]);

    if (format === 'xlsx' || format === 'excel') {
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Extracted Leads');
        sheet.addRow(headers);
        rowData.forEach((row) => sheet.addRow(row));
        const buffer = await workbook.xlsx.writeBuffer();
        return {
            format: 'xlsx',
            content: buffer,
            contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        };
    }

    const rows = rowData.map((cols) => cols.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    return { format: 'csv', content: csv, contentType: 'text/csv' };
}

export async function runKeywordSearchJob({
    companyId,
    financialYear,
    userId,
    keyword,
    city,
    state,
    country,
    sourceId,
    maxResults,
    rerunFromJobId = null,
}) {
    const settings = await assertExtractorModuleEnabled(companyId);

    const jobsToday = await countJobsToday(companyId);
    if (jobsToday >= settings.maxJobsPerDay) {
        throw new ApiError(429, `Daily job limit (${settings.maxJobsPerDay}) reached`);
    }

    const cap = Math.min(settings.maxResultsPerSearch || 20, Number(maxResults) || 10);
    const adapterId = String(sourceId || 'web_search').trim().toLowerCase();
    const summary = [keyword, city, state, country].filter(Boolean).join(' | ');

    const job = await ExtractorSearchJob.create({
        companyId,
        financialYear,
        jobType: 'search',
        adapterId,
        status: 'running',
        inputSummary: summary,
        inputPayload: { keyword, city, state, country, sourceId: adapterId, maxResults: cap },
        createdBy: userId,
    });

    try {
        const { records, errors, metadata } = await runKeywordSearch(
            { keyword, city, state, country, sourceId: adapterId, maxResults: cap },
            settings,
            companyId,
        );

        let previewRecords = records.map((r, idx) => ({ ...r, _previewIndex: idx }));

        if (settings.aiEnabled && previewRecords.length) {
            previewRecords = await enrichRecordsWithAi(previewRecords, settings, { searchKeyword: keyword });
            previewRecords = previewRecords.map((r, idx) => ({ ...r, _previewIndex: idx }));
        }

        job.status = 'completed';
        job.recordCount = previewRecords.length;
        job.errorCount = errors.length;
        job.jobErrors = errors;
        job.metadata = {
            ...(metadata || {}),
            ...(rerunFromJobId ? { rerunFromJobId: String(rerunFromJobId) } : {}),
            previewOnly: true,
            previewRecords,
            savedCount: 0,
            aiEnhanced: !!settings.aiEnabled,
        };
        job.completedAt = new Date();
        await job.save();

        if (settings.enableSearchLogs) {
            console.info('[data-extractor] keyword search', {
                companyId: String(companyId),
                jobId: String(job._id),
                adapterId: metadata?.adapterId,
                query: metadata?.query || metadata?.audit?.queries,
                provider: metadata?.provider,
                resultCount: previewRecords.length,
                rejectedUrlCount: metadata?.rejectedUrlCount,
            });
        }

        return {
            job: job.toObject(),
            previewRecords,
            records: [],
            errors,
            metadata: job.metadata,
        };
    } catch (err) {
        job.status = 'failed';
        job.jobErrors = [err?.message || 'Keyword search failed'];
        job.completedAt = new Date();
        await job.save();
        throw err;
    }
}

export async function rerunSearchJob(companyId, jobId, userId, financialYear) {
    const original = await getJobById(companyId, jobId);
    await assertExtractorModuleEnabled(companyId);

    if (original.jobType === 'search') {
        const p = original.inputPayload || {};
        return runKeywordSearchJob({
            companyId,
            financialYear: financialYear || original.financialYear,
            userId,
            keyword: p.keyword,
            city: p.city,
            state: p.state,
            country: p.country,
            sourceId: p.sourceId || original.adapterId,
            maxResults: p.maxResults,
            rerunFromJobId: jobId,
        });
    }

    if (original.jobType === 'manual_url') {
        const urls = original.inputPayload?.urls || [];
        return runManualUrlJob({
            companyId,
            financialYear: financialYear || original.financialYear,
            userId,
            urls,
        });
    }

    throw new ApiError(400, 'Only keyword search and manual URL jobs can be re-run');
}

export async function enhanceJobWithAi(companyId, jobId) {
    const settings = await assertExtractorModuleEnabled(companyId);
    if (!settings.aiEnabled) {
        throw new ApiError(400, 'Enable AI layer in Data Extractor settings first');
    }

    const job = await ExtractorSearchJob.findOne({ _id: jobId, companyId });
    if (!job) throw new ApiError(404, 'Job not found');

    const preview = job.metadata?.previewRecords || [];
    if (!preview.length) throw new ApiError(400, 'No preview records on this job');

    const keyword = job.inputPayload?.keyword || '';
    const enhanced = await enrichRecordsWithAi(preview, settings, { searchKeyword: keyword });
    const previewRecords = enhanced.map((r, idx) => ({ ...r, _previewIndex: idx }));

    job.metadata = {
        ...(job.metadata || {}),
        previewRecords,
        aiEnhanced: true,
        aiEnhancedAt: new Date(),
    };
    job.recordCount = previewRecords.length;
    await job.save();

    return { job: job.toObject(), previewRecords, errors: [] };
}

export async function convertRecord(companyId, id, entityType, userId) {
    switch (entityType) {
        case 'lead':
            return convertExtractedToLead(companyId, id, userId);
        case 'customer':
            return convertExtractedToCustomer(companyId, id, userId);
        case 'supplier':
            return convertExtractedToSupplier(companyId, id, userId);
        default:
            throw new ApiError(400, 'Invalid conversion type');
    }
}

export async function getRecordDuplicates(companyId, id) {
    return getExtractedRecordDuplicates(companyId, id);
}

export async function createRecordFollowup(companyId, id, userId, body, user) {
    return scheduleFollowupForExtracted(companyId, id, userId, body, user);
}
