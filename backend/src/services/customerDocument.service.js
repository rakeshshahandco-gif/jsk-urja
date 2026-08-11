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
import { createFileStorageService } from './fileStorage/index.js';

function publicFileUrl(filename) {
    return `/${CUSTOMER_DOCUMENT_UPLOAD_DIR}${filename}`.replace(/\\/g, '/');
}

function storageProviderName() {
    return String(process.env.FILE_STORAGE_PROVIDER || 'local').trim().toLowerCase() === 's3'
        ? 's3'
        : 'local';
}

function getFileBuffer(file) {
    if (file?.buffer && Buffer.isBuffer(file.buffer)) return file.buffer;
    if (file?.path && fs.existsSync(file.path)) return fs.readFileSync(file.path);
    throw new ApiError(400, 'Uploaded file content is missing');
}

async function persistUploadedFile(file, {
    companyId,
    financialYearId,
    documentType,
    userId,
}) {
    const provider = storageProviderName();
    if (provider === 's3') {
        const buffer = getFileBuffer(file);
        const storage = createFileStorageService({ provider: 's3' });
        const meta = await storage.uploadFile({
            companyId: companyId || 'unknown',
            financialYearId: financialYearId || 'none',
            module: 'customer-document',
            originalFileName: file.originalname || 'document.pdf',
            mimeType: file.mimetype || 'application/pdf',
            buffer,
            createdBy: userId || null,
        });
        if (file.path && fs.existsSync(file.path)) {
            try { fs.unlinkSync(file.path); } catch { /* ignore */ }
        }
        return {
            fileName: path.basename(meta.objectKey),
            originalName: meta.originalFileName,
            mimeType: meta.mimeType,
            fileUrl: `s3://${meta.bucket}/${meta.objectKey}`,
            fileSize: meta.fileSize,
            storageProvider: 's3',
            bucket: meta.bucket,
            objectKey: meta.objectKey,
            checksum: meta.checksum,
        };
    }

    if (!file?.filename) throw new ApiError(400, 'Uploaded file is missing');
    return {
        fileName: file.filename,
        originalName: file.originalname || file.filename,
        mimeType: file.mimetype || '',
        fileUrl: publicFileUrl(file.filename),
        fileSize: file.size || 0,
        storageProvider: 'local',
        bucket: null,
        objectKey: null,
        checksum: null,
    };
}

async function deleteStoredFile(doc) {
    if (!doc) return;
    if (doc.storageProvider === 's3' && doc.objectKey) {
        try {
            const storage = createFileStorageService({ provider: 's3' });
            await storage.deleteFile({ objectKey: doc.objectKey });
        } catch { /* ignore missing remote object */ }
        return;
    }
    const rel = String(doc.fileUrl || '').replace(/^\//, '');
    if (!rel || rel.startsWith('s3://')) return;
    const oldPath = path.join(process.cwd(), rel);
    if (fs.existsSync(oldPath)) {
        try { fs.unlinkSync(oldPath); } catch { /* ignore */ }
    }
}

async function withSignedUrl(doc) {
    if (!doc) return doc;
    const plain = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };
    if (plain.storageProvider === 's3' && plain.objectKey) {
        try {
            const storage = createFileStorageService({ provider: 's3' });
            const signed = await storage.getSignedUrl({
                objectKey: plain.objectKey,
                expiresInSeconds: 300,
            });
            // Ephemeral for clients — Mongo keeps s3:// reference only
            plain.signedUrl = signed.url;
            plain.fileUrl = signed.url;
        } catch {
            /* leave stored reference */
        }
    }
    // Never expose binary fields
    delete plain.buffer;
    delete plain.body;
    delete plain.data;
    return plain;
}

export async function listCustomerDocuments(customerId, { documentType, includeDeleted = false } = {}) {
    const filter = { customerId };
    if (!includeDeleted) filter.isDeleted = false;
    if (documentType) filter.documentType = documentType;
    const docs = await CustomerDocument.find(filter).sort({ createdAt: -1 }).populate('uploadedBy', 'name email');
    return Promise.all(docs.map((d) => withSignedUrl(d)));
}

export async function getCustomerDocumentById(id) {
    const doc = await CustomerDocument.findById(id);
    if (!doc || doc.isDeleted) throw new ApiError(404, 'Document not found');
    return withSignedUrl(doc);
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

    const stored = await persistUploadedFile(file, {
        companyId: companyId || customer.companyId,
        financialYearId,
        documentType,
        userId,
    });

    const doc = await CustomerDocument.create({
        groupId: groupId || '',
        companyId: companyId || customer.companyId || null,
        customerId,
        financialYearId: financialYearId || null,
        documentType,
        documentNumber: documentNumber || '',
        fileName: stored.fileName,
        originalName: stored.originalName,
        mimeType: stored.mimeType,
        fileUrl: stored.fileUrl,
        fileSize: stored.fileSize,
        storageProvider: stored.storageProvider,
        bucket: stored.bucket,
        objectKey: stored.objectKey,
        checksum: stored.checksum,
        source: source || 'upload',
        uploadedBy: userId,
        updatedBy: userId,
        expiryDate: expiryDate ? new Date(expiryDate) : null,
        reminderDays: reminderDays != null && reminderDays !== '' ? Number(reminderDays) : null,
        ocrStatus: 'none',
    });
    return withSignedUrl(doc);
}

export async function replaceCustomerDocument(id, { file, userId, documentNumber, expiryDate, reminderDays, source }) {
    const existing = await CustomerDocument.findById(id);
    if (!existing || existing.isDeleted) throw new ApiError(404, 'Document not found');

    await deleteStoredFile(existing);

    const stored = await persistUploadedFile(file, {
        companyId: existing.companyId,
        financialYearId: existing.financialYearId,
        documentType: existing.documentType,
        userId,
    });

    existing.fileName = stored.fileName;
    existing.originalName = stored.originalName;
    existing.mimeType = stored.mimeType;
    existing.fileUrl = stored.fileUrl;
    existing.fileSize = stored.fileSize;
    existing.storageProvider = stored.storageProvider;
    existing.bucket = stored.bucket;
    existing.objectKey = stored.objectKey;
    existing.checksum = stored.checksum;
    existing.source = source || 'replace';
    existing.updatedBy = userId;
    if (documentNumber !== undefined) existing.documentNumber = documentNumber || '';
    if (expiryDate !== undefined) existing.expiryDate = expiryDate ? new Date(expiryDate) : null;
    if (reminderDays !== undefined) {
        existing.reminderDays = reminderDays != null && reminderDays !== '' ? Number(reminderDays) : null;
    }
    await existing.save();
    return withSignedUrl(existing);
}

export async function softDeleteCustomerDocument(id, userId) {
    const doc = await CustomerDocument.findById(id);
    if (!doc || doc.isDeleted) throw new ApiError(404, 'Document not found');
    doc.isDeleted = true;
    doc.updatedBy = userId;
    await doc.save();
    return doc;
}

export async function updateDocumentMeta(id, { documentNumber, expiryDate, reminderDays }, userId) {
    const doc = await CustomerDocument.findById(id);
    if (!doc || doc.isDeleted) throw new ApiError(404, 'Document not found');
    if (documentNumber !== undefined) doc.documentNumber = documentNumber || '';
    if (expiryDate !== undefined) doc.expiryDate = expiryDate ? new Date(expiryDate) : null;
    if (reminderDays !== undefined) {
        doc.reminderDays = reminderDays != null && reminderDays !== '' ? Number(reminderDays) : null;
    }
    doc.updatedBy = userId;
    await doc.save();
    return withSignedUrl(doc);
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
