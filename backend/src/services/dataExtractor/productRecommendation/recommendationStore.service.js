import mongoose from 'mongoose';
import { AiProductRecommendation } from '../../../models/aiProductRecommendation.model.js';
import { AiIndustryClassification } from '../../../models/aiIndustryClassification.model.js';
import { AiLeadRelevance } from '../../../models/aiLeadRelevance.model.js';
import { ExtractedLead } from '../../../models/extractedLead.model.js';
import { ApiError } from '../../../utils/ApiError.js';
import { getOrCreateExtractorSettings } from '../extractor.service.js';
import { loadLeadIntelligenceMasters } from '../aiLeadIntelligence.service.js';
import { getActiveProducts } from './productMaster.service.js';
import { runProductRecommendation } from './recommend.service.js';

function rejectTenantOverrides(payload = {}) {
    if (payload.companyId != null || payload.tenantId != null) {
        throw new ApiError(400, 'companyId/tenantId overrides are rejected');
    }
}

function historyEntry(action, userId, previous, next, reason = '') {
    return {
        at: new Date(),
        action,
        userId: userId || null,
        previousStatus: previous?.status || '',
        resultingStatus: next?.status || previous?.status || '',
        previous,
        next,
        reason: String(reason || '').slice(0, 2000),
    };
}

function recordKeyOf(meta = {}) {
    if (meta.classificationId) return 'cls:' + String(meta.classificationId);
    if (meta.relevanceId) return 'rel:' + String(meta.relevanceId);
    if (meta.extractedLeadId) return 'lead:' + String(meta.extractedLeadId);
    if (meta.discoveryJobId != null && meta.previewIndex != null) {
        return 'job:' + String(meta.discoveryJobId) + ':' + String(meta.previewIndex);
    }
    if (meta.adhocKey) return 'adhoc:' + String(meta.adhocKey);
    return '';
}

export async function listRecommendations(companyId, query = {}) {
    const q = { companyId, isDeleted: { $ne: true } };
    if (query.status) q.status = query.status;
    if (query.parentIndustry) q.parentIndustry = query.parentIndustry;
    if (query.customerType) q.customerType = query.customerType;
    if (query.locked === 'true') q.locked = true;
    if (query.locked === 'false') q.locked = false;
    if (query.minScore != null) q.opportunityScore = { ...(q.opportunityScore || {}), $gte: Number(query.minScore) };
    if (query.product) q['primaryRecommendation.productName'] = new RegExp(String(query.product).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    if (query.priority) q['primaryRecommendation.priority'] = query.priority;
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 50));
    const skip = Math.max(0, Number(query.skip) || 0);
    const [results, total] = await Promise.all([
        AiProductRecommendation.find(q).sort({ updatedAt: -1 }).skip(skip).limit(limit).lean(),
        AiProductRecommendation.countDocuments(q),
    ]);
    return { results, total, limit, skip };
}

export async function getRecommendation(companyId, id) {
    const doc = await AiProductRecommendation.findOne({ _id: id, companyId, isDeleted: { $ne: true } }).lean();
    if (!doc) throw new ApiError(404, 'Recommendation not found');
    return doc;
}

export async function getRecommendationHistory(companyId, id) {
    const doc = await getRecommendation(companyId, id);
    return { _id: doc._id, companyId: doc.companyId, history: doc.history || [] };
}

