import mongoose from 'mongoose';

const assetLocationSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    branch: { type: String, trim: true, default: '' },
    department: { type: String, trim: true, default: '' },
    parentLocation: { type: mongoose.Schema.Types.ObjectId, ref: 'AssetLocation', default: null },
    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

const AssetLocation = mongoose.model('AssetLocation', assetLocationSchema);
export { AssetLocation };
