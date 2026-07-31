import mongoose from 'mongoose';
import { AiSimilarCompanyResult } from '../../../models/aiSimilarCompanyResult.model.js';
import { ExtractedLead } from '../../../models/extractedLead.model.js';
import { AiIndustryClassification } from '../../../models/aiIndustryClassification.model.js';
import { AiLeadRelevance } from '../../../models/aiLeadRelevance.model.js';
import { AiProductRecommendation } from '../../../models/aiProductRecommendation.model.js';
import { AiContactIntelligence } from '../../../models/aiContactIntelligence.model.js';
import { AiCompanyIntelligenceProfile } from '../../../models/aiCompanyIntelligenceProfile.model.js';
import { AiLeadScore } from '../../../models/aiLeadScore.model.js';
import { ApiError } from '../../../utils/ApiError.js';
import { scoreSimilarityPair } from './similarityEngine.service.js';
import { getSimilaritySettings, settingsFingerprint } from './settings.service.js';
import { enrichSimilarityWithAi, validateAiSimilarityOutput } from './aiAdapter.js';
import { ENGINE_VERSION } from './constants.js';

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
        seedCompanyName: doc.seedCompanyName || '',
        candidateCompanyName: doc.candidateCompanyName || '',
        similarityScore: doc.similarityScore,
        relationshipType: doc.relationshipType || '',
        confidence: doc.confidence,
        locked: !!doc.locked,
        manuallyApproved: !!doc.manuallyApproved,
    };
}

function historyEntry(action, userId, previous, next, reason = '', actionType = '', sourceType = 'system') {
    return {
        at: new Date(),
        action,
        userId: userId || null,
        previousStatus: previous?.status || '',
        resultingStatus: next?.status || previous?.status || '',
        previous: slimSnapshot(previous),
        next: slimSnapshot(next),
        reason: String(reason || '').slice(0, 2000),
        actionType: String(actionType || action || ''),
        sourceType,
    };
}

function pairKeyOf(seedKey, candKey) {
    return `${String(seedKey || '')}::${String(candKey || '')}`;
}

function recordKeyOf(meta = {}) {
    if (meta.extractedLeadId) return 'lead:' + String(meta.extractedLeadId);
    if (meta.adhocKey) return 'adhoc:' + String(meta.adhocKey);
    if (meta.companyName) return 'name:' + String(meta.companyName).toLowerCase().replace(/\s+/g, '-').slice(0, 80);
    return '';
}

async function loadSnapshot(companyId, extractedLeadId) {
    const lead = await ExtractedLead.findOne({ _id: extractedLeadId, companyId }).lean();
    if (!lead) return null;
    const [classification, relevance, recommendation, contact, profile, score] = await Promise.all([
        AiIndustryClassification.findOne({ companyId, extractedLeadId, isDeleted: { $ne: true } }).sort({ updatedAt: -1 }).lean(),
        AiLeadRelevance.findOne({ companyId, extractedLeadId, isDeleted: { $ne: true } }).sort({ updatedAt: -1 }).lean(),
        AiProductRecommendation.findOne({ companyId, extractedLeadId, isDeleted: { $ne: true } }).sort({ updatedAt: -1 }).lean(),
        AiContactIntelligence.findOne({ companyId, extractedLeadId, isDeleted: { $ne: true } }).sort({ updatedAt: -1 }).lean(),
        AiCompanyIntelligenceProfile.findOne({ companyId, extractedLeadId, isDeleted: { $ne: true } }).sort({ updatedAt: -1 }).lean(),
        AiLeadScore.findOne({ companyId, extractedLeadId, isDeleted: { $ne: true } }).sort({ updatedAt: -1 }).lean(),
    ]);
    return {
        record: lead,
        classification,
        relevance,
        recommendation,
        contact,
        profile,
        score,
        companyName: lead.companyName,
        existingCrmStatus: lead.crmStatus || lead.existingCrmStatus || 'UNKNOWN',
        duplicateEntityStatus: lead.duplicateStatus || '',
        manuallyApproved: !!lead.manuallyApproved,
    };
}

