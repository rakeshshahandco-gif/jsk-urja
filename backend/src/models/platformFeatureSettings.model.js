import mongoose from 'mongoose';

/** Singleton platform-wide defaults (common for all companies). */
const platformFeatureSettingsSchema = new mongoose.Schema(
    {
        key: { type: String, default: 'global', unique: true },
        settings: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },
    { timestamps: true, disableTenant: true },
);

export const PlatformFeatureSettings = mongoose.model('PlatformFeatureSettings', platformFeatureSettingsSchema);
