/**
 * Checkpoint 7 — AI/rule qualification + human review orchestration.
 * Does NOT create CRM Leads. Upserts by enrichmentId (no duplicate rows).
 */
import mongoose from 'mongoose';
import { ApiError } from '../../../../utils/ApiError.js';
import { checkUserPermission } from '../../../../utils/permissionUtils.js';
import { AssistedCaptureSession } from '../../../../models/assistedCaptureSession.model.js';
import { SearchCampaign } from '../../../../models/searchCampaign.model.js';
import { RawCapture } from '../../../../models/rawCapture.model.js';
import { RawCaptureEnrichment } from '../../../../models/rawCaptureEnrichment.model.js';
import {
    RawCaptureQualification,
    RawCaptureQualificationJob,
    RawCaptureLocationRecheckJob,
} from '../../../../models/rawCaptureQualification.model.js';
import {
    BUSINESS_TYPES,
    MAX_CONCURRENCY,
    OWNER_REVIEW_STATUSES,
    QUALIFICATION_DECISIONS,
    RULE_ENGINE_VERSION,
    isOllamaQualificationEnabled,
} from './constants.js';
import { qualifyWithRules } from './ruleEngine.js';
import { tryOllamaQualify } from './ollama.util.js';
import { normalizeCampaignCity } from './locationMatch.util.js';
import {
    startStrictLocationRecheck,
    getStrictLocationRecheckStatus,
    stopStrictLocationRecheck,
} from './locationRecheck.job.js';

function requireCompanyId(companyId) {
    if (!companyId || !mongoose.isValidObjectId(companyId)) throw new ApiError(400, 'Company context required');
    return companyId;
}

function actorId(user) {
    return user?._id || user?.id || null;
}

function assertQualifyPerm(user) {
    if (
        checkUserPermission(user, 'data_extractor.raw_capture.manage')
        || checkUserPermission(user, 'data_extractor.assisted_capture.start')
    ) return;
    throw new ApiError(403, 'Permission denied: qualification requires raw_capture.manage or assisted_capture.start');
}

function assertViewPerm(user) {
    if (
        checkUserPermission(user, 'data_extractor.raw_capture.view')
        || checkUserPermission(user, 'data_extractor.assisted_capture.view')
    ) return;
    throw new ApiError(403, 'Permission denied');
}

async function loadSession(companyId, sessionId) {
    if (!mongoose.isValidObjectId(sessionId)) throw new ApiError(404, 'Assisted capture session not found');
    const session = await AssistedCaptureSession.findOne({ _id: sessionId, companyId }).lean();
    if (!session) throw new ApiError(404, 'Assisted capture session not found');
    return session;
}

function decisionToStatus(decision) {
    if (decision === 'strong_match') return 'qualified';
    if (decision === 'possible_match') return 'possible';
    if (decision === 'rejected') return 'rejected';
    if (decision === 'human_review_required') return 'review_required';
    return 'failed';
}

function mapCaptureQualificationStatus(decision, failed = false) {
    if (failed) return 'failed';
    if (!decision) return 'pending';
    return 'completed';
}

function campaignHints(campaign = {}) {
    const product = campaign.targetIndustry
        || (Array.isArray(campaign.targetProducts) && campaign.targetProducts[0])
        || '';
    const cityNorm = normalizeCampaignCity(campaign.city || '');
    return {
        product,
        locationScope: campaign.locationScope || 'city',
        locationMatchMode: campaign.locationMatchMode || '',
        city: cityNorm.canonical || campaign.city || '',
        cityEntered: cityNorm.entered || campaign.city || '',
        cityDisplay: cityNorm.display || campaign.city || '',
        state: campaign.state || '',
        country: campaign.country || '',
        name: campaign.name || '',
        targetIndustry: campaign.targetIndustry || '',
        targetProducts: campaign.targetProducts || [],
        businessTypes: campaign.businessTypes || [],
    };
}

async function markCapturesQualification(captureIds, companyId, status) {
    if (!captureIds?.length) return;
    await RawCapture.updateMany(
        { _id: { $in: captureIds }, companyId },
        { $set: { qualificationStatus: status } },
    );
}

