import mongoose from 'mongoose';

export const KG_RELATIONSHIP_TYPES = [
    'ParentCompany', 'Subsidiary', 'Branch', 'SisterCompany', 'GroupCompany',
    'OEM', 'ODM', 'Distributor', 'Dealer', 'ChannelPartner', 'SystemIntegrator',
    'Customer', 'Supplier', 'Competitor', 'TechnologyPartner', 'ResearchPartner',
    'Government', 'Consultant', 'Architect', 'ElectricalContractor', 'LightingDesigner',
    'ProjectConsultant', 'SharedDirector', 'SharedContact', 'SharedWebsite', 'SharedDomain',
    'SharedPhone', 'SharedEmail', 'SharedGST', 'SharedAddress', 'SharedBrand', 'SharedProduct',
    'SharedIndustry', 'SimilarCompany', 'PotentialDuplicate', 'PotentialAcquisition',
    'PotentialCrossSell', 'PotentialUpsell', 'PotentialPartnership', 'PotentialOEM',
    'PotentialDealer', 'PotentialDistributor', 'PotentialExportOpportunity',
    'CrmLinked', 'WorkflowLinked', 'CampaignLinked', 'ProductRecommended', 'LocatedIn',
];

export const KG_APPROVAL_STATUSES = [
    'DISCOVERED', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'LOCKED', 'OUTDATED',
];

const schema = new mongoose.Schema({
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    relationshipType: { type: String, enum: KG_RELATIONSHIP_TYPES, required: true, index: true },
    relationshipKey: { type: String, trim: true, required: true, index: true },
    fromNodeId: { type: mongoose.Schema.Types.ObjectId, ref: 'KnowledgeGraphNode', required: true, index: true },
    toNodeId: { type: mongoose.Schema.Types.ObjectId, ref: 'KnowledgeGraphNode', required: true, index: true },
    fromNodeType: { type: String, trim: true, default: '' },
    toNodeType: { type: String, trim: true, default: '' },
    fromLabel: { type: String, trim: true, default: '' },
    toLabel: { type: String, trim: true, default: '' },
    confidence: { type: Number, default: 0, min: 0, max: 100, index: true },
    reason: { type: String, trim: true, default: '' },
    explanation: { type: String, trim: true, default: '' },
    source: { type: String, trim: true, default: '' },
    discoveryMethod: { type: String, trim: true, default: 'Rules Engine', index: true },
    approvalStatus: { type: String, enum: KG_APPROVAL_STATUSES, default: 'DISCOVERED', index: true },
    freshness: { type: String, enum: ['CURRENT', 'OUTDATED', 'UNKNOWN'], default: 'CURRENT', index: true },
    version: { type: Number, default: 1 },
    locked: { type: Boolean, default: false },
    manualOverride: { type: Boolean, default: false },
    limitations: { type: [String], default: [] },
    evidenceIds: { type: [mongoose.Schema.Types.ObjectId], ref: 'KnowledgeGraphEvidence', default: [] },
    evidenceSummary: { type: [mongoose.Schema.Types.Mixed], default: [] },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    isDeleted: { type: Boolean, default: false, index: true },
}, { timestamps: true, collection: 'knowledge_graph_relationships' });

schema.index(
    { companyId: 1, relationshipKey: 1 },
    { unique: true, partialFilterExpression: { isDeleted: { $ne: true } } },
);
schema.index({ companyId: 1, fromNodeId: 1, relationshipType: 1 });
schema.index({ companyId: 1, toNodeId: 1, relationshipType: 1 });

const KnowledgeGraphRelationship = mongoose.models.KnowledgeGraphRelationship
    || mongoose.model('KnowledgeGraphRelationship', schema);
export { KnowledgeGraphRelationship };
export default KnowledgeGraphRelationship;