function snapshotFromPayload(payload = {}) {
    return {
        record: payload.record || { companyName: payload.companyName || '', city: payload.city || '', ...payload.record },
        classification: payload.classification || null,
        relevance: payload.relevance || null,
        recommendation: payload.recommendation || null,
        contact: payload.contact || null,
        profile: payload.profile || null,
        score: payload.score || null,
        companyName: payload.companyName || payload.record?.companyName || '',
        existingCrmStatus: payload.existingCrmStatus || 'UNKNOWN',
        duplicateEntityStatus: payload.duplicateEntityStatus || payload.record?.duplicateStatus || '',
    };
}

export async function listSimilarResults(companyId, query = {}) {
    const q = { companyId, isDeleted: { $ne: true } };
    if (query.status) q.status = query.status;
    if (query.relationshipType) q.relationshipType = query.relationshipType;
    if (query.seedRecordKey) q.seedRecordKey = query.seedRecordKey;
    if (query.seedCompanyName) q.seedCompanyName = new RegExp(String(query.seedCompanyName).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    if (query.locked === 'true') q.locked = true;
    if (query.locked === 'false') q.locked = false;
    if (query.approved === 'true') q.manuallyApproved = true;
    if (query.outdated === 'true') q.status = 'OUTDATED';
    if (query.minScore != null || query.maxScore != null) {
        q.similarityScore = {};
        if (query.minScore != null) q.similarityScore.$gte = Number(query.minScore);
        if (query.maxScore != null) q.similarityScore.$lte = Number(query.maxScore);
    }
    if (query.existingCrmStatus) q.existingCrmStatus = query.existingCrmStatus;
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 50));
    const skip = Math.max(0, Number(query.skip) || 0);
    const [results, total] = await Promise.all([
        AiSimilarCompanyResult.find(q).sort({ similarityScore: -1, updatedAt: -1 }).skip(skip).limit(limit).lean(),
        AiSimilarCompanyResult.countDocuments(q),
    ]);
    return { results, total, limit, skip };
}

export async function getSimilarResult(companyId, id) {
    const doc = await AiSimilarCompanyResult.findOne({ _id: id, companyId, isDeleted: { $ne: true } }).lean();
    if (!doc) throw new ApiError(404, 'Similar company result not found');
    return doc;
}

export async function getSimilarHistory(companyId, id) {
    const doc = await getSimilarResult(companyId, id);
    return { _id: doc._id, companyId: doc.companyId, history: doc.history || [] };
}

/**
 * Find similar companies for one seed against a candidate pool.
 * Never invents candidates. Never auto-creates CRM leads.
 * Never auto-calls paid providers.
 */
