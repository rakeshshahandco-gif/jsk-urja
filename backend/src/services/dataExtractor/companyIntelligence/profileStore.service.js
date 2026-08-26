import mongoose from 'mongoose';
import { AiCompanyIntelligenceProfile } from '../../../models/aiCompanyIntelligenceProfile.model.js';
import { ensureModelIndexes } from '../../../utils/ensureModelIndexes.js';
import { ExtractedLead } from '../../../models/extractedLead.model.js';
import { AiIndustryClassification } from '../../../models/aiIndustryClassification.model.js';
import { AiLeadRelevance } from '../../../models/aiLeadRelevance.model.js';
import { AiProductRecommendation } from '../../../models/aiProductRecommendation.model.js';
import { AiContactIntelligence } from '../../../models/aiContactIntelligence.model.js';
import { ApiError } from '../../../utils/ApiError.js';
import { generateCompanyProfile } from './generate.service.js';

async function ensureCompanyIntelligenceStore() {
    await ensureModelIndexes(AiCompanyIntelligenceProfile);
}

function rejectTenantOverrides(payload = {}) {
    if (payload.companyId != null || payload.tenantId != null) {
        throw new ApiError(400, 'companyId/tenantId overrides are rejected');
    }
}

function assertNoSecrets(obj) {
    const blob = JSON.stringify(obj || {});
    if (/password|cookie|authorization|bearer\s|sessiontoken|sk-[a-z0-9]|openai_api_key/i.test(blob)) {
        throw new ApiError(500, 'Refusing to store or return secret/session values');
    }
}

function slimSnapshot(doc) {
    if (!doc || typeof doc !== 'object') return doc || null;
    return {
        status: doc.status || '',
        companyName: doc.companyName || '',
        shortSummary: String(doc.shortSummary || '').slice(0, 400),
        standardSummary: String(doc.standardSummary || '').slice(0, 600),
        confidence: doc.confidence,
        recommendedNextAction: doc.recommendedNextAction || '',
        primaryIndustry: doc.primaryIndustry || '',
        customerType: doc.customerType || '',
        engineUsed: doc.engineUsed || '',
        manuallyApproved: !!doc.manuallyApproved,
        locked: !!doc.locked,
        strengths: (doc.strengths || []).slice(0, 10),
        risks: (doc.risks || []).slice(0, 10),
        missingInformation: (doc.missingInformation || []).slice(0, 10),
    };
}

function historyEntry(action, userId, previous, next, reason = '', sourceType = 'system') {
    return {
        at: new Date(),
        action,
        userId: userId || null,
        previousStatus: previous?.status || '',
        resultingStatus: next?.status || previous?.status || '',
        previous: slimSnapshot(previous),
        next: slimSnapshot(next),
        reason: String(reason || '').slice(0, 2000),
        sourceType,
    };
}

function recordKeyOf(meta = {}) {
    if (meta.extractedLeadId) return 'lead:' + String(meta.extractedLeadId);
    if (meta.discoveryJobId != null && meta.previewIndex != null) return 'job:' + String(meta.discoveryJobId) + ':' + String(meta.previewIndex);
    if (meta.adhocKey) return 'adhoc:' + String(meta.adhocKey);
    return '';
}

function upstreamHashes({ record, classification, relevance, recommendation, contact }) {
    return {
        classificationUpdatedAt: classification?.updatedAt || null,
        relevanceUpdatedAt: relevance?.updatedAt || null,
        recommendationUpdatedAt: recommendation?.updatedAt || null,
        contactUpdatedAt: contact?.updatedAt || null,
        recordUpdatedAt: record?.updatedAt || null,
    };
}

function isUpstreamNewer(existing, hashes) {
    if (!existing?.upstreamHashes) return true;
    const keys = ['classificationUpdatedAt', 'relevanceUpdatedAt', 'recommendationUpdatedAt', 'contactUpdatedAt', 'recordUpdatedAt'];
    for (const k of keys) {
        const prev = existing.upstreamHashes[k] ? new Date(existing.upstreamHashes[k]).getTime() : 0;
        const next = hashes[k] ? new Date(hashes[k]).getTime() : 0;
        if (next > prev) return true;
    }
    return false;
}

