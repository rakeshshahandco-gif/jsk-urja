import mongoose from 'mongoose';
import { AiLeadScore } from '../../../models/aiLeadScore.model.js';
import { ExtractedLead } from '../../../models/extractedLead.model.js';
import { AiIndustryClassification } from '../../../models/aiIndustryClassification.model.js';
import { AiLeadRelevance } from '../../../models/aiLeadRelevance.model.js';
import { AiProductRecommendation } from '../../../models/aiProductRecommendation.model.js';
import { AiContactIntelligence } from '../../../models/aiContactIntelligence.model.js';
import { AiCompanyIntelligenceProfile } from '../../../models/aiCompanyIntelligenceProfile.model.js';
import { ApiError } from '../../../utils/ApiError.js';
import { runLeadScoring } from './score.service.js';
import { getLeadScoringSettings, settingsFingerprint } from './settings.service.js';

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
        finalScore: doc.finalScore,
        priority: doc.priority || '',
        grade: doc.grade || '',
        confidence: doc.confidence,
        recommendation: doc.recommendation || '',
        engineUsed: doc.engineUsed || '',
        manuallyApproved: !!doc.manuallyApproved,
        locked: !!doc.locked,
        positiveSignals: (doc.positiveSignals || []).slice(0, 8),
        negativeSignals: (doc.negativeSignals || []).slice(0, 8),
    };
}

function historyEntry(action, userId, previous, next, reason = '', overrideType = '', sourceType = 'system') {
    return {
        at: new Date(),
        action,
        userId: userId || null,
        previousStatus: previous?.status || '',
        resultingStatus: next?.status || previous?.status || '',
        previous: slimSnapshot(previous),
        next: slimSnapshot(next),
        reason: String(reason || '').slice(0, 2000),
        overrideType: String(overrideType || ''),
        sourceType,
    };
}

function recordKeyOf(meta = {}) {
    if (meta.extractedLeadId) return 'lead:' + String(meta.extractedLeadId);
    if (meta.discoveryJobId != null && meta.previewIndex != null) return 'job:' + String(meta.discoveryJobId) + ':' + String(meta.previewIndex);
    if (meta.adhocKey) return 'adhoc:' + String(meta.adhocKey);
    return '';
}

function upstreamHashes({ record, classification, relevance, recommendation, contact, profile, settingsFp }) {
    return {
        classificationUpdatedAt: classification?.updatedAt || null,
        relevanceUpdatedAt: relevance?.updatedAt || null,
        recommendationUpdatedAt: recommendation?.updatedAt || null,
        contactUpdatedAt: contact?.updatedAt || null,
        profileUpdatedAt: profile?.updatedAt || null,
        settingsVersion: settingsFp || '',
        recordUpdatedAt: record?.updatedAt || null,
    };
}

function isUpstreamNewer(existing, hashes) {
    if (!existing?.upstreamHashes) return true;
    const keys = ['classificationUpdatedAt', 'relevanceUpdatedAt', 'recommendationUpdatedAt', 'contactUpdatedAt', 'profileUpdatedAt', 'recordUpdatedAt'];
    for (const k of keys) {
        const prev = existing.upstreamHashes[k] ? new Date(existing.upstreamHashes[k]).getTime() : 0;
        const next = hashes[k] ? new Date(hashes[k]).getTime() : 0;
        if (next > prev) return true;
    }
    if ((existing.upstreamHashes.settingsVersion || '') !== (hashes.settingsVersion || '')) return true;
    return false;
}

export async function listScores(companyId, query = {}) {
    const q = { companyId, isDeleted: { $ne: true } };
    if (query.status) q.status = query.status;
    if (query.priority) q.priority = query.priority;
    if (query.grade) q.grade = query.grade;
    if (query.locked === 'true') q.locked = true;
    if (query.locked === 'false') q.locked = false;
    if (query.approved === 'true') q.manuallyApproved = true;
    if (query.outdated === 'true') q.status = 'OUTDATED';
    if (query.engineUsed) q.engineUsed = query.engineUsed;
    if (query.minScore != null || query.maxScore != null) {
        q.finalScore = {};
        if (query.minScore != null) q.finalScore.$gte = Number(query.minScore);
        if (query.maxScore != null) q.finalScore.$lte = Number(query.maxScore);
    }
    if (query.minConfidence != null) q.confidence = { $gte: Number(query.minConfidence) };
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 50));
    const skip = Math.max(0, Number(query.skip) || 0);
    const [results, total] = await Promise.all([
        AiLeadScore.find(q).sort({ finalScore: -1, updatedAt: -1 }).skip(skip).limit(limit).lean(),
        AiLeadScore.countDocuments(q),
    ]);
    return { results, total, limit, skip };
}

export async function getScore(companyId, id) {
    const doc = await AiLeadScore.findOne({ _id: id, companyId, isDeleted: { $ne: true } }).lean();
    if (!doc) throw new ApiError(404, 'Lead score not found');
    return doc;
}

