import mongoose from 'mongoose';

/** Singleton system security settings */
const securitySettingsSchema = new mongoose.Schema(
    {
        singletonKey: { type: String, default: 'default', unique: true },
        sessionTimeoutMinutes: { type: Number, default: 480 },
        maxFailedLogins: { type: Number, default: 5 },
        lockoutMinutes: { type: Number, default: 30 },
        requirePasswordChangeDays: { type: Number, default: 90 },
        enforceCompanyRestriction: { type: Boolean, default: true },
        defaultPostingMode: { type: String, enum: ['provisional', 'final'], default: 'provisional' },
        enableFieldPermissions: { type: Boolean, default: true },
        enableApprovalWorkflow: { type: Boolean, default: true },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },
    { timestamps: true, disableTenant: true },
);

export const SecuritySettings = mongoose.model('SecuritySettings', securitySettingsSchema);
