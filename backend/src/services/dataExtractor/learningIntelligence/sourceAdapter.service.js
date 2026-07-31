import mongoose from 'mongoose';
import { ApiError } from '../../../utils/ApiError.js';
import { AiIndustryClassification } from '../../../models/aiIndustryClassification.model.js';
import { AiLeadRelevance } from '../../../models/aiLeadRelevance.model.js';
import { AiProductRecommendation } from '../../../models/aiProductRecommendation.model.js';
import { AiContactIntelligence } from '../../../models/aiContactIntelligence.model.js';
import { AiCompanyIntelligenceProfile } from '../../../models/aiCompanyIntelligenceProfile.model.js';
import { AiLeadScore } from '../../../models/aiLeadScore.model.js';
import { AiSimilarCompanyResult } from '../../../models/aiSimilarCompanyResult.model.js';
import { AiCrmEnrichmentDraft } from '../../../models/aiCrmEnrichmentDraft.model.js';
import { AiSalesWorkflowDraft } from '../../../models/aiSalesWorkflowDraft.model.js';
import { AiMarketingCampaignDraft } from '../../../models/aiMarketingCampaignDraft.model.js';
import { AiSalesAssistantMessage } from '../../../models/aiSalesAssistantMessage.model.js';
import { KnowledgeGraphRelationship } from '../../../models/knowledgeGraphRelationship.model.js';
import { snapshotHash } from './normalize.util.js';

/**
 * Read-only source adapters — load metadata/snapshots only.
 * Never imports apply/prepare/create write services.
 */
const LOADERS = {
    industry_classification: async (companyId, id) => AiIndustryClassification.findOne({ _id: id, companyId, isDeleted: { $ne: true } }).lean(),
    customer_type_classification: async (companyId, id) => AiIndustryClassification.findOne({ _id: id, companyId, isDeleted: { $ne: true } }).lean(),
    lead_relevance: async (companyId, id) => AiLeadRelevance.findOne({ _id: id, companyId, isDeleted: { $ne: true } }).lean(),
    product_recommendation: async (companyId, id) => AiProductRecommendation.findOne({ _id: id, companyId, isDeleted: { $ne: true } }).lean(),
    contact_intelligence: async (companyId, id) => AiContactIntelligence.findOne({ _id: id, companyId, isDeleted: { $ne: true } }).lean(),
    company_intelligence: async (companyId, id) => AiCompanyIntelligenceProfile.findOne({ _id: id, companyId, isDeleted: { $ne: true } }).lean(),
    lead_scoring: async (companyId, id) => AiLeadScore.findOne({ _id: id, companyId, isDeleted: { $ne: true } }).lean(),
    similar_company: async (companyId, id) => AiSimilarCompanyResult.findOne({ _id: id, companyId, isDeleted: { $ne: true } }).lean(),
    crm_enrichment: async (companyId, id) => AiCrmEnrichmentDraft.findOne({ _id: id, companyId, isDeleted: { $ne: true } }).lean(),
    sales_workflow: async (companyId, id) => AiSalesWorkflowDraft.findOne({ _id: id, companyId, isDeleted: { $ne: true } }).lean(),
    marketing_audience: async (companyId, id) => AiMarketingCampaignDraft.findOne({ _id: id, companyId, isDeleted: { $ne: true } }).lean(),
    marketing_message: async (companyId, id) => AiMarketingCampaignDraft.findOne({ _id: id, companyId, isDeleted: { $ne: true } }).lean(),
    sales_assistant: async (companyId, id) => AiSalesAssistantMessage.findOne({ _id: id, companyId, isDeleted: { $ne: true } }).lean(),
    knowledge_graph: async (companyId, id) => KnowledgeGraphRelationship.findOne({ _id: id, companyId, isDeleted: { $ne: true } }).lean(),
    analytics: async () => ({ _id: null, status: 'AGGREGATE', updatedAt: new Date(), version: 'analytics' }),
    duplicate_suggestion: async (companyId, id) => {
        const { ExtractedLead } = await import('../../../models/extractedLead.model.js');
        return ExtractedLead.findOne({ _id: id, companyId }).lean();
    },
    manual_review: async (companyId, id) => AiLeadScore.findOne({ _id: id, companyId, isDeleted: { $ne: true } }).lean(),
    batch_quality: async () => ({ _id: null, status: 'BATCH', updatedAt: new Date(), version: 'batch' }),
    data_quality: async () => ({ _id: null, status: 'DATA_QUALITY', updatedAt: new Date(), version: 'dq' }),
    source_provenance: async () => ({ _id: null, status: 'PROVENANCE', updatedAt: new Date(), version: 'prov' }),
};

