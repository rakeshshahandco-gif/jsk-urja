import mongoose from 'mongoose';

const communicationHistorySchema = new mongoose.Schema(
    {
        companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
        channel: { type: String, enum: ['email', 'whatsapp'], default: 'email', index: true },
        direction: { type: String, enum: ['outbound', 'inbound'], default: 'outbound' },
        recipientAddress: { type: String, trim: true, default: '' },
        recipientName: { type: String, trim: true, default: '' },
        subject: { type: String, trim: true, default: '' },
        bodyPreview: { type: String, trim: true, default: '' },
        status: { type: String, enum: ['sent', 'failed', 'pending', 'delivered', 'bounced'], default: 'sent' },
        campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'EmailCampaign', default: null },
        templateId: { type: mongoose.Schema.Types.ObjectId, ref: 'EmailTemplate', default: null },
        errorMessage: { type: String, trim: true, default: '' },
        metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
        sentBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        sentAt: { type: Date, default: Date.now },
    },
    { timestamps: true },
);

communicationHistorySchema.index({ companyId: 1, channel: 1, sentAt: -1 });
communicationHistorySchema.index({ companyId: 1, recipientAddress: 1 });

const CommunicationHistory = mongoose.model('CommunicationHistory', communicationHistorySchema);
export default CommunicationHistory;
