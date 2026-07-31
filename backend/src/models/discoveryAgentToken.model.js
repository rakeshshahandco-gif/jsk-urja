import mongoose from 'mongoose';

const discoveryAgentTokenSchema = new mongoose.Schema(
    {
        companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
        name: { type: String, trim: true, default: 'Local Discovery Agent', maxlength: 120 },
        tokenHash: { type: String, required: true, unique: true, index: true },
        tokenPrefix: { type: String, required: true, maxlength: 12 },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
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

const DiscoveryAgentToken = mongoose.models.DiscoveryAgentToken
    || mongoose.model('DiscoveryAgentToken', discoveryAgentTokenSchema);
export default DiscoveryAgentToken;
export { DiscoveryAgentToken };
