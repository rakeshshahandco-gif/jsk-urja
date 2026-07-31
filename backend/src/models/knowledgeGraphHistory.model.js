import mongoose from 'mongoose';

const schema = new mongoose.Schema({
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    entityType: { type: String, enum: ['NODE', 'RELATIONSHIP', 'DISCOVERY_RUN', 'SETTINGS'], required: true },
    entityId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
    action: { type: String, trim: true, default: '' },
    previous: { type: mongoose.Schema.Types.Mixed, default: null },
    next: { type: mongoose.Schema.Types.Mixed, default: null },
    reason: { type: String, trim: true, default: '' },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    sourceType: { type: String, trim: true, default: 'system' },
    isDeleted: { type: Boolean, default: false },
}, { timestamps: true, collection: 'knowledge_graph_history' });

schema.index({ companyId: 1, createdAt: -1 });
schema.index({ companyId: 1, entityType: 1, entityId: 1, createdAt: -1 });

const KnowledgeGraphHistory = mongoose.models.KnowledgeGraphHistory
    || mongoose.model('KnowledgeGraphHistory', schema);
export { KnowledgeGraphHistory };
export default KnowledgeGraphHistory;
