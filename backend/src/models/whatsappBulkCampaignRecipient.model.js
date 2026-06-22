import mongoose from 'mongoose';
import { WHATSAPP_BULK_RECIPIENT_STATUSES } from '../constants/whatsappBulk.constants.js';

const whatsappBulkCampaignRecipientSchema = new mongoose.Schema(
    {
        companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
        campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'WhatsAppBulkCampaign', required: true, index: true },
        mobile: { type: String, required: true, trim: true },
        displayName: { type: String, trim: true, default: '' },
        sourceRef: { type: String, trim: true, default: '' },
        status: { type: String, enum: WHATSAPP_BULK_RECIPIENT_STATUSES, default: 'pending', index: true },
        errorMessage: { type: String, trim: true, default: '' },
        sentAt: { type: Date, default: null },
        attemptCount: { type: Number, default: 0 },
        whatsappMessageKey: {
            remoteJid: { type: String, default: '' },
            id: { type: String, default: '' },
            fromMe: { type: Boolean, default: true },
        },
        revokedAt: { type: Date, default: null },
    },
    { timestamps: true },
);

whatsappBulkCampaignRecipientSchema.index({ campaignId: 1, mobile: 1 }, { unique: true });
whatsappBulkCampaignRecipientSchema.index({ campaignId: 1, status: 1 });

const WhatsAppBulkCampaignRecipient = mongoose.model('WhatsAppBulkCampaignRecipient', whatsappBulkCampaignRecipientSchema);
export default WhatsAppBulkCampaignRecipient;
