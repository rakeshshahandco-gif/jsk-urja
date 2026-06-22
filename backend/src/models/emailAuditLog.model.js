import mongoose from 'mongoose';

const emailAuditLogSchema = new mongoose.Schema(
    {
        companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
        campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'EmailCampaign', default: null },
        action: { type: String, required: true, trim: true },
        details: { type: mongoose.Schema.Types.Mixed, default: {} },
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    },
    { timestamps: true },
);

emailAuditLogSchema.index({ companyId: 1, createdAt: -1 });

const EmailAuditLog = mongoose.model('EmailAuditLog', emailAuditLogSchema);
export default EmailAuditLog;
