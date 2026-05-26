import mongoose from 'mongoose';

const costingSettingsSchema = new mongoose.Schema(
    {
        /** GP % below this triggers warning (default 0 = negative GP only) */
        negativeGpThresholdPercent: { type: Number, default: 0 },
        /** High margin report cutoff % */
        highMarginThresholdPercent: { type: Number, default: 25 },
        /** Low margin report cutoff % */
        lowMarginThresholdPercent: { type: Number, default: 10 },
    },
    { timestamps: true },
);

export const CostingSettings = mongoose.model('CostingSettings', costingSettingsSchema);
