/**
 * Campaign-wide strict location recheck — async job with live progress.
 * Owner starts via one button; no duplicate RawCapture / CRM leads.
 */
import mongoose from 'mongoose';
import { ApiError } from '../../../../utils/ApiError.js';
import { checkUserPermission } from '../../../../utils/permissionUtils.js';
import { AssistedCaptureSession } from '../../../../models/assistedCaptureSession.model.js';
import { SearchCampaign } from '../../../../models/searchCampaign.model.js';
import { RawCapture } from '../../../../models/rawCapture.model.js';
import { RawCaptureEnrichment } from '../../../../models/rawCaptureEnrichment.model.js';
import { RawCaptureQualification } from '../../../../models/rawCaptureQualification.model.js';
import { RawCaptureLocationRecheckJob } from '../../../../models/rawCaptureQualification.model.js';
import { RULE_ENGINE_VERSION } from './constants.js';
import { normalizeCampaignCity } from './locationMatch.util.js';
// qualifyOneEnrichment loaded dynamically inside the job to avoid circular imports

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

const runningLocationRechecks = new Set();

async function recountLocationRecheckProgress(companyId, campaignId) {
    const { classifyStrictFinalBucket, countStrictFinalBuckets } = await import(
        '../simpleLeadSearch/strictFinalBucket.util.js'
    );
    let genDocs = [];
    try {
        const { RawCaptureGenuineness } = await import('../../../../models/rawCaptureGenuineness.model.js');
        genDocs = await RawCaptureGenuineness.find({ companyId, campaignId })
            .select('qualificationId systemDecision ownerDecision genuinenessDecision verificationStatus')
            .lean();
    } catch {
        genDocs = [];
    }

    const [captures, enrichDocs, qualDocs] = await Promise.all([
        RawCapture.find({ companyId, campaignId }).select('_id enrichmentStatus').lean(),
        RawCaptureEnrichment.find({ companyId, campaignId }).lean(),
        RawCaptureQualification.find({ companyId, campaignId }).lean(),
    ]);

    const enrichByCapture = new Map();
    for (const e of enrichDocs) {
        for (const cid of (e.rawCaptureIds || [])) {
            if (!enrichByCapture.has(String(cid))) enrichByCapture.set(String(cid), e);
        }
    }
    const qualByEnrichment = new Map(qualDocs.map((q) => [String(q.enrichmentId), q]));
    const genByQual = new Map((genDocs || []).map((g) => [String(g.qualificationId), g]));

    const rows = captures.map((cap) => {
        const enrich = enrichByCapture.get(String(cap._id));
        const qual = enrich ? qualByEnrichment.get(String(enrich._id)) : null;
        const gen = qual ? genByQual.get(String(qual._id)) : null;
        const exclusiveStatus = ['failed', 'blocked'].includes(String(cap.enrichmentStatus || ''))
            ? 'failed'
            : (!enrich ? 'waiting' : 'completed');
        const pseudo = {
            exclusiveStatus,
            retryAvailable: exclusiveStatus === 'failed',
            productMatchStrength: qual?.productMatchStrength || '',
            locationMatch: qual?.locationMatch || '',
            locationClassification: qual?.locationClassification || '',
            officeInSelectedCity: Boolean(qual?.officeInSelectedCity),
            servesSelectedCity: Boolean(qual?.servesSelectedCity),
            addressCount: Array.isArray(enrich?.addresses) ? enrich.addresses.length : 0,
            primaryAddress: enrich?.addresses?.[0]?.raw || '',
            city: enrich?.city || '',
            qualificationStatus: qual?.ownerDecision || qual?.systemDecision || '',
            genuinenessStatus: gen?.ownerDecision || gen?.systemDecision || gen?.genuinenessDecision || '',
            failureReason: qual?.decisionReason || '',
            flags: {
                hasEnrichDone: Boolean(enrich && ['completed', 'partial', 'review_required'].includes(enrich.enrichmentStatus)),
                hasQualified: Boolean(qual),
                hasVerified: Boolean(gen && /verified|likely|genuine/i.test(String(gen.systemDecision || gen.ownerDecision || ''))),
                isLocationMismatch: qual?.locationMatch === 'mismatch'
                    || (qual?.unmatchedOrConflictingEvidence || []).includes('location_mismatch'),
            },
        };
        return { ...pseudo, strictFinalBucket: classifyStrictFinalBucket(pseudo) };
    });

    const buckets = countStrictFinalBuckets(rows);
    return {
        buckets,
        exactCityConfirmed: rows.filter((r) => r.officeInSelectedCity && r.locationMatch === 'match').length,
        servesCityOnly: buckets.serves_city,
        differentCityConfirmed: buckets.location_mismatch,
        locationNotConfirmed: buckets.location_not_confirmed,
        addressMissing: buckets.address_missing,
        jobCourseTraining: buckets.job_course_training,
        unrelatedProduct: buckets.unrelated_product,
        directoryOnly: buckets.directory_only,
        strictProspects: buckets.strict_prospect,
        failedRetryable: buckets.failed_retryable,
        addressRows: enrichDocs.reduce((n, e) => n + (Array.isArray(e.addresses) ? e.addresses.length : 0), 0),
    };
}

