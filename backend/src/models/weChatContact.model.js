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
    contactPersonName: String, // Individual name if company contact
    country: String,
    city: String,
    mobile: String,
    weChatId: String,
    email: String,
    region: String,        // e.g. Shenzhen, Guangdong, Dongguan
    channelName: String,   // e.g. Alibaba, 1688, Direct, WeChat Group
    productKeywords: [String],
    relatedItems: [String],
    businessCategory: String,
    supplierType: String,
    
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
            enum: ['Catalog', 'Price List', 'Screenshot', 'Manual', 'Other'],
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
    region: 'text',
    channelName: 'text'
});

const WeChatContact = mongoose.model('WeChatContact', weChatContactSchema);

export { WeChatContact };
