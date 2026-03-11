import mongoose from 'mongoose';

const assetDisposalSchema = new mongoose.Schema({
    asset: { type: mongoose.Schema.Types.ObjectId, ref: 'FixedAsset', required: true },
    disposalDate: { type: Date, required: true, default: Date.now },
    disposalType: {
        type: String,
        enum: ['Sold', 'Scrapped', 'Discarded', 'Lost', 'Damaged Beyond Repair'],
        required: true
    },
    originalCost: { type: Number, required: true },
    accumulatedDepreciation: { type: Number, default: 0 },
    bookValue: { type: Number, required: true },
    saleValue: { type: Number, default: 0 },
    profitOrLoss: { type: Number, default: 0 },
    buyerName: { type: String, trim: true },
    invoiceNo: { type: String, trim: true },
    attachmentUrl: { type: String, default: '' },
    remarks: { type: String, trim: true },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

const AssetDisposal = mongoose.model('AssetDisposal', assetDisposalSchema);
export { AssetDisposal };
