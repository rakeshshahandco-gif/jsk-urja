import mongoose from 'mongoose';

const extractorImportBatchSchema = new mongoose.Schema(
    {
        companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
        financialYear: { type: String, required: true, trim: true },
        fileName: { type: String, trim: true, default: '' },
        columnMapping: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
        rowCount: { type: Number, default: 0 },
        searchJobId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExtractorSearchJob' },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },
    { timestamps: true },
);

const ExtractorImportBatch = mongoose.model('ExtractorImportBatch', extractorImportBatchSchema);
export { ExtractorImportBatch };
export default ExtractorImportBatch;
