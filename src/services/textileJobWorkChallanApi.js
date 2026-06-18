import api from './api';
import { getTextileJobWorkProcessConfig } from '@/utils/textileJobWorkProcessConfig';

// Issue/return challans update stock + ledger — allow extra time on localhost.
const CHALLAN_WRITE_TIMEOUT_MS = 120000;

function baseFor(processType = 'Dyeing') {
    return getTextileJobWorkProcessConfig(processType).apiBase;
}

export const getTextileJobWorkChallanMeta = async (processType = 'Dyeing') => {
    const res = await api.get(`${baseFor(processType)}/meta`);
    return res.data.data;
};

export const getTextileJobWorkChallanEligibility = async (companyId, processType = 'Dyeing') => {
    const res = await api.get(`${baseFor(processType)}/eligibility`, { params: companyId ? { companyId } : {} });
    return res.data.data;
};

export const listTextileJobWorkChallans = async (processType = 'Dyeing', params = {}) => {
    const res = await api.get(baseFor(processType), { params });
    return res.data.data || [];
};

export const getTextileJobWorkChallan = async (processType, id) => {
    const res = await api.get(`${baseFor(processType)}/${id}`);
    return res.data.data;
};

export const lookupTextileJobWorkChallan = async (processType, barcode) => {
    const res = await api.get(`${baseFor(processType)}/lookup`, { params: { barcode } });
    return res.data.data;
};

export const createTextileJobWorkChallan = async (processType, payload) => {
    const res = await api.post(baseFor(processType), { ...payload, processType }, { timeout: CHALLAN_WRITE_TIMEOUT_MS });
    return res.data.data;
};

export const recordTextileJobWorkReturn = async (processType, challanId, payload) => {
    const res = await api.post(`${baseFor(processType)}/${challanId}/returns`, payload, { timeout: CHALLAN_WRITE_TIMEOUT_MS });
    return res.data.data;
};

export const getTextileJobWorkChallanBarcode = async (processType, id) => {
    const res = await api.get(`${baseFor(processType)}/${id}/barcode`);
    return res.data.data;
};

export const getStockWithVendorReport = async (processType = 'Dyeing', params = {}) => {
    const stockPath = processType === 'Dyeing' ? '/reports/stock-with-dyers' : '/reports/stock-with-vendor';
    const res = await api.get(`${baseFor(processType)}${stockPath}`, { params });
    return res.data.data || [];
};

export const getPendingJobWorkChallansReport = async (processType = 'Dyeing', params = {}) => {
    const res = await api.get(`${baseFor(processType)}/reports/pending`, { params });
    return res.data.data || [];
};

export const getJobWorkReturnRegisterReport = async (processType = 'Dyeing', params = {}) => {
    const res = await api.get(`${baseFor(processType)}/reports/return-register`, { params });
    return res.data.data || [];
};

export const getVendorLedgerReport = async (processType = 'Dyeing', params = {}) => {
    const ledgerPath = processType === 'Dyeing' ? '/reports/dyer-ledger' : '/reports/vendor-ledger';
    const res = await api.get(`${baseFor(processType)}${ledgerPath}`, { params });
    return res.data.data || [];
};

export const getJobWorkLossReport = async (processType = 'Dyeing', params = {}) => {
    const res = await api.get(`${baseFor(processType)}/reports/loss`, { params });
    return res.data.data || [];
};
