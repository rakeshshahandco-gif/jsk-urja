import { PrintFormatService } from '../services/printFormat.service.js';
import {
    getPrintDesignerSettings,
    updatePrintDesignerSettings,
} from '../services/printDesignerSettings.service.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { PRINT_FORMAT_DOC_TYPES } from '../constants/printFormat.constants.js';
import { isGoldenBuiltInPrintFormat, isLivePrintFormat } from '../utils/printFormatRuntime.js';

export const listPrintFormats = asyncHandler(async (req, res) => {
    const { docType, invoiceSeriesId } = req.query;
    const data = await PrintFormatService.list(req.companyId, docType, invoiceSeriesId);
    res.json(new ApiResponse(200, data, 'Print formats fetched'));
});

export const getPrintFormat = asyncHandler(async (req, res) => {
    const data = await PrintFormatService.getById(req.companyId, req.params.id);
    res.json(new ApiResponse(200, data, 'Print format fetched'));
});

export const getOriginalTemplate = asyncHandler(async (req, res) => {
    const { docType } = req.query;
    const data = PrintFormatService.getOriginalTemplateMeta(docType);
    res.json(new ApiResponse(200, data, 'Original template metadata'));
});

export const pullOriginalFormat = asyncHandler(async (req, res) => {
    const { docType, name, invoiceSeriesId } = req.body;
    const data = await PrintFormatService.pullOriginal(
        req.companyId,
        req.user._id,
        docType,
        name,
        invoiceSeriesId,
    );
    res.status(201).json(new ApiResponse(201, data, 'Original format pulled'));
});

export const pullBlankFormat = asyncHandler(async (req, res) => {
    const { docType, name } = req.body;
    const data = await PrintFormatService.pullBlank(req.companyId, req.user._id, docType, name);
    res.status(201).json(new ApiResponse(201, data, 'Blank format created'));
});

export const copyPrintFormat = asyncHandler(async (req, res) => {
    const { sourceId, name } = req.body;
    const data = await PrintFormatService.copyExisting(req.companyId, req.user._id, sourceId, name);
    res.status(201).json(new ApiResponse(201, data, 'Format copied'));
});

export const importPrintFormat = asyncHandler(async (req, res) => {
    const data = await PrintFormatService.importFromExport(req.companyId, req.user._id, req.body || {});
    res.status(201).json(new ApiResponse(201, data, 'Format imported as draft'));
});

export const updatePrintFormat = asyncHandler(async (req, res) => {
    const data = await PrintFormatService.update(req.companyId, req.user._id, req.params.id, req.body);
    res.json(new ApiResponse(200, data, 'Print format updated'));
});

export const savePrintFormatDraft = asyncHandler(async (req, res) => {
    const data = await PrintFormatService.saveDraft(req.companyId, req.user._id, req.params.id, req.body);
    res.json(new ApiResponse(200, data, 'Draft saved'));
});

export const approvePrintFormat = asyncHandler(async (req, res) => {
    const data = await PrintFormatService.approveFormat(req.companyId, req.user._id, req.params.id);
    res.json(new ApiResponse(200, data, 'Format approved'));
});

export const setDefaultPrintFormat = asyncHandler(async (req, res) => {
    const data = await PrintFormatService.setAsDefault(req.companyId, req.user._id, req.params.id);
    res.json(new ApiResponse(200, data, 'Set as Active Default print format'));
});

export const deletePrintFormat = asyncHandler(async (req, res) => {
    await PrintFormatService.remove(req.companyId, req.params.id);
    res.json(new ApiResponse(200, null, 'Print format deleted'));
});

export const previewPrintFormat = asyncHandler(async (req, res) => {
    const sampleRef = req.body?.sampleRef || req.body?.sampleDocId;
    const data = await PrintFormatService.getPreviewPayload(req.companyId, req.params.id, sampleRef);
    res.json(new ApiResponse(200, data, 'Preview payload'));
});

export const getActivePrintFormat = asyncHandler(async (req, res) => {
    const { docType, invoiceSeriesId } = req.query;
    if (!PRINT_FORMAT_DOC_TYPES.includes(docType)) {
        return res.json(new ApiResponse(200, null, 'No custom format; use built-in original'));
    }
    const data = await PrintFormatService.getActiveDefault(
        req.companyId,
        docType,
        invoiceSeriesId,
    );
    const live = data && isLivePrintFormat(data) && !isGoldenBuiltInPrintFormat(data) ? data : null;
    res.json(new ApiResponse(200, live, live ? 'Active default format' : 'No custom format; use built-in original'));
});

export const suggestSampleDocRef = asyncHandler(async (req, res) => {
    const { docType, invoiceSeriesId } = req.query;
    const ref = await PrintFormatService.suggestSampleRef(docType, invoiceSeriesId);
    res.json(new ApiResponse(200, { sampleRef: ref }, 'Suggested sample document ref'));
});

export const listSampleDocumentRefs = asyncHandler(async (req, res) => {
    const { docType, invoiceSeriesId, limit } = req.query;
    const data = await PrintFormatService.listSampleDocumentRefs(req.companyId, docType, {
        invoiceSeriesId: invoiceSeriesId || null,
        limit,
    });
    res.json(new ApiResponse(200, data, 'Sample document list'));
});

export const getPrintDesignerSettingsHandler = asyncHandler(async (req, res) => {
    const data = await getPrintDesignerSettings(req.companyId);
    res.json(new ApiResponse(200, data, 'Print designer settings fetched'));
});

export const updatePrintDesignerSettingsHandler = asyncHandler(async (req, res) => {
    const data = await updatePrintDesignerSettings(req.companyId, req.user._id, req.body || {});
    res.json(new ApiResponse(200, data, 'Print designer settings updated'));
});
