import mongoose from 'mongoose';

const userHomePreferenceSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true
    },
    selectedCards: [{
        id: { type: String, required: true }, // Internal ID (e.g., 'customer-master')
        boxColor: { type: String, default: 'default' },
        textColor: { type: String, default: 'default' },
        iconColor: { type: String, default: 'theme' },
        orderNo: { type: Number, default: 0 }
    }]
}, { timestamps: true });

const UserHomePreference = mongoose.model('UserHomePreference', userHomePreferenceSchema);

export default UserHomePreference;
