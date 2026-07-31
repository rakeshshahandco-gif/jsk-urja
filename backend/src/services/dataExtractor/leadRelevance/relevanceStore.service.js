import mongoose from 'mongoose';
import { AiLeadRelevance } from '../../../models/aiLeadRelevance.model.js';
import { AiIndustryClassification } from '../../../models/aiIndustryClassification.model.js';
import { ExtractedLead } from '../../../models/extractedLead.model.js';
import { ApiError } from '../../../utils/ApiError.js';
import { getOrCreateExtractorSettings } from '../extractor.service.js';
import { loadLeadIntelligenceMasters } from '../aiLeadIntelligence.service.js';
import { scoreLeadRelevance } from './relevanceEngine.service.js';

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
        resultingStatus: next?.status || '',
        previous,
        next,
        reason: String(reason || '').slice(0, 2000),
    };
}

function recordKeyOf({ classificationId, extractedLeadId, discoveryJobId, previewIndex, adhocKey }) {
    if (classificationId) return 'cls:' + String(classificationId);
    if (extractedLeadId) return 'lead:' + String(extractedLeadId);
    if (discoveryJobId != null && previewIndex != null) return 'job:' + String(discoveryJobId) + ':' + String(previewIndex);
    if (adhocKey) return 'adhoc:' + String(adhocKey);
    return '';
}

export async function listRelevance(companyId, query = {}) {
    const q = { companyId, isDeleted: { $ne: true } };
    if (query.status) q.status = query.status;
    if (query.excluded === 'true') q.excluded = true;
    if (query.excluded === 'false') q.excluded = false;
    if (query.minScore != null) q.relevanceScore = { ...(q.relevanceScore || {}), $gte: Number(query.minScore) };
    if (query.maxScore != null) q.relevanceScore = { ...(q.relevanceScore || {}), $lte: Number(query.maxScore) };
    if (query.searchKeyword) q.searchKeyword = new RegExp(String(query.searchKeyword).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 50));
    const skip = Math.max(0, Number(query.skip) || 0);
    const [results, total] = await Promise.all([
        AiLeadRelevance.find(q).sort({ updatedAt: -1 }).skip(skip).limit(limit).lean(),
        AiLeadRelevance.countDocuments(q),
    ]);
    return { results, total, limit, skip };
}

export async function getRelevance(companyId, id) {
    const doc = await AiLeadRelevance.findOne({ _id: id, companyId, isDeleted: { $ne: true } }).lean();
    if (!doc) throw new ApiError(404, 'Relevance record not found');
    return doc;
}