/**
 * Qualify one enrichment document. Upserts by companyId+campaignId+enrichmentId.
 */
export async function qualifyOneEnrichment({
    companyId,
    campaignId,
    sessionId,
    enrichment,
    campaign,
    userId,
    recheckLocation = false,
}) {
    const captureIds = enrichment.rawCaptureIds || [];
    await markCapturesQualification(captureIds, companyId, 'pending');

    const captures = captureIds.length
        ? await RawCapture.find({ _id: { $in: captureIds }, companyId }).lean()
        : [];

    const hints = campaignHints(campaign);
    const ruleResult = qualifyWithRules({
        enrichment,
        captures,
        campaign: hints,
    });

    let result = ruleResult;
    let usedOllama = false;
    if (isOllamaQualificationEnabled()) {
        const ai = await tryOllamaQualify({
            campaign: hints,
            enrichment,
            captures,
            ruleHint: ruleResult,
        });
        if (ai) {
            usedOllama = true;
            result = {
                ...ai,
                // Contact quality always from deterministic calc (AI must not invent contacts)
                contactQualityScore: ruleResult.contactQualityScore,
                contactQualityBreakdown: ruleResult.contactQualityBreakdown,
                // Keep rule evidence if AI omitted sources
                sourceEvidence: (ai.sourceEvidence?.length ? ai.sourceEvidence : ruleResult.sourceEvidence),
                ruleEngineVersion: RULE_ENGINE_VERSION,
            };
        } else {
            result = {
                ...ruleResult,
                qualificationMethod: 'rule_based_fallback',
            };
        }
    }

    const qualificationStatus = decisionToStatus(result.systemDecision);
    const payload = {
        companyId,
        campaignId,
        sessionId,
        enrichmentId: enrichment._id,
        canonicalDomain: enrichment.canonicalDomain || '',
        companyName: enrichment.companyName || '',
        websiteUrl: enrichment.websiteUrl || '',
        systemDecision: result.systemDecision,
        relevanceScore: result.relevanceScore,
        confidence: result.confidence,
        decisionReason: result.decisionReason,
        matchedKeywords: result.matchedKeywords || [],
        unmatchedOrConflictingEvidence: result.unmatchedOrConflictingEvidence || [],
        productsMatched: result.productsMatched || [],
        businessType: result.businessType || 'unknown',
        locationMatch: result.locationMatch || 'unknown',
        locationClassification: result.locationClassification || '',
        locationMatchMode: result.locationMatchMode || 'strict_city',
        productMatchStrength: result.productMatchStrength || '',
        confirmedCities: result.confirmedCities || [],
        confirmedStates: result.confirmedStates || [],
        officeInSelectedCity: Boolean(result.officeInSelectedCity),
        servesSelectedCity: Boolean(result.servesSelectedCity),
        locationEvidenceUrl: result.locationEvidenceUrl || '',
        selectedCity: result.selectedCity || hints.city || '',
        selectedState: result.selectedState || hints.state || '',
        selectedCountry: result.selectedCountry || hints.country || '',
        addressCount: Number(result.addressCount || 0),
        contactQualityScore: result.contactQualityScore || 0,
        contactQualityBreakdown: result.contactQualityBreakdown || {},
        sourceEvidence: result.sourceEvidence || [],
        requestedBusinessType: result.requestedBusinessType || ruleResult.requestedBusinessType || '',
        requestedBusinessTypes: Array.isArray(result.requestedBusinessTypes) && result.requestedBusinessTypes.length
            ? result.requestedBusinessTypes
            : (Array.isArray(ruleResult.requestedBusinessTypes) ? ruleResult.requestedBusinessTypes : []),
        detectedBusinessType: result.detectedBusinessType || ruleResult.detectedBusinessType || '',
        detectedBusinessTypes: Array.isArray(result.detectedBusinessTypes) && result.detectedBusinessTypes.length
            ? result.detectedBusinessTypes
            : (Array.isArray(ruleResult.detectedBusinessTypes) ? ruleResult.detectedBusinessTypes : []),
        businessTypeMatch: result.businessTypeMatch || ruleResult.businessTypeMatch || '',
        businessTypeMatchReason: result.businessTypeMatchReason || ruleResult.businessTypeMatchReason || '',
        entityType: result.entityType || ruleResult.entityType || '',
        qualificationMode: result.qualificationMode || ruleResult.qualificationMode || '',
        canonicalCompanyName: result.canonicalCompanyName || ruleResult.canonicalCompanyName || enrichment.canonicalCompanyName || '',
        companyEntityConfidence: result.companyEntityConfidence || ruleResult.companyEntityConfidence || '',
        companyNameEvidence: result.companyNameEvidence || ruleResult.companyNameEvidence || '',
        qualificationStatus,
        qualificationMethod: result.qualificationMethod || 'rule_based',
        ruleEngineVersion: result.ruleEngineVersion || RULE_ENGINE_VERSION,
        aiModel: result.aiModel || '',
        aiSchemaVersion: result.aiSchemaVersion || '',
        qualifiedAt: new Date(),
        errorReason: '',
        updatedBy: userId,
    };

    const existing = await RawCaptureQualification.findOne({
        companyId,
        campaignId,
        enrichmentId: enrichment._id,
    });

    let doc;
    if (existing) {
        const previousLocationMatch = existing.locationMatch || '';
        const previousLocationClassification = existing.locationClassification || '';
        // Preserve owner review fields; refresh system decision
        Object.assign(existing, payload);
        if (recheckLocation) {
            existing.previousLocationMatch = previousLocationMatch;
            existing.previousLocationClassification = previousLocationClassification;
            existing.locationRecheckedAt = new Date();
            existing.auditHistory = [
                ...(existing.auditHistory || []),
                {
                    at: new Date(),
                    by: userId,
                    action: 'location_recheck',
                    from: previousLocationMatch,
                    to: result.locationMatch || '',
                    note: `${previousLocationClassification || ''} → ${result.locationClassification || ''}`,
                },
            ].slice(-40);
        }
        if (!existing.createdBy) existing.createdBy = userId;
        await existing.save();
        doc = existing;
    } else {
        doc = await RawCaptureQualification.create({
            ...payload,
            createdBy: userId,
            ownerDecision: '',
            ownerReviewStatus: 'unreviewed',
            auditHistory: [{
                at: new Date(),
                by: userId,
                action: 'system_qualified',
                from: '',
                to: result.systemDecision,
                note: result.qualificationMethod,
            }],
        });
    }

    await markCapturesQualification(
        captureIds,
        companyId,
        mapCaptureQualificationStatus(result.systemDecision),
    );

    return {
        decision: result.systemDecision,
        method: result.qualificationMethod,
        usedOllama,
        qualificationId: doc._id,
    };
}

