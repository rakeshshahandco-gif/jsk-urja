import mongoose from 'mongoose';

const attachmentSchema = new mongoose.Schema({
    filename: String,
    url: String,
    mimetype: String,
    size: Number,
    type: {
        type: String,
        enum: ['Catalog', 'Price List', 'Screenshot', 'Spec Sheet', 'Image', 'Other'],
        default: 'Other'
    },
    notes: String,
    uploadDate: { type: Date, default: Date.now },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
});

const weChatProductSchema = new mongoose.Schema({
    // Link to supplier contact
    contactId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'WeChatContact',
        required: true,
        index: true
    },
    // Optional link to group (if discovered in a group)
    groupId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'WeChatGroup',
        default: null
    },

    // Product Identity
    productCategory: {
        type: String,
        trim: true,
        index: true
        // e.g. "Tuya", "Zigbee", "BLE", "DALI", "Driver", "SMPS", "Enclosure"
    },
    productName: {
        type: String,
        trim: true
    },
    partNumber: {
        type: String,
        trim: true,
        index: true
        // Primary part number e.g. "BT2S", "ZT25"
    },
    altPartNumbers: [String], // Alternate / old part codes

    // Technical Details
    brand: { type: String, trim: true },
    specification: { type: String, trim: true }, // Short technical description
    
    // Commercial Terms
    moq: { type: Number, default: 0 },
    leadTimeDays: { type: Number, default: 0 },
    currency: { type: String, default: 'RMB' },

    // Latest price snapshot (denormalized for quick display — full history in WeChatPriceRecord)
    latestPrice: { type: Number, default: null },
    latestPriceDate: { type: Date, default: null },

    // Status
    isActive: { type: Boolean, default: true },
    notes: { type: String },

    // Attachments (catalogue, spec sheet, product image)
    attachments: [attachmentSchema],

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, {
    timestamps: true
});

// Full-text search indexes
weChatProductSchema.index({
    productCategory: 'text',
    productName: 'text',
    partNumber: 'text',
    altPartNumbers: 'text',
    brand: 'text',
    specification: 'text'
});

const WeChatProduct = mongoose.model('WeChatProduct', weChatProductSchema);

export { WeChatProduct };
