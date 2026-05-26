import mongoose from 'mongoose';

const tdsReturnSchema = new mongoose.Schema(
    {
        returnType: { type: String, enum: ['24Q', '26Q', '27Q'], required: true },
        financialYear: { type: String, trim: true, required: true },
        /** Assessment year aligned with FY (e.g. FY 2026-2027 → 2027-2028). */
        assessmentYear: { type: String, trim: true, default: '' },
        quarter: { type: String, enum: ['Q1', 'Q2', 'Q3', 'Q4'], required: true },
        status: {
            type: String,
            enum: ['draft', 'validated', 'exported'],
            default: 'draft',
        },
        deductionIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'TdsDeduction' }],
        validationErrors: [{ type: String }],
        exportCsv: { type: String, default: '' },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },
    { timestamps: true },
);

tdsReturnSchema.index({ returnType: 1, financialYear: 1, quarter: 1, createdAt: -1 });

export const TdsReturn = mongoose.model('TdsReturn', tdsReturnSchema);
