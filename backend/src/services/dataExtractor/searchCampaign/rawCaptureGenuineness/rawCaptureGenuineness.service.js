/**
 * Checkpoint 8 (Phase B) - genuineness verification + human review orchestration.
 * Runs AFTER CP7 qualification. Does NOT create CRM Leads.
 * Upserts by companyId+campaignId+qualificationId (no duplicate rows).
 */
import mongoose from 'mongoose';
import { ApiError } from '../../../../utils/ApiError.js';
import { checkUserPermission } from '../../../../utils/permissionUtils.js';
import { AssistedCaptureSession } from '../../../../models/assistedCaptureSession.model.js';
import { SearchCampaign } from '../../../../models/searchCampaign.model.js';
import { RawCapture } from '../../../../models/rawCapture.model.js';
import { RawCaptureEnrichment } from '../../../../models/rawCaptureEnrichment.model.js';
import { RawCaptureQualification } from '../../../../models/rawCaptureQualification.model.js';
import {
    RawCaptureGenuineness,
    RawCaptureGenuinenessJob,
} from '../../../../models/rawCaptureGenuineness.model.js';
import { SearchQuery } from '../../../../models/searchQuery.model.js';
import {
    ELIGIBLE_QUALIFICATION_DECISIONS,
    GENUINENESS_DECISIONS,
    MAX_CONCURRENCY,
    OWNER_REVIEW_STATUSES,
    RULE_ENGINE_VERSION,
    isOllamaGenuinenessEnabled,
} from './constants.js';
import { evaluateGenuineness } from './ruleEngine.js';
import { tryOllamaVerifyGenuineness } from './ollama.util.js';
import {
    isGenuinenessJobTerminalStatus,
    isJobProcessedComplete,
    resolveGenuinenessJobTerminalStatus,
} from './jobTerminal.util.js';

function requireCompanyId(companyId) {
    if (!companyId || !mongoose.isValidObjectId(companyId)) throw new ApiError(400, 'Company context required');
    return companyId;
}

function actorId(user) {
    return user?._id || user?.id || null;
}

