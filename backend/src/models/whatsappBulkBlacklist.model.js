import mongoose from 'mongoose';

const whatsappBulkBlacklistSchema = new mongoose.Schema(
    {
        companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
        mobile: { type: String, required: true, trim: true },
        reason: { type: String, trim: true, default: 'manual' },
        source: { type: String, enum: ['manual', 'unsubscribe', 'do_not_send'], default: 'manual' },
        notes: { type: String, trim: true, default: '' },
        isActive: { type: Boolean, default: true },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },
    { timestamps: true },
);

whatsappBulkBlacklistSchema.index({ companyId: 1, mobile: 1 }, { unique: true });

const WhatsAppBulkBlacklist = mongoose.model('WhatsAppBulkBlacklist', whatsappBulkBlacklistSchema);
export default WhatsAppBulkBlacklist;