const runningJobs = new Set();

async function processJob(jobId) {
    if (runningJobs.has(String(jobId))) return;
    runningJobs.add(String(jobId));
    try {
        let job = await RawCaptureQualificationJob.findById(jobId);
        if (!job) return;
        job.status = 'processing';
        job.startedAt = new Date();
        await job.save();

        const session = await AssistedCaptureSession.findById(job.sessionId).lean();
        if (!session) {
            job.status = 'failed';
            job.lastError = 'Session not found';
            job.finishedAt = new Date();
            await job.save();
            return;
        }

        const campaign = await SearchCampaign.findById(job.campaignId).lean();
        const hints = campaignHints(campaign || {});
        job.productHint = hints.product;
        job.locationHint = [hints.city, hints.state].filter(Boolean).join(', ');
        await job.save();

        let enrichments = await RawCaptureEnrichment.find({
            companyId: job.companyId,
            campaignId: job.campaignId,
        }).sort({ updatedAt: -1 }).lean();

        if (job.mode === 'selected' && job.selectedEnrichmentIds?.length) {
            const allow = new Set(job.selectedEnrichmentIds.map(String));
            enrichments = enrichments.filter((e) => allow.has(String(e._id)));
        } else if (job.mode === 'retry_failed') {
            const failedIds = await RawCaptureQualification.find({
                companyId: job.companyId,
                campaignId: job.campaignId,
                qualificationStatus: 'failed',
            }).select('enrichmentId').lean();
            const failSet = new Set(failedIds.map((f) => String(f.enrichmentId)));
            enrichments = enrichments.filter((e) => failSet.has(String(e._id)));
        } else {
            // all_enriched — include completed/partial/review_required (have evidence)
            enrichments = enrichments.filter((e) =>
                ['completed', 'partial', 'review_required'].includes(e.enrichmentStatus)
                || e.isDirectorySource);
        }

        job.total = enrichments.length;
        await job.save();

        let idx = 0;
        async function worker() {
            while (idx < enrichments.length) {
                const current = await RawCaptureQualificationJob.findById(jobId).select('stopRequested').lean();
                if (current?.stopRequested) break;

                const my = idx;
                idx += 1;
                const enrichment = enrichments[my];
                if (!enrichment) continue;
                await RawCaptureQualificationJob.updateOne(
                    { _id: jobId },
                    { $set: { currentDomain: enrichment.canonicalDomain || enrichment.companyName || '' } },
                );

                try {
                    const stats = await qualifyOneEnrichment({
                        companyId: job.companyId,
                        campaignId: job.campaignId,
                        sessionId: job.sessionId,
                        enrichment,
                        campaign: campaign || {},
                        userId: job.createdBy,
                    });
                    const inc = { processed: 1 };
                    if (stats.decision === 'strong_match') inc.strongMatchCount = 1;
                    else if (stats.decision === 'possible_match') inc.possibleMatchCount = 1;
                    else if (stats.decision === 'rejected') inc.rejectedCount = 1;
                    else if (stats.decision === 'human_review_required') inc.reviewRequiredCount = 1;
                    if (stats.method === 'ollama_local') inc.ollamaCount = 1;
                    else inc.ruleBasedCount = 1;
                    await RawCaptureQualificationJob.updateOne({ _id: jobId }, { $inc: inc });
                } catch (err) {
                    await RawCaptureQualificationJob.updateOne({ _id: jobId }, {
                        $set: { lastError: String(err?.message || err).slice(0, 500) },
                        $inc: { failedCount: 1, processed: 1 },
                    });
                    try {
                        await RawCaptureQualification.findOneAndUpdate(
                            {
                                companyId: job.companyId,
                                campaignId: job.campaignId,
                                enrichmentId: enrichment._id,
                            },
                            {
                                $set: {
                                    companyId: job.companyId,
                                    campaignId: job.campaignId,
                                    sessionId: job.sessionId,
                                    enrichmentId: enrichment._id,
                                    canonicalDomain: enrichment.canonicalDomain || '',
                                    companyName: enrichment.companyName || '',
                                    websiteUrl: enrichment.websiteUrl || '',
                                    systemDecision: 'human_review_required',
                                    relevanceScore: 0,
                                    confidence: 'low',
                                    decisionReason: 'Qualification failed — review required',
                                    qualificationStatus: 'failed',
                                    qualificationMethod: 'rule_based',
                                    ruleEngineVersion: RULE_ENGINE_VERSION,
                                    errorReason: String(err?.message || err).slice(0, 500),
                                    qualifiedAt: new Date(),
                                },
                            },
                            { upsert: true, new: true, setDefaultsOnInsert: true },
                        );
                    } catch {
                        /* ignore secondary upsert errors */
                    }
                }
            }
        }

        const workers = Array.from(
            { length: Math.min(MAX_CONCURRENCY, Math.max(1, enrichments.length || 1)) },
            () => worker(),
        );
        await Promise.all(workers);

        job = await RawCaptureQualificationJob.findById(jobId);
        if (job.stopRequested) {
            job.status = 'stopped';
        } else if (job.failedCount && (job.strongMatchCount || job.possibleMatchCount || job.reviewRequiredCount || job.rejectedCount)) {
            job.status = 'partial';
        } else if (job.failedCount && !job.strongMatchCount && !job.possibleMatchCount) {
            job.status = 'failed';
        } else {
            job.status = 'completed';
        }
        job.finishedAt = new Date();
        job.currentDomain = '';
        await job.save();
    } finally {
        runningJobs.delete(String(jobId));
    }
}

