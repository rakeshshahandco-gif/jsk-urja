import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    action: {
        type: String,
        required: true,
        enum: ['CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'EXPORT', 'PRINT', 'APPROVE', 'CANCEL', 'REOPEN', 'OTHER']
    },
    module: {
        type: String,
        required: true
    },
    resourceId: {
        type: mongoose.Schema.Types.ObjectId
    },
    description: {
        type: String
    },
    details: {
        type: Object // { old: {}, new: {} }
    },
    ipAddress: {
        type: String
    },
    userAgent: {
        type: String
    }
}, {
    timestamps: true
});

const AuditLog = mongoose.model('AuditLog', auditLogSchema);

export { AuditLog };
