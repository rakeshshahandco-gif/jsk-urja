import mongoose from 'mongoose';

const testHistorySchema = new mongoose.Schema({
    testDate: { type: Date, default: Date.now },
    testedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    parametersChecked: String,
    result: String,
    status: { type: String, enum: ['Pass', 'Fail'], default: 'Pass' },
    issueFound: String,
    suggestedChange: String,
    finalRemark: String
});

const rdSampleSchema = new mongoose.Schema({
    entryNo: {
        type: String,
        required: true,
        unique: true
    },
    entryDate: {
        type: Date,
        default: Date.now
    },
    project: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'RdSampleProject',
        required: true
    },
    sampleType: {
        type: String,
        trim: true
    },
    itemName: {
        type: String,
        required: [true, 'Item Name is required'],
        trim: true
    },
    itemDescription: {
        type: String,
        trim: true
    },
    internalSampleCode: {
        type: String,
        trim: true
    },
    supplierName: {
        type: String,
        required: true,
        trim: true
    },
    supplierCountry: {
        type: String,
        enum: ['India', 'China', 'Other'],
        default: 'India'
    },
    supplierContactPerson: String,
    supplierMobile: String,
    supplierWeChat: String,
    supplierWhatsApp: String,
    supplierEmail: String,
    purchaseSource: {
        type: String,
        enum: ['Local', 'Import', 'Agent', 'Online', 'Exhibition', 'Existing Vendor', 'Other'],
        default: 'Local'
    },
    manufacturerName: String,
    brand: String,
    partNumber: String,
    technicalSpec: String,
    quantity: { type: Number, default: 1 },
    uom: String,
    unitRate: { type: Number, default: 0 },
    currency: { type: String, default: 'INR' },
    exchangeRate: { type: Number, default: 1 },
    totalAmount: { type: Number, default: 0 },
    freight: { type: Number, default: 0 },
    landedCost: { type: Number, default: 0 },
    receiptDate: Date,
    usedFor: String,
    testStatus: {
        type: String,
        enum: [
            'Pending', 
            'Sample Sent',
            'Under Testing', 
            'Approved', 
            'Rejected', 
            'Alternative', 
            'Final Selected',
            'Negotiation',
            'Converted to Order',
            'Not Converted',
            'Hold'
        ],
        default: 'Pending'
    },
    notConvertedDetails: {
        reason: String,
        matter: String,
        remarks: String
    },
    testResultSummary: String,
    finalSelectionStatus: {
        type: String,
        enum: ['Not Selected', 'Waitlist', 'Backup', 'Final Selected'],
        default: 'Not Selected'
    },
    notes: String,
    attachments: [{
        filename: String,
        url: String,
        mimetype: String,
        size: Number,
        uploadDate: { type: Date, default: Date.now }
    }],
    testHistory: [testHistorySchema],
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, {
    timestamps: true
});

const RdSample = mongoose.model('RdSample', rdSampleSchema);

export { RdSample };
