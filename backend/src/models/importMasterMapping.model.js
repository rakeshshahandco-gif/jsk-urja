import mongoose from 'mongoose';

const importMasterMappingSchema = new mongoose.Schema(
    {
        companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
        entityType: { type: String, enum: ['supplier', 'customer', 'ledger', 'item'], required: true },
        importedName: { type: String, required: true, trim: true },
        normalizedName: { type: String, required: true, trim: true, index: true },
        entityId: { type: mongoose.Schema.Types.ObjectId, required: true },
        entityLabel: { type: String, trim: true, default: '' },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },
    { timestamps: true },
);

importMasterMappingSchema.index({ companyId: 1, entityType: 1, normalizedName: 1 }, { unique: true });

export const ImportMasterMapping = mongoose.model('ImportMasterMapping', importMasterMappingSchema);
export default ImportMasterMapping;
