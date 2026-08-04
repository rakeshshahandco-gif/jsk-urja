import api from './api';

export const getCreditDebitNotes = async (params) => {
  const response = await api.get('/credit-debit-notes', { params });
  return response.data.data;
};

export const getCreditDebitNote = async (id) => {
  const response = await api.get(`/credit-debit-notes/${id}`);
  return response.data.data;
};

export const createCreditDebitNote = async (data) => {
  const response = await api.post('/credit-debit-notes', data);
  return response.data.data;
};

export const updateCreditDebitNote = async (id, data) => {
  const response = await api.put(`/credit-debit-notes/${id}`, data);
  return response.data.data;
};

export const finalizeCreditDebitNote = async (id) => {
  const response = await api.post(`/credit-debit-notes/${id}/finalize`);
  return response.data.data;
};

export const getCreditNoteSalesReturnSetup = async () => {
  const response = await api.get('/credit-debit-notes/ledger-setup/sales-return');
  return response.data.data;
};

export const getCreditNoteLedgerConfig = async () => {
  const response = await api.get('/credit-debit-notes/ledger-config');
  return response.data.data;
};

export const searchCreditNoteMappingLedgers = async (q = '') => {
  const response = await api.get('/credit-debit-notes/ledger-config/search', { params: { q } });
  return response.data.data;
};

export const selectCreditNoteExistingLedger = async (ledgerId, systemCode = 'SALES_RETURN') => {
  const response = await api.post('/credit-debit-notes/ledger-config/select-existing', { ledgerId, systemCode });
  return response.data.data;
};

export const createCreditNoteConfigLedger = async (body = {}) => {
  const response = await api.post('/credit-debit-notes/ledger-config/create-new', body);
  return response.data.data;
};

export const useCreditNoteDefaultSystemLedger = async () => {
  const response = await api.post('/credit-debit-notes/ledger-config/use-default');
  return response.data.data;
};

export const updateCreditNoteReasonMappings = async (reasonMappings) => {
  const response = await api.put('/credit-debit-notes/ledger-config/reason-mappings', { reasonMappings });
  return response.data.data;
};

export const ensureCreditNoteSalesReturnLedger = async () => {
  const response = await api.post('/credit-debit-notes/ledger-setup/sales-return/ensure');
  return response.data.data;
};

export const mapCreditNoteSalesReturnLedger = async (ledgerId) => {
  const response = await api.post('/credit-debit-notes/ledger-setup/sales-return/map', { ledgerId });
  return response.data.data;
};

export const listSalesReturnMappingCandidates = async () => {
  const response = await api.get('/credit-debit-notes/ledger-setup/sales-return/candidates');
  return response.data.data;
};

export const cancelCreditDebitNote = async (id, data) => {
  const response = await api.post(`/credit-debit-notes/${id}/cancel`, data);
  return response.data.data;
};

/** Phase 4A — Customer Credit Note bill allocation */
export const getAvailableCustomerCreditNotes = async (params) => {
  const response = await api.get('/credit-debit-notes/available-for-customer', { params });
  return response.data.data;
};

export const applyCreditNoteAllocations = async (body) => {
  const response = await api.post('/credit-debit-notes/allocate', body);
  return response.data.data;
};

export const reverseCreditNoteAllocation = async (id, body) => {
  const response = await api.post(`/credit-debit-notes/allocations/${id}/reverse`, body);
  return response.data.data;
};
