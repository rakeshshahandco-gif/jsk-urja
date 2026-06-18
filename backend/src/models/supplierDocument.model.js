import mongoose from 'mongoose';
import { SUPPLIER_DOCUMENT_TYPES } from '../constants/supplierKyc.constants.js';

const supplierDocumentSchema = new mongoose.Schema(
    {
        groupId: { type: String, trim: true, default: '' },
        companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null },
        supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true },
        financialYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'FinancialYear', default: null },
        documentType: {
            type: String,
            required: true,
            enum: SUPPLIER_DOCUMENT_TYPES,
        },
        documentNumber: { type: String, trim: true, default: '' },
        fileName: { type: String, required: true, trim: true },
        originalName: { type: String, trim: true, default: '' },
        mimeType: { type: String, trim: true, default: '' },
        fileUrl: { type: String, required: true, trim: true },
        fileSize: { type: Number, default: 0 },
        source: {
            type: String,
            enum: ['upload', 'scan', 'mobile_scan', 'replace'],
            default: 'upload',
        },
        uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        expiryDate: { type: Date, default: null },
        reminderDays: { type: Number, default: null },
        ocrExtracted: { type: mongoose.Schema.Types.Mixed, default: null },
        ocrStatus: {
            type: String,
            enum: ['none', 'pending', 'completed', 'failed'],
            default: 'none',
        },
        isDeleted: { type: Boolean, default: false },
    },
    { timestamps: true },
);

supplierDocumentSchema.index({ supplierId: 1, documentType: 1, isDeleted: 1 });
supplierDocumentSchema.index({ companyId: 1, documentType: 1, isDeleted: 1 });
supplierDocumentSchema.index({ expiryDate: 1, isDeleted: 1 });

const SupplierDocument = mongoose.model('SupplierDocument', supplierDocumentSchema);
export default SupplierDocument;
