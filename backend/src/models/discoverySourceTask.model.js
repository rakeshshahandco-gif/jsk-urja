import mongoose from 'mongoose';
import { SOURCE_TASK_STATUSES } from '../services/dataExtractor/discovery/providerTypes.js';

const discoverySourceTaskSchema = new mongoose.Schema(
    {
        jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'DiscoveryJob', required: true, index: true },
        companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
        providerId: { type: String, required: true, trim: true },
        status: { type: String, enum: SOURCE_TASK_STATUSES, default: 'PENDING', index: true },
        pagesProcessed: { type: Number, default: 0 },
        rawResults: { type: Number, default: 0 },
        uniqueResults: { type: Number, default: 0 },
        apiRequests: { type: Number, default: 0 },
        cursor: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
        lastError: { type: String, default: '' },
    },
    { timestamps: true },
);

discoverySourceTaskSchema.index({ jobId: 1, providerId: 1 }, { unique: true });

const DiscoverySourceTask = mongoose.model('DiscoverySourceTask', discoverySourceTaskSchema);
export { DiscoverySourceTask };
export default DiscoverySourceTask;
