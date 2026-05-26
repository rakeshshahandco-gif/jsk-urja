import mongoose from 'mongoose';
import { DEFAULT_COMPANY_FEATURE_SETTINGS } from '../constants/companyFeatureSettings.defaults.js';

const companyFeatureSettingsSchema = new mongoose.Schema(
    {
        companyId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Company',
            required: true,
            unique: true,
        },
        settings: {
            type: mongoose.Schema.Types.Mixed,
            default: () => ({ ...DEFAULT_COMPANY_FEATURE_SETTINGS }),
        },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },
    { timestamps: true, disableTenant: true },
);

companyFeatureSettingsSchema.index({ companyId: 1 }, { unique: true });

export const CompanyFeatureSettings = mongoose.model('CompanyFeatureSettings', companyFeatureSettingsSchema);
