import mongoose from 'mongoose';

const loginActivitySchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    loginTime: {
        type: Date,
        default: Date.now
    },
    logoutTime: {
        type: Date
    },
    ipAddress: {
        type: String
    },
    userAgent: {
        type: String
    },
    status: {
        type: String,
        enum: ['SUCCESS', 'FAILED', 'LOCKED'],
        default: 'SUCCESS'
    },
    failureReason: {
        type: String
    }
}, {
    timestamps: true
});

const LoginActivity = mongoose.model('LoginActivity', loginActivitySchema);

export { LoginActivity };