export async function findSimilarForSeed(companyId, userId, payload = {}) {
    rejectTenantOverrides(payload);
    if (payload.executePaidProvider === true && payload.confirmPaidProvider !== true) {
        throw new ApiError(400, 'Paid provider requires explicit confirmation');
    }
    const settings = await getSimilaritySettings(companyId);
    if (settings.enabled === false) throw new ApiError(400, 'Similar company engine is disabled for this company');

    let seed = null;
    let seedMeta = {
        financialYear: payload.financialYear || '',
        extractedLeadId: payload.seedExtractedLeadId || payload.extractedLeadId || null,
        adhocKey: payload.seedAdhocKey || null,
        companyName: payload.seedCompanyName || null,
    };

    if (seedMeta.extractedLeadId) {
        seed = await loadSnapshot(companyId, seedMeta.extractedLeadId);
        if (!seed) throw new ApiError(404, 'Seed extracted lead not found');
        // Foreign company check already via companyId on query
    } else if (payload.seed) {
        seed = snapshotFromPayload(payload.seed);
    } else {
        throw new ApiError(400, 'seedExtractedLeadId or seed snapshot required');
    }

    const seedKey = recordKeyOf({
        extractedLeadId: seedMeta.extractedLeadId,
        adhocKey: seedMeta.adhocKey,
        companyName: seed.companyName || seed.record?.companyName,
    }) || ('adhoc:' + new mongoose.Types.ObjectId().toString());

    let candidates = [];
    if (Array.isArray(payload.candidates) && payload.candidates.length) {
        candidates = payload.candidates.map((c, i) => ({
            snap: snapshotFromPayload(c),
            meta: {
                extractedLeadId: c.extractedLeadId || null,
                adhocKey: c.adhocKey || `cand-${i}`,
                companyName: c.companyName || c.record?.companyName,
            },
        }));
    } else if (Array.isArray(payload.candidateExtractedLeadIds) && payload.candidateExtractedLeadIds.length) {
        for (const id of payload.candidateExtractedLeadIds) {
            if (String(id) === String(seedMeta.extractedLeadId)) continue;
            const snap = await loadSnapshot(companyId, id);
            if (snap) candidates.push({ snap, meta: { extractedLeadId: id } });
        }
    } else {
        // Default pool: other extracted leads in company scope
        const leads = await ExtractedLead.find({
            companyId,
            ...(seedMeta.extractedLeadId ? { _id: { $ne: seedMeta.extractedLeadId } } : {}),
        }).select('_id').limit(Math.min(200, Number(settings.maximumCandidatesPerSeed) * 3 || 150)).lean();
        for (const l of leads) {
            const snap = await loadSnapshot(companyId, l._id);
            if (snap) candidates.push({ snap, meta: { extractedLeadId: l._id } });
        }
    }

    const maxCand = Math.max(1, Number(settings.maximumCandidatesPerSeed) || 50);
    const scored = [];
    let providerCalls = 0;
    const maxProvider = Number(settings.maximumProviderCallsPerJob) || 0;

    for (const item of candidates.slice(0, maxCand * 2)) {
        if (scored.length >= maxCand) break;
        let result = scoreSimilarityPair({ seed: seed, candidate: item.snap, settings });

        if ((payload.mode || settings.similarityMode) === 'ai' || (payload.mode || settings.similarityMode) === 'hybrid') {
            const ai = await enrichSimilarityWithAi();
            if (!ai.ok) {
                result = { ...result, fallbackUsed: true, fallbackReason: ai.reason || 'AI unavailable; rule fallback' };
            } else {
                const validated = validateAiSimilarityOutput(ai.result, {
                    candidateNames: [item.snap.companyName || item.snap.record?.companyName],
                });
                if (!validated.ok) {
                    result = { ...result, fallbackUsed: true, fallbackReason: `AI rejected: ${validated.reason}` };
                }
            }
            // AI path never consumes paid discovery providers here
        }

        if (Number(result.similarityScore) < Number(settings.minimumSimilarityScore || 0) && !payload.includeLowScore) {
            // still allow related/branch review statuses through
            if (!['RELATED_COMPANY_REVIEW', 'POSSIBLE_BRANCH_REVIEW', 'DUPLICATE', 'ALREADY_IN_CRM'].includes(result.status)) {
                continue;
            }
        }

        assertNoSecrets(result);
        const candKey = recordKeyOf({
            extractedLeadId: item.meta.extractedLeadId,
            adhocKey: item.meta.adhocKey,
            companyName: item.snap.companyName || item.snap.record?.companyName,
        }) || ('cand:' + new mongoose.Types.ObjectId().toString());
        const pk = pairKeyOf(seedKey, candKey);

        const existing = await AiSimilarCompanyResult.findOne({ companyId, pairKey: pk, isDeleted: { $ne: true } });
        if (existing?.locked && !payload.force) {
            scored.push({ skipped: true, reason: 'locked', result: existing.toObject() });
            continue;
        }

        const docPayload = {
            companyId,
            financialYear: seedMeta.financialYear || '',
            seedRecordKey: seedKey,
            seedExtractedLeadId: seedMeta.extractedLeadId || null,
            seedCompanyName: result.seedCompanyName,
            candidateRecordKey: candKey,
            candidateExtractedLeadId: item.meta.extractedLeadId || null,
            candidateCompanyName: result.candidateCompanyName,
            pairKey: pk,
            status: result.status,
            similarityScore: result.similarityScore,
            confidence: result.confidence,
            relationshipType: result.relationshipType,
            primaryReasons: result.primaryReasons || [],
            matchingIndustries: result.matchingIndustries || [],
            matchingSubIndustries: result.matchingSubIndustries || [],
            matchingCustomerTypes: result.matchingCustomerTypes || [],
            matchingProducts: result.matchingProducts || [],
            matchingOpportunitySignals: result.matchingOpportunitySignals || [],
            geographicProximity: result.geographicProximity || null,
            sourceAgreement: result.sourceAgreement || [],
            riskSignals: result.riskSignals || [],
            existingCrmStatus: result.existingCrmStatus || 'UNKNOWN',
            duplicateEntityStatus: result.duplicateEntityStatus || '',
            candidateLeadScore: result.candidateLeadScore,
            recommendedNextAction: result.recommendedNextAction || '',
            evidence: result.evidence || [],
            sourceUrls: result.sourceUrls || [],
            dimensionScores: result.dimensionScores || [],
            engineUsed: result.engineUsed || 'rule_based',
            modelVersion: result.modelVersion || ENGINE_VERSION,
            settingsVersion: result.settingsVersion || settingsFingerprint(settings),
            fallbackUsed: !!result.fallbackUsed,
            fallbackReason: result.fallbackReason || '',
            generatedAt: new Date(),
            rawPayload: { ...result, history: undefined },
            updatedBy: userId || null,
            locked: existing?.locked || false,
            lockedAt: existing?.lockedAt || null,
            lockedBy: existing?.lockedBy || null,
            manuallyApproved: false,
            noAutoCrmCreate: true,
            noAutoCommunications: true,
            noAutoPaidProvider: true,
        };

        if (!existing) {
            const created = await AiSimilarCompanyResult.create({
                ...docPayload,
                createdBy: userId || null,
                history: [historyEntry('analyzed', userId, null, result, 'initial similarity analysis')],
            });
            scored.push({ skipped: false, result: created.toObject() });
        } else {
            const previous = existing.toObject();
            Object.assign(existing, docPayload);
            existing.history = [...(existing.history || []), historyEntry(payload.refresh ? 'reanalyzed' : 'reanalyzed', userId, previous, result, payload.reason || 're-analysis')].slice(-100);
            await existing.save();
            scored.push({ skipped: false, result: existing.toObject() });
        }
    }

    return {
        seedRecordKey: seedKey,
        seedCompanyName: seed.companyName || seed.record?.companyName || '',
        candidateCount: scored.filter((s) => !s.skipped).length,
        skippedCount: scored.filter((s) => s.skipped).length,
        providerCallCount: providerCalls,
        maxProviderCalls: maxProvider,
        paidProviderExecuted: false,
        results: scored.map((s) => s.result),
        noAutoCrmCreate: true,
        noAutoCommunications: true,
        noAutoPaidProvider: true,
    };
}

