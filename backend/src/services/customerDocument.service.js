import path from 'path';
import fs from 'fs';
import CustomerDocument from '../models/customerDocument.model.js';
import Customer from '../models/customer.model.js';
import { ApiError } from '../utils/ApiError.js';
import {
    CUSTOMER_DOCUMENT_TYPES,
    CUSTOMER_DOCUMENT_EXPIRY_TYPES,
    CUSTOMER_FIELD_DOCUMENT_LINKS,
} from '../constants/customerKyc.constants.js';
import { CUSTOMER_DOCUMENT_UPLOAD_DIR } from '../middlewares/customerDocumentUpload.middleware.js';

function publicFileUrl(filename) {
    return `/${CUSTOMER_DOCUMENT_UPLOAD_DIR}${filename}`.replace(/\\/g, '/');
}

export async function listCustomerDocuments(customerId, { documentType, includeDeleted = false } = {}) {
    const filter = { customerId };
    if (!includeDeleted) filter.isDeleted = false;
    if (documentType) filter.documentType = documentType;
    const docs = await CustomerDocument.find(filter).sort({ createdAt: -1 }).populate('uploadedBy', 'name email');
    return docs;
}

export async function getCustomerDocumentById(id) {
    const doc = await CustomerDocument.findById(id);
    if (!doc || doc.isDeleted) throw new ApiError(404, 'Document not found');
    return doc;
}

export async function uploadCustomerDocument({
    customerId,
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
    if (!CUSTOMER_DOCUMENT_TYPES.includes(documentType)) {
        throw new ApiError(400, 'Invalid document type');
    }
    const customer = await Customer.findById(customerId);
    if (!customer || customer.isDeleted) throw new ApiError(404, 'Customer not found');

    const fileUrl = publicFileUrl(file.filename);
    const doc = await CustomerDocument.create({
        groupId: groupId || '',
        companyId: companyId || null,
        customerId,
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
    return doc;
}

export async function replaceCustomerDocument(id, { file, userId, documentNumber, expiryDate, reminderDays, source }) {
    const existing = await getCustomerDocumentById(id);
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

export async function softDeleteCustomerDocument(id, userId) {
    const doc = await getCustomerDocumentById(id);
    doc.isDeleted = true;
    doc.updatedBy = userId;
    await doc.save();
    return doc;
}

export async function updateDocumentMeta(id, { documentNumber, expiryDate, reminderDays }, userId) {
    const doc = await getCustomerDocumentById(id);
    if (documentNumber !== undefined) doc.documentNumber = documentNumber || '';
    if (expiryDate !== undefined) doc.expiryDate = expiryDate ? new Date(expiryDate) : null;
    if (reminderDays !== undefined) {
        doc.reminderDays = reminderDays != null && reminderDays !== '' ? Number(reminderDays) : null;
    }
    doc.updatedBy = userId;
    await doc.save();
    return doc;
}

/** OCR-ready hook — no extraction yet */
export async function applyOcrToCustomerField(_customerId, _documentType, _extractedValue) {
    return { applied: false, message: 'OCR not enabled yet. Verify and save manually.' };
}

export function getFieldDocumentLinks() {
    return CUSTOMER_FIELD_DOCUMENT_LINKS;
}

export function getExpiryCapableTypes() {
    return [...CUSTOMER_DOCUMENT_EXPIRY_TYPES];
}

export async function reportMissingDocument(documentType, { limit = 500, companyId } = {}) {
    if (!CUSTOMER_DOCUMENT_TYPES.includes(documentType)) {
        throw new ApiError(400, 'Invalid document type');
    }
    const customers = await Customer.find({ isDeleted: { $ne: true } })
        .select('customerName company customerCode gstNumber panNumber tanNumber msmeRegNo iecNumber')
        .limit(limit * 2)
        .lean();

    const withDocs = await CustomerDocument.distinct('customerId', {
        documentType,
        isDeleted: false,
        ...(companyId ? { companyId } : {}),
    });
    const withSet = new Set(withDocs.map((id) => String(id)));

    const missing = customers
        .filter((c) => !withSet.has(String(c._id)))
        .slice(0, limit)
        .map((c) => ({
            _id: c._id,
            customerName: c.customerName,
            company: c.company,
            customerCode: c.customerCode,
        }));

    return { documentType, total: missing.length, results: missing };
}

export async function reportMissingKyc({ limit = 500 } = {}) {
    const kycTypes = ['gst_certificate', 'pan_card', 'kyc_form'];
    const combined = [];
    for (const documentType of kycTypes) {
        const part = await reportMissingDocument(documentType, { limit });
        combined.push({ documentType, count: part.total });
    }
    return { reports: combined };
}

export async function reportExpiringDocuments({ withinDays = 30, limit = 500 } = {}) {
    const now = new Date();
    const until = new Date();
    until.setDate(until.getDate() + Number(withinDays) || 30);

    const docs = await CustomerDocument.find({
        isDeleted: false,
        expiryDate: { $gte: now, $lte: until },
    })
        .populate('customerId', 'customerName company customerCode')
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
            customer: d.customerId,
        })),
    };
}
