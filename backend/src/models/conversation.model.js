import mongoose from 'mongoose';

const conversationSchema = mongoose.Schema(
    {
        customerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Customer',
            required: true,
        },
        conversationDate: {
            type: Date,
            required: true,
            default: Date.now,
        },
        mode: {
            type: String,
            enum: ['call', 'whatsapp', 'visit', 'email'],
            required: true,
        },
        discussionDetails: {
            type: String,
            required: true,
        },
        outcome: {
            type: String,
        },
        interestedProducts: {
            type: [String],
            default: [],
        },
        productNotes: {
            type: String,
            trim: true,
        },
        callDuration: {
            type: Number,
        },
        followUpStatus: {
            type: String,
            enum: [
                'Interested',
                'Follow-up Required',
                'Quotation Required',
                'Sample Required',
                'Sample Sent',
                'Sample Under Testing',
                'Negotiation',
                'Converted to Order',
                'Not Converted',
                'Lost',
                'Hold',
                'Project Postponed',
                'Customer Not Responding'
            ],
        },
        notConvertedDetails: {
            reason: String, // Fixed reason from dropdown
            matter: String, // Detailed matter / explanation
            offeredRate: Number,
            expectedRate: Number,
            competitorRate: Number,
            competitorName: String,
            requiredSpec: String,
            offeredSpec: String,
            issueDetails: String,
            expectedRequirementDate: Date,
            nextFollowUpDate: Date,
            assignedTo: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User'
            },
            remarks: String
        }
    },
    {
        timestamps: true,
    }
);

// Index for faster queries
conversationSchema.index({ customerId: 1, conversationDate: -1 });

/**
 * @typedef Conversation
 */
const Conversation = mongoose.model('Conversation', conversationSchema);

export default Conversation;
