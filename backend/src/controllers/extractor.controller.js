import fs from 'fs';
import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
    approveRecord,
    bulkActionRecords,
    convertRecord,
    createRecordFollowup,
    deleteDraftRecord,
    enhanceJobWithAi,
    exportRecords,
    getExtractedLeadById,
    getJobById,
    getOrCreateExtractorSettings,
    getProviderStatus,
    getRecordDuplicates,
    handleJustdialWebhook,
    listExtractedLeads,
    listKeywordSources,
    listSearchJobs,
    rejectRecord,
    rerunSearchJob,
    runExcelImportJob,
    runKeywordSearchJob,
    runManualUrlJob,
    saveJobDrafts,
    testExtractorAdapter,
    updateExtractorSettings,
} from '../services/dataExtractor/extractor.service.js';
import { ensureJustdialWebhookToken } from '../services/dataExtractor/adapters/portalAdapter.factory.js';

export const getSettings = asyncHandler(async (req, res) => {
    let settings = await getOrCreateExtractorSettings(req.companyId);
    if (settings.moduleEnabled) {
        await ensureJustdialWebhookToken(req.companyId);
        settings = await getOrCreateExtractorSettings(req.companyId);
    }
    const providerStatus = getProviderStatus(settings);
    res.send(new ApiResponse(200, { ...settings, providerStatus }, 'Extractor settings'));
});

export const getProviderStatusHandler = asyncHandler(async (req, res) => {
    const settings = await getOrCreateExtractorSettings(req.companyId);
    res.send(new ApiResponse(200, getProviderStatus(settings), 'Provider status'));
});

export const testWebSearchProvider = asyncHandler(async (req, res) => {
    const settings = await getOrCreateExtractorSettings(req.companyId);
    const result = await testExtractorAdapter('web_search', settings, req.companyId);
    res.send(new ApiResponse(200, result, result.ok ? 'Google / Web Search OK' : 'Web Search test failed'));
});

export const putSettings = asyncHandler(async (req, res) => {
    const roleName = String(req.user?.roleName || '').toLowerCase();
    const isPlatformAdmin = roleName === 'superadmin';
    if (req.body?.moduleEnabled === true && !isPlatformAdmin) {
        throw new ApiError(403, 'Only platform superadmin can enable Data Extractor for a company');
    }

    const allowed = {};
    if (typeof req.body.moduleEnabled === 'boolean') allowed.moduleEnabled = req.body.moduleEnabled;
    if (req.body.maxUrlsPerJob != null) allowed.maxUrlsPerJob = Number(req.body.maxUrlsPerJob);
    if (req.body.maxJobsPerDay != null) allowed.maxJobsPerDay = Number(req.body.maxJobsPerDay);
    if (req.body.maxResultsPerSearch != null) allowed.maxResultsPerSearch = Number(req.body.maxResultsPerSearch);
    if (req.body.searchTimeoutMs != null) allowed.searchTimeoutMs = Number(req.body.searchTimeoutMs);
    if (typeof req.body.enableSearchLogs === 'boolean') allowed.enableSearchLogs = req.body.enableSearchLogs;
    if (typeof req.body.aiEnabled === 'boolean') allowed.aiEnabled = req.body.aiEnabled;
    if (Array.isArray(req.body.allowedAdapters)) allowed.allowedAdapters = req.body.allowedAdapters;
    if (req.body.googleApiKeys && typeof req.body.googleApiKeys === 'object') {
        allowed.googleApiKeys = req.body.googleApiKeys;
    }

    const settings = await updateExtractorSettings(req.companyId, allowed, req.user.id);
    res.send(new ApiResponse(200, { ...settings, providerStatus: getProviderStatus(settings) }, 'Extractor settings updated'));
});

export const createManualUrlJob = asyncHandler(async (req, res) => {
    const financialYear = req.body.financialYear || req.query.financialYear;
    if (!financialYear) throw new ApiError(400, 'financialYear is required');

    const urls = Array.isArray(req.body.urls)
        ? req.body.urls
        : String(req.body.urls || '').split(/[\n,]+/);

    const result = await runManualUrlJob({
        companyId: req.companyId,
        financialYear,
        userId: req.user.id,
        urls,
    });

    res.status(201).send(new ApiResponse(201, result, 'Manual URL extraction completed'));
});

export const uploadExcelImport = asyncHandler(async (req, res) => {
    const financialYear = req.body.financialYear;
    if (!financialYear) throw new ApiError(400, 'financialYear is required');

    let buffer;
    if (req.file?.path) {
        buffer = fs.readFileSync(req.file.path);
    } else if (req.file?.buffer) {
        buffer = req.file.buffer;
    } else {
        throw new ApiError(400, 'File is required');
    }

    let columnMapping = {};
    if (req.body.columnMapping) {
        try {
            columnMapping = typeof req.body.columnMapping === 'string'
                ? JSON.parse(req.body.columnMapping)
                : req.body.columnMapping;
        } catch {
            throw new ApiError(400, 'Invalid columnMapping JSON');
        }
    }

    const result = await runExcelImportJob({
        companyId: req.companyId,
        financialYear,
        userId: req.user.id,
        buffer,
        fileName: req.file.originalname || 'import.xlsx',
        columnMapping,
    });

    res.status(201).send(new ApiResponse(201, result, 'Excel import completed'));
});

export const listRecords = asyncHandler(async (req, res) => {
    const data = await listExtractedLeads(req.companyId, req.query);
    res.send(new ApiResponse(200, data, 'Extracted records'));
});

export const listJobs = asyncHandler(async (req, res) => {
    const data = await listSearchJobs(req.companyId, req.query);
    res.send(new ApiResponse(200, data, 'Search jobs'));
});