function summarize(module, doc, { aggregateOnly = false, canSeeContacts = false } = {}) {
    if (!doc) return {};
    const base = {
        status: doc.status || '',
        label: doc.companyName || doc.label || doc.title || doc.intent || '',
    };
    if (aggregateOnly) {
        return { status: base.status, label: '[restricted]' };
    }
    if (module === 'lead_scoring') {
        return { status: doc.status, finalScore: doc.finalScore, priority: doc.priority, grade: doc.grade, companyName: doc.companyName };
    }
    if (module === 'product_recommendation') {
        return {
            status: doc.status,
            companyName: doc.companyName,
            primary: doc.primaryRecommendation?.productName || '',
        };
    }
    if (module === 'contact_intelligence') {
        return {
            status: doc.status,
            companyName: aggregateOnly ? '[restricted]' : doc.companyName,
            contactCount: (doc.contacts || []).length,
            // Never persist emails/phones in feedback snapshots
            availabilityOnly: true,
            contactsRedacted: true,
        };
    }
    if (module === 'knowledge_graph') {
        return {
            relationshipType: doc.relationshipType,
            confidence: doc.confidence,
            fromLabel: doc.fromLabel,
            toLabel: doc.toLabel,
            freshness: doc.freshness,
        };
    }
    if (module === 'sales_assistant') {
        return {
            intent: doc.intent,
            role: doc.role,
            contentPreview: String(doc.content || '').slice(0, 160),
        };
    }
    return base;
}

export async function loadSourceSnapshot(companyId, sourceModule, sourceRecordId, opts = {}) {
    if (!mongoose.Types.ObjectId.isValid(String(sourceRecordId)) && !['analytics', 'batch_quality', 'data_quality', 'source_provenance'].includes(sourceModule)) {
        throw new ApiError(400, 'Invalid sourceRecordId');
    }
    const loader = LOADERS[sourceModule];
    if (!loader) throw new ApiError(400, `Unsupported source module: ${sourceModule}`);

    const id = mongoose.Types.ObjectId.isValid(String(sourceRecordId))
        ? new mongoose.Types.ObjectId(String(sourceRecordId))
        : sourceRecordId;
    const doc = await loader(companyId, id);
    if (!doc) throw new ApiError(404, 'Source record not found');
    if (doc.companyId && String(doc.companyId) !== String(companyId)) {
        throw new ApiError(404, 'Source record not found');
    }

    const version = String(doc.version || doc.modelVersion || doc.settingsVersion || doc.updatedAt || doc._id || '1');
    const summary = summarize(sourceModule, doc, opts);
    const hash = snapshotHash({
        module: sourceModule,
        id: String(doc._id || sourceRecordId),
        version,
        status: doc.status || '',
        updatedAt: doc.updatedAt || null,
        summary,
    });

    return {
        sourceRecordType: doc.constructor?.modelName || sourceModule,
        sourceRecordId: doc._id || id,
        sourceVersion: version,
        sourceSnapshotHash: hash,
        sourceStatus: doc.status || '',
        sourceUpdatedAt: doc.updatedAt || null,
        sourceFreshnessAtFeedback: doc.freshness === 'OUTDATED' || doc.status === 'OUTDATED' ? 'OUTDATED' : 'CURRENT',
        outputSummary: summary,
        rawExists: true,
    };
}