export async function getScoreHistory(companyId, id) {
    const doc = await getScore(companyId, id);
    return { _id: doc._id, companyId: doc.companyId, history: doc.history || [] };
}

export async function scoreOne(companyId, userId, payload = {}) {
    rejectTenantOverrides(payload);
    let record = payload.record || null;
    let classification = payload.classification || null;
    let relevance = payload.relevance || null;
    let recommendation = payload.recommendation || null;
    let contact = payload.contact || null;
    let profile = payload.profile || null;
    const mode = payload.mode || null;
    const meta = {
        financialYear: payload.financialYear || '',
        extractedLeadId: payload.extractedLeadId || null,
        discoveryJobId: payload.discoveryJobId || null,
        previewIndex: payload.previewIndex != null ? Number(payload.previewIndex) : null,
        classificationId: payload.classificationId || null,
        relevanceId: payload.relevanceId || null,
        recommendationId: payload.recommendationId || null,
        contactIntelligenceId: payload.contactIntelligenceId || null,
        profileId: payload.profileId || null,
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
    if (payload.profileId) {
        profile = await AiCompanyIntelligenceProfile.findOne({ _id: payload.profileId, companyId, isDeleted: { $ne: true } }).lean();
        if (!profile) throw new ApiError(404, 'Company intelligence profile not found');
        meta.profileId = profile._id;
    }

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
        if (!profile) {
            profile = await AiCompanyIntelligenceProfile.findOne({ companyId, extractedLeadId: meta.extractedLeadId, isDeleted: { $ne: true } }).sort({ updatedAt: -1 }).lean();
            if (profile) meta.profileId = profile._id;
        }
    }

    if (!record) throw new ApiError(400, 'record or extractedLeadId required');

    const settings = await getLeadScoringSettings(companyId);
    const settingsFp = settingsFingerprint(settings);
    const key = recordKeyOf(meta) || ('adhoc:' + new mongoose.Types.ObjectId().toString());
    const existing = await AiLeadScore.findOne({ companyId, recordKey: key, isDeleted: { $ne: true } });
    const hashes = upstreamHashes({ record, classification, relevance, recommendation, contact, profile, settingsFp });

    if (existing?.locked && !payload.force) {
        return { skipped: true, reason: 'locked', score: existing.toObject() };
    }
    if (existing && !payload.force && !payload.refresh && existing.status !== 'OUTDATED' && existing.status !== 'FAILED' && !isUpstreamNewer(existing, hashes)) {
        return { skipped: true, reason: 'unchanged', score: existing.toObject() };
    }

    const result = await runLeadScoring({
        record, classification, relevance, recommendation, contact, profile, settings, mode,
        searchContext: payload.searchContext || null,
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
        profileId: meta.profileId || null,
        recordKey: key,
        companyName: result.companyName,
        status: result.status,
        dimensionScores: result.dimensionScores || [],
        rawScore: result.rawScore,
        weightedScore: result.weightedScore,
        finalScore: result.finalScore,
        confidence: result.confidence,
        priority: result.priority,
        grade: result.grade,
        positiveSignals: result.positiveSignals || [],
        negativeSignals: result.negativeSignals || [],
        penalties: result.penalties || [],
        boosts: result.boosts || [],
        recommendation: result.recommendation,
        recommendationReason: result.recommendationReason,
        reviewReason: result.reviewReason || '',
        engineUsed: result.engineUsed,
        modelVersion: result.modelVersion,
        settingsVersion: result.settingsVersion,
        fallbackUsed: !!result.fallbackUsed,
        fallbackReason: result.fallbackReason || '',
        preAiScore: result.preAiScore,
        postAiScore: result.postAiScore,
        aiAdjustment: result.aiAdjustment,
        evidenceReferences: result.evidenceReferences || [],
        sourceUrls: result.sourceUrls || [],
        inputSnapshots: result.inputSnapshots,
        upstreamHashes: hashes,
        generatedAt: new Date(),
        rawPayload: { ...result, history: undefined },
        updatedBy: userId || null,
        locked: existing?.locked || false,
        lockedAt: existing?.lockedAt || null,
        lockedBy: existing?.lockedBy || null,
        manuallyApproved: false,
        noAutoCrmCreate: true,
        noAutoCommunications: true,
    };

    if (!existing) {
        const created = await AiLeadScore.create({
            ...docPayload,
            createdBy: userId || null,
            history: [historyEntry('scored', userId, null, result, 'initial score')],
        });
        return { skipped: false, score: created.toObject() };
    }

    const previous = existing.toObject();
    Object.assign(existing, docPayload);
    existing.history = [...(existing.history || []), historyEntry(payload.refresh ? 'rescored' : 'rescored', userId, previous, result, payload.reason || 're-score')].slice(-100);
    await existing.save();
    return { skipped: false, score: existing.toObject() };
}

export async function overrideScore(companyId, userId, id, payload = {}) {
    rejectTenantOverrides(payload);
    const doc = await AiLeadScore.findOne({ _id: id, companyId, isDeleted: { $ne: true } });
    if (!doc) throw new ApiError(404, 'Lead score not found');
    if (doc.locked && !['unlock'].includes(payload.action)) throw new ApiError(400, 'Score is locked');

    const previous = doc.toObject();
    const action = String(payload.action || 'override');

    if (action === 'override') {
        if (payload.finalScore != null) {
            const n = Number(payload.finalScore);
            if (!Number.isFinite(n) || n < 0 || n > 100) throw new ApiError(400, 'finalScore must be 0-100');
            doc.finalScore = Math.round(n);
        }
        if (payload.priority) doc.priority = String(payload.priority);
        if (payload.grade) doc.grade = String(payload.grade);
        if (payload.recommendation) doc.recommendation = String(payload.recommendation).slice(0, 200);
        if (payload.manualBoost != null) {
            const pts = Number(payload.manualBoost);
            doc.boosts = [...(doc.boosts || []), { type: 'manual_boost', points: pts, reason: payload.reason || 'Manual boost' }];
            doc.finalScore = Math.max(0, Math.min(100, Number(doc.finalScore) + pts));
        }
        if (payload.manualPenalty != null) {
            const pts = Number(payload.manualPenalty);
            doc.penalties = [...(doc.penalties || []), { type: 'manual_penalty', points: pts, reason: payload.reason || 'Manual penalty' }];
            doc.finalScore = Math.max(0, Math.min(100, Number(doc.finalScore) - pts));
        }
        if (payload.reviewNote) doc.reviewReason = String(payload.reviewNote).slice(0, 2000);
        doc.reviewedAt = new Date();
    } else if (action === 'approve') {
        doc.manuallyApproved = true;
        doc.status = 'APPROVED';
        doc.reviewedAt = new Date();
    } else if (action === 'reject') {
        doc.manuallyApproved = false;
        doc.status = 'REJECTED_MANUALLY';
        doc.reviewedAt = new Date();
        doc.reviewReason = String(payload.reason || 'Rejected manually').slice(0, 2000);
    } else if (action === 'mark_outdated') {
        doc.status = 'OUTDATED';
    } else if (action === 'restore') {
        doc.status = doc.manuallyApproved ? 'APPROVED' : 'SCORED';
    } else {
        throw new ApiError(400, 'Invalid override action');
    }

    doc.updatedBy = userId;
    doc.history = [...(doc.history || []), historyEntry(action, userId, previous, doc.toObject(), payload.reason || '', action, 'manual')].slice(-100);
    await doc.save();
    return doc.toObject();
}

export async function lockScore(companyId, userId, id, payload = {}) {
    rejectTenantOverrides(payload);
    const doc = await AiLeadScore.findOne({ _id: id, companyId, isDeleted: { $ne: true } });
    if (!doc) throw new ApiError(404, 'Lead score not found');
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
        if (doc.status === 'LOCKED') doc.status = doc.manuallyApproved ? 'APPROVED' : 'SCORED';
    } else {
        throw new ApiError(400, 'action must be lock or unlock');
    }
    doc.updatedBy = userId;
    doc.history = [...(doc.history || []), historyEntry(action, userId, previous, doc.toObject(), payload.reason || '')].slice(-100);
    await doc.save();
    return doc.toObject();
}