export async function recommendOne(companyId, userId, payload = {}) {
    rejectTenantOverrides(payload);
    const settings = await getOrCreateExtractorSettings(companyId);
    const masters = await loadLeadIntelligenceMasters(companyId);
    const products = await getActiveProducts(companyId);

    let record = payload.record || null;
    let classification = payload.classification || null;
    let relevance = payload.relevance || null;
    const meta = {
        financialYear: payload.financialYear || '',
        classificationId: payload.classificationId || null,
        relevanceId: payload.relevanceId || null,
        extractedLeadId: payload.extractedLeadId || null,
        discoveryJobId: payload.discoveryJobId || null,
        previewIndex: payload.previewIndex != null ? Number(payload.previewIndex) : null,
        adhocKey: payload.adhocKey || null,
    };

    if (payload.classificationId) {
        classification = await AiIndustryClassification.findOne({ _id: payload.classificationId, companyId, isDeleted: { $ne: true } }).lean();
        if (!classification) throw new ApiError(404, 'Classification not found');
        meta.classificationId = classification._id;
        meta.extractedLeadId = classification.extractedLeadId || meta.extractedLeadId;
        record = record || {
            companyName: classification.companyName,
            businessDescription: (classification.evidenceSnippets || []).join(' '),
            keywords: classification.positiveKeywordsFound || [],
            productCategories: classification.productSignals || [],
        };
    }
    if (payload.relevanceId) {
        relevance = await AiLeadRelevance.findOne({ _id: payload.relevanceId, companyId, isDeleted: { $ne: true } }).lean();
        if (!relevance) throw new ApiError(404, 'Relevance record not found');
        meta.relevanceId = relevance._id;
        record = record || { companyName: relevance.companyName, businessDescription: relevance.explanation };
    }
    if (payload.extractedLeadId) {
        const lead = await ExtractedLead.findOne({ _id: payload.extractedLeadId, companyId }).lean();
        if (!lead) throw new ApiError(404, 'Extracted lead not found');
        record = lead;
        meta.extractedLeadId = lead._id;
        if (!classification) {
            classification = await AiIndustryClassification.findOne({ companyId, extractedLeadId: lead._id, isDeleted: { $ne: true } }).sort({ updatedAt: -1 }).lean();
            if (classification) meta.classificationId = classification._id;
        }
        if (!relevance) {
            relevance = await AiLeadRelevance.findOne({ companyId, extractedLeadId: lead._id, isDeleted: { $ne: true } }).sort({ updatedAt: -1 }).lean();
            if (relevance) meta.relevanceId = relevance._id;
        }
    }
    if (!record) throw new ApiError(400, 'record, classificationId, relevanceId, or extractedLeadId required');
    if (!products.length) throw new ApiError(400, 'Create at least one Product Master entry first');

    const key = recordKeyOf(meta) || ('adhoc:' + new mongoose.Types.ObjectId().toString());
    const existing = await AiProductRecommendation.findOne({ companyId, recordKey: key, isDeleted: { $ne: true } });
    if (existing?.locked && !payload.force) {
        return { skipped: true, reason: 'locked', recommendation: existing.toObject() };
    }
    if (existing?.manuallyApproved && !payload.force) {
        return { skipped: true, reason: 'manual_approved', recommendation: existing.toObject() };
    }

    const result = await runProductRecommendation({
        record,
        classification,
        relevance,
        products,
        opportunityMaps: masters.opportunityMaps || [],
        settingsDoc: settings,
        searchContext: {
            searchKeyword: payload.searchKeyword || relevance?.searchKeyword || '',
            selectedIndustry: payload.selectedIndustry || '',
            selectedProduct: payload.selectedProduct || '',
            selectedLocation: payload.selectedLocation || '',
        },
        customerType: payload.customerType || classification?.customerType || '',
        forceMode: payload.mode || null,
    });

    const docPayload = {
        companyId,
        financialYear: meta.financialYear || '',
        classificationId: meta.classificationId || null,
        relevanceId: meta.relevanceId || null,
        extractedLeadId: meta.extractedLeadId || null,
        discoveryJobId: meta.discoveryJobId || null,
        previewIndex: meta.previewIndex,
        recordKey: key,
        companyName: result.companyName,
        status: result.status,
        parentIndustry: result.parentIndustry,
        subIndustry: result.subIndustry,
        customerType: result.customerType,
        searchKeyword: result.searchKeyword,
        relevanceScore: result.relevanceScore,
        classificationConfidence: result.classificationConfidence,
        opportunityScore: result.opportunityScore,
        confidence: result.confidence,
        primaryRecommendation: result.primaryRecommendation,
        secondaryRecommendations: result.secondaryRecommendations || [],
        alternativeProducts: result.alternativeProducts || [],
        crossSellOpportunities: result.crossSellOpportunities || [],
        upsellOpportunities: result.upsellOpportunities || [],
        bundleRecommendations: result.bundleRecommendations || [],
        recommendedSalesStrategy: result.recommendedSalesStrategy || '',
        recommendedFollowUpAction: result.recommendedFollowUpAction || '',
        engineUsed: result.engineUsed,
        modelProvider: result.modelProvider || '',
        modelVersion: result.modelVersion || '',
        fallbackUsed: !!result.fallbackUsed,
        analysisTimestamp: new Date(),
        rawPayload: result,
        updatedBy: userId || null,
    };

    if (!existing) {
        const created = await AiProductRecommendation.create({
            ...docPayload,
            createdBy: userId || null,
            history: [historyEntry('recommended', userId, null, result, 'initial recommendation')],
        });
        return { skipped: false, recommendation: created.toObject() };
    }

    const previous = existing.toObject();
    Object.assign(existing, docPayload);
    existing.history = [...(existing.history || []), historyEntry('re_recommended', userId, previous, result, 're-run')].slice(-100);
    await existing.save();
    return { skipped: false, recommendation: existing.toObject() };
}

