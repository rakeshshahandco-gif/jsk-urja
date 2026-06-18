import mongoose from 'mongoose';
import { DEFAULT_SUNDRY_DEBTOR_SETTINGS } from '../constants/sundryDebtorSettings.defaults.js';

const sundryDebtorSettingsSchema = new mongoose.Schema(
    {
        companyId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Company',
            required: true,
            unique: true,
        },
        ...Object.fromEntries(
            Object.keys(DEFAULT_SUNDRY_DEBTOR_SETTINGS).map((key) => [key, { type: Boolean, default: false }]),
        ),
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },
    { timestamps: true, disableTenant: true },
);

sundryDebtorSettingsSchema.index({ companyId: 1 }, { unique: true });

export const SundryDebtorSettings = mongoose.model('SundryDebtorSettings', sundryDebtorSettingsSchema);
export default SundryDebtorSettings;
