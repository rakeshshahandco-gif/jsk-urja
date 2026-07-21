import api from './api';

const base = '/print-formats';

export const listPrintFormats = (docType, invoiceSeriesId) => {
    const params = {};
    if (docType) params.docType = docType;
    if (invoiceSeriesId) params.invoiceSeriesId = invoiceSeriesId;
    return api.get(base, { params }).then((r) => r.data?.data ?? r.data);
};

export const getPrintFormat = (id) =>
    api.get(`${base}/${id}`).then((r) => r.data?.data ?? r.data);

export const getOriginalPrintTemplate = (docType) =>
    api.get(`${base}/original-template`, { params: { docType } }).then((r) => r.data?.data ?? r.data);

export const getActivePrintFormat = (docType, invoiceSeriesId) => {
    const params = { docType };
    if (invoiceSeriesId) params.invoiceSeriesId = invoiceSeriesId;
    return api.get(`${base}/active`, { params }).then((r) => r.data?.data ?? r.data);
};

export const getSampleDocSuggestion = (docType, invoiceSeriesId) => {
    const params = { docType };
    if (invoiceSeriesId) params.invoiceSeriesId = invoiceSeriesId;
    return api.get(`${base}/sample-suggestion`, { params }).then((r) => r.data?.data?.sampleRef ?? r.data?.sampleRef ?? '');
};

export const listPrintFormatSampleDocs = (docType, invoiceSeriesId, limit = 80) => {
    const params = { docType, limit };
    if (invoiceSeriesId) params.invoiceSeriesId = invoiceSeriesId;
    return api.get(`${base}/sample-documents`, { params }).then((r) => r.data?.data ?? r.data ?? []);
};

export const pullOriginalPrintFormat = (docType, name, invoiceSeriesId) =>
    api.post(`${base}/pull-original`, {
        docType,
        name,
        ...(invoiceSeriesId ? { invoiceSeriesId } : {}),
    }).then((r) => r.data?.data ?? r.data);

export const pullBlankPrintFormat = (docType, name) =>
    api.post(`${base}/pull-blank`, { docType, name }).then((r) => r.data?.data ?? r.data);

export const copyPrintFormat = (sourceId, name) =>
    api.post(`${base}/copy`, { sourceId, name }).then((r) => r.data?.data ?? r.data);

export const importPrintFormat = (payload) =>
    api.post(`${base}/import`, payload).then((r) => r.data?.data ?? r.data);

/** Build a portable JSON snapshot for Export (layout only — no live activation). */
export function buildPrintFormatExportPayload(format) {
    if (!format) return null;
    return {
        schemaVersion: 1,
        exportedAt: new Date().toISOString(),
        docType: format.docType,
        name: format.name,
        paperSize: format.paperSize,
        orientation: format.orientation,
        margins: format.margins,
        customPaper: format.customPaper,
        layout: format.layout,
        sourceFormatId: format._id,
        sourceStatus: format.status,
        sourceIsDefault: format.isDefault,
    };
}

export const updatePrintFormat = (id, payload) =>
    api.put(`${base}/${id}`, payload).then((r) => r.data?.data ?? r.data);

export const savePrintFormatDraft = (id, payload) =>
    api.patch(`${base}/${id}/draft`, payload).then((r) => r.data?.data ?? r.data);

export const approvePrintFormat = (id) =>
    api.patch(`${base}/${id}/approve`).then((r) => r.data?.data ?? r.data);

export const setDefaultPrintFormat = (id) =>
    api.patch(`${base}/${id}/set-default`).then((r) => r.data?.data ?? r.data);

export const previewPrintFormat = (id, sampleRef) =>
    api.post(`${base}/${id}/preview`, sampleRef ? { sampleRef } : {}).then((r) => r.data?.data ?? r.data);

export const deletePrintFormat = (id) =>
    api.delete(`${base}/${id}`).then((r) => r.data);

export const getPrintDesignerSettings = () =>
    api.get(`${base}/designer-settings`).then((r) => r.data?.data ?? r.data);

export const updatePrintDesignerSettings = (payload) =>
    api.patch(`${base}/designer-settings`, payload).then((r) => r.data?.data ?? r.data);
