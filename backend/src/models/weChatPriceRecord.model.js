import mongoose from 'mongoose';

const attachmentSchema = new mongoose.Schema({
    filename: String,
    url: String,
    mimetype: String,
    size: Number,
    type: {
        type: String,
        enum: ['Quotation', 'Price List', 'Screenshot', 'Other'],
        default: 'Other'
    },
    notes: String,
    uploadDate: { type: Date, default: Date.now }
});

const weChatPriceRecordSchema = new mongoose.Schema({
    // Primary links
    contactId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'WeChatContact',
        required: true,
        index: true
    },
    productId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'WeChatProduct',
        required: true,
        index: true
    },
    groupId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'WeChatGroup',
        default: null
    },

    // Denormalized fields for fast search without joins
    partNumber: { type: String, trim: true, index: true },
    productCategory: { type: String, trim: true },
    productName: { type: String, trim: true },

    // Price Details
    price: { type: Number, required: true },
    currency: { type: String, default: 'RMB' },
    moq: { type: Number, default: 0 },
    leadTimeDays: { type: Number, default: 0 },

    // Meta
    source: {
        type: String,
        enum: ['group_chat', 'individual_chat', 'manual', 'quotation_file'],
        default: 'manual'
    },
    quotationDate: { type: Date, default: Date.now },
    remarks: { type: String },

    // Supporting documents
    attachments: [attachmentSchema],

    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, {
    timestamps: true
});

// Compound index for fast comparison queries
weChatPriceRecordSchema.index({ partNumber: 1, quotationDate: -1 });
weChatPriceRecordSchema.index({ contactId: 1, productId: 1, quotationDate: -1 });

const WeChatPriceRecord = mongoose.model('WeChatPriceRecord', weChatPriceRecordSchema);

export { WeChatPriceRecord };