function assertVerifyPerm(user) {
    if (
        checkUserPermission(user, 'data_extractor.raw_capture.manage')
        || checkUserPermission(user, 'data_extractor.assisted_capture.start')
    ) return;
    throw new ApiError(403, 'Permission denied: genuineness verification requires raw_capture.manage or assisted_capture.start');
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

function decisionToVerificationStatus(decision) {
    if (decision === 'verified_genuine' || decision === 'likely_genuine') return 'verified';
    if (decision === 'human_review_required') return 'review_required';
    if (decision === 'directory_or_marketplace_only') return 'directory_only';
    if (decision === 'suspected_unreliable') return 'unreliable';
    if (decision === 'rejected_unusable') return 'rejected';
    return 'failed';
}

function decisionCounterKey(decision) {
    switch (decision) {
        case 'verified_genuine': return 'verifiedGenuineCount';
        case 'likely_genuine': return 'likelyGenuineCount';
        case 'human_review_required': return 'humanReviewRequiredCount';
        case 'directory_or_marketplace_only': return 'directoryOrMarketplaceOnlyCount';
        case 'suspected_unreliable': return 'suspectedUnreliableCount';
        case 'rejected_unusable': return 'rejectedUnusableCount';
        default: return null;
    }
}

function campaignHints(campaign = {}) {
    const product = campaign.targetIndustry
        || (Array.isArray(campaign.targetProducts) && campaign.targetProducts[0])
        || campaign.name
        || '';
    return {
        product,
        city: campaign.city || '',
        state: campaign.state || '',
        name: campaign.name || '',
    };
}

/**
 * Verify one qualification record's genuineness. Upserts by
 * companyId+campaignId+qualificationId.
 */
export async function verifyOneQualification({
    companyId,
    campaignId,
    sessionId,
    qualification,
    campaign,
    userId,
}) {
    const enrichment = qualification.enrichmentId
        ? await RawCaptureEnrichment.findOne({ _id: qualification.enrichmentId, companyId }).lean()
        : null;
    const firstCaptureId = enrichment?.rawCaptureIds?.[0];
    const rawCapture = firstCaptureId
        ? await RawCapture.findOne({ _id: firstCaptureId, companyId }).lean()
        : null;

    const hints = campaignHints(campaign);
    const ruleResult = evaluateGenuineness({
        enrichment: enrichment || {},
        qualification,
        rawCapture: rawCapture || {},
        productHint: hints.product,
    });

    let result = ruleResult;
    let usedOllama = false;
    if (isOllamaGenuinenessEnabled()) {
        const ai = await tryOllamaVerifyGenuineness({
            enrichment,
            qualification,
            rawCapture,
            productHint: hints.product,
            ruleHint: ruleResult,
        });
        if (ai) {
            usedOllama = true;
            result = {
                ...ai,
                evidenceUrls: (ai.evidenceUrls?.length ? ai.evidenceUrls : ruleResult.evidenceUrls),
                ruleEngineVersion: RULE_ENGINE_VERSION,
            };
        } else {
            result = { ...ruleResult, verificationMethod: 'rule_based_fallback' };
        }
    }

    const verificationStatus = decisionToVerificationStatus(result.genuinenessDecision);
    const payload = {
        companyId,
        campaignId,
        sessionId,
        qualificationId: qualification._id,
        enrichmentId: enrichment?._id || null,
        canonicalDomain: enrichment?.canonicalDomain || qualification.canonicalDomain || '',
        companyName: enrichment?.companyName || qualification.companyName || '',
        websiteUrl: enrichment?.websiteUrl || qualification.websiteUrl || '',
        systemDecision: result.genuinenessDecision,
        genuinenessScore: result.genuinenessScore,
        genuinenessConfidence: result.genuinenessConfidence,
        verificationReason: result.verificationReason,
        positiveSignals: result.positiveSignals || [],
        warningSignals: result.warningSignals || [],
        conflictingEvidence: result.conflictingEvidence || [],
        missingCriticalFields: result.missingCriticalFields || [],
        evidenceUrls: result.evidenceUrls || [],
        manufacturerEvidence: result.manufacturerEvidence || 'unknown',
        verificationMethod: result.verificationMethod || 'rule_based',
        ruleVersion: result.ruleEngineVersion || RULE_ENGINE_VERSION,
        modelVersion: result.aiModel || '',
        verifiedAt: new Date(),
        verificationStatus,
        errorReason: '',
        updatedBy: userId,
        ruleResult,
        aiResult: usedOllama ? result : null,
    };

    const existing = await RawCaptureGenuineness.findOne({
        companyId,
        campaignId,
        qualificationId: qualification._id,
    });

    let doc;
    if (existing) {
        Object.assign(existing, payload);
        if (!existing.createdBy) existing.createdBy = userId;
        await existing.save();
        doc = existing;
    } else {
        doc = await RawCaptureGenuineness.create({
            ...payload,
            createdBy: userId,
            ownerDecision: '',
            ownerReviewStatus: 'unreviewed',
            auditHistory: [{
                at: new Date(),
                by: userId,
                action: 'system_verified',
                from: '',
                to: result.genuinenessDecision,
                note: result.verificationMethod,
            }],
        });
    }

    return {
        decision: result.genuinenessDecision,
        method: result.verificationMethod,
        usedOllama,
        genuinenessId: doc._id,
    };
}

const runningJobs = new Set();

async function persistGenuinenessJobTerminal(jobId) {
    const fresh = await RawCaptureGenuinenessJob.findById(jobId);
    if (!fresh) return null;
    if (isGenuinenessJobTerminalStatus(fresh.status)) return fresh;
    if (!fresh.stopRequested && !isJobProcessedComplete(fresh)) return fresh;
    fresh.status = resolveGenuinenessJobTerminalStatus(fresh);
    fresh.finishedAt = new Date();
    fresh.currentDomain = '';
    await fresh.save();
    return fresh;
}

async function processJob(jobId) {
    if (runningJobs.has(String(jobId))) return;
    runningJobs.add(String(jobId));
    try {
        let job = await RawCaptureGenuinenessJob.findById(jobId);
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

        let qualifications = await RawCaptureQualification.find({
            companyId: job.companyId,
            campaignId: job.campaignId,
        }).sort({ updatedAt: -1 }).lean();

        if (job.mode === 'selected' && job.selectedQualificationIds?.length) {
            const allow = new Set(job.selectedQualificationIds.map(String));
            qualifications = qualifications.filter((q) => allow.has(String(q._id)));
        } else if (job.mode === 'retry_failed') {
            const failedIds = await RawCaptureGenuineness.find({
                companyId: job.companyId,
                campaignId: job.campaignId,
                verificationStatus: 'failed',
            }).select('qualificationId').lean();
            const failSet = new Set(failedIds.map((f) => String(f.qualificationId)));
            qualifications = qualifications.filter((q) => failSet.has(String(q._id)));
        } else {
            qualifications = qualifications.filter((q) => ELIGIBLE_QUALIFICATION_DECISIONS.includes(q.systemDecision));
        }

        job.total = qualifications.length;
        await job.save();

        let idx = 0;
        async function worker() {
            while (idx < qualifications.length) {
                const current = await RawCaptureGenuinenessJob.findById(jobId).select('stopRequested').lean();
                if (current?.stopRequested) break;

                const my = idx;
                idx += 1;
                const qualification = qualifications[my];
                await RawCaptureGenuinenessJob.updateOne(
                    { _id: jobId },
                    { $set: { currentDomain: qualification.canonicalDomain || qualification.companyName || '' } },
                );

                try {
                    const stats = await verifyOneQualification({
                        companyId: job.companyId,
                        campaignId: job.campaignId,
                        sessionId: job.sessionId,
                        qualification,
                        campaign: campaign || {},
                        userId: job.createdBy,
                    });
                    const inc = { processed: 1 };
                    const counterKey = decisionCounterKey(stats.decision);
                    if (counterKey) inc[counterKey] = 1;
                    if (stats.method === 'ollama_local') inc.ollamaCount = 1;
                    else inc.ruleBasedCount = 1;
                    await RawCaptureGenuinenessJob.updateOne({ _id: jobId }, { $inc: inc });
                    await persistGenuinenessJobTerminal(jobId);
                } catch (err) {
                    await RawCaptureGenuinenessJob.updateOne({ _id: jobId }, {
                        $set: { lastError: String(err?.message || err).slice(0, 500) },
                        $inc: { failedCount: 1, processed: 1 },
                    });
                    await persistGenuinenessJobTerminal(jobId);
                    try {
                        await RawCaptureGenuineness.findOneAndUpdate(
                            {
                                companyId: job.companyId,
                                campaignId: job.campaignId,
                                qualificationId: qualification._id,
                            },
                            {
                                $set: {
                                    companyId: job.companyId,
                                    campaignId: job.campaignId,
                                    sessionId: job.sessionId,
                                    qualificationId: qualification._id,
                                    canonicalDomain: qualification.canonicalDomain || '',
                                    companyName: qualification.companyName || '',
                                    websiteUrl: qualification.websiteUrl || '',
                                    systemDecision: 'human_review_required',
                                    genuinenessScore: 0,
                                    genuinenessConfidence: 'low',
                                    verificationReason: 'Genuineness verification failed — review required',
                                    verificationStatus: 'failed',
                                    verificationMethod: 'rule_based',
                                    ruleVersion: RULE_ENGINE_VERSION,
                                    errorReason: String(err?.message || err).slice(0, 500),
                                    verifiedAt: new Date(),
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
            { length: Math.min(MAX_CONCURRENCY, Math.max(1, qualifications.length || 1)) },
            () => worker(),
        );
        await Promise.all(workers);
        await persistGenuinenessJobTerminal(jobId);
    } catch (err) {
        try {
            const fresh = await RawCaptureGenuinenessJob.findById(jobId);
            if (fresh && !isGenuinenessJobTerminalStatus(fresh.status)) {
                if (isJobProcessedComplete(fresh) || fresh.stopRequested) {
                    await persistGenuinenessJobTerminal(jobId);
                } else {
                    fresh.status = 'failed';
                    fresh.lastError = String(err?.message || err).slice(0, 500);
                    fresh.finishedAt = new Date();
                    await fresh.save();
                }
            }
        } catch {
            /* ignore secondary persist errors */
        }
    } finally {
        try {
            await persistGenuinenessJobTerminal(jobId);
        } catch {
            /* ignore */
        }
        runningJobs.delete(String(jobId));
    }
}

export async function startVerificationJob({
    companyId,
    user,
    sessionId,
    mode = 'all_qualified',
    qualificationIds = [],
}) {
    const cid = requireCompanyId(companyId);
    assertVerifyPerm(user);
    const session = await loadSession(cid, sessionId);

    const active = await RawCaptureGenuinenessJob.findOne({
        companyId: cid,
        sessionId,
        status: { $in: ['queued', 'processing'] },
    }).lean();
    if (active) {
        if (isJobProcessedComplete(active)) {
            await RawCaptureGenuinenessJob.updateOne(
                { _id: active._id },
                {
                    $set: {
                        status: resolveGenuinenessJobTerminalStatus(active),
                        finishedAt: new Date(),
                        currentDomain: '',
                    },
                },
            );
        } else {
            return { job: active, alreadyRunning: true };
        }
    }

    const job = await RawCaptureGenuinenessJob.create({
        companyId: cid,
        campaignId: session.campaignId,
        sessionId,
        mode: mode === 'selected' ? 'selected' : mode === 'retry_failed' ? 'retry_failed' : 'all_qualified',
        selectedQualificationIds: (qualificationIds || []).filter((id) => mongoose.isValidObjectId(id)),
        status: 'queued',
        createdBy: actorId(user),
    });

    setImmediate(() => {
        processJob(job._id).catch((err) => {
            console.error('CP8 genuineness job failed', job._id, err?.message || err);
        });
    });

    return { job: job.toObject(), alreadyRunning: false };
}

export async function stopVerificationJob({ companyId, user, sessionId, jobId }) {
    const cid = requireCompanyId(companyId);
    assertVerifyPerm(user);
    await loadSession(cid, sessionId);
    const filter = { companyId: cid, sessionId };
    if (jobId) filter._id = jobId;
    else filter.status = { $in: ['queued', 'processing'] };

    const job = await RawCaptureGenuinenessJob.findOneAndUpdate(
        filter,
        { $set: { stopRequested: true } },
        { new: true, sort: { createdAt: -1 } },
    );
    if (!job) throw new ApiError(404, 'No active genuineness verification job');
    return { job };
}

export async function getVerificationJobStatus({ companyId, user, sessionId, jobId }) {
    const cid = requireCompanyId(companyId);
    assertViewPerm(user);
    await loadSession(cid, sessionId);
    let job;
    if (jobId) {
        job = await RawCaptureGenuinenessJob.findOne({ _id: jobId, companyId: cid, sessionId }).lean();
    } else {
        job = await RawCaptureGenuinenessJob.findOne({ companyId: cid, sessionId }).sort({ createdAt: -1 }).lean();
    }
    return { job: job || null, ollamaEnabled: isOllamaGenuinenessEnabled() };
}

export async function listGenuinenessForSession({
    companyId,
    user,
    sessionId,
    query = {},
}) {
    const cid = requireCompanyId(companyId);
    assertViewPerm(user);
    const session = await loadSession(cid, sessionId);
    const campaignId = session.campaignId;

    const [items, enrichments, qualifications, captures, queries] = await Promise.all([
        RawCaptureGenuineness.find({ companyId: cid, campaignId })
            .sort({ genuinenessScore: -1, updatedAt: -1 })
            .lean(),
        RawCaptureEnrichment.find({ companyId: cid, campaignId }).lean(),
        RawCaptureQualification.find({ companyId: cid, campaignId }).lean(),
        RawCapture.find({ companyId: cid, campaignId }).sort({ firstSeenAt: 1, createdAt: 1 }).lean(),
        SearchQuery.find({ companyId: cid, campaignId }).select('_id queryText').lean(),
    ]);

    const queryTextById = {};
    for (const q of queries) queryTextById[String(q._id)] = q.queryText || '';

    const {
        buildCanonicalVerifiedCompanies,
    } = await import('./canonicalVerifiedCompany.util.js');

    const allMode = String(query.limit || '').toLowerCase() === 'all' || query.limit == null;
    const verifiedOnlyParam = query.verifiedOnly;
    const wantVerifiedOnly = verifiedOnlyParam == null
        ? true
        : !(verifiedOnlyParam === 'false' || verifiedOnlyParam === false || verifiedOnlyParam === '0');

    const sharedOptions = {
        includeDirectoryListings: false,
        search: query.search || '',
        sort: query.sort || 'sourceAppearances',
        sortDir: query.sortDir || 'desc',
        page: query.page || 1,
        limit: allMode ? null : (Number(query.limit) || 50),
    };

    // Shared verified-only dataset for Latest Verified / KPI / Final Excel
    const verifiedBuilt = buildCanonicalVerifiedCompanies({
        captures,
        enrichments,
        qualifications,
        genuinenessDocs: items,
        queryTextById,
        options: { ...sharedOptions, verifiedOnly: true },
    });

    // Full CP8 canonical set (includes Review Required) for owner-approval panel
    const allBuilt = buildCanonicalVerifiedCompanies({
        captures,
        enrichments,
        qualifications,
        genuinenessDocs: items,
        queryTextById,
        options: { ...sharedOptions, verifiedOnly: false },
    });

    const primary = wantVerifiedOnly ? verifiedBuilt : allBuilt;

    return {
        items: primary.items,
        allItems: allBuilt.items,
        verifiedItems: verifiedBuilt.items,
        sourceGenuinenessCount: items.length,
        fullCp8CanonicalCount: allBuilt.counters.uniqueVerifiedCompanies,
        campaignId,
        counters: {
            ...verifiedBuilt.counters,
            sourceGenuinenessDocs: items.length,
            fullCp8CanonicalCount: allBuilt.counters.uniqueVerifiedCompanies,
            uniqueVerifiedCompanies: verifiedBuilt.counters.uniqueVerifiedCompanies,
            sourceAppearances: verifiedBuilt.counters.sourceAppearances,
            duplicatesConsolidated: verifiedBuilt.counters.duplicatesConsolidated,
            verifiedSourceAppearances: verifiedBuilt.counters.sourceAppearances,
            uniqueSourceIdentities: verifiedBuilt.counters.uniqueVerifiedCompanies,
            duplicateAppearancesConsolidated: verifiedBuilt.counters.duplicatesConsolidated,
            directoryListings: verifiedBuilt.counters.directoryListings,
            independentlyVerifiedCompanies: verifiedBuilt.counters.independentlyVerifiedCompanies,
        },
        pagination: primary.pagination,
        note: 'Default items are verified-only canonical companies (isEligibleForFinalVerified). allItems includes Review Required. RawCapture docs are not deleted.',
    };
}

export async function getGenuinenessDetail({ companyId, user, sessionId, genuinenessId }) {
    const cid = requireCompanyId(companyId);
    assertViewPerm(user);
    const session = await loadSession(cid, sessionId);
    const genuineness = await RawCaptureGenuineness.findOne({
        _id: genuinenessId,
        companyId: cid,
        campaignId: session.campaignId,
    }).lean();
    if (!genuineness) throw new ApiError(404, 'Genuineness record not found');

    const qualification = await RawCaptureQualification.findOne({
        _id: genuineness.qualificationId,
        companyId: cid,
    }).lean();

    const enrichment = genuineness.enrichmentId
        ? await RawCaptureEnrichment.findOne({ _id: genuineness.enrichmentId, companyId: cid }).lean()
        : null;

    return {
        genuineness,
        qualification,
        enrichment,
        createCrmLeadEnabled: true,
        createCrmLeadNote: 'Create Lead uses the existing CRM Lead Master. Extraction is not paused.',
    };
}

export async function updateOwnerReview({ companyId, user, sessionId, genuinenessId, body = {} }) {
    const cid = requireCompanyId(companyId);
    assertVerifyPerm(user);
    const session = await loadSession(cid, sessionId);
    const doc = await RawCaptureGenuineness.findOne({
        _id: genuinenessId,
        companyId: cid,
        campaignId: session.campaignId,
    });
    if (!doc) throw new ApiError(404, 'Genuineness record not found');

    const prevOwner = doc.ownerDecision || '';
    const prevReview = doc.ownerReviewStatus || 'unreviewed';
    const uid = actorId(user);
    const audits = [];

    if (body.action === 'approve' || body.ownerReviewStatus === 'approved') {
        doc.ownerDecision = 'verified_genuine';
        doc.ownerReviewStatus = 'approved';
    } else if (body.action === 'reject' || body.ownerReviewStatus === 'rejected') {
        doc.ownerDecision = 'rejected_unusable';
        doc.ownerReviewStatus = 'rejected';
    } else if (body.action === 'mark_possible' || body.ownerReviewStatus === 'possible') {
        doc.ownerDecision = 'likely_genuine';
        doc.ownerReviewStatus = 'possible';
    } else if (body.action === 'send_for_review' || body.ownerReviewStatus === 'send_for_review') {
        doc.ownerDecision = 'human_review_required';
        doc.ownerReviewStatus = 'send_for_review';
    } else if (body.ownerDecision && GENUINENESS_DECISIONS.includes(body.ownerDecision)) {
        doc.ownerDecision = body.ownerDecision;
        if (body.ownerReviewStatus && OWNER_REVIEW_STATUSES.includes(body.ownerReviewStatus)) {
            doc.ownerReviewStatus = body.ownerReviewStatus;
        }
    }

    if (body.ownerReviewNote != null) {
        doc.ownerReviewNote = String(body.ownerReviewNote).slice(0, 2000);
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
        genuineness: doc.toObject(),
        systemDecisionPreserved: doc.systemDecision,
        createCrmLeadEnabled: false,
    };
}

export { createCrmLeadFromCapture as createCrmLead } from '../simpleLeadSearch/simpleLeadSearch.createCrmLead.service.js';

export { processJob, evaluateGenuineness };
