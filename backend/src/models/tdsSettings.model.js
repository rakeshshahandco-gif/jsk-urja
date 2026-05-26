import mongoose from 'mongoose';

/** Per-company TDS engine settings (admin-configurable). */
const tdsSettingsSchema = new mongoose.Schema(
    {
        tdsCalculationBasis: {
            type: String,
            enum: ['CurrentBill', 'Cumulative'],
            default: 'CurrentBill',
        },
        tdsPostingMode: {
            type: String,
            enum: ['AutoJV', 'InlineAdjustment'],
            default: 'AutoJV',
        },
        panAbsentRate: { type: Number, default: 20, min: 0, max: 100 },
        gstExcludedFromTdsBase: { type: Boolean, default: true },
    },
    { timestamps: true },
);

export const TdsSettings = mongoose.model('TdsSettings', tdsSettingsSchema);
