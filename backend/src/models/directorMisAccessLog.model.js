import mongoose from 'mongoose';

const directorMisAccessLogSchema = new mongoose.Schema(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        userName: { type: String, default: '' },
        userRole: { type: String, default: '' },
        financialYear: { type: String, default: '' },
        filters: { type: mongoose.Schema.Types.Mixed, default: {} },
        ipAddress: { type: String, default: '' },
    },
    { timestamps: true },
);

directorMisAccessLogSchema.index({ userId: 1, createdAt: -1 });
directorMisAccessLogSchema.index({ createdAt: -1 });

export const DirectorMisAccessLog = mongoose.model('DirectorMisAccessLog', directorMisAccessLogSchema);
