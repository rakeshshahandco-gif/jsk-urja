import mongoose from 'mongoose';

const mappedItemSchema = new mongoose.Schema(
    {
        ocrLineIndex: { type: Number, default: 0 },
        ocrItemName: { type: String, trim: true, default: '' },
        ocrItemCode: { type: String, trim: true, default: '' },
        ocrHsn: { type: String, trim: true, default: '' },
        itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', default: null },
        itemName: { type: String, trim: true, default: '' },
        itemCode: { type: String, trim: true, default: '' },
        hsnCode: { type: String, trim: true, default: '' },
        uom: { type: String, trim: true, default: 'NOS' },
        qty: { type: Number, default: 0 },
        rate: { type: Number, default: 0 },
        gstRate: { type: Number, default: 18 },
        discountPercent: { type: Number, default: 0 },
        purchaseType: {
            type: String,
            enum: ['RAW_MATERIAL_PURCHASE', 'TRADING_PURCHASE', 'CONSUMABLE_PURCHASE'],
            default: 'RAW_MATERIAL_PURCHASE',
        },
    },
    { _id: false },
);

const scanEntryDraftSchema = new mongoose.Schema(
    {
        companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null },
        financialYear: { type: String, required: true, trim: true },
        moduleType: { type: String, enum: ['purchase_invoice', 'sales_invoice', 'expense_bill'], required: true },
        uploadFileUrl: { type: String, trim: true, default: '' },
        storedFileName: { type: String, trim: true, default: '' },
        originalFileName: { type: String, trim: true, default: '' },
        fileType: { type: String, trim: true, default: '' },
        mimeType: { type: String, trim: true, default: '' },
        fileSize: { type: Number, default: 0 },
        ocrRawText: { type: String, default: '' },
        extractedData: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
        confidence: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
        mappedSupplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', default: null },
        mappedCustomerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null },
        mappedLedgerId: { type: mongoose.Schema.Types.ObjectId, ref: 'AccountLedger', default: null },
        mappedItems: { type: [mappedItemSchema], default: [] },
        status: {
            type: String,
            enum: ['uploaded', 'ocr_processing', 'ocr_completed', 'needs_review', 'ready_to_post', 'posted', 'rejected', 'duplicate_found', 'error'],
            default: 'uploaded',
        },
        duplicateCheckResult: { type: mongoose.Schema.Types.Mixed, default: null },
        validationErrors: { type: [String], default: [] },
        userRemarks: { type: String, trim: true, default: '' },
        adminOverrideReason: { type: String, trim: true, default: '' },
        pendingMasters: {
            type: [{
                type: { type: String, enum: ['supplier', 'item', 'ledger'], required: true },
                status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
                payload: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
                approvedEntityId: { type: mongoose.Schema.Types.ObjectId, default: null },
                createdAt: { type: Date, default: Date.now },
                approvedAt: { type: Date, default: null },
                approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
            }],
            default: [],
        },
        finalLinkedVoucherId: { type: mongoose.Schema.Types.ObjectId, default: null },
        finalLinkedInvoiceId: { type: mongoose.Schema.Types.ObjectId, default: null },
        uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        postedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        ocrErrorMessage: { type: String, trim: true, default: '' },
        deletedAt: { type: Date, default: null },
    },
    { timestamps: true },
);

scanEntryDraftSchema.index({ financialYear: 1, status: 1, moduleType: 1 });
scanEntryDraftSchema.index({ uploadedBy: 1, createdAt: -1 });
scanEntryDraftSchema.index({ deletedAt: 1 });

const ScanEntryDraft = mongoose.model('ScanEntryDraft', scanEntryDraftSchema);
export { ScanEntryDraft };
export default ScanEntryDraft;