export async function startQualificationJob({
    companyId,
    user,
    sessionId,
    mode = 'all_enriched',
    enrichmentIds = [],
}) {
    const cid = requireCompanyId(companyId);
    assertQualifyPerm(user);
    const session = await loadSession(cid, sessionId);

    const active = await RawCaptureQualificationJob.findOne({
        companyId: cid,
        sessionId,
        status: { $in: ['queued', 'processing'] },
    }).lean();
    if (active) {
        return { job: active, alreadyRunning: true };
    }

    const job = await RawCaptureQualificationJob.create({
        companyId: cid,
        campaignId: session.campaignId,
        sessionId,
        mode: mode === 'selected' ? 'selected' : mode === 'retry_failed' ? 'retry_failed' : 'all_enriched',
        selectedEnrichmentIds: (enrichmentIds || []).filter((id) => mongoose.isValidObjectId(id)),
        status: 'queued',
        createdBy: actorId(user),
    });

    setImmediate(() => {
        processJob(job._id).catch((err) => {
            console.error('CP7 qualification job failed', job._id, err?.message || err);
        });
    });

    return { job: job.toObject(), alreadyRunning: false };
}

export async function stopQualificationJob({ companyId, user, sessionId, jobId }) {
    const cid = requireCompanyId(companyId);
    assertQualifyPerm(user);
    await loadSession(cid, sessionId);
    const filter = { companyId: cid, sessionId };
    if (jobId) filter._id = jobId;
    else filter.status = { $in: ['queued', 'processing'] };

    const job = await RawCaptureQualificationJob.findOneAndUpdate(
        filter,
        { $set: { stopRequested: true } },
        { new: true, sort: { createdAt: -1 } },
    );
    if (!job) throw new ApiError(404, 'No active qualification job');
    return { job };
}