export async function overrideRecommendation(companyId, userId, id, payload = {}) {
    rejectTenantOverrides(payload);
    const doc = await AiProductRecommendation.findOne({ _id: id, companyId, isDeleted: { $ne: true } });
    if (!doc) throw new ApiError(404, 'Recommendation not found');
    if (doc.locked) throw new ApiError(400, 'Recommendation is locked');

    const previous = doc.toObject();
    const action = String(payload.action || 'override');
    if (action === 'accept') {
        doc.status = 'ACCEPTED';
        doc.manuallyApproved = true;
    } else if (action === 'reject') {
        doc.status = 'REJECTED';
        doc.manuallyApproved = true;
    } else if (action === 'override') {
        if (payload.productName) {
            doc.primaryRecommendation = {
                ...(doc.primaryRecommendation?.toObject?.() || doc.primaryRecommendation || {}),
                productName: String(payload.productName),
                productCategory: payload.productCategory || doc.primaryRecommendation?.productCategory || '',
                priority: payload.priority || doc.primaryRecommendation?.priority || 'Medium Priority',
                reason: payload.reason || 'Manual product override',
                salesStrategy: payload.salesStrategy || doc.primaryRecommendation?.salesStrategy || '',
                role: 'primary',
            };
        }
        if (payload.priority) {
            doc.primaryRecommendation = {
                ...(doc.primaryRecommendation?.toObject?.() || doc.primaryRecommendation || {}),
                priority: String(payload.priority),
            };
        }
        if (Array.isArray(payload.additionalProducts)) {
            doc.secondaryRecommendations = [
                ...(doc.secondaryRecommendations || []),
                ...payload.additionalProducts.map((p) => ({
                    role: 'secondary',
                    productName: String(p.productName || p),
                    priority: p.priority || 'Medium Priority',
                    reason: p.reason || 'Manually added',
                    opportunityScore: Number(p.opportunityScore) || 0,
                    confidence: Number(p.confidence) || 0,
                })),
            ];
        }
        if (payload.salesStrategy) doc.recommendedSalesStrategy = String(payload.salesStrategy);
        doc.status = payload.status || 'ACCEPTED';
        doc.engineUsed = 'manual_override';
        doc.manuallyApproved = true;
    } else {
        throw new ApiError(400, 'Invalid override action');
    }
    doc.updatedBy = userId;
    doc.history = [...(doc.history || []), historyEntry(action, userId, previous, doc.toObject(), payload.reason || '')].slice(-100);
    await doc.save();
    return doc.toObject();
}

export async function lockRecommendation(companyId, userId, id, payload = {}) {
    rejectTenantOverrides(payload);
    const doc = await AiProductRecommendation.findOne({ _id: id, companyId, isDeleted: { $ne: true } });
    if (!doc) throw new ApiError(404, 'Recommendation not found');
    const previous = doc.toObject();
    const action = String(payload.action || 'lock');
    if (action === 'lock') {
        doc.locked = true;
        doc.lockedAt = new Date();
        doc.lockedBy = userId;
    } else if (action === 'unlock') {
        doc.locked = false;
        doc.lockedAt = null;
        doc.lockedBy = null;
    } else {
        throw new ApiError(400, 'action must be lock or unlock');
    }
    doc.updatedBy = userId;
    doc.history = [...(doc.history || []), historyEntry(action, userId, previous, doc.toObject(), payload.reason || '')].slice(-100);
    await doc.save();
    return doc.toObject();
}
