import mongoose from 'mongoose';
import { CUSTOMER_DOCUMENT_TYPES } from '../constants/customerKyc.constants.js';

const customerDocumentSchema = new mongoose.Schema(
    {
        groupId: { type: String, trim: true, default: '' },
        companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null },
        customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
        financialYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'FinancialYear', default: null },
        documentType: {
            type: String,
            required: true,
            enum: CUSTOMER_DOCUMENT_TYPES,
        },
        documentNumber: { type: String, trim: true, default: '' },
        fileName: { type: String, required: true, trim: true },
        originalName: { type: String, trim: true, default: '' },
        mimeType: { type: String, trim: true, default: '' },
        fileUrl: { type: String, required: true, trim: true },
        fileSize: { type: Number, default: 0 },
        /** Storage foundation metadata — binary never stored in Mongo */
        storageProvider: {
            type: String,
            enum: ['local', 's3'],
            default: 'local',
        },
        bucket: { type: String, trim: true, default: null },
        objectKey: { type: String, trim: true, default: null },
        checksum: { type: String, trim: true, default: null },
        source: {
            type: String,
            enum: ['upload', 'scan', 'mobile_scan', 'replace'],
            default: 'upload',
        },
        uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        expiryDate: { type: Date, default: null },
        reminderDays: { type: Number, default: null },
        /** Future OCR extraction payload */
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

customerDocumentSchema.index({ customerId: 1, documentType: 1, isDeleted: 1 });
customerDocumentSchema.index({ companyId: 1, documentType: 1, isDeleted: 1 });
customerDocumentSchema.index({ expiryDate: 1, isDeleted: 1 });

const CustomerDocument = mongoose.model('CustomerDocument', customerDocumentSchema);
export default CustomerDocument;