export async function getQualificationJobStatus({ companyId, user, sessionId, jobId }) {
    const cid = requireCompanyId(companyId);
    assertViewPerm(user);
    await loadSession(cid, sessionId);
    let job;
    if (jobId) {
        job = await RawCaptureQualificationJob.findOne({ _id: jobId, companyId: cid, sessionId }).lean();
    } else {
        job = await RawCaptureQualificationJob.findOne({ companyId: cid, sessionId }).sort({ createdAt: -1 }).lean();
    }
    return { job: job || null, ollamaEnabled: isOllamaQualificationEnabled() };
}

export async function listQualificationsForSession({ companyId, user, sessionId }) {
    const cid = requireCompanyId(companyId);
    assertViewPerm(user);
    const session = await loadSession(cid, sessionId);
    const items = await RawCaptureQualification.find({
        companyId: cid,
        campaignId: session.campaignId,
    }).sort({ relevanceScore: -1, updatedAt: -1 }).lean();
    return { items, campaignId: session.campaignId };
}

export async function getQualificationDetail({ companyId, user, sessionId, qualificationId }) {
    const cid = requireCompanyId(companyId);
    assertViewPerm(user);
    const session = await loadSession(cid, sessionId);
    const qualification = await RawCaptureQualification.findOne({
        _id: qualificationId,
        companyId: cid,
        campaignId: session.campaignId,
    }).lean();
    if (!qualification) throw new ApiError(404, 'Qualification record not found');

    const enrichment = await RawCaptureEnrichment.findOne({
        _id: qualification.enrichmentId,
        companyId: cid,
    }).lean();

    const captures = enrichment?.rawCaptureIds?.length
        ? await RawCapture.find({ _id: { $in: enrichment.rawCaptureIds }, companyId: cid }).lean()
        : [];

    return {
        qualification,
        enrichment,
        captures,
        createCrmLeadEnabled: false,
        createCrmLeadNote: 'Create CRM Lead is disabled in Checkpoint 7 (future-ready only)',
    };
}

