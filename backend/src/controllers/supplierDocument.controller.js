import pick from '../utils/pick.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import * as supplierDocumentService from '../services/supplierDocument.service.js';
import {
    SUPPLIER_DOCUMENT_TYPE_LABELS,
    SUPPLIER_OCR_FIELD_MAP,
} from '../constants/supplierKyc.constants.js';

export const listDocuments = asyncHandler(async (req, res) => {
    const { supplierId } = req.params;
    const { documentType } = req.query;
    const results = await supplierDocumentService.listSupplierDocuments(supplierId, { documentType });
    res.send(new ApiResponse(200, { results }));
});

export const getDocument = asyncHandler(async (req, res) => {
    const doc = await supplierDocumentService.getSupplierDocumentById(req.params.documentId);
    res.send(new ApiResponse(200, doc));
});

export const uploadDocument = asyncHandler(async (req, res) => {
    if (!req.file) throw new ApiError(400, 'No file uploaded');
    const body = pick(req.body, [
        'documentType',
        'documentNumber',
        'expiryDate',
        'reminderDays',
        'source',
        'companyId',
        'financialYearId',
        'groupId',
    ]);
    const doc = await supplierDocumentService.uploadSupplierDocument({
        supplierId: req.params.supplierId,
        companyId: body.companyId || req.companyId,
        financialYearId: body.financialYearId,
        groupId: body.groupId,
        documentType: body.documentType,
        documentNumber: body.documentNumber,
        expiryDate: body.expiryDate,
        reminderDays: body.reminderDays,
        source: body.source || (req.body.scanMode === 'mobile' ? 'mobile_scan' : 'upload'),
        file: req.file,
        userId: req.user?._id || req.user?.id,
    });
    res.status(201).send(new ApiResponse(201, doc, 'Document uploaded'));
});

export const replaceDocument = asyncHandler(async (req, res) => {
    if (!req.file) throw new ApiError(400, 'No file uploaded');
    const body = pick(req.body, ['documentNumber', 'expiryDate', 'reminderDays', 'source']);
    const doc = await supplierDocumentService.replaceSupplierDocument(req.params.documentId, {
        file: req.file,
        userId: req.user?._id || req.user?.id,
        ...body,
        source: body.source || 'replace',
    });
    res.send(new ApiResponse(200, doc, 'Document replaced'));
});

export const updateMeta = asyncHandler(async (req, res) => {
    const body = pick(req.body, ['documentNumber', 'expiryDate', 'reminderDays']);
    const doc = await supplierDocumentService.updateSupplierDocumentMeta(
        req.params.documentId,
        body,
        req.user?._id || req.user?.id,
    );
    res.send(new ApiResponse(200, doc, 'Document updated'));
});

export const removeDocument = asyncHandler(async (req, res) => {
    await supplierDocumentService.softDeleteSupplierDocument(
        req.params.documentId,
        req.user?._id || req.user?.id,
    );
    res.send(new ApiResponse(200, null, 'Document deleted'));
});

export const getKycMeta = asyncHandler(async (req, res) => {
    res.send(
        new ApiResponse(200, {
            documentTypeLabels: SUPPLIER_DOCUMENT_TYPE_LABELS,
            ocrFieldMap: SUPPLIER_OCR_FIELD_MAP,
            ocrEnabled: false,
        }),
    );
});

export const missingByType = asyncHandler(async (req, res) => {
    const { documentType } = req.params;
    const options = pick(req.query, ['limit', 'companyId']);
    const result = await supplierDocumentService.reportMissingSupplierDocument(documentType, options);
    res.send(new ApiResponse(200, result));
});

export const missingKyc = asyncHandler(async (req, res) => {
    const options = pick(req.query, ['limit']);
    const result = await supplierDocumentService.reportMissingSupplierKyc(options);
    res.send(new ApiResponse(200, result));
});

export const expiringReport = asyncHandler(async (req, res) => {
    const options = pick(req.query, ['withinDays', 'limit']);
    const result = await supplierDocumentService.reportExpiringSupplierDocuments(options);
    res.send(new ApiResponse(200, result));
});
