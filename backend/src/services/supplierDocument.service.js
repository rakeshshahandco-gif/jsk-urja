import path from 'path';
import fs from 'fs';
import SupplierDocument from '../models/supplierDocument.model.js';
import { Supplier } from '../models/supplier.model.js';
import { ApiError } from '../utils/ApiError.js';
import { SUPPLIER_DOCUMENT_TYPES } from '../constants/supplierKyc.constants.js';
import { SUPPLIER_DOCUMENT_UPLOAD_DIR } from '../middlewares/supplierDocumentUpload.middleware.js';

function publicFileUrl(filename) {
    return `/${SUPPLIER_DOCUMENT_UPLOAD_DIR}${filename}`.replace(/\\/g, '/');
}

export async function listSupplierDocuments(supplierId, { documentType, includeDeleted = false } = {}) {
    const filter = { supplierId };
    if (!includeDeleted) filter.isDeleted = false;
    if (documentType) filter.documentType = documentType;
    return SupplierDocument.find(filter).sort({ createdAt: -1 }).populate('uploadedBy', 'name email');
}

export async function getSupplierDocumentById(id) {
    const doc = await SupplierDocument.findById(id);
    if (!doc || doc.isDeleted) throw new ApiError(404, 'Document not found');
    return doc;
}

export async function uploadSupplierDocument({
    supplierId,
    companyId,
    financialYearId,
    groupId,
    documentType,
    documentNumber,
    expiryDate,
    reminderDays,
    source,
    file,
    userId,
}) {
    if (!SUPPLIER_DOCUMENT_TYPES.includes(documentType)) {
        throw new ApiError(400, 'Invalid document type');
    }
    const supplier = await Supplier.findById(supplierId);
    if (!supplier || supplier.isDeleted) throw new ApiError(404, 'Supplier not found');

    const fileUrl = publicFileUrl(file.filename);
    return SupplierDocument.create({
        groupId: groupId || '',
        companyId: companyId || null,
        supplierId,
        financialYearId: financialYearId || null,
        documentType,
        documentNumber: documentNumber || '',
        fileName: file.filename,
        originalName: file.originalname || file.filename,
        mimeType: file.mimetype || '',
        fileUrl,
        fileSize: file.size || 0,
        source: source || 'upload',
        uploadedBy: userId,
        updatedBy: userId,
        expiryDate: expiryDate ? new Date(expiryDate) : null,
        reminderDays: reminderDays != null && reminderDays !== '' ? Number(reminderDays) : null,
        ocrStatus: 'none',
    });
}

export async function replaceSupplierDocument(id, { file, userId, documentNumber, expiryDate, reminderDays, source }) {
    const existing = await getSupplierDocumentById(id);
    const oldPath = path.join(process.cwd(), existing.fileUrl.replace(/^\//, ''));
    if (fs.existsSync(oldPath)) {
        try { fs.unlinkSync(oldPath); } catch (_) { /* ignore */ }
    }
    existing.fileName = file.filename;
    existing.originalName = file.originalname || file.filename;
    existing.mimeType = file.mimetype || '';
    existing.fileUrl = publicFileUrl(file.filename);
    existing.fileSize = file.size || 0;
    existing.source = source || 'replace';
    existing.updatedBy = userId;
    if (documentNumber !== undefined) existing.documentNumber = documentNumber || '';
    if (expiryDate !== undefined) existing.expiryDate = expiryDate ? new Date(expiryDate) : null;
    if (reminderDays !== undefined) {
        existing.reminderDays = reminderDays != null && reminderDays !== '' ? Number(reminderDays) : null;
    }
    await existing.save();
    return existing;
}

export async function softDeleteSupplierDocument(id, userId) {
    const doc = await getSupplierDocumentById(id);
    doc.isDeleted = true;
    doc.updatedBy = userId;
    await doc.save();
    return doc;
}

export async function updateSupplierDocumentMeta(id, { documentNumber, expiryDate, reminderDays }, userId) {
    const doc = await getSupplierDocumentById(id);
    if (documentNumber !== undefined) doc.documentNumber = documentNumber || '';
    if (expiryDate !== undefined) doc.expiryDate = expiryDate ? new Date(expiryDate) : null;
    if (reminderDays !== undefined) {
        doc.reminderDays = reminderDays != null && reminderDays !== '' ? Number(reminderDays) : null;
    }
    doc.updatedBy = userId;
    await doc.save();
    return doc;
}

export async function reportMissingSupplierDocument(documentType, { limit = 500, companyId } = {}) {
    if (!SUPPLIER_DOCUMENT_TYPES.includes(documentType)) {
        throw new ApiError(400, 'Invalid document type');
    }
    const suppliers = await Supplier.find({ isDeleted: { $ne: true } })
        .select('supplierName supplierCode gstNumber panNumber')
        .limit(limit * 2)
        .lean();

    const withDocs = await SupplierDocument.distinct('supplierId', {
        documentType,
        isDeleted: false,
        ...(companyId ? { companyId } : {}),
    });
    const withSet = new Set(withDocs.map((id) => String(id)));

    const missing = suppliers
        .filter((s) => !withSet.has(String(s._id)))
        .slice(0, limit)
        .map((s) => ({
            _id: s._id,
            supplierName: s.supplierName,
            supplierCode: s.supplierCode,
        }));

    return { documentType, total: missing.length, results: missing };
}

export async function reportMissingSupplierKyc({ limit = 500 } = {}) {
    const kycTypes = ['gst_certificate', 'pan_card', 'registration_form'];
    const combined = [];
    for (const documentType of kycTypes) {
        const part = await reportMissingSupplierDocument(documentType, { limit });
        combined.push({ documentType, count: part.total });
    }
    return { reports: combined };
}

export async function reportExpiringSupplierDocuments({ withinDays = 30, limit = 500 } = {}) {
    const now = new Date();
    const until = new Date();
    until.setDate(until.getDate() + Number(withinDays) || 30);

    const docs = await SupplierDocument.find({
        isDeleted: false,
        expiryDate: { $gte: now, $lte: until },
    })
        .populate('supplierId', 'supplierName supplierCode')
        .sort({ expiryDate: 1 })
        .limit(limit)
        .lean();

    return {
        withinDays: Number(withinDays) || 30,
        total: docs.length,
        results: docs.map((d) => ({
            _id: d._id,
            documentType: d.documentType,
            fileName: d.fileName,
            expiryDate: d.expiryDate,
            reminderDays: d.reminderDays,
            supplier: d.supplierId,
        })),
    };
}
