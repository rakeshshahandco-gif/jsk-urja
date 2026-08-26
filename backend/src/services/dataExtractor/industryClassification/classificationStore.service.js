import mongoose from 'mongoose';
import { AiIndustryClassification } from '../../../models/aiIndustryClassification.model.js';
import { ensureModelIndexes } from '../../../utils/ensureModelIndexes.js';
import { ExtractedLead } from '../../../models/extractedLead.model.js';
import { DiscoveryJob } from '../../../models/discoveryJob.model.js';
import { ApiError } from '../../../utils/ApiError.js';
import { classifyIndustryRecord } from './classify.service.js';
import { getOrCreateExtractorSettings } from '../extractor.service.js';
import { loadLeadIntelligenceMasters } from '../aiLeadIntelligence.service.js';

async function ensureIndustryClassificationStore() {
    await ensureModelIndexes(AiIndustryClassification);
}


function rejectTenantOverrides(payload = {}) {
    if (payload.companyId != null || payload.tenantId != null) {
        throw new ApiError(400, 'companyId/tenantId overrides are rejected');
    }
}

function recordKeyOf({ extractedLeadId = null, discoveryJobId = null, previewIndex = null, adhocKey = null }) {
    if (extractedLeadId) return 'lead:' + String(extractedLeadId);
    if (discoveryJobId != null && previewIndex != null) return 'job:' + String(discoveryJobId) + ':' + String(previewIndex);
    if (adhocKey) return 'adhoc:' + String(adhocKey);
    return '';
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
        engineUsed: next?.engineUsed || '',
        confidence: next?.confidenceScore || 0,
        evidence: next?.evidenceSnippets || [],
        reason: String(reason || '').slice(0, 2000),
    };
}

function isProtectedFromAutoOverwrite(doc) {
    if (!doc) return false;
    if (doc.locked) return true;
    if (doc.manuallyApproved) return true;
    return false;
}

export async function listClassifications(companyId, query = {}) {
    await ensureIndustryClassificationStore();
    const q = { companyId, isDeleted: { $ne: true } };
    if (query.status) q.status = query.status;
    if (query.engineUsed) q.engineUsed = query.engineUsed;
    if (query.parentIndustry) q.parentIndustry = query.parentIndustry;
    if (query.locked === 'true') q.locked = true;
    if (query.locked === 'false') q.locked = false;
    if (query.minConfidence != null) q.confidenceScore = { ...(q.confidenceScore || {}), $gte: Number(query.minConfidence) };
    if (query.maxConfidence != null) q.confidenceScore = { ...(q.confidenceScore || {}), $lte: Number(query.maxConfidence) };
    if (query.discoveryJobId) q.discoveryJobId = query.discoveryJobId;
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 50));
    const skip = Math.max(0, Number(query.skip) || 0);
    const [results, total] = await Promise.all([
        AiIndustryClassification.find(q).sort({ updatedAt: -1 }).skip(skip).limit(limit).lean(),
        AiIndustryClassification.countDocuments(q),
    ]);
    return { results, total, limit, skip };
}

export async function getClassification(companyId, id) {
    await ensureIndustryClassificationStore();
    const doc = await AiIndustryClassification.findOne({ _id: id, companyId, isDeleted: { $ne: true } }).lean();
    if (!doc) throw new ApiError(404, 'Classification not found');
    return doc;
}

export async function getClassificationEvidence(companyId, id) {
    await ensureIndustryClassificationStore();
    const doc = await getClassification(companyId, id);
    return {
        _id: doc._id,
        companyId: doc.companyId,
        evidenceSnippets: doc.evidenceSnippets || [],
        evidenceSourceUrls: doc.evidenceSourceUrls || [],
        rulesMatched: doc.rulesMatched || [],
        positiveKeywordsFound: doc.positiveKeywordsFound || [],
        negativeKeywordsFound: doc.negativeKeywordsFound || [],
        productSignals: doc.productSignals || [],
        websiteSignals: doc.websiteSignals || [],
    };
}

export async function getClassificationHistory(companyId, id) {
    await ensureIndustryClassificationStore();
    const doc = await getClassification(companyId, id);
    return {
        _id: doc._id,
        companyId: doc.companyId,
        history: doc.history || [],
    };
}

