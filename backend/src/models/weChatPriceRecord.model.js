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
    currency: { 
        type: String, 
        enum: ['RMB', 'USD', 'INR', 'Other'],
        default: 'RMB' 
    },
    moq: { type: Number, default: 0 },
    samplePrice: { type: Number, default: 0 },
    bulkPrice: { type: Number, default: 0 },
    priceValidityDate: { type: Date },
    leadTimeDays: { type: Number, default: 0 },
    paymentTerms: { type: String, trim: true },
    shippingTerms: { type: String, trim: true },
    warrantyNotes: { type: String, trim: true },
    technicalRemarks: { type: String, trim: true },

    // Meta
    source: {
        type: String,
        enum: ['group_chat', 'individual_chat', 'manual', 'quotation_file'],
        default: 'manual'
    },
    status: {
        type: String,
        enum: ['Best Price', 'Negotiation', 'Sample Ordered', 'Rejected', 'Approved Supplier', 'Pending'],
        default: 'Pending'
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
