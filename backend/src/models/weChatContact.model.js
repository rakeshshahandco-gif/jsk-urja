import mongoose from 'mongoose';

const weChatNoteSchema = new mongoose.Schema({
    date: { type: Date, default: Date.now },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    note: { type: String, required: true },
    nextAction: String,
    reminderDate: Date
});

const weChatContactSchema = new mongoose.Schema({
    entryNo: {
        type: String,
        required: true,
        unique: true
    },
    contactType: {
        type: String,
        enum: [
            'Individual', 'Company', 'Supplier', 'Manufacturer', 
            'Technical Contact', 'Sales Contact', 'Agent', 
            'Service Contact', 'Group Member', 'Other'
        ],
        default: 'Individual'
    },
    weChatDisplayName: {
        type: String,
        required: [true, 'WeChat Display Name is required'],
        trim: true
    },
    englishName: {
        type: String,
        trim: true
    },
    chineseName: {
        type: String,
        trim: true
    },
    searchName: {
        type: String,
        trim: true
    },
    searchKeywords: [String], // Changed to array for better multi-keyword support
    shortCode: {
        type: String,
        trim: true
    },
    companyName: {
        type: String,
        trim: true
    },
    contactPersonName: String,
    country: String,
    city: String,
    mobile: String,
    whatsapp: String,
    weChatId: String,
    email: String,
    role: {
        type: String,
        enum: ['Owner', 'Sales', 'Technical', 'Export', 'Unknown', 'Other'],
        default: 'Unknown'
    },
    communicationLanguage: {
        type: String,
        enum: ['Chinese', 'English', 'Other'],
        default: 'Chinese'
    },
    source: {
        type: String,
        enum: ['WeChat', 'Alibaba', 'Made-in-China', 'Reference', 'Exhibition', 'Other'],
        default: 'Other'
    },
    remarks: String,
    
    // Relationships
    groupIds: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'WeChatGroup'
    }],

    notes: String,
    attachments: [{
        filename: String,
        url: String,
        mimetype: String,
        size: Number,
        type: { 
            type: String, 
            enum: ['Profile Screenshot', 'Business Card', 'Other'],
            default: 'Other'
        },
        uploadDate: { type: Date, default: Date.now }
    }],
    isActive: {
        type: Boolean,
        default: true
    },
    isFavorite: {
        type: Boolean,
        default: false
    },
    notesHistory: [weChatNoteSchema],
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, {
    timestamps: true
});

// Indexing for powerful search as requested
weChatContactSchema.index({ 
    weChatDisplayName: 'text', 
    englishName: 'text', 
    chineseName: 'text', 
    companyName: 'text',
    searchKeywords: 'text',
    shortCode: 'text',
    country: 'text',
    city: 'text',
    remarks: 'text'
});

const WeChatContact = mongoose.model('WeChatContact', weChatContactSchema);

export { WeChatContact };