export async function getClassificationAudit(companyId, id) {
    await ensureIndustryClassificationStore();
    const doc = await getClassification(companyId, id);
    return {
        _id: doc._id,
        companyId: doc.companyId,
        locked: doc.locked,
        lockedAt: doc.lockedAt,
        lockedBy: doc.lockedBy,
        manuallyApproved: doc.manuallyApproved,
        engineUsed: doc.engineUsed,
        fallbackUsed: doc.fallbackUsed,
        modelProvider: doc.modelProvider,
        modelVersion: doc.modelVersion,
        analysisTimestamp: doc.analysisTimestamp,
        updatedBy: doc.updatedBy,
        history: doc.history || [],
    };
}

async function upsertClassification(companyId, userId, meta, result) {
    const key = recordKeyOf(meta);
    if (!key) {
        const created = await AiIndustryClassification.create({
            companyId,
            financialYear: meta.financialYear || '',
            extractedLeadId: meta.extractedLeadId || null,
            discoveryJobId: meta.discoveryJobId || null,
            previewIndex: meta.previewIndex != null ? meta.previewIndex : null,
            recordKey: 'adhoc:' + new mongoose.Types.ObjectId().toString(),
            companyName: result.companyName || '',
            status: result.status,
            primaryIndustry: result.primaryIndustry,
            primaryIndustryId: result.primaryIndustryId && mongoose.isValidObjectId(result.primaryIndustryId) ? result.primaryIndustryId : null,
            parentIndustry: result.parentIndustry,
            subIndustry: result.subIndustry,
            secondaryIndustries: result.secondaryIndustries || [],
            customerType: result.customerType || '',
            customerTypeId: result.customerTypeId && mongoose.isValidObjectId(result.customerTypeId) ? result.customerTypeId : null,
            confidenceScore: result.confidenceScore || 0,
            engineUsed: result.engineUsed,
            modelProvider: result.modelProvider || '',
            modelVersion: result.modelVersion || '',
            rulesMatched: result.rulesMatched || [],
            positiveKeywordsFound: result.positiveKeywordsFound || [],
            negativeKeywordsFound: result.negativeKeywordsFound || [],
            productSignals: result.productSignals || [],
            websiteSignals: result.websiteSignals || [],
            evidenceSnippets: result.evidenceSnippets || [],
            evidenceSourceUrls: result.evidenceSourceUrls || [],
            analysisTimestamp: new Date(),
            manualReviewReason: result.manualReviewReason || '',
            fallbackUsed: !!result.fallbackUsed,
            applied: !!result.applied,
            createdBy: userId || null,
            updatedBy: userId || null,
            history: [historyEntry('classified', userId, null, result, 'initial classification')],
            rawPayload: result,
        });
        return { skipped: false, classification: created.toObject() };
    }

    const existing = await AiIndustryClassification.findOne({
        companyId,
        recordKey: key,
        isDeleted: { $ne: true },
    });

    if (isProtectedFromAutoOverwrite(existing)) {
        return {
            skipped: true,
            reason: existing.locked ? 'locked' : 'manual_approved',
            classification: existing.toObject(),
        };
    }

    const payload = {
        companyId,
        financialYear: meta.financialYear || '',
        extractedLeadId: meta.extractedLeadId || null,
        discoveryJobId: meta.discoveryJobId || null,
        previewIndex: meta.previewIndex != null ? meta.previewIndex : null,
        recordKey: key,
        companyName: result.companyName || '',
        status: result.status,
        primaryIndustry: result.primaryIndustry,
        primaryIndustryId: result.primaryIndustryId && mongoose.isValidObjectId(result.primaryIndustryId) ? result.primaryIndustryId : null,
        parentIndustry: result.parentIndustry,
        subIndustry: result.subIndustry,
        secondaryIndustries: result.secondaryIndustries || [],
        customerType: result.customerType || '',
        customerTypeId: result.customerTypeId && mongoose.isValidObjectId(result.customerTypeId) ? result.customerTypeId : null,
        confidenceScore: result.confidenceScore || 0,
        engineUsed: result.engineUsed,
        modelProvider: result.modelProvider || '',
        modelVersion: result.modelVersion || '',
        rulesMatched: result.rulesMatched || [],
        positiveKeywordsFound: result.positiveKeywordsFound || [],
        negativeKeywordsFound: result.negativeKeywordsFound || [],
        productSignals: result.productSignals || [],
        websiteSignals: result.websiteSignals || [],
        evidenceSnippets: result.evidenceSnippets || [],
        evidenceSourceUrls: result.evidenceSourceUrls || [],
        analysisTimestamp: new Date(),
        manualReviewReason: result.manualReviewReason || '',
        fallbackUsed: !!result.fallbackUsed,
        applied: !!result.applied,
        updatedBy: userId || null,
        rawPayload: result,
    };

    if (!existing) {
        const created = await AiIndustryClassification.create({
            ...payload,
            createdBy: userId || null,
            history: [historyEntry('classified', userId, null, result, 'initial classification')],
        });
        return { skipped: false, classification: created.toObject() };
    }

    const previous = existing.toObject();
    Object.assign(existing, payload);
    existing.history = [...(existing.history || []), historyEntry('reclassified', userId, previous, result, 're-analysis')].slice(-100);
    await existing.save();
    return { skipped: false, classification: existing.toObject() };
}

