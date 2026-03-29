import mongoose from 'mongoose';

const msgMessageSchema = new mongoose.Schema(
    {
        threadId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'MsgThread',
            required: true,
        },
        sender: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        content: {
            type: String,
            required: [true, 'Message content cannot be empty'],
            trim: true,
        },
        replyTo: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'MsgMessage',
            default: null,
        },
        readBy: [
            {
                user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
                readAt: { type: Date, default: Date.now },
            },
        ],
        isDeleted: {
            type: Boolean,
            default: false,
        },
        deletedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null,
        },
        deletedAt: {
            type: Date,
            default: null,
        },
        editedAt: {
            type: Date,
            default: null,
        },
        attachments: [
            {
                type: { type: String, enum: ['image', 'video', 'audio', 'document'] },
                url: { type: String, required: true },
                filename: { type: String },
                size: { type: Number },
                mimeType: { type: String },
            },
        ],
        // Reserved for future meta (e.g. image dimensions, typing status)
        meta: {
            type: mongoose.Schema.Types.Mixed,
            default: {},
        },
    },
    { timestamps: true }
);

// Efficient pagination: get messages for a thread ordered by time
msgMessageSchema.index({ threadId: 1, createdAt: 1 });
// For the soft-delete filter
msgMessageSchema.index({ threadId: 1, isDeleted: 1, createdAt: 1 });
// For attachment queries
msgMessageSchema.index({ threadId: 1, 'attachments.type': 1 });

const MsgMessage = mongoose.model('MsgMessage', msgMessageSchema);
export default MsgMessage;