export function markProfileOutdatedIfNeeded(profile, hashes) {
    if (!profile || profile.locked) return profile;
    if (profile.status === 'APPROVED' || profile.status === 'GENERATED' || profile.status === 'LOW_CONFIDENCE') {
        if (isUpstreamNewer(profile, hashes)) {
            profile.status = 'OUTDATED';
        }
    }
    return profile;
}

export async function listProfiles(companyId, query = {}) {
    await ensureCompanyIntelligenceStore();
    const q = { companyId, isDeleted: { $ne: true } };
    if (query.status) q.status = query.status;
    if (query.parentIndustry || query.primaryIndustry) q.primaryIndustry = query.parentIndustry || query.primaryIndustry;
    if (query.customerType) q.customerType = query.customerType;
    if (query.locked === 'true') q.locked = true;
    if (query.locked === 'false') q.locked = false;
    if (query.approved === 'true') q.manuallyApproved = true;
    if (query.approved === 'false') q.manuallyApproved = { $ne: true };
    if (query.outdated === 'true') q.status = 'OUTDATED';
    if (query.engineUsed) q.engineUsed = query.engineUsed;
    if (query.minConfidence != null) q.confidence = { $gte: Number(query.minConfidence) };
    if (query.contactAvailable === 'true') q['contactSnapshot.primaryContact'] = { $ne: null };
    if (query.recommendedProduct) q['recommendationSnapshot.productName'] = new RegExp(String(query.recommendedProduct), 'i');
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 50));
    const skip = Math.max(0, Number(query.skip) || 0);
    const [results, total] = await Promise.all([
        AiCompanyIntelligenceProfile.find(q).sort({ updatedAt: -1 }).skip(skip).limit(limit).lean(),
        AiCompanyIntelligenceProfile.countDocuments(q),
    ]);
    return { results, total, limit, skip };
}

export async function getProfile(companyId, id) {
    await ensureCompanyIntelligenceStore();
    const doc = await AiCompanyIntelligenceProfile.findOne({ _id: id, companyId, isDeleted: { $ne: true } }).lean();
    if (!doc) throw new ApiError(404, 'Company intelligence profile not found');
    return doc;
}

export async function getProfileHistory(companyId, id) {
    await ensureCompanyIntelligenceStore();
    const doc = await getProfile(companyId, id);
    return { _id: doc._id, companyId: doc.companyId, history: doc.history || [] };
}

