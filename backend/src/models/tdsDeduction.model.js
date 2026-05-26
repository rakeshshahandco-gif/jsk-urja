import mongoose from 'mongoose';

const tdsDeductionSchema = new mongoose.Schema(
    {
        paymentEntryId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'PaymentEntry',
            default: null,
        },
        supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true },
        supplierName: { type: String, trim: true, default: '' },
        deducteePan: { type: String, trim: true, uppercase: true, required: true },
        section: { type: String, trim: true, required: true },
        amountPaid: { type: Number, required: true, min: 0 },
        tdsAmount: { type: Number, required: true, min: 0 },
        paymentDate: { type: Date, required: true },
        financialYear: { type: String, trim: true, required: true },
        quarter: { type: String, enum: ['Q1', 'Q2', 'Q3', 'Q4'], required: true },
        isNonResident: { type: Boolean, default: false },
        challanId: { type: mongoose.Schema.Types.ObjectId, ref: 'TdsChallan', default: null },
        /** Part / full payments against challans (supports multiple challans per row). */
        challanAllocations: [
            {
                challanId: { type: mongoose.Schema.Types.ObjectId, ref: 'TdsChallan', required: true },
                amount: { type: Number, required: true, min: 0 },
            },
        ],
        notes: { type: String, trim: true, default: '' },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },
    { timestamps: true },
);

tdsDeductionSchema.index({ financialYear: 1, quarter: 1 });
tdsDeductionSchema.index({ supplierId: 1, financialYear: 1 });
tdsDeductionSchema.index({ challanId: 1 });
tdsDeductionSchema.index({ paymentEntryId: 1 }, { sparse: true });

export const TdsDeduction = mongoose.model('TdsDeduction', tdsDeductionSchema);
