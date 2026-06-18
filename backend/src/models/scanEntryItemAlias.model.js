import mongoose from 'mongoose';

const scanEntryItemAliasSchema = new mongoose.Schema(
    {
        supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true },
        ocrItemName: { type: String, required: true, trim: true },
        itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },
    { timestamps: true },
);

scanEntryItemAliasSchema.index({ supplierId: 1, ocrItemName: 1 }, { unique: true });

const ScanEntryItemAlias = mongoose.model('ScanEntryItemAlias', scanEntryItemAliasSchema);
export { ScanEntryItemAlias };
export default ScanEntryItemAlias;

