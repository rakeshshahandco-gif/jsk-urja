import api from './api';

export const getCreditDebitNotes = async (params) => {
  const response = await api.get('/v1/credit-debit-notes', { params });
  return response.data;
};

export const getCreditDebitNote = async (id) => {
  const response = await api.get(`/v1/credit-debit-notes/${id}`);
  return response.data.data;
};

export const createCreditDebitNote = async (data) => {
  const response = await api.post('/v1/credit-debit-notes', data);
  return response.data.data;
};

export const updateCreditDebitNote = async (id, data) => {
  const response = await api.put(`/v1/credit-debit-notes/${id}`, data);
  return response.data.data;
};

export const finalizeCreditDebitNote = async (id) => {
  const response = await api.post(`/v1/credit-debit-notes/${id}/finalize`);
  return response.data.data;
};

export const cancelCreditDebitNote = async (id, data) => {
  const response = await api.post(`/v1/credit-debit-notes/${id}/cancel`, data);
  return response.data.data;
};
