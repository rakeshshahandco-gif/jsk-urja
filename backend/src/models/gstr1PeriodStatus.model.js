import mongoose from 'mongoose';

/**
 * GSTR-1 period filing status — used to decide invoice overwrite vs amendment.
 * Does not alter filed portal data; CRM tracking only.
 */
const gstr1PeriodStatusSchema = new mongoose.Schema(
    {
        companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
        returnPeriod: { type: String, required: true, trim: true }, // YYYY-MM
        financialYear: { type: String, default: '', trim: true },
        status: {
            type: String,
            enum: ['Open', 'Filed'],
            default: 'Open',
        },
        filedAt: { type: Date, default: null },
        filedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        remarks: { type: String, default: '' },
    },
    { timestamps: true }
);

gstr1PeriodStatusSchema.index({ companyId: 1, returnPeriod: 1 }, { unique: true });

export const Gstr1PeriodStatus = mongoose.model('Gstr1PeriodStatus', gstr1PeriodStatusSchema);
