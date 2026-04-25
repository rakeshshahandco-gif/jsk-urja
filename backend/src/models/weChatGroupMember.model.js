import mongoose from 'mongoose';

const weChatGroupMemberSchema = new mongoose.Schema({
    contactId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'WeChatContact',
        required: true,
        index: true
    },
    groupId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'WeChatGroup',
        required: true,
        index: true
    },
    roleInGroup: {
        type: String,
        enum: ['Owner', 'Admin', 'Sales', 'Technical', 'General Member', 'Unknown'],
        default: 'General Member'
    },
    isMainDealingPerson: {
        type: Boolean,
        default: false
    },
    remarks: {
        type: String,
        trim: true
    },
    addedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, {
    timestamps: true
});

// Ensure a contact is not duplicated in the same group
weChatGroupMemberSchema.index({ contactId: 1, groupId: 1 }, { unique: true });

const WeChatGroupMember = mongoose.model('WeChatGroupMember', weChatGroupMemberSchema);

export { WeChatGroupMember };
