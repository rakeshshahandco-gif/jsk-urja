import mongoose from 'mongoose';

/** Lightweight file reference — binary stored on disk only (uploads/whatsapp-bulk/). */
export const whatsappBulkAttachmentRefSchema = new mongoose.Schema(
    {
        attachmentId: { type: String, required: true, trim: true },
        fileName: { type: String, required: true, trim: true },
        filePath: { type: String, required: true, trim: true },
        fileUrl: { type: String, required: true, trim: true },
        mimeType: { type: String, trim: true, default: '' },
        sizeBytes: { type: Number, default: 0 },
        checksum: { type: String, trim: true, default: '' },
        companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company' },
        financialYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'FinancialYear', default: null },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },
    { _id: false, timestamps: true },
);

export default whatsappBulkAttachmentRefSchema;
