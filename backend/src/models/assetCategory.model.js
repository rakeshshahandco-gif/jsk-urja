import mongoose from 'mongoose';

const assetCategorySchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true, unique: true },
    parentGroup: { type: String, trim: true, default: '' },
    codePrefix: { type: String, required: true, trim: true, uppercase: true },
    depreciationApplicable: { type: Boolean, default: true },
    depreciationMethod: {
        type: String,
        enum: ['Straight Line Method', 'Written Down Value', 'None'],
        default: 'Straight Line Method'
    },
    depreciationRate: { type: Number, default: 0 },
    usefulLife: { type: Number, default: 0 }, // in years
    assetLedger: { type: mongoose.Schema.Types.ObjectId, ref: 'AccountLedger' },
    depreciationLedger: { type: mongoose.Schema.Types.ObjectId, ref: 'AccountLedger' },
    accumulatedDepreciationLedger: { type: mongoose.Schema.Types.ObjectId, ref: 'AccountLedger' },
    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

const AssetCategory = mongoose.model('AssetCategory', assetCategorySchema);
export { AssetCategory };