export async function generateOne(companyId, userId, payload = {}) {
    await ensureCompanyIntelligenceStore();
    rejectTenantOverrides(payload);
    let record = payload.record || null;
    let classification = payload.classification || null;
    let relevance = payload.relevance || null;
    let recommendation = payload.recommendation || null;
    let contact = payload.contact || null;
    const mode = payload.mode || 'rule_based';
    const meta = {
        financialYear: payload.financialYear || '',
        extractedLeadId: payload.extractedLeadId || null,
        discoveryJobId: payload.discoveryJobId || null,
        previewIndex: payload.previewIndex != null ? Number(payload.previewIndex) : null,
        classificationId: payload.classificationId || null,
        relevanceId: payload.relevanceId || null,
        recommendationId: payload.recommendationId || null,
        contactIntelligenceId: payload.contactIntelligenceId || null,
        adhocKey: payload.adhocKey || null,
    };

    if (payload.extractedLeadId) {
        const lead = await ExtractedLead.findOne({ _id: payload.extractedLeadId, companyId }).lean();
        if (!lead) throw new ApiError(404, 'Extracted lead not found');
        record = lead;
        meta.extractedLeadId = lead._id;
        meta.financialYear = lead.financialYear || meta.financialYear;
    }
    if (payload.classificationId) {
        classification = await AiIndustryClassification.findOne({ _id: payload.classificationId, companyId, isDeleted: { $ne: true } }).lean();
        if (!classification) throw new ApiError(404, 'Classification not found');
        meta.classificationId = classification._id;
        record = record || { companyName: classification.companyName };
    }
    if (payload.relevanceId) {
        relevance = await AiLeadRelevance.findOne({ _id: payload.relevanceId, companyId, isDeleted: { $ne: true } }).lean();
        if (!relevance) throw new ApiError(404, 'Relevance not found');
        meta.relevanceId = relevance._id;
    }
    if (payload.recommendationId) {
        recommendation = await AiProductRecommendation.findOne({ _id: payload.recommendationId, companyId, isDeleted: { $ne: true } }).lean();
        if (!recommendation) throw new ApiError(404, 'Recommendation not found');
        meta.recommendationId = recommendation._id;
    }
    if (payload.contactIntelligenceId) {
        contact = await AiContactIntelligence.findOne({ _id: payload.contactIntelligenceId, companyId, isDeleted: { $ne: true } }).lean();
        if (!contact) throw new ApiError(404, 'Contact intelligence not found');
        meta.contactIntelligenceId = contact._id;
    }

    // Auto-attach latest upstream docs by recordKey/lead when IDs not provided
    if (meta.extractedLeadId) {
        if (!classification) {
            classification = await AiIndustryClassification.findOne({ companyId, extractedLeadId: meta.extractedLeadId, isDeleted: { $ne: true } }).sort({ updatedAt: -1 }).lean();
            if (classification) meta.classificationId = classification._id;
        }
        if (!relevance) {
            relevance = await AiLeadRelevance.findOne({ companyId, extractedLeadId: meta.extractedLeadId, isDeleted: { $ne: true } }).sort({ updatedAt: -1 }).lean();
            if (relevance) meta.relevanceId = relevance._id;
        }
        if (!recommendation) {
            recommendation = await AiProductRecommendation.findOne({ companyId, extractedLeadId: meta.extractedLeadId, isDeleted: { $ne: true } }).sort({ updatedAt: -1 }).lean();
            if (recommendation) meta.recommendationId = recommendation._id;
        }
        if (!contact) {
            contact = await AiContactIntelligence.findOne({ companyId, extractedLeadId: meta.extractedLeadId, isDeleted: { $ne: true } }).sort({ updatedAt: -1 }).lean();
            if (contact) meta.contactIntelligenceId = contact._id;
        }
    }

    if (!record) throw new ApiError(400, 'record or extractedLeadId required');

    const key = recordKeyOf(meta) || ('adhoc:' + new mongoose.Types.ObjectId().toString());
    const existing = await AiCompanyIntelligenceProfile.findOne({ companyId, recordKey: key, isDeleted: { $ne: true } });
    const hashes = upstreamHashes({ record, classification, relevance, recommendation, contact });

    if (existing?.locked && !payload.force) {
        return { skipped: true, reason: 'locked', profile: existing.toObject() };
    }
    if (existing && !payload.force && !payload.refresh && existing.status !== 'OUTDATED' && existing.status !== 'FAILED' && !isUpstreamNewer(existing, hashes)) {
        return { skipped: true, reason: 'unchanged', profile: existing.toObject() };
    }

    const result = await generateCompanyProfile({
        record, classification, relevance, recommendation, contact, mode,
    });
    assertNoSecrets(result);

    const docPayload = {
        companyId,
        financialYear: meta.financialYear || '',
        extractedLeadId: meta.extractedLeadId || null,
        discoveryJobId: meta.discoveryJobId || null,
        previewIndex: meta.previewIndex,
        classificationId: meta.classificationId || null,
        relevanceId: meta.relevanceId || null,
        recommendationId: meta.recommendationId || null,
        contactIntelligenceId: meta.contactIntelligenceId || null,
        recordKey: key,
        companyName: result.companyName,
        status: result.status,
        shortSummary: result.shortSummary,
        standardSummary: result.standardSummary,
        detailedSummary: result.detailedSummary,
        structuredSections: result.structuredSections,
        primaryIndustry: result.primaryIndustry,
        secondaryIndustries: result.secondaryIndustries || [],
        customerType: result.customerType,
        relevanceSnapshot: result.relevanceSnapshot,
        recommendationSnapshot: result.recommendationSnapshot,
        contactSnapshot: result.contactSnapshot,
        strengths: result.strengths || [],
        risks: result.risks || [],
        missingInformation: result.missingInformation || [],
        recommendedNextAction: result.recommendedNextAction,
        nextActionReason: result.nextActionReason,
        confidence: result.confidence,
        evidenceReferences: result.evidenceReferences || [],
        sourceUrls: result.sourceUrls || [],
        engineUsed: result.engineUsed,
        modelVersion: result.modelVersion,
        fallbackUsed: !!result.fallbackUsed,
        fallbackReason: result.fallbackReason || '',
        upstreamHashes: hashes,
        generatedAt: new Date(),
        rawPayload: { ...result, history: undefined },
        updatedBy: userId || null,
        locked: existing?.locked || false,
        lockedAt: existing?.lockedAt || null,
        lockedBy: existing?.lockedBy || null,
        manuallyApproved: false,
    };

    if (!existing) {
        const created = await AiCompanyIntelligenceProfile.create({
            ...docPayload,
            createdBy: userId || null,
            history: [historyEntry('generated', userId, null, result, 'initial profile generation')],
        });
        return { skipped: false, profile: created.toObject() };
    }

    const previous = existing.toObject();
    Object.assign(existing, docPayload);
    existing.history = [...(existing.history || []), historyEntry(payload.refresh ? 'refreshed' : 'regenerated', userId, previous, result, payload.reason || 're-generate')].slice(-100);
    await existing.save();
    return { skipped: false, profile: existing.toObject() };
}

