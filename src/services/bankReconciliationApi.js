import { apiClient } from '@/lib/apiClient';

export const uploadBankStatement = (formData) =>
    apiClient.post('/bank-reconciliation/imports', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
    }).then((r) => r.data.data);

export const listBankImports = (params) =>
    apiClient.get('/bank-reconciliation/imports', { params }).then((r) => r.data.data);

export const deleteBankImport = (importId) =>
    apiClient.delete(`/bank-reconciliation/imports/${importId}`).then((r) => r.data.data);

export const getBankReconWorkspace = (params) =>
    apiClient.get('/bank-reconciliation/workspace', { params }).then((r) => r.data.data);

export const runBankMatching = (body) =>
    apiClient.post('/bank-reconciliation/run-matching', body).then((r) => r.data.data);

export const approveBankMatches = (body) =>
    apiClient.post('/bank-reconciliation/approve', body).then((r) => r.data.data);

export const approveBankCombo = (body) =>
    apiClient.post('/bank-reconciliation/approve-combo', body).then((r) => r.data.data);

export const manualBankLink = (body) =>
    apiClient.post('/bank-reconciliation/manual-link', body).then((r) => r.data.data);

export const rejectBankMatch = (body) =>
    apiClient.post('/bank-reconciliation/reject', body).then((r) => r.data.data);

export const ignoreBankLine = (body) =>
    apiClient.post('/bank-reconciliation/ignore', body).then((r) => r.data.data);

export const markBankCharge = (body) =>
    apiClient.post('/bank-reconciliation/mark-bank-charge', body).then((r) => r.data.data);

export const undoBankReconciliation = (id, reason) =>
    apiClient.post(`/bank-reconciliation/${id}/undo`, { reason }).then((r) => r.data.data);

export const getBankReconSummary = (params) =>
    apiClient.get('/bank-reconciliation/reports/summary', { params }).then((r) => r.data.data);

export const getBankReconStatement = (params) =>
    apiClient.get('/bank-reconciliation/reports/reconciliation-statement', { params }).then((r) => r.data.data);

export const listBankReconciled = (params) =>
    apiClient.get('/bank-reconciliation/reconciled', { params }).then((r) => r.data.data);