export async function analyzeSamplePair(companyId, payload = {}) {
    rejectTenantOverrides(payload);
    const settings = payload.settings || await getSimilaritySettings(companyId);
    const seed = snapshotFromPayload(payload.seed || {});
    const candidate = snapshotFromPayload(payload.candidate || {});
    let result = scoreSimilarityPair({ seed, candidate, settings });
    if ((payload.mode || settings.similarityMode) === 'ai' || (payload.mode || settings.similarityMode) === 'hybrid') {
        const ai = await enrichSimilarityWithAi();
        if (!ai.ok) {
            result = { ...result, fallbackUsed: true, fallbackReason: ai.reason || 'AI unavailable; rule fallback' };
        } else {
            const validated = validateAiSimilarityOutput(ai.result, {
                candidateNames: [candidate.companyName || candidate.record?.companyName],
            });
            if (!validated.ok) {
                result = { ...result, fallbackUsed: true, fallbackReason: `AI rejected: ${validated.reason}` };
            }
        }
    }
    assertNoSecrets(result);
    return result;
}

export async function overrideSimilarResult(companyId, userId, id, payload = {}) {
    rejectTenantOverrides(payload);
    const doc = await AiSimilarCompanyResult.findOne({ _id: id, companyId, isDeleted: { $ne: true } });
    if (!doc) throw new ApiError(404, 'Similar company result not found');
    if (doc.locked && !['unlock'].includes(payload.action)) throw new ApiError(400, 'Result is locked');

    const previous = doc.toObject();
    const action = String(payload.action || 'override');

    if (action === 'override') {
        if (payload.similarityScore != null) {
            const n = Number(payload.similarityScore);
            if (!Number.isFinite(n) || n < 0 || n > 100) throw new ApiError(400, 'similarityScore must be 0-100');
            doc.similarityScore = Math.round(n);
        }
        if (payload.relationshipType) doc.relationshipType = String(payload.relationshipType);
        if (payload.reviewNote) doc.recommendedNextAction = String(payload.reviewNote).slice(0, 2000);
        doc.reviewedAt = new Date();
    } else if (action === 'approve' || action === 'approve_for_enrichment') {
        // NEVER create CRM Lead — only APPROVED_FOR_ENRICHMENT
        doc.manuallyApproved = true;
        doc.status = 'APPROVED_FOR_ENRICHMENT';
        doc.reviewedAt = new Date();
    } else if (action === 'reject') {
        doc.manuallyApproved = false;
        doc.status = 'REJECTED';
        doc.reviewedAt = new Date();
    } else if (action === 'mark_competitor') {
        doc.relationshipType = 'POSSIBLE_COMPETITOR';
        doc.status = 'POSSIBLE_COMPETITOR';
        doc.reviewedAt = new Date();
    } else if (action === 'mark_peer') {
        doc.relationshipType = 'INDUSTRY_PEER';
        doc.reviewedAt = new Date();
    } else if (action === 'mark_related') {
        doc.relationshipType = 'RELATED_COMPANY';
        doc.status = 'RELATED_COMPANY_REVIEW';
        doc.reviewedAt = new Date();
    } else if (action === 'mark_separate') {
        doc.relationshipType = 'UNRELATED';
        doc.status = 'IRRELEVANT';
        doc.reviewedAt = new Date();
    } else if (action === 'mark_branch') {
        doc.relationshipType = 'POSSIBLE_BRANCH';
        doc.status = 'POSSIBLE_BRANCH_REVIEW';
        doc.reviewedAt = new Date();
    } else if (action === 'mark_customer_prospect') {
        doc.relationshipType = 'POSSIBLE_CUSTOMER';
        doc.reviewedAt = new Date();
    } else if (action === 'mark_already_in_crm') {
        doc.status = 'ALREADY_IN_CRM';
        doc.existingCrmStatus = payload.existingCrmStatus || doc.existingCrmStatus || 'LEAD';
        doc.reviewedAt = new Date();
    } else if (action === 'mark_irrelevant') {
        doc.status = 'IRRELEVANT';
        doc.reviewedAt = new Date();
    } else if (action === 'mark_outdated') {
        doc.status = 'OUTDATED';
    } else {
        throw new ApiError(400, 'Invalid override action');
    }

    doc.updatedBy = userId;
    doc.history = [...(doc.history || []), historyEntry(action, userId, previous, doc.toObject(), payload.reason || '', action, 'manual')].slice(-100);
    await doc.save();
    return doc.toObject();
}