export async function editProfile(companyId, userId, id, payload = {}) {
    await ensureCompanyIntelligenceStore();
    rejectTenantOverrides(payload);
    const doc = await AiCompanyIntelligenceProfile.findOne({ _id: id, companyId, isDeleted: { $ne: true } });
    if (!doc) throw new ApiError(404, 'Company intelligence profile not found');
    if (doc.locked) throw new ApiError(400, 'Profile is locked');

    const previous = doc.toObject();
    const action = String(payload.action || 'edit');

    if (action === 'edit') {
        if (payload.shortSummary != null) doc.shortSummary = String(payload.shortSummary).slice(0, 600);
        if (payload.standardSummary != null) doc.standardSummary = String(payload.standardSummary).slice(0, 2500);
        if (payload.detailedSummary != null) doc.detailedSummary = String(payload.detailedSummary).slice(0, 8000);
        if (payload.recommendedNextAction != null) doc.recommendedNextAction = String(payload.recommendedNextAction).slice(0, 200);
        if (payload.nextActionReason != null) doc.nextActionReason = String(payload.nextActionReason).slice(0, 500);
        if (Array.isArray(payload.strengths)) doc.strengths = payload.strengths.map((x) => String(x).slice(0, 300)).slice(0, 20);
        if (Array.isArray(payload.risks)) doc.risks = payload.risks.map((x) => String(x).slice(0, 300)).slice(0, 20);
        if (Array.isArray(payload.missingInformation)) doc.missingInformation = payload.missingInformation.map((x) => String(x).slice(0, 300)).slice(0, 30);
        doc.reviewedAt = new Date();
    } else if (action === 'approve') {
        doc.manuallyApproved = true;
        doc.status = 'APPROVED';
        doc.reviewedAt = new Date();
    } else if (action === 'reject') {
        doc.manuallyApproved = false;
        doc.status = 'MANUAL_REVIEW_REQUIRED';
        doc.reviewedAt = new Date();
    } else if (action === 'mark_outdated') {
        doc.status = 'OUTDATED';
    } else if (action === 'mark_unavailable') {
        const field = String(payload.field || 'information');
        doc.missingInformation = uniqPush(doc.missingInformation, `${field}: NOT AVAILABLE`);
    } else {
        throw new ApiError(400, 'Invalid edit action');
    }

    doc.updatedBy = userId;
    doc.history = [...(doc.history || []), historyEntry(action, userId, previous, doc.toObject(), payload.reason || '', 'manual')].slice(-100);
    await doc.save();
    return doc.toObject();
}

