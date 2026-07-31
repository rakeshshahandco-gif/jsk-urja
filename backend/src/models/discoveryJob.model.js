import mongoose from 'mongoose';
import { JOB_STATUSES } from '../services/dataExtractor/discovery/providerTypes.js';

const discoveryJobSchema = new mongoose.Schema(
    {
        companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
        financialYear: { type: String, required: true, trim: true, index: true },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        keyword: { type: String, trim: true, required: true },
        city: { type: String, trim: true, default: '' },
        state: { type: String, trim: true, default: '' },
        country: { type: String, trim: true, default: '' },
        targetCompanies: { type: Number, default: 10, min: 1 },
        batchSize: { type: Number, default: 10, min: 1 },
        selectedSources: [{ type: String, trim: true }],
        status: { type: String, enum: JOB_STATUSES, default: 'DRAFT', index: true },
        sourceProgress: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
        totalRawResults: { type: Number, default: 0 },
        totalUniqueResults: { type: Number, default: 0 },
        totalDuplicates: { type: Number, default: 0 },
        totalRejected: { type: Number, default: 0 },
        totalConverted: { type: Number, default: 0 },
        totalApiRequests: { type: Number, default: 0 },
        cursors: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
        metadata: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
        errorSummary: [{ type: String }],
        startedAt: { type: Date, default: null },
        pausedAt: { type: Date, default: null },
        resumedAt: { type: Date, default: null },
        completedAt: { type: Date, default: null },
        lastProcessedAt: { type: Date, default: null },
        isDeleted: { type: Boolean, default: false },
    },
    { timestamps: true },
);

discoveryJobSchema.index({ companyId: 1, createdAt: -1 });
discoveryJobSchema.index({ companyId: 1, status: 1 });

const DiscoveryJob = mongoose.model('DiscoveryJob', discoveryJobSchema);
export { DiscoveryJob };
export default DiscoveryJob;
