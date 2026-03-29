import mongoose from 'mongoose';

const msgThreadSchema = new mongoose.Schema(
    {
        type: {
            type: String,
            enum: ['direct', 'group', 'broadcast'],
            required: true,
        },
        name: {
            type: String,
            trim: true,
            default: '',
        },
        participants: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User',
            },
        ],
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        lastMessage: {
            content: { type: String, default: '' },
            sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
            timestamp: { type: Date, default: null },
        },
        isCompanyWide: {
            type: Boolean,
            default: false,
        },
        isPermanent: {
            type: Boolean,
            default: false,
        },
        avatar: {
            type: String, // URL to group image
            default: '',
        },
        isActive: {
            type: Boolean,
            default: true,
        },
    },
    { timestamps: true }
);

// Index to quickly find threads for a particular user
msgThreadSchema.index({ participants: 1, 'lastMessage.timestamp': -1 });
msgThreadSchema.index({ createdBy: 1, type: 1 });
msgThreadSchema.index({ isCompanyWide: 1 });

const MsgThread = mongoose.model('MsgThread', msgThreadSchema);
export default MsgThread;