export async function evaluateRelevance(companyId, userId, payload = {}) {
    rejectTenantOverrides(payload);
    const settings = await getOrCreateExtractorSettings(companyId);
    const masters = await loadLeadIntelligenceMasters(companyId);

    let record = payload.record || null;
    let classification = payload.classification || null;
    let meta = {
        financialYear: payload.financialYear || '',
        classificationId: payload.classificationId || null,
        extractedLeadId: payload.extractedLeadId || null,
        discoveryJobId: payload.discoveryJobId || null,
        previewIndex: payload.previewIndex != null ? Number(payload.previewIndex) : null,
        adhocKey: payload.adhocKey || null,
    };

    if (payload.classificationId) {
        classification = await AiIndustryClassification.findOne({
            _id: payload.classificationId,
            companyId,
            isDeleted: { $ne: true },
        }).lean();
        if (!classification) throw new ApiError(404, 'Classification not found');
        meta.classificationId = classification._id;
        meta.extractedLeadId = classification.extractedLeadId || meta.extractedLeadId;
        meta.discoveryJobId = classification.discoveryJobId || meta.discoveryJobId;
        meta.previewIndex = classification.previewIndex != null ? classification.previewIndex : meta.previewIndex;
        record = record || {
            companyName: classification.companyName,
            businessDescription: (classification.evidenceSnippets || []).join(' '),
            keywords: classification.positiveKeywordsFound || [],
            productCategories: classification.productSignals || [],
            website: (classification.evidenceSourceUrls || [])[0] || '',
            city: '',
            state: '',
            country: '',
        };
    }

    if (payload.extractedLeadId) {
        const lead = await ExtractedLead.findOne({ _id: payload.extractedLeadId, companyId }).lean();
        if (!lead) throw new ApiError(404, 'Extracted lead not found');
        record = lead;
        meta.extractedLeadId = lead._id;
        meta.financialYear = lead.financialYear || meta.financialYear;
        if (!classification) {
            classification = await AiIndustryClassification.findOne({
                companyId,
                extractedLeadId: lead._id,
                isDeleted: { $ne: true },
            }).sort({ updatedAt: -1 }).lean();
            if (classification) meta.classificationId = classification._id;
        }
    }

    if (!record) throw new ApiError(400, 'record, classificationId, or extractedLeadId required');

    const searchContext = {
        searchKeyword: payload.searchKeyword || payload.keyword || '',
        selectedIndustry: payload.selectedIndustry || '',
        selectedProduct: payload.selectedProduct || '',
        selectedLocation: payload.selectedLocation || payload.location || '',
    };

    // Filter opportunity maps to related industry when possible
    const maps = (masters.opportunityMaps || []).filter((m) => {
        if (!classification?.parentIndustry) return true;
        return !m.parentIndustry
            || String(m.parentIndustry).toLowerCase() === String(classification.parentIndustry).toLowerCase()
            || !classification.parentIndustry;
    });

    const result = scoreLeadRelevance({
        record,
        classification,
        searchContext,
        settingsDoc: settings,
        opportunityMaps: maps.length ? maps : (masters.opportunityMaps || []),
    });

    const key = recordKeyOf(meta) || ('adhoc:' + new mongoose.Types.ObjectId().toString());
    const existing = await AiLeadRelevance.findOne({ companyId, recordKey: key, isDeleted: { $ne: true } });

    const payloadDoc = {
        companyId,
        financialYear: meta.financialYear || '',
        classificationId: meta.classificationId || null,
        extractedLeadId: meta.extractedLeadId || null,
        discoveryJobId: meta.discoveryJobId || null,
        previewIndex: meta.previewIndex,
        recordKey: key,
        companyName: result.companyName,
        status: result.status,
        relevanceScore: result.relevanceScore,
        explanation: result.explanation,
        matchingProducts: result.matchingProducts,
        conflictingKeywords: result.conflictingKeywords,
        exclusionReason: result.exclusionReason,
        searchKeyword: result.searchKeyword,
        selectedIndustry: result.selectedIndustry,
        selectedProduct: result.selectedProduct,
        selectedLocation: result.selectedLocation,
        classificationStatus: result.classificationStatus,
        primaryIndustry: result.primaryIndustry,
        parentIndustry: result.parentIndustry,
        subIndustry: result.subIndustry,
        signals: result.signals,
        evidenceSnippets: result.evidenceSnippets,
        engineVersion: result.engineVersion,
        rawPayload: result,
        updatedBy: userId || null,
        // Auto-place IRRELEVANT into excluded/low-relevance queue without deleting
        excluded: result.status === 'IRRELEVANT' ? true : (existing?.excluded || false),
        excludedAt: result.status === 'IRRELEVANT' ? new Date() : (existing?.excludedAt || null),
        excludedBy: result.status === 'IRRELEVANT' ? (userId || null) : (existing?.excludedBy || null),
    };

    if (!existing) {
        const created = await AiLeadRelevance.create({
            ...payloadDoc,
            createdBy: userId || null,
            history: [historyEntry('evaluated', userId, null, result, 'initial relevance evaluation')],
        });
        return created.toObject();
    }

    const previous = existing.toObject();
    // Do not clear a manual restore silently when re-evaluating to non-irrelevant
    if (result.status !== 'IRRELEVANT' && existing.excluded && payload.forceExclude !== true) {
        payloadDoc.excluded = existing.excluded;
        payloadDoc.excludedAt = existing.excludedAt;
        payloadDoc.excludedBy = existing.excludedBy;
    }
    Object.assign(existing, payloadDoc);
    existing.history = [...(existing.history || []), historyEntry('evaluated', userId, previous, result, 're-evaluation')].slice(-100);
    await existing.save();
    return existing.toObject();
}

export async function excludeRelevance(companyId, userId, id, payload = {}) {
    rejectTenantOverrides(payload);
    const doc = await AiLeadRelevance.findOne({ _id: id, companyId, isDeleted: { $ne: true } });
    if (!doc) throw new ApiError(404, 'Relevance record not found');
    const previous = doc.toObject();
    doc.excluded = true;
    doc.excludedAt = new Date();
    doc.excludedBy = userId;
    if (payload.reason) doc.exclusionReason = String(payload.reason).slice(0, 2000);
    if (doc.status !== 'IRRELEVANT' && payload.markIrrelevant !== false) {
        // Keep original status unless caller wants status change; default keep but excluded queue
    }
    doc.updatedBy = userId;
    doc.history = [...(doc.history || []), historyEntry('exclude', userId, previous, doc.toObject(), payload.reason || 'Moved to excluded / low relevance')].slice(-100);
    await doc.save();
    return doc.toObject();
}

export async function restoreRelevance(companyId, userId, id, payload = {}) {
    rejectTenantOverrides(payload);
    const doc = await AiLeadRelevance.findOne({ _id: id, companyId, isDeleted: { $ne: true } });
    if (!doc) throw new ApiError(404, 'Relevance record not found');
    const previous = doc.toObject();
    doc.excluded = false;
    doc.restoredAt = new Date();
    doc.restoredBy = userId;
    doc.updatedBy = userId;
    if (payload.status && ['RELEVANT', 'POSSIBLY_RELEVANT', 'MANUAL_REVIEW'].includes(payload.status)) {
        doc.status = payload.status;
    } else if (doc.status === 'IRRELEVANT') {
        doc.status = 'MANUAL_REVIEW';
    }
    doc.history = [...(doc.history || []), historyEntry('restore', userId, previous, doc.toObject(), payload.reason || 'Restored from excluded / low relevance')].slice(-100);
    await doc.save();
    return doc.toObject();
}

export async function getRelevanceHistory(companyId, id) {
    const doc = await getRelevance(companyId, id);
    return { _id: doc._id, companyId: doc.companyId, history: doc.history || [] };
}
