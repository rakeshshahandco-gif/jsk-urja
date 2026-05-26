import mongoose from 'mongoose';

/**
 * Stores per-user UI customization preferences (theme, colors, density, etc).
 * The `preferences` blob is intentionally Mixed so future phases can add keys
 * (sidebar colors, header style, dashboard theme, etc.) without schema migration.
 * Frontend defines default shape; missing keys fall back to defaults client-side.
 *
 * Independent of company / tenant: a user's personal UI choices are theirs alone
 * and follow them across every company they have access to.
 */
const userUiPreferencesSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            unique: true,
        },
        preferences: {
            type: mongoose.Schema.Types.Mixed,
            default: () => ({}),
        },
        updatedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
        },
    },
    { timestamps: true },
);

userUiPreferencesSchema.index({ userId: 1 }, { unique: true });

const UserUiPreferences = mongoose.model('UserUiPreferences', userUiPreferencesSchema);

export default UserUiPreferences;
