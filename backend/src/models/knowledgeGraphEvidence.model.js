import mongoose from 'mongoose';

const schema = new mongoose.Schema({
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    relationshipId: { type: mongoose.Schema.Types.ObjectId, ref: 'KnowledgeGraphRelationship', default: null, index: true },
    fromNodeId: { type: mongoose.Schema.Types.ObjectId, ref: 'KnowledgeGraphNode', default: null },
    toNodeId: { type: mongoose.Schema.Types.ObjectId, ref: 'KnowledgeGraphNode', default: null },
    evidenceType: { type: String, trim: true, default: 'rule_match' },
    field: { type: String, trim: true, default: '' },
    valueFingerprint: { type: String, trim: true, default: '' },
    displayValue: { type: String, trim: true, default: '' },
    sourceModule: { type: String, trim: true, default: '' },
    sourceRecordId: { type: mongoose.Schema.Types.ObjectId, default: null },
    sourceUrl: { type: String, trim: true, default: '' },
    reason: { type: String, trim: true, default: '' },
    confidenceContribution: { type: Number, default: 0 },
    retrievedAt: { type: Date, default: Date.now },
    freshness: { type: String, enum: ['CURRENT', 'OUTDATED', 'UNKNOWN'], default: 'CURRENT' },
    untrustedTextSanitized: { type: Boolean, default: false },
    isDeleted: { type: Boolean, default: false },
}, { timestamps: true, collection: 'knowledge_graph_evidence' });

schema.index({ companyId: 1, relationshipId: 1, createdAt: -1 });

const KnowledgeGraphEvidence = mongoose.models.KnowledgeGraphEvidence
    || mongoose.model('KnowledgeGraphEvidence', schema);
export { KnowledgeGraphEvidence };
export default KnowledgeGraphEvidence;