function uniqPush(list = [], value) {
    const out = [...(list || [])];
    if (value && !out.includes(value)) out.push(value);
    return out.slice(0, 40);
}

export async function lockProfile(companyId, userId, id, payload = {}) {
    await ensureCompanyIntelligenceStore();
    rejectTenantOverrides(payload);
    const doc = await AiCompanyIntelligenceProfile.findOne({ _id: id, companyId, isDeleted: { $ne: true } });
    if (!doc) throw new ApiError(404, 'Company intelligence profile not found');
    const previous = doc.toObject();
    const action = String(payload.action || 'lock');
    if (action === 'lock') {
        doc.locked = true;
        doc.lockedAt = new Date();
        doc.lockedBy = userId;
        if (doc.status === 'APPROVED') doc.status = 'LOCKED';
    } else if (action === 'unlock') {
        doc.locked = false;
        doc.lockedAt = null;
        doc.lockedBy = null;
        if (doc.status === 'LOCKED') doc.status = doc.manuallyApproved ? 'APPROVED' : 'GENERATED';
    } else {
        throw new ApiError(400, 'action must be lock or unlock');
    }
    doc.updatedBy = userId;
    doc.history = [...(doc.history || []), historyEntry(action, userId, previous, doc.toObject(), payload.reason || '')].slice(-100);
    await doc.save();
    return doc.toObject();
}

export async function exportApprovedProfiles(companyId, query = {}) {
    await ensureCompanyIntelligenceStore();
    const q = {
        companyId,
        isDeleted: { $ne: true },
        $or: [{ manuallyApproved: true }, { status: 'APPROVED' }, { status: 'LOCKED' }],
    };
    const rows = await AiCompanyIntelligenceProfile.find(q).sort({ updatedAt: -1 }).limit(500).lean();
    const format = String(query.format || 'json').toLowerCase();
    const results = rows.map((r) => ({
        companyName: r.companyName,
        status: r.status,
        shortSummary: r.shortSummary,
        standardSummary: r.standardSummary,
        primaryIndustry: r.primaryIndustry,
        customerType: r.customerType,
        recommendedNextAction: r.recommendedNextAction,
        confidence: r.confidence,
        recommendedProduct: r.recommendationSnapshot?.productName || '',
        primaryContact: r.contactSnapshot?.primaryContact
            ? {
                name: r.contactSnapshot.primaryContact.contactName || '',
                email: r.contactSnapshot.primaryContact.email || '',
                phone: r.contactSnapshot.primaryContact.phone || '',
                role: r.contactSnapshot.primaryContact.contactRoleCategory || '',
            }
            : null,
        sourceUrls: r.sourceUrls || [],
        engineUsed: r.engineUsed,
        generatedAt: r.generatedAt,
    }));
    return { format, results };
}

/** Helper for tests / callers: mark existing profile outdated when upstream changes. */
export async function applyOutdatedFromUpstream(companyId, profileId, hashes = {}) {
    await ensureCompanyIntelligenceStore();
    const doc = await AiCompanyIntelligenceProfile.findOne({ _id: profileId, companyId, isDeleted: { $ne: true } });
    if (!doc) throw new ApiError(404, 'Company intelligence profile not found');
    if (doc.locked) return { outdated: false, reason: 'locked', profile: doc.toObject() };
    const previous = doc.toObject();
    markProfileOutdatedIfNeeded(doc, { ...doc.upstreamHashes?.toObject?.() || doc.upstreamHashes || {}, ...hashes });
    if (doc.status === 'OUTDATED') {
        doc.history = [...(doc.history || []), historyEntry('outdated', null, previous, doc.toObject(), 'Upstream Phase 6-9 data changed')].slice(-100);
        await doc.save();
        return { outdated: true, profile: doc.toObject() };
    }
    return { outdated: false, profile: doc.toObject() };
}
