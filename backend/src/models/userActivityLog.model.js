import mongoose from 'mongoose';

const ACTIONS = [
    'login', 'logout', 'create', 'update', 'delete',
    'view', 'export', 'import', 'backup', 'restore',
    'impersonate', 'permission_change',
];

const userActivityLogSchema = new mongoose.Schema(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
        companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null, index: true },
        username: { type: String, default: '' },
        action: { type: String, enum: ACTIONS, required: true },
        module: { type: String, trim: true, default: '' },
        entityType: { type: String, trim: true, default: '' },
        entityId: { type: mongoose.Schema.Types.ObjectId, default: null },
        description: { type: String, trim: true, default: '' },
        ipAddress: { type: String, trim: true, default: '' },
        userAgent: { type: String, trim: true, default: '' },
        success: { type: Boolean, default: true },
        meta: { type: Object, default: {} },
    },
    { timestamps: true, disableTenant: true },
);

userActivityLogSchema.index({ userId: 1, createdAt: -1 });
userActivityLogSchema.index({ companyId: 1, createdAt: -1 });
userActivityLogSchema.index({ action: 1, createdAt: -1 });

export const UserActivityLog = mongoose.model('UserActivityLog', userActivityLogSchema);
export { ACTIONS };
