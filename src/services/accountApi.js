import { apiClient } from '../lib/apiClient';

// ── Tally-Style Masters ──────────────────────────────────────────────────

export const getAccountGroups = (params = {}) =>
    apiClient.get('/accounts/masters/groups', { params }).then(r => r.data.data);

export const getAccountGroupById = (id) =>
    apiClient.get(`/accounts/masters/groups/${id}`).then(r => r.data.data);

export const createAccountGroup = (data) =>
    apiClient.post('/accounts/masters/groups', data).then(r => r.data.data);

export const updateAccountGroup = (id, data) =>
    apiClient.patch(`/accounts/masters/groups/${id}`, data).then(r => r.data.data);

export const deleteAccountGroup = (id) =>
    apiClient.delete(`/accounts/masters/groups/${id}`).then(r => r.data);

export const initializeAccounts = () =>
    apiClient.post('/accounts/masters/initialize').then(r => r.data.data);

export const getLedgers = (params = {}) =>
    apiClient.get('/accounts/masters/ledgers', { params }).then(r => r.data.data);

export const createLedger = (data) =>
    apiClient.post('/accounts/masters/ledgers', data).then(r => r.data.data);

export const updateLedger = (id, data) =>
    apiClient.patch(`/accounts/masters/ledgers/${id}`, data).then(r => r.data.data);

export const deleteLedger = (id) =>
    apiClient.delete(`/accounts/masters/ledgers/${id}`).then(r => r.data);

// ── Masters (Legacy/Other) ──────────────────────────────────────────────────

export const getCashBankAccounts = (params = {}) =>
    apiClient.get('/cash-bank-accounts', { params }).then(r => r.data.data);

export const createCashBankAccount = (data) =>
    apiClient.post('/cash-bank-accounts', data).then(r => r.data.data);

export const updateCashBankAccount = (id, data) =>
    apiClient.put(`/cash-bank-accounts/${id}`, data).then(r => r.data.data);

export const getVoucherTypes = (params = {}) =>
    apiClient.get('/voucher-types', { params }).then(r => r.data.data);

export const createVoucherType = (data) =>
    apiClient.post('/voucher-types', data).then(r => r.data.data);

// ── Vouchers ─────────────────────────────────────────────────────────────────

export const getVouchers = (params = {}) =>
    apiClient.get('/vouchers', { params }).then(r => r.data.data);

export const getVoucher = (id) =>
    apiClient.get(`/vouchers/${id}`).then(r => r.data.data);

export const createVoucher = (data) =>
    apiClient.post('/vouchers', data).then(r => r.data.data);

export const cancelVoucher = (id) =>
    apiClient.post(`/vouchers/${id}/cancel`).then(r => r.data);

// ── Ledgers & Reports ────────────────────────────────────────────────────────

export const getLedgerReport = (params = {}) =>
    apiClient.get('/ledgers/report', { params }).then(r => r.data.data);

export const getLedgerStatement = (ledgerId, params = {}) =>
    apiClient.get('/ledgers/report', { params: { ...params, ledgerId } }).then(r => r.data.data);

export const getCashBankBalances = () =>
    apiClient.get('/ledgers/balances').then(r => r.data.data);

export const getOutstandingBills = (ledgerId) =>
    apiClient.get(`/ledgers/${ledgerId}/outstanding`).then(r => r.data.data);

export const getOutstandingSummary = (type) =>
    apiClient.get('/ledgers/outstanding-summary', { params: { type } }).then(r => r.data.data);

// ── Accounting Reports (Tally Style) ────────────────────────────────────────

export const getSalesRegister = (params = {}) =>
    apiClient.get('/accounts/reports/sales-register', { params }).then(r => r.data.data);

export const getPurchaseRegister = (params = {}) =>
    apiClient.get('/accounts/reports/purchase-register', { params }).then(r => r.data.data);

export const getDayBook = (params = {}) =>
    apiClient.get('/accounts/reports/day-book', { params }).then(r => r.data.data);

export const getCashBankBook = (params = {}) =>
    apiClient.get('/accounts/reports/cash-bank-book', { params }).then(r => r.data.data);

const accountApi = {
    getAccountGroups,
    createAccountGroup,
    initializeAccounts,
    getLedgers,
    createLedger,
    getCashBankAccounts,
    createCashBankAccount,
    updateCashBankAccount,
    getVoucherTypes,
    createVoucherType,
    getVouchers,
    getVoucher,
    createVoucher,
    cancelVoucher,
    getLedgerReport,
    getLedgerStatement,
    getCashBankBalances,
    getOutstandingBills,
    getOutstandingSummary,
    getSalesRegister,
    getPurchaseRegister,
    getDayBook,
    getCashBankBook
};

export default accountApi;
