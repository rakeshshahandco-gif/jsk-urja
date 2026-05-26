import mongoose from 'mongoose';

const gstrImportBatchSchema = new mongoose.Schema(
    {
        financialYear: { type: String, required: true, trim: true, index: true },
        month: { type: String, required: true, index: true },
        source: { type: String, enum: ['2A', '2B'], default: '2B' },
        fileName: { type: String, default: '' },
        fileHash: { type: String, default: '', index: true },
        fileType: { type: String, enum: ['json', 'csv', 'xlsx', 'xls'], default: 'json' },
        importedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        rowCount: { type: Number, default: 0 },
        created: { type: Number, default: 0 },
        updated: { type: Number, default: 0 },
        skipped: { type: Number, default: 0 },
        status: { type: String, enum: ['Completed', 'Failed'], default: 'Completed' },
        errorMessage: { type: String, default: '' },
    },
    { timestamps: true },
);

gstrImportBatchSchema.index({ financialYear: 1, month: 1, source: 1, fileHash: 1 });

const GstrImportBatch = mongoose.model('GstrImportBatch', gstrImportBatchSchema);
export { GstrImportBatch };
