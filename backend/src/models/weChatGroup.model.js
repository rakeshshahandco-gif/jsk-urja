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
    purpose: String,
    category: String, // e.g., "Supplier Group", "Technolgoy Group"
    
    // Searchable items
    productKeywords: [String],
    relatedItems: [String],
    relatedCompanies: [String],
    
    // Relationships
    memberIds: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'WeChatContact'
    }],
    
    // Attachments & Documentation
    attachments: [{
        filename: String,
        url: String,
        mimetype: String,
        size: Number,
        notes: String,
        type: { 
            type: String, 
            enum: ['Catalog', 'Price List', 'Screenshot', 'Manual', 'Other'],
            default: 'Other'
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
    productKeywords: 'text',
    relatedItems: 'text',
    relatedCompanies: 'text'
});

const WeChatGroup = mongoose.model('WeChatGroup', weChatGroupSchema);

export { WeChatGroup };
