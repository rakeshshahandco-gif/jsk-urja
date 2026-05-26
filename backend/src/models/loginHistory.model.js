import mongoose from 'mongoose';

const loginHistorySchema = new mongoose.Schema(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        username: { type: String, default: '' },
        success: { type: Boolean, default: true },
        ipAddress: { type: String, default: '' },
        userAgent: { type: String, default: '' },
        failureReason: { type: String, default: '' },
        logoutAt: { type: Date, default: null },
    },
    { timestamps: true, disableTenant: true },
);

loginHistorySchema.index({ userId: 1, createdAt: -1 });
loginHistorySchema.index({ success: 1, createdAt: -1 });

export const LoginHistory = mongoose.model('LoginHistory', loginHistorySchema);
