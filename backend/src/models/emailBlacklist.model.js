import mongoose from 'mongoose';

const emailBlacklistSchema = new mongoose.Schema(
    {
        companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
        email: { type: String, required: true, trim: true, lowercase: true },
        reason: { type: String, trim: true, default: 'manual' },
        source: { type: String, enum: ['manual', 'unsubscribe', 'do_not_send', 'bounce'], default: 'manual' },
        notes: { type: String, trim: true, default: '' },
        isActive: { type: Boolean, default: true },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },
    { timestamps: true },
);

emailBlacklistSchema.index({ companyId: 1, email: 1 }, { unique: true });

const EmailBlacklist = mongoose.model('EmailBlacklist', emailBlacklistSchema);
export default EmailBlacklist;