export async function processLocationRecheckJob(jobId) {
    if (runningLocationRechecks.has(String(jobId))) return;
    runningLocationRechecks.add(String(jobId));
    try {
        let job = await RawCaptureLocationRecheckJob.findById(jobId);
        if (!job) return;
        job.status = 'processing';
        job.startedAt = new Date();
        job.ruleEngineVersion = RULE_ENGINE_VERSION;
        await job.save();

        const campaign = await SearchCampaign.findById(job.campaignId).lean();
        if (!campaign) {
            job.status = 'failed';
            job.lastError = 'Campaign not found';
            job.finishedAt = new Date();
            await job.save();
            return;
        }
        const cityNorm = normalizeCampaignCity(campaign.city || '');
        job.selectedCityEntered = cityNorm.entered;
        job.selectedCityInterpreted = cityNorm.display;
        await job.save();

        const { enrichDomainFromWebsite } = await import('../rawCaptureEnrichment/fetch.util.js');
        const { dedupeAddresses } = await import('../rawCaptureEnrichment/addressExtract.util.js');

        const captures = await RawCapture.find({
            companyId: job.companyId,
            campaignId: job.campaignId,
        }).sort({ firstSeenAt: 1, createdAt: 1 }).lean();

        job.total = captures.length;
        job.remaining = captures.length;
        await job.save();

        const enrichDocs = await RawCaptureEnrichment.find({
            companyId: job.companyId,
            campaignId: job.campaignId,
        });
        const enrichByCapture = new Map();
        for (const e of enrichDocs) {
            for (const cid of (e.rawCaptureIds || [])) {
                if (!enrichByCapture.has(String(cid))) enrichByCapture.set(String(cid), e);
            }
        }

        const doneEnrichments = new Set();
        let checked = 0;

        for (const cap of captures) {
            const fresh = await RawCaptureLocationRecheckJob.findById(jobId).select('stopRequested').lean();
            if (fresh?.stopRequested) {
                job = await RawCaptureLocationRecheckJob.findById(jobId);
                job.status = 'stopped';
                job.finishedAt = new Date();
                await job.save();
                return;
            }

            const enrichment = enrichByCapture.get(String(cap._id));
            try {
                if (enrichment && !doneEnrichments.has(String(enrichment._id))) {
                    await RawCaptureLocationRecheckJob.updateOne(
                        { _id: jobId },
                        { $set: { currentCompany: enrichment.companyName || cap.title || '' } },
                    );

                    if (job.refreshAddresses && enrichment.websiteUrl) {
                        let seed = enrichment.websiteUrl;
                        try {
                            const u = new URL(enrichment.websiteUrl);
                            if (!/contact/i.test(u.pathname)) seed = `${u.origin}/contact-us.html`;
                        } catch { /* keep */ }
                        const fetched = await enrichDomainFromWebsite(seed, { maxPages: 3 });
                        if (fetched?.ok && fetched.data?.addresses?.length) {
                            const merged = dedupeAddresses([
                                ...(enrichment.addresses || []),
                                ...fetched.data.addresses,
                            ]);
                            enrichment.addresses = merged;
                            if (!enrichment.city && merged[0]?.city) enrichment.city = merged[0].city;
                            if (!enrichment.state && merged[0]?.state) enrichment.state = merged[0].state;
                            if (!enrichment.country && merged[0]?.country) enrichment.country = merged[0].country;
                            if (fetched.data.productsServices?.length) {
                                enrichment.productsServices = [...new Set([
                                    ...(enrichment.productsServices || []),
                                    ...fetched.data.productsServices,
                                ])].slice(0, 30);
                                enrichment.markModified('productsServices');
                            }
                            enrichment.markModified('addresses');
                            await enrichment.save();
                            await RawCaptureLocationRecheckJob.updateOne({ _id: jobId }, { $inc: { addressesRefreshed: 1 } });
                        }
                    }

                    const { qualifyOneEnrichment } = await import('./rawCaptureQualification.service.js');
                    await qualifyOneEnrichment({
                        companyId: job.companyId,
                        campaignId: job.campaignId,
                        sessionId: job.sessionId,
                        enrichment: enrichment.toObject ? enrichment.toObject() : enrichment,
                        campaign,
                        userId: job.createdBy,
                        recheckLocation: true,
                    });
                    doneEnrichments.add(String(enrichment._id));
                    await RawCaptureLocationRecheckJob.updateOne({ _id: jobId }, { $inc: { enrichmentsRechecked: 1 } });
                }
            } catch (err) {
                await RawCaptureLocationRecheckJob.updateOne({ _id: jobId }, {
                    $inc: { failed: 1 },
                    $set: { lastError: String(err?.message || err).slice(0, 500) },
                });
            }

            checked += 1;
            if (checked % 5 === 0 || checked === captures.length) {
                const progress = await recountLocationRecheckProgress(job.companyId, job.campaignId);
                await RawCaptureLocationRecheckJob.updateOne({ _id: jobId }, {
                    $set: {
                        checked,
                        remaining: Math.max(0, captures.length - checked),
                        exactCityConfirmed: progress.exactCityConfirmed,
                        servesCityOnly: progress.servesCityOnly,
                        differentCityConfirmed: progress.differentCityConfirmed,
                        locationNotConfirmed: progress.locationNotConfirmed,
                        addressMissing: progress.addressMissing,
                        jobCourseTraining: progress.jobCourseTraining,
                        unrelatedProduct: progress.unrelatedProduct,
                        directoryOnly: progress.directoryOnly,
                        strictProspects: progress.strictProspects,
                        failedRetryable: progress.failedRetryable,
                        reconciliation: {
                            totalCaptured: captures.length,
                            buckets: progress.buckets,
                            addressRows: progress.addressRows,
                            bucketTotal: progress.buckets.total,
                            balanced: progress.buckets.total === captures.length,
                        },
                    },
                });
            } else {
                await RawCaptureLocationRecheckJob.updateOne({ _id: jobId }, {
                    $set: { checked, remaining: Math.max(0, captures.length - checked) },
                });
            }
        }

        job = await RawCaptureLocationRecheckJob.findById(jobId);
        const finalProgress = await recountLocationRecheckProgress(job.companyId, job.campaignId);
        job.checked = captures.length;
        job.remaining = 0;
        job.exactCityConfirmed = finalProgress.exactCityConfirmed;
        job.servesCityOnly = finalProgress.servesCityOnly;
        job.differentCityConfirmed = finalProgress.differentCityConfirmed;
        job.locationNotConfirmed = finalProgress.locationNotConfirmed;
        job.addressMissing = finalProgress.addressMissing;
        job.jobCourseTraining = finalProgress.jobCourseTraining;
        job.unrelatedProduct = finalProgress.unrelatedProduct;
        job.directoryOnly = finalProgress.directoryOnly;
        job.strictProspects = finalProgress.strictProspects;
        job.failedRetryable = finalProgress.failedRetryable;
        job.reconciliation = {
            totalCaptured: captures.length,
            buckets: finalProgress.buckets,
            addressRows: finalProgress.addressRows,
            bucketTotal: finalProgress.buckets.total,
            balanced: finalProgress.buckets.total === captures.length,
        };
        job.currentCompany = '';
        job.status = Number(job.failed || 0) > 0 ? 'partial' : 'completed';
        job.finishedAt = new Date();
        await job.save();
    } catch (err) {
        await RawCaptureLocationRecheckJob.updateOne({ _id: jobId }, {
            $set: {
                status: 'failed',
                lastError: String(err?.message || err).slice(0, 500),
                finishedAt: new Date(),
            },
        });
    } finally {
        runningLocationRechecks.delete(String(jobId));
    }
}

