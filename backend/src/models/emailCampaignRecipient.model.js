import mongoose from 'mongoose';
import { EMAIL_BULK_RECIPIENT_STATUSES } from '../constants/emailBulk.constants.js';

const emailCampaignRecipientSchema = new mongoose.Schema(
    {
        companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
        campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'EmailCampaign', required: true, index: true },
        email: { type: String, required: true, trim: true, lowercase: true },
        displayName: { type: String, trim: true, default: '' },
        sourceRef: { type: String, trim: true, default: '' },
        status: { type: String, enum: EMAIL_BULK_RECIPIENT_STATUSES, default: 'pending', index: true },
        errorMessage: { type: String, trim: true, default: '' },
        sentAt: { type: Date, default: null },
        attemptCount: { type: Number, default: 0 },
    },
    { timestamps: true },
);

emailCampaignRecipientSchema.index({ campaignId: 1, email: 1 }, { unique: true });
emailCampaignRecipientSchema.index({ campaignId: 1, status: 1 });

const EmailCampaignRecipient = mongoose.model('EmailCampaignRecipient', emailCampaignRecipientSchema);
export default EmailCampaignRecipient;
