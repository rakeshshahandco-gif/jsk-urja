import mongoose from 'mongoose';

const followupSchema = mongoose.Schema(
    {
        customerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Customer',
            required: true,
            unique: true, // One follow-up record per customer
        },
        nextCallDate: {
            type: Date,
            required: true,
        },
        nextCallTime: {
            type: String, // Format: "HH:MM" (24-hour)
        },
        whatToTalkNext: {
            type: String,
        },
        priority: {
            type: String,
            enum: ['high', 'medium', 'low'],
            default: 'medium',
        },
        reminderEnabled: {
            type: Boolean,
            default: false,
        },
        followUpType: {
            type: String,
            enum: ['CALL', 'WHATSAPP'],
            default: 'CALL',
            required: true,
        },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
        },
    },
    {
        timestamps: true,
    }
);

// Index for reminder queries
followupSchema.index({ nextCallDate: 1, reminderEnabled: 1 });

/**
 * @typedef Followup
 */
const Followup = mongoose.model('Followup', followupSchema);

export default Followup;
