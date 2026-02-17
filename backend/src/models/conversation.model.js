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
