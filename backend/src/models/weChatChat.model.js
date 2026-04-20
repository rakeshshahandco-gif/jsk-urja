import mongoose from 'mongoose';

const attachmentSchema = new mongoose.Schema({
    filename: String,
    url: String,
    mimetype: String,
    size: Number,
    type: {
        type: String,
        enum: ['Screenshot', 'Quotation', 'Catalog', 'Image', 'Other'],
        default: 'Other'
    },
    notes: String,
    uploadDate: { type: Date, default: Date.now }
});

const weChatChatSchema = new mongoose.Schema({
    // Primary link — always required
    contactId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'WeChatContact',
        required: true,
        index: true
    },

    // Optional product/group context links
    groupId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'WeChatGroup',
        default: null
    },
    productId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'WeChatProduct',
        default: null
    },

    // Denormalized for search (avoids expensive joins on every search)
    partNumber: { type: String, trim: true, index: true },
    productCategory: { type: String, trim: true },

    // Chat / Note Content
    chatDate: { type: Date, default: Date.now, index: true },
    direction: {
        type: String,
        enum: ['outgoing', 'incoming', 'note'],
        default: 'note'
    },
    source: {
        type: String,
        enum: ['individual', 'group', 'manual'],
        default: 'manual'
    },

    // The actual message/note content
    message: {
        type: String,
        required: [true, 'Message/note content is required'],
        trim: true
    },

    // Categorization tag for filtering
    tag: {
        type: String,
        enum: ['Price', 'MOQ', 'Sample', 'Delivery', 'Technical', 'Complaint', 'New Development', 'General'],
        default: 'General'
    },

    // Supporting screenshots / files
    attachments: [attachmentSchema],

    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, {
    timestamps: true
});

// Text search on message content and denormalized fields
weChatChatSchema.index({
    message: 'text',
    partNumber: 'text',
    productCategory: 'text'
});

// Compound index for timeline retrieval
weChatChatSchema.index({ contactId: 1, chatDate: -1 });
weChatChatSchema.index({ productId: 1, chatDate: -1 });

const WeChatChat = mongoose.model('WeChatChat', weChatChatSchema);

export { WeChatChat };
