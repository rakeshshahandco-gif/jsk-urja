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
    // This is now a standalone master product, not tied to a single contact
    // Products have many suppliers, managed via WeChatPriceRecord
    
    // Product Identity
    productName: {
        type: String,
        trim: true,
        required: true
    },
    productCode: {
        type: String,
        trim: true,
        index: true
    },
    chineseProductName: {
        type: String,
        trim: true
    },
    category: {
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
    description: { type: String, trim: true },
    technicalSpec: { type: String, trim: true },
    application: { type: String, trim: true },
    
    // Status
    status: {
        type: String,
        enum: ['New', 'Under R&D', 'Sample Ordered', 'Approved', 'Rejected', 'Regular Purchase', 'Discontinued'],
        default: 'New'
    },

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
    category: 'text',
    productName: 'text',
    productCode: 'text',
    chineseProductName: 'text',
    partNumber: 'text',
    altPartNumbers: 'text',
    description: 'text',
    technicalSpec: 'text',
    application: 'text'
});

const WeChatProduct = mongoose.model('WeChatProduct', weChatProductSchema);

export { WeChatProduct };
