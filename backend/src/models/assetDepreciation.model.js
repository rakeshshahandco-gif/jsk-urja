import mongoose from 'mongoose';

const assetDepreciationSchema = new mongoose.Schema({
    runDate: { type: Date, required: true, default: Date.now },
    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },
    totalAmount: { type: Number, required: true },
    entries: [{
        asset: { type: mongoose.Schema.Types.ObjectId, ref: 'FixedAsset' },
        amount: { type: Number, required: true },
        openingBookValue: { type: Number, required: true },
        closingBookValue: { type: Number, required: true }
    }],
    isPosted: { type: Boolean, default: false },
    linkedVoucher: { type: mongoose.Schema.Types.ObjectId, ref: 'Voucher' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

const AssetDepreciation = mongoose.model('AssetDepreciation', assetDepreciationSchema);
export { AssetDepreciation };
