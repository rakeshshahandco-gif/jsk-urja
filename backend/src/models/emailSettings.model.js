import mongoose from 'mongoose';
import { EMAIL_PROVIDERS } from '../constants/emailProvider.constants.js';

const emailSettingsSchema = new mongoose.Schema(
    {
        companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
        provider: { type: String, enum: EMAIL_PROVIDERS, default: 'gmail' },
        smtpHost: { type: String, trim: true, default: '' },
        smtpPort: { type: Number, default: 587 },
        smtpSecure: { type: Boolean, default: false },
        authUser: { type: String, trim: true, default: '' },
        authPassEncrypted: { type: String, default: '' },
        fromEmail: { type: String, trim: true, lowercase: true, default: '' },
        senderName: { type: String, trim: true, default: '' },
        replyTo: { type: String, trim: true, lowercase: true, default: '' },
        isVerified: { type: Boolean, default: false },
        lastTestedAt: { type: Date, default: null },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },
    { timestamps: true },
);

emailSettingsSchema.index({ companyId: 1 }, { unique: true });

const EmailSettings = mongoose.model('EmailSettings', emailSettingsSchema);
export default EmailSettings;
