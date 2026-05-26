import mongoose from 'mongoose';

const tdsForm16aSchema = new mongoose.Schema(
    {
        supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true },
        supplierName: { type: String, trim: true, default: '' },
        deducteePan: { type: String, trim: true, uppercase: true, required: true },
        financialYear: { type: String, trim: true, required: true },
        assessmentYear: { type: String, trim: true, default: '' },
        quarter: { type: String, enum: ['Q1', 'Q2', 'Q3', 'Q4'], required: true },
        totalAmountPaid: { type: Number, required: true, min: 0 },
        totalTdsDeducted: { type: Number, required: true, min: 0 },
        deductionIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'TdsDeduction' }],
        certificateNo: { type: String, trim: true, default: '' },
        issuedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },
    { timestamps: true },
);

tdsForm16aSchema.index(
    { supplierId: 1, financialYear: 1, quarter: 1, companyId: 1 },
    { unique: true },
);

export const TdsForm16a = mongoose.model('TdsForm16a', tdsForm16aSchema);
