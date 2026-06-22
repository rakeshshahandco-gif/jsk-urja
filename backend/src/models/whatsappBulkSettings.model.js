import mongoose from 'mongoose';
import { WHATSAPP_BULK_DEFAULT_SETTINGS } from '../constants/whatsappBulk.constants.js';

const whatsappBulkSettingsSchema = new mongoose.Schema(
    {
        companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
        ...Object.keys(WHATSAPP_BULK_DEFAULT_SETTINGS).reduce((acc, key) => {
            acc[key] = { type: mongoose.Schema.Types.Mixed };
            return acc;
        }, {}),
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },
    { timestamps: true },
);

whatsappBulkSettingsSchema.index({ companyId: 1 }, { unique: true });

const WhatsAppBulkSettings = mongoose.model('WhatsAppBulkSettings', whatsappBulkSettingsSchema);
export default WhatsAppBulkSettings;
