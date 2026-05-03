import mongoose from 'mongoose';

const userHomePreferenceSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    moduleName: {
        type: String,
        required: true,
        default: 'dashboard'
    },
    selectedCards: [{
        id: { type: String, required: true }, // Internal ID (e.g., 'customer-master')
        boxColor: { type: String, default: 'default' },
        textColor: { type: String, default: 'default' },
        iconColor: { type: String, default: 'theme' },
        orderNo: { type: Number, default: 0 },
        customBg: { type: String, default: '' },
        customText: { type: String, default: '' }
    }]
}, { timestamps: true });

// Compound unique index for user and module
userHomePreferenceSchema.index({ userId: 1, moduleName: 1 }, { unique: true });

const UserHomePreference = mongoose.model('UserHomePreference', userHomePreferenceSchema);

export default UserHomePreference;
