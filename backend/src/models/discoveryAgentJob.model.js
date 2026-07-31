import mongoose from 'mongoose';

export const AGENT_SOURCES = ['google_visible', 'facebook_public_visible', 'instagram_public_visible', 'manual_directory', 'assisted_google_capture'];
export const AGENT_JOB_STATUSES = [
    'DRAFT', 'WAITING_CONNECT', 'RUNNING', 'PAUSED', 'MANUAL_ACTION_REQUIRED',
    'STOPPED', 'COMPLETED', 'FAILED', 'CANCELLED',
];

const discoveryAgentJobSchema = new mongoose.Schema(
    {
        companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
        financialYear: { type: String, required: true, trim: true },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        discoveryJobId: { type: mongoose.Schema.Types.ObjectId, ref: 'DiscoveryJob', default: null },
        agentTokenId: { type: mongoose.Schema.Types.ObjectId, ref: 'DiscoveryAgentToken', default: null },
        sourceMode: { type: String, enum: AGENT_SOURCES, required: true },
        status: { type: String, enum: AGENT_JOB_STATUSES, default: 'DRAFT', index: true },
        keyword: { type: String, trim: true, default: '' },
        city: { type: String, trim: true, default: '' },
        state: { type: String, trim: true, default: '' },
        country: { type: String, trim: true, default: 'India' },
        maxPages: { type: Number, default: 3, min: 1, max: 50 },
        maxCompanies: { type: Number, default: 10, min: 1, max: 200 },
        delayMsMin: { type: Number, default: 2500, min: 500 },
        delayMsMax: { type: Number, default: 6000, min: 500 },
        maxConcurrentTabs: { type: Number, default: 1, min: 1, max: 2 },
        websiteEnrichment: { type: Boolean, default: false },
        cursor: { type: mongoose.Schema.Types.Mixed, default: () => ({ page: 0, processedUrls: [] }) },
        extractedCount: { type: Number, default: 0 },
        currentPageUrl: { type: String, default: '' },
        manualActionMessage: { type: String, default: '' },
        controlCommand: { type: String, enum: ['none', 'pause', 'resume', 'stop', 'continue_after_manual'], default: 'none' },
        lastHeartbeatAt: { type: Date, default: null },
        agentInstanceId: { type: String, default: '', maxlength: 120 },
        errorSummary: [{ type: String }],
        auditLog: { type: [mongoose.Schema.Types.Mixed], default: [] },
        // Never store cookies/passwords — only operational metadata
        metadata: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
        isDeleted: { type: Boolean, default: false },
    },
    { timestamps: true, collection: 'discovery_agent_jobs' },
);

discoveryAgentJobSchema.index({ companyId: 1, createdAt: -1 });
discoveryAgentJobSchema.index({ companyId: 1, status: 1 });

const DiscoveryAgentJob = mongoose.models.DiscoveryAgentJob
    || mongoose.model('DiscoveryAgentJob', discoveryAgentJobSchema);
export default DiscoveryAgentJob;
export { DiscoveryAgentJob };
