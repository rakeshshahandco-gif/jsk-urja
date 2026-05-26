import mongoose from 'mongoose';

const approvalRuleSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true },
        module: {
            type: String,
            required: true,
            enum: [
                'sales_invoice',
                'purchase_invoice',
                'payment_voucher',
                'journal_voucher',
                'bank_reconciliation',
                'gst_return',
                'negative_gp',
                'backdated_entry',
                'lock_override',
                'other',
            ],
        },
        isActive: { type: Boolean, default: true },
        priority: { type: Number, default: 100 },
        /** amount threshold — 0 = any amount */
        amountThreshold: { type: Number, default: 0 },
        conditionType: {
            type: String,
            enum: ['amount_above', 'negative_gp', 'backdated', 'lock_override', 'always', 'custom'],
            default: 'amount_above',
        },
        approverRoleIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Role' }],
        approverUserIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
        requireAllApprovers: { type: Boolean, default: false },
        /** provisional vs final posting */
        postingMode: { type: String, enum: ['provisional', 'final'], default: 'provisional' },
        description: { type: String, default: '' },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },
    { timestamps: true },
);

approvalRuleSchema.index({ module: 1, isActive: 1, priority: 1 });

export const ApprovalRule = mongoose.model('ApprovalRule', approvalRuleSchema);