export const getRecord = asyncHandler(async (req, res) => {
    const doc = await getExtractedLeadById(req.companyId, req.params.id);
    res.send(new ApiResponse(200, doc, 'Extracted record'));
});

export const getJob = asyncHandler(async (req, res) => {
    const job = await getJobById(req.companyId, req.params.id);
    res.send(new ApiResponse(200, job, 'Extractor job'));
});

export const removeDraft = asyncHandler(async (req, res) => {
    const result = await deleteDraftRecord(req.companyId, req.params.id);
    res.send(new ApiResponse(200, result, 'Draft deleted'));
});

export const listSources = asyncHandler(async (req, res) => {
    let settings = await getOrCreateExtractorSettings(req.companyId);
    if (settings.moduleEnabled) {
        await ensureJustdialWebhookToken(req.companyId);
        settings = await getOrCreateExtractorSettings(req.companyId);
    }
    res.send(new ApiResponse(200, listKeywordSources(settings), 'Keyword sources'));
});

export const testAdapter = asyncHandler(async (req, res) => {
    const adapterId = req.params.adapterId;
    const settings = await getOrCreateExtractorSettings(req.companyId);
    const result = await testExtractorAdapter(adapterId, settings, req.companyId);
    res.send(new ApiResponse(200, result, result.ok ? 'Adapter OK' : 'Adapter test failed'));
});

export const justdialWebhook = asyncHandler(async (req, res) => {
    const result = await handleJustdialWebhook(
        req.params.token,
        req.body || {},
        req.query || {},
        { ip: req.ip },
    );
    res.status(result.status || 200).send({
        success: result.ok,
        message: result.message,
        duplicate: result.duplicate || false,
        recordId: result.recordId || null,
    });
});

export const createKeywordSearchJob = asyncHandler(async (req, res) => {
    const financialYear = req.body.financialYear || req.query.financialYear;
    if (!financialYear) throw new ApiError(400, 'financialYear is required');

    const result = await runKeywordSearchJob({
        companyId: req.companyId,
        financialYear,
        userId: req.user.id,
        keyword: req.body.keyword,
        city: req.body.city,
        state: req.body.state,
        country: req.body.country,
        sourceId: req.body.sourceId,
        maxResults: req.body.maxResults,
    });

    res.status(201).send(new ApiResponse(201, result, 'Keyword search completed'));
});

export const saveDrafts = asyncHandler(async (req, res) => {
    const financialYear = req.body.financialYear || req.query.financialYear;
    const result = await saveJobDrafts(
        req.companyId,
        req.params.id,
        req.user.id,
        financialYear,
        { indices: req.body.indices, all: req.body.all },
    );
    res.send(new ApiResponse(200, result, 'Drafts saved'));
});

export const rerunJob = asyncHandler(async (req, res) => {
    const financialYear = req.body.financialYear || req.query.financialYear;
    const result = await rerunSearchJob(req.companyId, req.params.id, req.user.id, financialYear);
    res.status(201).send(new ApiResponse(201, result, 'Job re-run completed'));
});

export const enhanceJobAi = asyncHandler(async (req, res) => {
    const result = await enhanceJobWithAi(req.companyId, req.params.id);
    res.send(new ApiResponse(200, result, 'AI enhancement applied'));
});

export const approveExtractedRecord = asyncHandler(async (req, res) => {
    const doc = await approveRecord(req.companyId, req.params.id, req.user.id);
    res.send(new ApiResponse(200, doc, 'Record approved'));
});

export const rejectExtractedRecord = asyncHandler(async (req, res) => {
    const doc = await rejectRecord(req.companyId, req.params.id, req.user.id, req.body.reason);
    res.send(new ApiResponse(200, doc, 'Record rejected'));
});

export const getRecordDuplicatesHandler = asyncHandler(async (req, res) => {
    const data = await getRecordDuplicates(req.companyId, req.params.id);
    res.send(new ApiResponse(200, data, 'Duplicate matches'));
});

export const scheduleRecordFollowupHandler = asyncHandler(async (req, res) => {
    const result = await createRecordFollowup(
        req.companyId,
        req.params.id,
        req.user.id,
        req.body,
        req.user,
    );
    res.status(201).send(new ApiResponse(201, result, 'Follow-up scheduled'));
});

export const convertToLead = asyncHandler(async (req, res) => {
    const result = await convertRecord(req.companyId, req.params.id, 'lead', req.user.id);
    res.send(new ApiResponse(200, result, 'Converted to lead'));
});

export const convertToCustomer = asyncHandler(async (req, res) => {
    const result = await convertRecord(req.companyId, req.params.id, 'customer', req.user.id);
    res.send(new ApiResponse(200, result, 'Converted to customer'));
});

export const convertToSupplier = asyncHandler(async (req, res) => {
    const result = await convertRecord(req.companyId, req.params.id, 'supplier', req.user.id);
    res.send(new ApiResponse(200, result, 'Converted to supplier'));
});

export const bulkRecordsAction = asyncHandler(async (req, res) => {
    const { action, ids, reason, entityType } = req.body || {};
    const result = await bulkActionRecords(req.companyId, ids, req.user.id, action, { reason, entityType });
    const msg = result.failed.length
        ? `Completed: ${result.success} ok, ${result.failed.length} failed`
        : `${result.success} record(s) updated`;
    res.send(new ApiResponse(200, result, msg));
});

export const exportExtractedRecords = asyncHandler(async (req, res) => {
    const { format, content, contentType, records } = await exportRecords(req.companyId, req.query);
    if (format === 'json') {
        return res.send(new ApiResponse(200, records, 'Export data'));
    }
    const ext = format === 'xlsx' ? 'xlsx' : 'csv';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="extracted-leads.${ext}"`);
    res.send(Buffer.from(content));
});
