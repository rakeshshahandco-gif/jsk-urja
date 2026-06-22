import mongoose from 'mongoose';
import { EMAIL_BULK_DEFAULT_SETTINGS } from '../constants/emailBulk.constants.js';

const emailBulkSettingsSchema = new mongoose.Schema(
    {
        companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
        ...Object.keys(EMAIL_BULK_DEFAULT_SETTINGS).reduce((acc, key) => {
            acc[key] = { type: mongoose.Schema.Types.Mixed };
            return acc;
        }, {}),
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },
    { timestamps: true },
);

emailBulkSettingsSchema.index({ companyId: 1 }, { unique: true });

const EmailBulkSettings = mongoose.model('EmailBulkSettings', emailBulkSettingsSchema);
export default EmailBulkSettings;