async function applyToExtractedLead(companyId, leadId, classification) {
    if (!leadId) return;
    const lead = await ExtractedLead.findOne({ _id: leadId, companyId });
    if (!lead) return;
    lead.aiClassification = classification.primaryIndustry || lead.aiClassification;
    lead.rawExtractedData = {
        ...(lead.rawExtractedData || {}),
        industryClassification: classification,
    };
    await lead.save();
}

async function applyToDiscoveryPreview(companyId, discoveryJobId, previewIndex, classification) {
    if (!discoveryJobId || previewIndex == null) return;
    const job = await DiscoveryJob.findOne({ _id: discoveryJobId, companyId, isDeleted: { $ne: true } });
    if (!job) return;
    const preview = [...(job.metadata?.previewRecords || [])];
    if (!preview[previewIndex]) return;
    preview[previewIndex] = {
        ...preview[previewIndex],
        aiClassification: classification.primaryIndustry || preview[previewIndex].aiClassification,
        rawExtractedData: {
            ...(preview[previewIndex].rawExtractedData || {}),
            industryClassification: classification,
        },
    };
    job.metadata = { ...(job.metadata || {}), previewRecords: preview };
    await job.save();
}

export async function classifyOneRecord(companyId, userId, payload = {}) {
    await ensureIndustryClassificationStore();
    rejectTenantOverrides(payload);
    const settings = await getOrCreateExtractorSettings(companyId);
    const masters = await loadLeadIntelligenceMasters(companyId);

    let record = payload.record || null;
    let meta = {
        financialYear: payload.financialYear || '',
        extractedLeadId: payload.extractedLeadId || null,
        discoveryJobId: payload.discoveryJobId || null,
        previewIndex: payload.previewIndex != null ? Number(payload.previewIndex) : null,
        adhocKey: payload.adhocKey || null,
    };

    if (payload.extractedLeadId) {
        const lead = await ExtractedLead.findOne({ _id: payload.extractedLeadId, companyId }).lean();
        if (!lead) throw new ApiError(404, 'Extracted lead not found');
        record = lead;
        meta.financialYear = lead.financialYear || meta.financialYear;
        meta.extractedLeadId = lead._id;
    } else if (payload.discoveryJobId != null && payload.previewIndex != null) {
        const job = await DiscoveryJob.findOne({ _id: payload.discoveryJobId, companyId, isDeleted: { $ne: true } }).lean();
        if (!job) throw new ApiError(404, 'Discovery job not found');
        const preview = job.metadata?.previewRecords || [];
        const idx = Number(payload.previewIndex);
        if (!preview[idx]) throw new ApiError(404, 'Preview record not found');
        record = preview[idx];
        meta.financialYear = job.financialYear || meta.financialYear;
        meta.discoveryJobId = job._id;
        meta.previewIndex = idx;
    }

    if (!record) throw new ApiError(400, 'record, extractedLeadId, or discoveryJobId+previewIndex required');

    const existingKey = recordKeyOf(meta);
    const existing = existingKey
        ? await AiIndustryClassification.findOne({ companyId, recordKey: existingKey, isDeleted: { $ne: true } })
        : null;
    if (isProtectedFromAutoOverwrite(existing) && !payload.force) {
        return {
            skipped: true,
            reason: existing.locked ? 'locked' : 'manual_approved',
            classification: existing.toObject(),
        };
    }

    const result = await classifyIndustryRecord(companyId, record, settings, {
        masters,
        forceMode: payload.mode || null,
    });
    const saved = await upsertClassification(companyId, userId, meta, result);
    if (!saved.skipped && result.applied) {
        await applyToExtractedLead(companyId, meta.extractedLeadId, saved.classification);
        await applyToDiscoveryPreview(companyId, meta.discoveryJobId, meta.previewIndex, saved.classification);
    }
    return saved;
}

