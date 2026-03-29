import mongoose from 'mongoose';

const msgUnreadSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        thread: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'MsgThread',
            required: true,
        },
        count: {
            type: Number,
            default: 0,
            min: 0,
        },
    },
    { timestamps: true }
);

// Unique constraint: one record per user per thread
msgUnreadSchema.index({ user: 1, thread: 1 }, { unique: true });
// Quickly sum all unread for a user
msgUnreadSchema.index({ user: 1, count: 1 });

const MsgUnread = mongoose.model('MsgUnread', msgUnreadSchema);
export default MsgUnread;
