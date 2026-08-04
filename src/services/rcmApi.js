import { apiClient } from '@/lib/apiClient';

/** Phase 2A evaluate + 2B-A simulate + 2B-B liability + 2B-C tax payment. */

export const rcmApi = {
    evaluate: async (payload, { includeDraftRules = true } = {}) => {
        const { data } = await apiClient.post('/rcm/evaluate', {
            ...payload,
            includeDraftRules,
        });
        return data?.data || data;
    },

    simulateAccounting: async (payload) => {
        const { data } = await apiClient.post('/rcm/simulate-accounting', payload);
        return data?.data || data;
    },

    ledgerDesign: async () => {
        const { data } = await apiClient.get('/rcm/ledger-design');
        return data?.data || data;
    },

    confirm: async (payload) => {
        const { data } = await apiClient.post('/rcm/confirm', payload);
        return data?.data || data;
    },

    postingEligibility: async (payload) => {
        const { data } = await apiClient.post('/rcm/posting-eligibility', payload);
        return data?.data || data;
    },

    ensureLedgers: async (payload) => {
        const { data } = await apiClient.post('/rcm/ensure-ledgers', payload);
        return data?.data || data;
    },

    postLiability: async (payload) => {
        const { data } = await apiClient.post('/rcm/post-liability', payload);
        return data?.data || data;
    },

    listPostings: async (params = {}) => {
        const { data } = await apiClient.get('/rcm/postings', { params });
        return data?.data || [];
    },

    getPosting: async (id) => {
        const { data } = await apiClient.get(`/rcm/postings/${id}`);
        return data?.data || data;
    },

    reversePosting: async (id, payload) => {
        const { data } = await apiClient.post(`/rcm/postings/${id}/reverse`, payload);
        return data?.data || data;
    },

    recordPayment: async (liabilityPostingId, payload) => {
        const { data } = await apiClient.post(`/rcm/postings/${liabilityPostingId}/record-payment`, payload);
        return data?.data || data;
    },

    listPayments: async (liabilityPostingId) => {
        const { data } = await apiClient.get(`/rcm/postings/${liabilityPostingId}/payments`);
        return data?.data || data;
    },

    reversePayment: async (paymentVoucherId, payload) => {
        const { data } = await apiClient.post(`/rcm/payments/${paymentVoucherId}/reverse`, payload);
        return data?.data || data;
    },

    getItcReview: async (liabilityPostingId) => {
        const { data } = await apiClient.get(`/rcm/postings/${liabilityPostingId}/itc-review`);
        return data?.data || data;
    },

    saveItcReview: async (liabilityPostingId, payload) => {
        const { data } = await apiClient.post(`/rcm/postings/${liabilityPostingId}/itc-review`, payload);
        return data?.data || data;
    },

    previewItcRelease: async (liabilityPostingId, payload = {}) => {
        const { data } = await apiClient.post(`/rcm/postings/${liabilityPostingId}/itc-release-preview`, payload);
        return data?.data || data;
    },

    releaseItc: async (liabilityPostingId, payload) => {
        const { data } = await apiClient.post(`/rcm/postings/${liabilityPostingId}/release-itc`, payload);
        return data?.data || data;
    },

    listItcReleases: async (liabilityPostingId) => {
        const { data } = await apiClient.get(`/rcm/postings/${liabilityPostingId}/itc-releases`);
        return data?.data || data;
    },

    reverseItcRelease: async (releaseVoucherId, payload) => {
        const { data } = await apiClient.post(`/rcm/itc-releases/${releaseVoucherId}/reverse`, payload);
        return data?.data || data;
    },

    reclassifyIneligible: async (liabilityPostingId, payload) => {
        const { data } = await apiClient.post(`/rcm/postings/${liabilityPostingId}/reclassify-ineligible`, payload);
        return data?.data || data;
    },

    getGstr3bReconciliation: async (params = {}) => {
        const { data } = await apiClient.get('/rcm/gstr3b-reconciliation', { params });
        return data?.data || data;
    },

    exportGstr3bReconciliation: async (params = {}) => {
        const { data } = await apiClient.get('/rcm/gstr3b-reconciliation/export', { params });
        return data?.data || data;
    },

    prepareReturnMapping: async (payload) => {
        const { data } = await apiClient.post('/rcm/gstr3b-reconciliation/prepare', payload);
        return data?.data || data;
    },

    reviewReturnMapping: async (payload) => {
        const { data } = await apiClient.post('/rcm/gstr3b-reconciliation/review', payload);
        return data?.data || data;
    },

    approveReturnMapping: async (payload) => {
        const { data } = await apiClient.post('/rcm/gstr3b-reconciliation/approve', payload);
        return data?.data || data;
    },

    includeInGstr3b: async (payload) => {
        const { data } = await apiClient.post('/rcm/gstr3b-reconciliation/include', payload);
        return data?.data || data;
    },

    lockGstr3bPeriod: async (payload) => {
        const { data } = await apiClient.post('/rcm/gstr3b-reconciliation/lock', payload);
        return data?.data || data;
    },

    createGstr3bAmendment: async (payload) => {
        const { data } = await apiClient.post('/rcm/gstr3b-reconciliation/amendment', payload);
        return data?.data || data;
    },

    listRules: async (params = {}) => {
        const { data } = await apiClient.get('/rcm/rules', { params });
        return data?.data || [];
    },
};
