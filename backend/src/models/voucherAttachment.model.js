import mongoose from 'mongoose';

const VOUCHER_TYPES = [
    'purchase_invoice',
    'sales_invoice',
    'expense_voucher',
    'payment_voucher',
    'receipt_voucher',
    'delivery_challan',
    'customer_master',
    'supplier_master',
    'petty_cash',
];

const voucherAttachmentSchema = new mongoose.Schema(
    {
        voucherType: {
            type: String,
            required: true,
            enum: VOUCHER_TYPES,
        },
        voucherId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
        },
        voucherNumber: { type: String, trim: true, default: '' },
        partyName: { type: String, trim: true, default: '' },
        billNo: { type: String, trim: true, default: '' },
        amount: { type: Number, default: 0 },
        voucherDate: { type: Date, default: null },

        fileName: { type: String, required: true, trim: true },
        originalName: { type: String, trim: true, default: '' },
        mimeType: { type: String, trim: true, default: '' },
        fileUrl: { type: String, required: true, trim: true },
        fileSize: { type: Number, default: 0 },

        source: {
            type: String,
            enum: ['upload', 'scan', 'mobile_scan'],
            default: 'upload',
        },
        label: { type: String, trim: true, default: '' },

        uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        isDeleted: { type: Boolean, default: false },
    },
    { timestamps: true },
);

voucherAttachmentSchema.index({ voucherType: 1, voucherId: 1, isDeleted: 1 });
voucherAttachmentSchema.index({ voucherType: 1, voucherNumber: 1 });
voucherAttachmentSchema.index({ billNo: 1 });
voucherAttachmentSchema.index({ createdAt: -1 });

export const VOUCHER_ATTACHMENT_TYPES = VOUCHER_TYPES;

const VoucherAttachment = mongoose.model('VoucherAttachment', voucherAttachmentSchema);
export { VoucherAttachment };
export default VoucherAttachment;
