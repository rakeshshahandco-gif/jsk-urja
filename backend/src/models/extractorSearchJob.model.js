import mongoose from 'mongoose';

const extractorSearchJobSchema = new mongoose.Schema(
    {
        companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
        financialYear: { type: String, required: true, trim: true, index: true },
        jobType: {
            type: String,
            enum: ['manual_url', 'excel_import', 'search'],
            required: true,
        },
        adapterId: { type: String, trim: true, required: true },
        status: {
            type: String,
            enum: ['queued', 'running', 'completed', 'failed', 'cancelled'],
            default: 'queued',
            index: true,
        },
        inputSummary: { type: String, trim: true, default: '' },
        inputPayload: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
        recordCount: { type: Number, default: 0 },
        errorCount: { type: Number, default: 0 },
        jobErrors: [{ type: String }],
        metadata: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        completedAt: { type: Date, default: null },
    },
    { timestamps: true },
);

extractorSearchJobSchema.index({ companyId: 1, createdAt: -1 });

const ExtractorSearchJob = mongoose.model('ExtractorSearchJob', extractorSearchJobSchema);
export { ExtractorSearchJob };
export default ExtractorSearchJob;
