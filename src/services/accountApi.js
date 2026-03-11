import { apiClient } from '../lib/apiClient';

// ── Masters ──────────────────────────────────────────────────────────────────

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

export const getLedgers = (params = {}) =>
    apiClient.get('/ledgers', { params }).then(r => r.data.data);

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

export default {
    getCashBankAccounts, createCashBankAccount, updateCashBankAccount,
    getVoucherTypes, createVoucherType,
    getVouchers, getVoucher, createVoucher, cancelVoucher,
    getLedgers, getLedgerReport, getLedgerStatement, getCashBankBalances,
    getOutstandingBills, getOutstandingSummary
};
