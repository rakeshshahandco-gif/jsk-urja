import mongoose from 'mongoose';

const discoveryAgentTokenSchema = new mongoose.Schema(
    {
        companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
        name: { type: String, trim: true, default: 'Local Discovery Agent', maxlength: 120 },
        tokenHash: { type: String, required: true, unique: true, index: true },
        tokenPrefix: { type: String, required: true, maxlength: 12 },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
        userName: { type: String, trim: true, default: '', maxlength: 160 },
        deviceId: { type: String, trim: true, default: '', maxlength: 80, index: true },
        deviceName: { type: String, trim: true, default: '', maxlength: 120 },
        hostname: { type: String, trim: true, default: '', maxlength: 120 },
        applicationKey: { type: String, trim: true, default: '', maxlength: 80 },
        agentVersion: { type: String, trim: true, default: '', maxlength: 40 },
        lastHeartbeatAt: { type: Date, default: null },
        lastUsedAt: { type: Date, default: null },
        expiresAt: { type: Date, default: null },
        revokedAt: { type: Date, default: null },
        isActive: { type: Boolean, default: true },
        scopes: { type: [String], default: () => ['discovery.agent.ingest', 'discovery.agent.job'] },
        metadata: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    },
    { timestamps: true, collection: 'discovery_agent_tokens' },
);

discoveryAgentTokenSchema.index({ companyId: 1, isActive: 1 });
discoveryAgentTokenSchema.index({ companyId: 1, userId: 1, isActive: 1 });
discoveryAgentTokenSchema.index({ companyId: 1, deviceId: 1 });

const DiscoveryAgentToken = mongoose.models.DiscoveryAgentToken
    || mongoose.model('DiscoveryAgentToken', discoveryAgentTokenSchema);
export default DiscoveryAgentToken;
export { DiscoveryAgentToken };
