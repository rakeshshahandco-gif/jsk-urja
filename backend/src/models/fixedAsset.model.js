import mongoose from 'mongoose';

const fixedAssetSchema = new mongoose.Schema({
    // Basic Details
    assetCode: { type: String, required: true, unique: true, uppercase: true, trim: true },
    assetName: { type: String, required: true, trim: true },
    assetShortName: { type: String, trim: true, default: '' },
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'AssetCategory', required: true },
    assetDescription: { type: String, trim: true, default: '' },
    brand: { type: String, trim: true, default: '' },
    modelNo: { type: String, trim: true, default: '' },
    serialNo: { type: String, trim: true, default: '' },
    identificationNo: { type: String, trim: true, default: '' },
    barcodeNo: { type: String, trim: true, default: '' },
    manufacturerName: { type: String, trim: true, default: '' },

    // Tracking & Quantity
    trackingType: {
        type: String,
        enum: ['Individual Asset Tracking', 'Quantity Based Tracking'],
        default: 'Individual Asset Tracking'
    },
    quantity: { type: Number, default: 1 },

    // Purchase & Financial Details
    supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier' },
    purchaseInvoiceNo: { type: String, trim: true, default: '' },
    purchaseInvoiceDate: { type: Date },
    purchaseDate: { type: Date, required: true },
    installationDate: { type: Date },
    putToUseDate: { type: Date },

    purchaseValue: { type: Number, default: 0 },
    gstAmount: { type: Number, default: 0 },
    freightCharges: { type: Number, default: 0 },
    installationCharges: { type: Number, default: 0 },
    otherCharges: { type: Number, default: 0 },
    capitalizedCost: { type: Number, required: true }, // Total cost including extras

    // Depreciation Details
    depreciationApplicable: { type: Boolean, default: true },
    depreciationMethod: {
        type: String,
        enum: ['Straight Line Method', 'Written Down Value', 'None'],
        default: 'Straight Line Method'
    },
    depreciationRate: { type: Number, default: 0 },
    usefulLife: { type: Number, default: 0 },
    residualValue: { type: Number, default: 0 },
    currentBookValue: { type: Number, required: true },
    accumulatedDepreciation: { type: Number, default: 0 },
    lastDepreciationDate: { type: Date },

    // Location & Responsibility
    location: { type: mongoose.Schema.Types.ObjectId, ref: 'AssetLocation' },
    department: { type: String, trim: true, default: '' },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    custodian: { type: String, trim: true, default: '' },

    // Condition & Status
    status: {
        type: String,
        enum: ['In Use', 'In Store', 'Under Repair', 'Under Maintenance', 'Idle', 'Disposed', 'Sold', 'Scrapped'],
        default: 'In Use'
    },
    condition: {
        type: String,
        enum: ['New', 'Good', 'Average', 'Damaged', 'Not Working'],
        default: 'Good'
    },

    // Warranty & AMC
    warrantyAvailable: { type: Boolean, default: false },
    warrantyStartDate: { type: Date },
    warrantyEndDate: { type: Date },
    amcAvailable: { type: Boolean, default: false },
    amcStartDate: { type: Date },
    amcEndDate: { type: Date },
    insuranceAvailable: { type: Boolean, default: false },
    insurancePolicyNo: { type: String, trim: true, default: '' },
    insuranceEndDate: { type: Date },

    // Photos & Documents (URLs)
    photoUrl: { type: String, default: '' },
    invoiceCopyUrl: { type: String, default: '' },
    documentUrls: [{ type: String }],

    isActive: { type: Boolean, default: true },
    remarks: { type: String, trim: true, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

fixedAssetSchema.index({ assetName: 'text', assetCode: 'text', serialNo: 'text' });

const FixedAsset = mongoose.model('FixedAsset', fixedAssetSchema);
export { FixedAsset };