export async function updateOwnerReview({ companyId, user, sessionId, qualificationId, body = {} }) {
    const cid = requireCompanyId(companyId);
    assertQualifyPerm(user);
    const session = await loadSession(cid, sessionId);
    const doc = await RawCaptureQualification.findOne({
        _id: qualificationId,
        companyId: cid,
        campaignId: session.campaignId,
    });
    if (!doc) throw new ApiError(404, 'Qualification record not found');

    const prevOwner = doc.ownerDecision || '';
    const prevReview = doc.ownerReviewStatus || 'unreviewed';
    const uid = actorId(user);
    const audits = [];

    // Preserve systemDecision always
    if (body.action === 'approve' || body.ownerReviewStatus === 'approved') {
        doc.ownerDecision = 'strong_match';
        doc.ownerReviewStatus = 'approved';
    } else if (body.action === 'reject' || body.ownerReviewStatus === 'rejected') {
        doc.ownerDecision = 'rejected';
        doc.ownerReviewStatus = 'rejected';
    } else if (body.action === 'mark_possible' || body.ownerReviewStatus === 'possible') {
        doc.ownerDecision = 'possible_match';
        doc.ownerReviewStatus = 'possible';
    } else if (body.action === 'send_for_review' || body.ownerReviewStatus === 'send_for_review') {
        doc.ownerDecision = 'human_review_required';
        doc.ownerReviewStatus = 'send_for_review';
    } else if (body.ownerDecision && QUALIFICATION_DECISIONS.includes(body.ownerDecision)) {
        doc.ownerDecision = body.ownerDecision;
        if (body.ownerReviewStatus && OWNER_REVIEW_STATUSES.includes(body.ownerReviewStatus)) {
            doc.ownerReviewStatus = body.ownerReviewStatus;
        }
    }

    if (body.ownerReviewNote != null) {
        doc.ownerReviewNote = String(body.ownerReviewNote).slice(0, 2000);
    }

    if (body.ownerBusinessTypeOverride != null || body.action === 'correct_business_type') {
        const bt = String(body.ownerBusinessTypeOverride || body.businessType || '').trim();
        if (bt && BUSINESS_TYPES.includes(bt)) {
            const from = doc.ownerBusinessTypeOverride || doc.businessType;
            doc.ownerBusinessTypeOverride = bt;
            audits.push({
                at: new Date(),
                by: uid,
                action: 'correct_business_type',
                from,
                to: bt,
                note: body.ownerReviewNote || '',
            });
        }
    }

    if (doc.ownerDecision !== prevOwner || doc.ownerReviewStatus !== prevReview) {
        audits.push({
            at: new Date(),
            by: uid,
            action: body.action || 'owner_review',
            from: `${prevReview}:${prevOwner}`,
            to: `${doc.ownerReviewStatus}:${doc.ownerDecision}`,
            note: doc.ownerReviewNote || '',
        });
    } else if (body.ownerReviewNote && body.action === 'add_note') {
        audits.push({
            at: new Date(),
            by: uid,
            action: 'add_review_note',
            from: '',
            to: '',
            note: doc.ownerReviewNote,
        });
    }

    if (audits.length) {
        doc.auditHistory = [...(doc.auditHistory || []), ...audits].slice(-100);
        doc.reviewedBy = uid;
        doc.reviewedAt = new Date();
    }
    doc.updatedBy = uid;
    await doc.save();

    return {
        qualification: doc.toObject(),
        systemDecisionPreserved: doc.systemDecision,
        createCrmLeadEnabled: false,
    };
}

/** @deprecated Prefer startStrictLocationRecheck */
export async function recheckStrictLocationForSession(args) {
    return startStrictLocationRecheck(args);
}

export {
    startStrictLocationRecheck,
    getStrictLocationRecheckStatus,
    stopStrictLocationRecheck,
};

export { processJob, qualifyWithRules };
