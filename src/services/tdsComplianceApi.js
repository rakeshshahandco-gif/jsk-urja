import api from './api';
import axios from 'axios';
import { env } from '@/config/env';
import { getAuthData } from '@/utils/auth';

const unwrap = (res) => res.data?.data ?? res.data;

export const tdsComplianceApi = {
    listMasterSections: async () => {
        const res = await api.get('/tds/master/sections');
        return unwrap(res);
    },
    updateMasterSection: async (sectionCode, body) => {
        const enc = encodeURIComponent(String(sectionCode || '').trim());
        const res = await api.patch(`/tds/master/sections/${enc}`, body);
        return unwrap(res);
    },
    getMasterSection: async (sectionCode) => {
        const enc = encodeURIComponent(String(sectionCode || '').trim());
        const res = await api.get(`/tds/master/sections/${enc}`);
        return unwrap(res);
    },
    getPayableLedgerSuggestion: async (sectionCode) => {
        const enc = encodeURIComponent(String(sectionCode || '').trim());
        const res = await api.get(`/tds/master/sections/${enc}/payable-suggestion`);
        return unwrap(res);
    },
    createSectionPayableLedger: async (sectionCode, body) => {
        const enc = encodeURIComponent(String(sectionCode || '').trim());
        const res = await api.post(`/tds/master/sections/${enc}/payable-ledger`, body);
        return unwrap(res);
    },
    getDashboard: async (financialYear) => {
        const res = await api.get('/tds/dashboard', { params: { financialYear } });
        return unwrap(res);
    },
    listDeductionRegister: async (financialYear) => {
        const res = await api.get('/tds/deduction-register', { params: { financialYear } });
        return unwrap(res);
    },
    listDeductions: async (params = {}) => {
        const res = await api.get('/tds/deductions', { params });
        return unwrap(res);
    },
    createDeduction: async (body) => {
        const res = await api.post('/tds/deductions', body);
        return unwrap(res);
    },
    createDeductionFromPayment: async (body) => {
        const res = await api.post('/tds/deductions/from-payment', body);
        return unwrap(res);
    },
    updateDeduction: async (id, body) => {
        const res = await api.patch(`/tds/deductions/${id}`, body);
        return unwrap(res);
    },
    deleteDeduction: async (id) => {
        const res = await api.delete(`/tds/deductions/${id}`);
        return unwrap(res);
    },
    listChallans: async (params = {}) => {
        const res = await api.get('/tds/challans', { params });
        return unwrap(res);
    },
    listChallanRegister: async (params = {}) => {
        const res = await api.get('/tds/challans/register', { params });
        return unwrap(res);
    },
    listUnpaidTdsForChallan: async (params = {}) => {
        const res = await api.get('/tds/challans/unpaid', { params });
        return unwrap(res);
    },
    getChallan: async (id) => {
        const res = await api.get(`/tds/challans/${id}`);
        return unwrap(res);
    },
    getChallanEPayUrl: async () => {
        const res = await api.get('/tds/challans/e-pay-url');
        return unwrap(res);
    },
    createChallan: async (body) => {
        const res = await api.post('/tds/challans', body);
        return unwrap(res);
    },
    markChallanPaid: async (challanId, body) => {
        const res = await api.post(`/tds/challans/${challanId}/mark-paid`, body);
        return unwrap(res);
    },
    downloadChallanPdf: async (challanId, variant = 'official') => {
        const authData = getAuthData();
        const base = env.API_URL.endsWith('/') ? env.API_URL.slice(0, -1) : env.API_URL;
        const headers = { Authorization: `Bearer ${authData?.token || ''}` };
        try {
            const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('jsk_selected_company') : null;
            if (raw) {
                const co = JSON.parse(raw);
                if (co?._id) headers['X-Company-Id'] = co._id;
            }
        } catch {
            /* ignore */
        }
        const res = await axios.get(`${base}/tds/challans/${challanId}/pdf`, {
            headers,
            params: { variant },
            responseType: 'blob',
        });
        return res.data;
    },
    previewItns281: async (body) => {
        const res = await api.post('/tds/challans/itns281/preview', body);
        return unwrap(res);
    },
    downloadItns281Pdf: async (body) => {
        const authData = getAuthData();
        const base = env.API_URL.endsWith('/') ? env.API_URL.slice(0, -1) : env.API_URL;
        const headers = {
            Authorization: `Bearer ${authData?.token || ''}`,
            'Content-Type': 'application/json',
        };
        try {
            const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('jsk_selected_company') : null;
            if (raw) {
                const co = JSON.parse(raw);
                if (co?._id) headers['X-Company-Id'] = co._id;
            }
        } catch {
            /* ignore */
        }
        const res = await axios.post(`${base}/tds/challans/itns281/pdf`, body, {
            headers,
            responseType: 'blob',
        });
        return res.data;
    },
    linkChallan: async (challanId, deductionIds) => {
        const res = await api.post(`/tds/challans/${challanId}/link`, { deductionIds });
        return unwrap(res);
    },
    previewReturn: async (body) => {
        const res = await api.post('/tds/returns/preview', body);
        return unwrap(res);
    },
    exportReturn: async (body) => {
        const res = await api.post('/tds/returns/export', body);
        return unwrap(res);
    },
    listReturns: async () => {
        const res = await api.get('/tds/returns');
        return unwrap(res);
    },
    issueForm16a: async (body) => {
        const res = await api.post('/tds/form16a/issue', body);
        return unwrap(res);
    },
    listForm16a: async () => {
        const res = await api.get('/tds/form16a');
        return unwrap(res);
    },
    downloadForm16aPdf: async (certificateId) => {
        const authData = getAuthData();
        const base = env.API_URL.endsWith('/') ? env.API_URL.slice(0, -1) : env.API_URL;
        const headers = {
            Authorization: `Bearer ${authData?.token || ''}`,
        };
        try {
            const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('jsk_selected_company') : null;
            if (raw) {
                const co = JSON.parse(raw);
                if (co?._id) headers['X-Company-Id'] = co._id;
            }
        } catch {
            /* ignore */
        }
        const res = await axios.get(`${base}/tds/form16a/${certificateId}/pdf`, {
            headers,
            responseType: 'blob',
        });
        return res.data;
    },
    getSettings: async () => {
        const res = await api.get('/tds/settings');
        return unwrap(res);
    },
    updateSettings: async (body) => {
        const res = await api.patch('/tds/settings', body);
        return unwrap(res);
    },
    getThresholdTrackingReport: async (financialYear) => {
        const res = await api.get('/tds/reports/threshold-tracking', { params: { financialYear } });
        return unwrap(res);
    },
    getVendorSummaryReport: async (financialYear) => {
        const res = await api.get('/tds/reports/vendor-summary', { params: { financialYear } });
        return unwrap(res);
    },
    getPendingDeductionsReport: async (financialYear) => {
        const res = await api.get('/tds/reports/pending-deductions', { params: { financialYear } });
        return unwrap(res);
    },
    getNearLimitReport: async (financialYear) => {
        const res = await api.get('/tds/reports/near-limit', { params: { financialYear } });
        return unwrap(res);
    },
    getDeductedNotPaidReport: async (financialYear) => {
        const res = await api.get('/tds/reports/deducted-not-paid', { params: { financialYear } });
        return unwrap(res);
    },
    getExceptionReport: async (financialYear) => {
        const res = await api.get('/tds/reports/exceptions', { params: { financialYear } });
        return unwrap(res);
    },
    getPayableReport: async (financialYear) => {
        const res = await api.get('/tds/reports/payable', { params: { financialYear } });
        return unwrap(res);
    },
    getSectionSummaryReport: async (financialYear) => {
        const res = await api.get('/tds/reports/section-summary', { params: { financialYear } });
        return unwrap(res);
    },
    getDeducteeSummaryReport: async (financialYear) => {
        const res = await api.get('/tds/reports/deductee-summary', { params: { financialYear } });
        return unwrap(res);
    },
    getPanMissingReport: async (financialYear) => {
        const res = await api.get('/tds/reports/pan-missing', { params: { financialYear } });
        return unwrap(res);
    },
    getMonthlyLiabilityReport: async (financialYear) => {
        const res = await api.get('/tds/reports/monthly-liability', { params: { financialYear } });
        return unwrap(res);
    },
    getQuarterSummaryReport: async (financialYear) => {
        const res = await api.get('/tds/reports/quarter-summary', { params: { financialYear } });
        return unwrap(res);
    },
    getLowerDeductionReport: async () => {
        const res = await api.get('/tds/reports/lower-deduction');
        return unwrap(res);
    },
    getChallanReconciliationReport: async (financialYear) => {
        const res = await api.get('/tds/reports/challan-reconciliation', { params: { financialYear } });
        return unwrap(res);
    },
    getAuditLogs: async (params = {}) => {
        const res = await api.get('/tds/audit-logs', { params });
        return unwrap(res);
    },
    previewExpenseVoucher: async (body) => {
        const res = await api.post('/tds/expense-voucher/preview', body, { timeout: 45000 });
        return unwrap(res);
    },
    previewPurchaseInvoiceBill: async (body) => {
        const res = await api.post('/tds/purchase-invoice/preview', body);
        return unwrap(res);
    },
};
