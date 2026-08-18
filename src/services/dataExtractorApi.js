import api from './api';

const unwrap = (res) => res.data?.data ?? res.data;

export const dataExtractorApi = {
    getProviderStatus: async () => {
        const res = await api.get('/data-extractor/provider-status');
        return unwrap(res);
    },

    testWebSearch: async () => {
        const res = await api.post('/data-extractor/provider/test');
        return unwrap(res);
    },

    getSettings: async () => {
        const res = await api.get('/data-extractor/settings');
        return unwrap(res);
    },

    getProviderStatus: async () => {
        const res = await api.get('/data-extractor/provider-status');
        return unwrap(res);
    },

    updateSettings: async (payload) => {
        const res = await api.put('/data-extractor/settings', payload);
        return unwrap(res);
    },

    listSources: async () => {
        const res = await api.get('/data-extractor/sources');
        return unwrap(res);
    },

    listAdapters: async () => {
        const res = await api.get('/data-extractor/adapters');
        return unwrap(res);
    },

    testAdapter: async (adapterId) => {
        const res = await api.post(`/data-extractor/adapters/${adapterId}/test`);
        return unwrap(res);
    },

    runKeywordSearch: async (payload) => {
        const res = await api.post('/data-extractor/jobs/keyword-search', payload, { timeout: 180000 });
        return unwrap(res);
    },

    runManualUrl: async ({ urls, financialYear }) => {
        const res = await api.post('/data-extractor/jobs/manual-url', { urls, financialYear }, { timeout: 120000 });
        return unwrap(res);
    },

    uploadExcel: async ({ file, financialYear, columnMapping }) => {
        const form = new FormData();
        form.append('file', file);
        form.append('financialYear', financialYear);
        if (columnMapping) form.append('columnMapping', JSON.stringify(columnMapping));
        const res = await api.post('/data-extractor/import/excel', form, {
            timeout: 120000,
            transformRequest: [(data, headers) => {
                delete headers['Content-Type'];
                return data;
            }],
        });
        return unwrap(res);
    },

    listJobs: async (params = {}) => {
        const res = await api.get('/data-extractor/jobs', { params });
        return unwrap(res);
    },

    getJob: async (jobId) => {
        const res = await api.get(`/data-extractor/jobs/${jobId}`);
        return unwrap(res);
    },

    saveJobDrafts: async (jobId, payload) => {
        const res = await api.post(`/data-extractor/jobs/${jobId}/save-drafts`, payload);
        return unwrap(res);
    },

    rerunJob: async (jobId, payload = {}) => {
        const res = await api.post(`/data-extractor/jobs/${jobId}/rerun`, payload, { timeout: 180000 });
        return unwrap(res);
    },

    enhanceJobAi: async (jobId) => {
        const res = await api.post(`/data-extractor/jobs/${jobId}/enhance-ai`, {}, { timeout: 120000 });
        return unwrap(res);
    },

    listRecords: async (params = {}) => {
        const res = await api.get('/data-extractor/records', { params });
        return unwrap(res);
    },

    getRecord: async (id) => {
        const res = await api.get(`/data-extractor/records/${id}`);
        return unwrap(res);
    },

    getRecordDuplicates: async (id) => {
        const res = await api.get(`/data-extractor/records/${id}/duplicates`);
        return unwrap(res);
    },

    scheduleFollowup: async (id, payload) => {
        const res = await api.post(`/data-extractor/records/${id}/followup`, payload);
        return unwrap(res);
    },

    deleteDraft: async (id) => {
        const res = await api.delete(`/data-extractor/records/${id}`);
        return unwrap(res);
    },

    bulkAction: async ({ action, ids, reason, entityType }) => {
        const res = await api.post('/data-extractor/records/bulk', { action, ids, reason, entityType });
        return unwrap(res);
    },

    approveRecord: async (id) => {
        const res = await api.post(`/data-extractor/records/${id}/approve`);
        return unwrap(res);
    },

    rejectRecord: async (id, reason) => {
        const res = await api.post(`/data-extractor/records/${id}/reject`, { reason });
        return unwrap(res);
    },

    convertToLead: async (id) => {
        const res = await api.post(`/data-extractor/records/${id}/convert/lead`);
        return unwrap(res);
    },

    convertToCustomer: async (id) => {
        const res = await api.post(`/data-extractor/records/${id}/convert/customer`);
        return unwrap(res);
    },

    convertToSupplier: async (id) => {
        const res = await api.post(`/data-extractor/records/${id}/convert/supplier`);
        return unwrap(res);
    },

    exportRecords: async (params = {}) => {
        const res = await api.get('/data-extractor/records/export', {
            params,
            responseType: params.format === 'json' ? 'json' : 'blob',
        });
        if (params.format === 'json') return unwrap(res);
        return res.data;
    },

    // ---- Checkpoint 5B Simple Lead Search ----
    simpleLeadSearchStart: async (payload) => {
        const res = await api.post('/data-extractor/simple-lead-search/start', payload, { timeout: 120000 });
        return unwrap(res);
    },
    simpleLeadSearchPreviewQueries: async (payload) => {
        const res = await api.post('/data-extractor/simple-lead-search/preview-queries', payload, { timeout: 60000 });
        return unwrap(res);
    },
    simpleLeadSearchAgentStatus: async (params = {}) => {
        const res = await api.get('/data-extractor/simple-lead-search/agent-status', { params });
        return unwrap(res);
    },
    simpleLeadSearchListRuns: async (params = {}) => {
        const res = await api.get('/data-extractor/simple-lead-search/runs', { params });
        return unwrap(res);
    },
    simpleLeadSearchPersistExport: async (sessionId, body = {}) => {
        const res = await api.post(`/data-extractor/simple-lead-search/sessions/${sessionId}/export-artifacts`, body);
        return unwrap(res);
    },
    simpleLeadSearchExportDownloadUrl: async (sessionId, params = {}) => {
        const res = await api.get(`/data-extractor/simple-lead-search/sessions/${sessionId}/export-artifacts/download`, { params });
        return unwrap(res);
    },
    simpleLeadSearchSessionStatus: async (sessionId) => {
        const res = await api.get(`/data-extractor/simple-lead-search/sessions/${sessionId}`);
        return unwrap(res);
    },
    simpleLeadSearchSessionResults: async (sessionId, params = {}) => {
        const res = await api.get(`/data-extractor/simple-lead-search/sessions/${sessionId}/results`, { params });
        return unwrap(res);
    },
    simpleLeadSearchStop: async (sessionId) => {
        const res = await api.post(`/data-extractor/simple-lead-search/sessions/${sessionId}/stop`);
        return unwrap(res);
    },
    simpleLeadSearchContinueAfterManual: async (sessionId) => {
        const res = await api.post(`/data-extractor/simple-lead-search/sessions/${sessionId}/continue-after-manual`);
        return unwrap(res);
    },
    simpleLeadSearchComplete: async (sessionId) => {
        const res = await api.post(`/data-extractor/simple-lead-search/sessions/${sessionId}/complete`);
        return unwrap(res);
    },
    simpleLeadSearchExport: async (sessionId) => {
        const res = await api.get(`/data-extractor/simple-lead-search/sessions/${sessionId}/export`, {
            responseType: 'blob',
            timeout: 120000,
        });
        return res;
    },
    simpleLeadSearchCapturedData: async (sessionId, params = {}) => {
        const res = await api.get(`/data-extractor/simple-lead-search/sessions/${sessionId}/captured-data`, {
            params,
            timeout: 120000,
        });
        return unwrap(res);
    },
    simpleLeadSearchExportAllCurrent: async (sessionId) => {
        const res = await api.get(`/data-extractor/simple-lead-search/sessions/${sessionId}/export-all-current`, {
            responseType: 'blob',
            timeout: 180000,
        });
        return res;
    },
    simpleLeadSearchStopAndExport: async (sessionId) => {
        const res = await api.post(`/data-extractor/simple-lead-search/sessions/${sessionId}/stop-and-export`, null, {
            responseType: 'blob',
            timeout: 120000,
        });
        return res;
    },
    simpleLeadSearchOpenNextQuery: async (sessionId) => {
        const res = await api.post(`/data-extractor/simple-lead-search/sessions/${sessionId}/open-next-query`, {}, { timeout: 60000 });
        return unwrap(res);
    },
    simpleLeadSearchOpenNextPage: async (sessionId) => {
        const res = await api.post(`/data-extractor/simple-lead-search/sessions/${sessionId}/open-next-page`, {});
        return unwrap(res);
    },
    simpleLeadSearchSkipQuery: async (sessionId) => {
        const res = await api.post(`/data-extractor/simple-lead-search/sessions/${sessionId}/skip-query`, {});
        return unwrap(res);
    },
    simpleLeadSearchCompleteQuery: async (sessionId) => {
        const res = await api.post(`/data-extractor/simple-lead-search/sessions/${sessionId}/complete-query`, {});
        return unwrap(res);
    },
    simpleLeadSearchCampaignProgress: async (sessionId) => {
        const res = await api.get(`/data-extractor/simple-lead-search/sessions/${sessionId}/campaign-progress`);
        return unwrap(res);
    },
    simpleLeadSearchAutoCollectionStart: async (sessionId, body = {}) => {
        const res = await api.post(`/data-extractor/simple-lead-search/sessions/${sessionId}/auto-collection/start`, body, { timeout: 60000 });
        return unwrap(res);
    },
    simpleLeadSearchAutoCollectionPause: async (sessionId) => {
        const res = await api.post(`/data-extractor/simple-lead-search/sessions/${sessionId}/auto-collection/pause`, {});
        return unwrap(res);
    },
    simpleLeadSearchAutoCollectionResume: async (sessionId) => {
        const res = await api.post(`/data-extractor/simple-lead-search/sessions/${sessionId}/auto-collection/resume`, {});
        return unwrap(res);
    },
    simpleLeadSearchAutoCollectionStop: async (sessionId, body = {}) => {
        const res = await api.post(`/data-extractor/simple-lead-search/sessions/${sessionId}/auto-collection/stop`, body);
        return unwrap(res);
    },
    simpleLeadSearchAutoCollectionContinue: async (sessionId) => {
        const res = await api.post(`/data-extractor/simple-lead-search/sessions/${sessionId}/auto-collection/continue`, {});
        return unwrap(res);
    },
    simpleLeadSearchAutoCollectionContinueBatch: async (sessionId) => {
        const res = await api.post(`/data-extractor/simple-lead-search/sessions/${sessionId}/auto-collection/continue-batch`, {});
        return unwrap(res);
    },
    simpleLeadSearchAutoCollectionResumeCheckpoint: async (sessionId, body = {}) => {
        const res = await api.post(`/data-extractor/simple-lead-search/sessions/${sessionId}/auto-collection/resume-checkpoint`, body);
        return unwrap(res);
    },
    simpleLeadSearchAutoCollectionNextQuery: async (sessionId) => {
        const res = await api.post(`/data-extractor/simple-lead-search/sessions/${sessionId}/auto-collection/next-query`, {}, { timeout: 60000 });
        return unwrap(res);
    },
    simpleLeadSearchAutoCollectionTick: async (sessionId) => {
        const res = await api.post(`/data-extractor/simple-lead-search/sessions/${sessionId}/auto-collection/tick`, {});
        return unwrap(res);
    },
    simpleLeadSearchAutoProcessingEnable: async (sessionId, payload = {}) => {
        const res = await api.post(`/data-extractor/simple-lead-search/sessions/${sessionId}/auto-processing/enable`, payload);
        return unwrap(res);
    },
    simpleLeadSearchAutoProcessingPause: async (sessionId) => {
        const res = await api.post(`/data-extractor/simple-lead-search/sessions/${sessionId}/auto-processing/pause`, {});
        return unwrap(res);
    },
    simpleLeadSearchAutoProcessingResume: async (sessionId) => {
        const res = await api.post(`/data-extractor/simple-lead-search/sessions/${sessionId}/auto-processing/resume`, {});
        return unwrap(res);
    },
    simpleLeadSearchAutoProcessingStop: async (sessionId, payload = {}) => {
        const res = await api.post(`/data-extractor/simple-lead-search/sessions/${sessionId}/auto-processing/stop`, payload);
        return unwrap(res);
    },
    simpleLeadSearchAutoProcessingStatus: async (sessionId) => {
        const res = await api.get(`/data-extractor/simple-lead-search/sessions/${sessionId}/auto-processing`);
        return unwrap(res);
    },
    simpleLeadSearchAutoProcessingTick: async (sessionId) => {
        const res = await api.post(`/data-extractor/simple-lead-search/sessions/${sessionId}/auto-processing/tick`, {});
        return unwrap(res);
    },
    requestAssistedCapture: async ({ campaignId, queryId, sessionId, idempotencyKey }) => {
        const res = await api.post(
            `/data-extractor/search-campaigns/${campaignId}/queries/${queryId}/assisted-captures/${sessionId}/request-capture`,
            { idempotencyKey },
        );
        return unwrap(res);
    },
    completeAssistedCapture: async ({ campaignId, queryId, sessionId }) => {
        const res = await api.post(
            `/data-extractor/search-campaigns/${campaignId}/queries/${queryId}/assisted-captures/${sessionId}/complete`,
        );
        return unwrap(res);
    },
    cancelAssistedCapture: async ({ campaignId, queryId, sessionId }) => {
        const res = await api.post(
            `/data-extractor/search-campaigns/${campaignId}/queries/${queryId}/assisted-captures/${sessionId}/cancel`,
        );
        return unwrap(res);
    },

    // ---- Checkpoint 6A enrichment ----
    simpleLeadSearchEnrichmentStart: async (sessionId, payload = {}) => {
        const res = await api.post(`/data-extractor/simple-lead-search/sessions/${sessionId}/enrichment/start`, payload, { timeout: 60000 });
        return unwrap(res);
    },
    simpleLeadSearchEnrichmentStop: async (sessionId, payload = {}) => {
        const res = await api.post(`/data-extractor/simple-lead-search/sessions/${sessionId}/enrichment/stop`, payload);
        return unwrap(res);
    },
    simpleLeadSearchEnrichmentJob: async (sessionId, params = {}) => {
        const res = await api.get(`/data-extractor/simple-lead-search/sessions/${sessionId}/enrichment/job`, { params });
        return unwrap(res);
    },
    simpleLeadSearchEnrichmentList: async (sessionId) => {
        const res = await api.get(`/data-extractor/simple-lead-search/sessions/${sessionId}/enrichment`);
        return unwrap(res);
    },
    simpleLeadSearchEnrichmentDetail: async (sessionId, enrichmentId) => {
        const res = await api.get(`/data-extractor/simple-lead-search/sessions/${sessionId}/enrichment/${enrichmentId}`);
        return unwrap(res);
    },
    simpleLeadSearchEnrichmentReview: async (sessionId, enrichmentId, body) => {
        const res = await api.patch(`/data-extractor/simple-lead-search/sessions/${sessionId}/enrichment/${enrichmentId}/review`, body);
        return unwrap(res);
    },
    simpleLeadSearchEnrichmentExport: async (sessionId) => {
        const res = await api.get(`/data-extractor/simple-lead-search/sessions/${sessionId}/enrichment/export`, {
            responseType: 'blob',
            timeout: 120000,
        });
        return res;
    },

    // ---- Checkpoint 7 qualification ----
    simpleLeadSearchQualificationStart: async (sessionId, payload = {}) => {
        const res = await api.post(`/data-extractor/simple-lead-search/sessions/${sessionId}/qualification/start`, payload, { timeout: 60000 });
        return unwrap(res);
    },
    simpleLeadSearchQualificationStop: async (sessionId, payload = {}) => {
        const res = await api.post(`/data-extractor/simple-lead-search/sessions/${sessionId}/qualification/stop`, payload);
        return unwrap(res);
    },
    simpleLeadSearchQualificationJob: async (sessionId, params = {}) => {
        const res = await api.get(`/data-extractor/simple-lead-search/sessions/${sessionId}/qualification/job`, { params });
        return unwrap(res);
    },
    simpleLeadSearchQualificationList: async (sessionId) => {
        const res = await api.get(`/data-extractor/simple-lead-search/sessions/${sessionId}/qualification`);
        return unwrap(res);
    },
    simpleLeadSearchQualificationDetail: async (sessionId, qualificationId) => {
        const res = await api.get(`/data-extractor/simple-lead-search/sessions/${sessionId}/qualification/${qualificationId}`);
        return unwrap(res);
    },
    simpleLeadSearchQualificationReview: async (sessionId, qualificationId, body) => {
        const res = await api.patch(`/data-extractor/simple-lead-search/sessions/${sessionId}/qualification/${qualificationId}/review`, body);
        return unwrap(res);
    },
    simpleLeadSearchQualificationExport: async (sessionId) => {
        const res = await api.get(`/data-extractor/simple-lead-search/sessions/${sessionId}/qualification/export`, {
            responseType: 'blob',
            timeout: 120000,
        });
        return res;
    },
    simpleLeadSearchLocationRecheckStart: async (sessionId, payload = {}) => {
        const res = await api.post(`/data-extractor/simple-lead-search/sessions/${sessionId}/qualification/recheck-location`, payload, { timeout: 60000 });
        return unwrap(res);
    },
    simpleLeadSearchLocationRecheckStatus: async (sessionId, params = {}) => {
        const res = await api.get(`/data-extractor/simple-lead-search/sessions/${sessionId}/qualification/recheck-location`, { params });
        return unwrap(res);
    },
    simpleLeadSearchLocationRecheckStop: async (sessionId, payload = {}) => {
        const res = await api.post(`/data-extractor/simple-lead-search/sessions/${sessionId}/qualification/recheck-location/stop`, payload);
        return unwrap(res);
    },

    // ---- Checkpoint 8 genuineness verification ----
    simpleLeadSearchGenuinenessStart: async (sessionId, payload = {}) => {
        const res = await api.post(`/data-extractor/simple-lead-search/sessions/${sessionId}/genuineness/start`, payload, { timeout: 60000 });
        return unwrap(res);
    },
    simpleLeadSearchGenuinenessStop: async (sessionId, payload = {}) => {
        const res = await api.post(`/data-extractor/simple-lead-search/sessions/${sessionId}/genuineness/stop`, payload);
        return unwrap(res);
    },
    simpleLeadSearchGenuinenessJob: async (sessionId, params = {}) => {
        const res = await api.get(`/data-extractor/simple-lead-search/sessions/${sessionId}/genuineness/job`, { params });
        return unwrap(res);
    },
    simpleLeadSearchGenuinenessList: async (sessionId) => {
        const res = await api.get(`/data-extractor/simple-lead-search/sessions/${sessionId}/genuineness`);
        return unwrap(res);
    },
    simpleLeadSearchGenuinenessDetail: async (sessionId, genuinenessId) => {
        const res = await api.get(`/data-extractor/simple-lead-search/sessions/${sessionId}/genuineness/${genuinenessId}`);
        return unwrap(res);
    },
    simpleLeadSearchGenuinenessReview: async (sessionId, genuinenessId, body) => {
        const res = await api.patch(`/data-extractor/simple-lead-search/sessions/${sessionId}/genuineness/${genuinenessId}/review`, body);
        return unwrap(res);
    },
    simpleLeadSearchGenuinenessExport: async (sessionId) => {
        const res = await api.get(`/data-extractor/simple-lead-search/sessions/${sessionId}/genuineness/export`, {
            responseType: 'blob',
            timeout: 120000,
        });
        return res;
    },

    facebookSourceStatus: async () => unwrap(await api.get('/data-extractor/social/facebook/status')),
    instagramSourceStatus: async () => unwrap(await api.get('/data-extractor/social/instagram/status')),
    facebookConnect: async () => unwrap(await api.post('/data-extractor/social/facebook/connect', {}, { timeout: 180000 })),
    instagramConnect: async () => unwrap(await api.post('/data-extractor/social/instagram/connect', {}, { timeout: 180000 })),
    facebookDisconnect: async () => unwrap(await api.post('/data-extractor/social/facebook/disconnect')),
    instagramDisconnect: async () => unwrap(await api.post('/data-extractor/social/instagram/disconnect')),
    startFacebookExtraction: async (payload) => unwrap(await api.post('/data-extractor/social/facebook/extract', payload, { timeout: 180000 })),
    startInstagramExtraction: async (payload) => unwrap(await api.post('/data-extractor/social/instagram/extract', payload, { timeout: 180000 })),
    linkedinSourceStatus: async () => unwrap(await api.get('/data-extractor/social/linkedin/status')),
    xSourceStatus: async () => unwrap(await api.get('/data-extractor/social/x/status')),
    linkedinConnect: async () => unwrap(await api.post('/data-extractor/social/linkedin/connect', {}, { timeout: 180000 })),
    xConnect: async () => unwrap(await api.post('/data-extractor/social/x/connect', {}, { timeout: 180000 })),
    linkedinDisconnect: async () => unwrap(await api.post('/data-extractor/social/linkedin/disconnect')),
    xDisconnect: async () => unwrap(await api.post('/data-extractor/social/x/disconnect')),
    startLinkedInExtraction: async (payload) => unwrap(await api.post('/data-extractor/social/linkedin/extract', payload, { timeout: 180000 })),
    startXExtraction: async (payload) => unwrap(await api.post('/data-extractor/social/x/extract', payload, { timeout: 180000 })),
};
