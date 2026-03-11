import mongoose from 'mongoose';

const assetTransferSchema = new mongoose.Schema({
    asset: { type: mongoose.Schema.Types.ObjectId, ref: 'FixedAsset', required: true },
    transferDate: { type: Date, required: true, default: Date.now },
    fromLocation: { type: mongoose.Schema.Types.ObjectId, ref: 'AssetLocation' },
    toLocation: { type: mongoose.Schema.Types.ObjectId, ref: 'AssetLocation' },
    fromDepartment: { type: String, trim: true },
    toDepartment: { type: String, trim: true },
    fromUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    toUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reason: { type: String, trim: true },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    remarks: { type: String, trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

const AssetTransfer = mongoose.model('AssetTransfer', assetTransferSchema);
export { AssetTransfer };
