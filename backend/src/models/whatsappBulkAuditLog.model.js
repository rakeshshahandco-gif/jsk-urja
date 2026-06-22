import mongoose from 'mongoose';

const whatsappBulkAuditLogSchema = new mongoose.Schema(
    {
        companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
        campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'WhatsAppBulkCampaign', default: null },
        action: { type: String, required: true, trim: true },
        details: { type: mongoose.Schema.Types.Mixed, default: {} },
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    },
    { timestamps: true },
);

whatsappBulkAuditLogSchema.index({ companyId: 1, createdAt: -1 });

const WhatsAppBulkAuditLog = mongoose.model('WhatsAppBulkAuditLog', whatsappBulkAuditLogSchema);
export default WhatsAppBulkAuditLog;
