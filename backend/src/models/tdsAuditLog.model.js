import mongoose from 'mongoose';

const tdsAuditLogSchema = new mongoose.Schema(
    {
        action: {
            type: String,
            enum: [
                'MASTER_SECTION_UPDATE',
                'THRESHOLD_OVERRIDE',
                'POPUP_SKIPPED',
                'POPUP_CONFIRMED',
                'AUTO_JV_CREATED',
                'INLINE_TDS_ADJUSTMENT',
                'PAYMENT_TDS_APPLIED',
                'PAYMENT_TDS_REVERSED',
                'MANUAL_TDS_EDIT',
            ],
            required: true,
        },
        supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', default: null },
        section: { type: String, trim: true, default: '' },
        financialYear: { type: String, trim: true, default: '' },
        paymentEntryId: { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentEntry', default: null },
        voucherId: { type: mongoose.Schema.Types.ObjectId, default: null },
        details: { type: mongoose.Schema.Types.Mixed, default: {} },
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    },
    { timestamps: true },
);

tdsAuditLogSchema.index({ createdAt: -1 });
tdsAuditLogSchema.index({ supplierId: 1, financialYear: 1 });

export const TdsAuditLog = mongoose.model('TdsAuditLog', tdsAuditLogSchema);
