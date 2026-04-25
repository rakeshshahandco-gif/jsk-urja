import mongoose from 'mongoose';

const attachmentSchema = new mongoose.Schema({
    filename: String,
    url: String,
    mimetype: String,
    size: Number,
    type: {
        type: String,
        enum: ['Invoice', 'Courier Slip', 'Sample Photo', 'Test Report', 'Other'],
        default: 'Other'
    },
    notes: String,
    uploadDate: { type: Date, default: Date.now },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
});

const weChatSampleSchema = new mongoose.Schema({
    productId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'WeChatProduct',
        required: true,
        index: true
    },
    contactId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'WeChatContact',
        required: true,
        index: true
    },
    groupId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'WeChatGroup',
        default: null
    },
    
    // Sample Details
    orderedDate: { type: Date, required: true, default: Date.now },
    quantity: { type: Number, required: true, default: 1 },
    samplePrice: { type: Number, default: 0 },
    currency: { type: String, default: 'RMB' },
    
    // Logistics
    courierName: { type: String, trim: true },
    trackingNumber: { type: String, trim: true },
    receivedDate: { type: Date },
    
    // Testing & Decision
    testingStatus: {
        type: String,
        enum: ['Pending', 'Under Testing', 'Approved', 'Failed', 'Hold'],
        default: 'Pending'
    },
    testRemarks: { type: String, trim: true },
    finalDecision: { type: String, trim: true },
    
    attachments: [attachmentSchema],
    
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, {
    timestamps: true
});

// Indexes for fast searching
weChatSampleSchema.index({ testingStatus: 1 });
weChatSampleSchema.index({ trackingNumber: 'text', courierName: 'text' });

const WeChatSample = mongoose.model('WeChatSample', weChatSampleSchema);

export { WeChatSample };