export async function overrideClassification(companyId, userId, id, payload = {}) {
    await ensureIndustryClassificationStore();
    rejectTenantOverrides(payload);
    const doc = await AiIndustryClassification.findOne({ _id: id, companyId, isDeleted: { $ne: true } });
    if (!doc) throw new ApiError(404, 'Classification not found');
    if (doc.locked) throw new ApiError(400, 'Classification is locked');

    const previous = doc.toObject();
    const action = String(payload.action || 'override');

    if (action === 'accept') {
        doc.status = 'CLASSIFIED';
        doc.applied = true;
        doc.manuallyApproved = true;
        doc.manualReviewReason = '';
    } else if (action === 'override') {
        if (payload.parentIndustry != null) doc.parentIndustry = String(payload.parentIndustry);
        if (payload.subIndustry != null) doc.subIndustry = String(payload.subIndustry);
        doc.primaryIndustry = [doc.parentIndustry, doc.subIndustry].filter(Boolean).join(' / ');
        if (Array.isArray(payload.secondaryIndustries)) doc.secondaryIndustries = payload.secondaryIndustries;
        if (payload.status) doc.status = payload.status;
        doc.engineUsed = 'manual_override';
        doc.manualReviewReason = String(payload.reason || 'Manual override');
        doc.applied = payload.apply !== false;
        doc.manuallyApproved = true;
    } else {
        throw new ApiError(400, 'Invalid override action');
    }

    doc.updatedBy = userId;
    doc.history = [...(doc.history || []), historyEntry(action, userId, previous, doc.toObject(), payload.reason || '')].slice(-100);
    await doc.save();

    if (doc.applied) {
        await applyToExtractedLead(companyId, doc.extractedLeadId, doc.toObject());
        await applyToDiscoveryPreview(companyId, doc.discoveryJobId, doc.previewIndex, doc.toObject());
    }
    return doc.toObject();
}

export async function lockClassification(companyId, userId, id, payload = {}) {
    await ensureIndustryClassificationStore();
    rejectTenantOverrides(payload);
    const doc = await AiIndustryClassification.findOne({ _id: id, companyId, isDeleted: { $ne: true } });
    if (!doc) throw new ApiError(404, 'Classification not found');

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

export async function markIrrelevantClassification(companyId, userId, id, payload = {}) {
    await ensureIndustryClassificationStore();
    rejectTenantOverrides(payload);
    const doc = await AiIndustryClassification.findOne({ _id: id, companyId, isDeleted: { $ne: true } });
    if (!doc) throw new ApiError(404, 'Classification not found');
    if (doc.locked) throw new ApiError(400, 'Classification is locked');

    const previous = doc.toObject();
    doc.status = 'IRRELEVANT';
    doc.applied = false;
    doc.manuallyApproved = true;
    doc.manualReviewReason = String(payload.reason || 'Marked irrelevant by user');
    doc.updatedBy = userId;
    doc.history = [...(doc.history || []), historyEntry('mark_irrelevant', userId, previous, doc.toObject(), payload.reason || 'Marked irrelevant')].slice(-100);
    await doc.save();
    return doc.toObject();
}

export async function reanalyzeClassification(companyId, userId, id, payload = {}) {
    await ensureIndustryClassificationStore();
    rejectTenantOverrides(payload);
    const doc = await AiIndustryClassification.findOne({ _id: id, companyId, isDeleted: { $ne: true } });
    if (!doc) throw new ApiError(404, 'Classification not found');
    if (doc.locked) throw new ApiError(400, 'Locked classification cannot be overwritten automatically');
    if (doc.manuallyApproved && !payload.force) {
        throw new ApiError(400, 'Manually approved classification cannot be overwritten automatically');
    }
    const base = {
        financialYear: doc.financialYear,
        mode: payload.mode,
        force: true,
    };
    if (doc.extractedLeadId) {
        return classifyOneRecord(companyId, userId, { ...base, extractedLeadId: doc.extractedLeadId });
    }
    if (doc.discoveryJobId != null && doc.previewIndex != null) {
        return classifyOneRecord(companyId, userId, {
            ...base,
            discoveryJobId: doc.discoveryJobId,
            previewIndex: doc.previewIndex,
        });
    }
    const raw = doc.rawPayload && typeof doc.rawPayload === 'object' ? doc.rawPayload : {};
    return classifyOneRecord(companyId, userId, {
        ...base,
        adhocKey: String(doc.recordKey || doc._id).replace(/^adhoc:/, ''),
        record: {
            companyName: doc.companyName || raw.companyName || '',
            businessDescription: raw.businessDescription || (doc.evidenceSnippets || []).join(' '),
            website: raw.website || '',
            keywords: raw.positiveKeywordsFound || doc.positiveKeywordsFound || [],
            websiteTitle: raw.websiteTitle || '',
            websiteMetaDescription: raw.websiteMetaDescription || '',
        },
    });
}