export async function lockSimilarResult(companyId, userId, id, payload = {}) {
    rejectTenantOverrides(payload);
    const doc = await AiSimilarCompanyResult.findOne({ _id: id, companyId, isDeleted: { $ne: true } });
    if (!doc) throw new ApiError(404, 'Similar company result not found');
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

export async function exportApprovedCandidates(companyId, query = {}) {
    const q = {
        companyId,
        isDeleted: { $ne: true },
        $or: [{ manuallyApproved: true }, { status: 'APPROVED_FOR_ENRICHMENT' }],
    };
    const rows = await AiSimilarCompanyResult.find(q).sort({ similarityScore: -1 }).limit(500).lean();
    return {
        format: String(query.format || 'json'),
        results: rows.map((r) => ({
            seedCompany: r.seedCompanyName,
            candidateCompany: r.candidateCompanyName,
            similarityScore: r.similarityScore,
            relationshipType: r.relationshipType,
            industry: (r.matchingIndustries || [])[0] || '',
            customerType: (r.matchingCustomerTypes || [])[0] || '',
            location: r.geographicProximity?.reason || '',
            leadScore: r.candidateLeadScore,
            productOpportunities: r.matchingOpportunitySignals || [],
            contactAvailability: '',
            evidence: (r.primaryReasons || []).slice(0, 8),
            recommendedNextAction: r.recommendedNextAction,
            status: r.status,
            generatedAt: r.generatedAt,
            engineUsed: r.engineUsed,
        })),
        note: 'Approved for enrichment only — no automatic CRM Lead creation',
    };
}

export async function markOutdatedIfUnlocked(companyId, id, reason = 'Upstream change') {
    const doc = await AiSimilarCompanyResult.findOne({ _id: id, companyId, isDeleted: { $ne: true } });
    if (!doc) throw new ApiError(404, 'Similar company result not found');
    if (doc.locked) return { outdated: false, reason: 'locked', result: doc.toObject() };
    const previous = doc.toObject();
    doc.status = 'OUTDATED';
    doc.history = [...(doc.history || []), historyEntry('outdated', null, previous, doc.toObject(), reason)].slice(-100);
    await doc.save();
    return { outdated: true, result: doc.toObject() };
}
