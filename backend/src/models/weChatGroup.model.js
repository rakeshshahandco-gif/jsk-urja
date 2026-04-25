import mongoose from 'mongoose';

const weChatGroupNoteSchema = new mongoose.Schema({
    date: { type: Date, default: Date.now },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    note: { type: String, required: true },
    nextAction: String,
    reminderDate: Date
});

const weChatGroupSchema = new mongoose.Schema({
    entryNo: {
        type: String,
        required: true,
        unique: true
    },
    groupName: {
        type: String,
        required: [true, 'Group Name is required'],
        trim: true
    },
    groupAlias: {
        type: String, // English name
        trim: true
    },
    chineseGroupName: {
        type: String,
        trim: true
    },
    groupCreatedBy: String,
    purpose: String,
    category: String,
    groupSource: {
        type: String,
        enum: ['WeChat', 'Other'],
        default: 'WeChat'
    },
    remarks: String,
    
    // Relationships
    // Note: Members are mapped using WeChatGroupMember join collection for role management
    
    // Attachments & Documentation
    attachments: [{
        filename: String,
        url: String,
        mimetype: String,
        size: Number,
        notes: String,
        type: { 
            type: String, 
            enum: ['Group Screenshot', 'Other'],
            default: 'Group Screenshot'
        },
        uploadDate: { type: Date, default: Date.now },
        uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
    }],
    
    notes: String,
    notesHistory: [weChatGroupNoteSchema],
    
    isActive: {
        type: Boolean,
        default: true
    },
    isFavorite: {
        type: Boolean,
        default: false
    },
    
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, {
    timestamps: true
});

// Indexing for search
weChatGroupSchema.index({ 
    groupName: 'text', 
    groupAlias: 'text', 
    chineseGroupName: 'text', 
    purpose: 'text',
    remarks: 'text'
});

const WeChatGroup = mongoose.model('WeChatGroup', weChatGroupSchema);

export { WeChatGroup };
