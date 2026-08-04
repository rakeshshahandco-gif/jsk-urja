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
