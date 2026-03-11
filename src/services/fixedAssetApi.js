import api from './api';

const CAT = '/asset-categories';
const LOC = '/asset-locations';
const AST = '/fixed-assets';
const TRA = '/asset-transfers';
const MAI = '/asset-maintenance';
const DIS = '/asset-disposals';

// Categories
export const getAssetCategories = async () => { const r = await api.get(CAT); return r.data.data; };
export const createAssetCategory = async (data) => { const r = await api.post(CAT, data); return r.data.data; };
export const updateAssetCategory = async (id, data) => { const r = await api.put(`${CAT}/${id}`, data); return r.data.data; };
export const deleteAssetCategory = async (id) => { const r = await api.delete(`${CAT}/${id}`); return r.data; };

// Locations
export const getAssetLocations = async () => { const r = await api.get(LOC); return r.data.data; };
export const createAssetLocation = async (data) => { const r = await api.post(LOC, data); return r.data.data; };
export const updateAssetLocation = async (id, data) => { const r = await api.put(`${LOC}/${id}`, data); return r.data.data; };
export const deleteAssetLocation = async (id) => { const r = await api.delete(`${LOC}/${id}`); return r.data; };

// Main Assets
export const getFixedAssets = async (params) => { const r = await api.get(AST, { params }); return r.data.data; };
export const getFixedAssetById = async (id) => { const r = await api.get(`${AST}/${id}`); return r.data.data; };
export const createFixedAsset = async (data) => { const r = await api.post(AST, data); return r.data.data; };
export const updateFixedAsset = async (id, data) => { const r = await api.put(`${AST}/${id}`, data); return r.data.data; };

// Lifecycle
export const createAssetTransfer = async (data) => { const r = await api.post(TRA, data); return r.data.data; };
export const getTransferHistory = async (assetId) => { const r = await api.get(`${TRA}/asset/${assetId}`); return r.data.data; };

export const createAssetMaintenance = async (data) => { const r = await api.post(MAI, data); return r.data.data; };
export const getMaintenanceHistory = async (assetId) => { const r = await api.get(`${MAI}/asset/${assetId}`); return r.data.data; };

export const createAssetDisposal = async (data) => { const r = await api.post(DIS, data); return r.data.data; };