export async function exportApprovedScores(companyId, query = {}) {
    const q = {
        companyId,
        isDeleted: { $ne: true },
        $or: [{ manuallyApproved: true }, { status: 'APPROVED' }, { status: 'LOCKED' }],
    };
    const rows = await AiLeadScore.find(q).sort({ finalScore: -1 }).limit(500).lean();
    return {
        format: String(query.format || 'json'),
        results: rows.map((r) => ({
            companyName: r.companyName,
            finalScore: r.finalScore,
            priority: r.priority,
            grade: r.grade,
            confidence: r.confidence,
            dimensionScores: (r.dimensionScores || []).map((d) => ({ id: d.id, label: d.label, score: d.score, maxScore: d.maxScore })),
            positiveSignals: r.positiveSignals,
            negativeSignals: r.negativeSignals,
            recommendation: r.recommendation,
            generatedAt: r.generatedAt,
            engineUsed: r.engineUsed,
        })),
    };
}

export async function applyOutdatedFromUpstream(companyId, scoreId, hashes = {}) {
    const doc = await AiLeadScore.findOne({ _id: scoreId, companyId, isDeleted: { $ne: true } });
    if (!doc) throw new ApiError(404, 'Lead score not found');
    if (doc.locked) return { outdated: false, reason: 'locked', score: doc.toObject() };
    const previous = doc.toObject();
    const merged = { ...(doc.upstreamHashes?.toObject?.() || doc.upstreamHashes || {}), ...hashes };
    if (isUpstreamNewer(doc, merged) || hashes.force === true) {
        doc.status = 'OUTDATED';
        doc.history = [...(doc.history || []), historyEntry('outdated', null, previous, doc.toObject(), 'Upstream Phase 6-10/settings changed')].slice(-100);
        await doc.save();
        return { outdated: true, score: doc.toObject() };
    }
    return { outdated: false, score: doc.toObject() };
}
