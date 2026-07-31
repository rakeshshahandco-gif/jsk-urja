import mongoose from 'mongoose';

export const KG_NODE_TYPES = [
    'Company', 'Contact', 'Industry', 'CustomerType', 'Product', 'Lead', 'CampaignDraft',
    'SalesWorkflowDraft', 'CrmLead', 'Task', 'FollowUp', 'Location', 'Website', 'Phone',
    'Email', 'GST', 'PAN', 'Brand', 'OEM', 'Dealer', 'Distributor', 'SystemIntegrator',
    'Manufacturer', 'Importer', 'Exporter', 'Technology', 'Certification',
];

const schema = new mongoose.Schema({
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    nodeType: { type: String, enum: KG_NODE_TYPES, required: true, index: true },
    nodeKey: { type: String, trim: true, required: true, index: true },
    label: { type: String, trim: true, default: '' },
    sourceModule: { type: String, trim: true, default: '' },
    sourceRecordId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
    sourceRecordType: { type: String, trim: true, default: '' },
    attributes: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    freshness: { type: String, enum: ['CURRENT', 'OUTDATED', 'UNKNOWN'], default: 'CURRENT', index: true },
    locked: { type: Boolean, default: false },
    version: { type: Number, default: 1 },
    discoveryMethod: { type: String, trim: true, default: 'Rules Engine' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    isDeleted: { type: Boolean, default: false, index: true },
}, { timestamps: true, collection: 'knowledge_graph_nodes' });

schema.index(
    { companyId: 1, nodeType: 1, nodeKey: 1 },
    { unique: true, partialFilterExpression: { isDeleted: { $ne: true } } },
);
schema.index({ companyId: 1, sourceRecordId: 1, nodeType: 1 });

const KnowledgeGraphNode = mongoose.models.KnowledgeGraphNode
    || mongoose.model('KnowledgeGraphNode', schema);
export { KnowledgeGraphNode };
export default KnowledgeGraphNode;