export async function startStrictLocationRecheck({ companyId, user, sessionId, refreshAddresses = true }) {
    const cid = requireCompanyId(companyId);
    assertQualifyPerm(user);
    const session = await loadSession(cid, sessionId);

    const active = await RawCaptureLocationRecheckJob.findOne({
        companyId: cid,
        sessionId,
        status: { $in: ['queued', 'processing'] },
    }).lean();
    if (active) {
        return { job: active, alreadyRunning: true };
    }

    const cityNorm = normalizeCampaignCity(
        (await SearchCampaign.findById(session.campaignId).select('city').lean())?.city || '',
    );

    const total = await RawCapture.countDocuments({ companyId: cid, campaignId: session.campaignId });
    const job = await RawCaptureLocationRecheckJob.create({
        companyId: cid,
        campaignId: session.campaignId,
        sessionId,
        status: 'queued',
        refreshAddresses: refreshAddresses !== false,
        total,
        remaining: total,
        selectedCityEntered: cityNorm.entered,
        selectedCityInterpreted: cityNorm.display,
        ruleEngineVersion: RULE_ENGINE_VERSION,
        createdBy: actorId(user),
    });

    setImmediate(() => {
        processLocationRecheckJob(job._id).catch((err) => {
            console.error('Strict location recheck job failed', job._id, err?.message || err);
        });
    });

    return {
        job: job.toObject(),
        alreadyRunning: false,
        note: 'CRM Lead creation remains OFF. RawCapture rows are not deleted or duplicated.',
    };
}

export async function getStrictLocationRecheckStatus({ companyId, user, sessionId, jobId }) {
    const cid = requireCompanyId(companyId);
    assertViewPerm(user);
    await loadSession(cid, sessionId);
    const filter = { companyId: cid, sessionId };
    if (jobId && mongoose.isValidObjectId(jobId)) filter._id = jobId;
    const job = await RawCaptureLocationRecheckJob.findOne(filter).sort({ createdAt: -1 }).lean();
    return { job: job || null };
}

export async function stopStrictLocationRecheck({ companyId, user, sessionId, jobId }) {
    const cid = requireCompanyId(companyId);
    assertQualifyPerm(user);
    await loadSession(cid, sessionId);
    const filter = { companyId: cid, sessionId, status: { $in: ['queued', 'processing'] } };
    if (jobId && mongoose.isValidObjectId(jobId)) filter._id = jobId;
    const job = await RawCaptureLocationRecheckJob.findOne(filter);
    if (!job) return { stopped: false, job: null };
    job.stopRequested = true;
    await job.save();
    return { stopped: true, job: job.toObject() };
}
