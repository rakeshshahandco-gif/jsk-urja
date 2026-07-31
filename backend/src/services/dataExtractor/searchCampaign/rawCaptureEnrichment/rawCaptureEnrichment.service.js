/**
 * Checkpoint 6A — RawCapture website enrichment orchestration.
 * Does NOT create CRM Leads. Does NOT overwrite RawCapture content fields.
 */
import mongoose from 'mongoose';
import { ApiError } from '../../../../utils/ApiError.js';
import { checkUserPermission } from '../../../../utils/permissionUtils.js';
import { AssistedCaptureSession } from '../../../../models/assistedCaptureSession.model.js';
import { RawCapture } from '../../../../models/rawCapture.model.js';
import { RawCaptureEnrichment, RawCaptureEnrichmentJob } from '../../../../models/rawCaptureEnrichment.model.js';
import { classifyStageA } from '../simpleLeadSearch/stageAPreFilter.util.js';
import { DOMAIN_ENRICH_TIMEOUT_MS, MAX_CONCURRENCY } from './constants.js';
import { enrichDomainFromWebsite } from './fetch.util.js';
import {
    computeMissingFields,
    isDirectoryHost,
    normalizeDomain,
    scoreEnrichmentConfidence,
} from './parse.util.js';

function requireCompanyId(companyId) {
    if (!companyId || !mongoose.isValidObjectId(companyId)) throw new ApiError(400, 'Company context required');
    return companyId;
}

function actorId(user) {
    return user?._id || user?.id || null;
}

function assertEnrichPerm(user) {
    if (
        checkUserPermission(user, 'data_extractor.raw_capture.manage')
        || checkUserPermission(user, 'data_extractor.assisted_capture.start')
    ) return;
    throw new ApiError(403, 'Permission denied: enrichment requires raw_capture.manage or assisted_capture.start');
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

function captureMongoForSession(session) {
    const mongo = { companyId: session.companyId, campaignId: session.campaignId };
    const batchIds = Array.isArray(session.rawCaptureBatchIds) ? session.rawCaptureBatchIds : [];
    if (batchIds.length) mongo.captureBatchId = { $in: batchIds };
    else mongo.queryId = session.queryId;
    return mongo;
}

function pickSeedUrl(capture) {
    return capture.resultUrlOriginal || capture.resultUrlNormalized || '';
}

function groupByDomain(captures) {
    const map = new Map();
    for (const c of captures) {
        const domain = normalizeDomain(c.displayDomain || c.resultUrlNormalized || c.resultUrlOriginal);
        if (!domain) continue;
        const stageA = classifyStageA(c);
        if (stageA.decision === 'rejected') continue; // skip obvious unwanted
        if (!map.has(domain)) map.set(domain, []);
        map.get(domain).push(c);
    }
    return map;
}

async function upsertEnrichmentDoc({ companyId, campaignId, sessionId, domain, captureIds, userId, patch }) {
    const existing = await RawCaptureEnrichment.findOne({ companyId, campaignId, canonicalDomain: domain });
    const mergedIds = [...new Set([
        ...(existing?.rawCaptureIds || []).map(String),
        ...captureIds.map(String),
    ])].map((id) => new mongoose.Types.ObjectId(id));

    const payload = {
        ...patch,
        companyId,
        campaignId,
        sessionId,
        canonicalDomain: domain,
        rawCaptureIds: mergedIds,
        updatedBy: userId,
        lastEnrichedAt: new Date(),
    };
    if (!existing) payload.createdBy = userId;

    const doc = await RawCaptureEnrichment.findOneAndUpdate(
        { companyId, campaignId, canonicalDomain: domain },
        { $set: payload },
        { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    return doc;
}

async function markCapturesStatus(captureIds, companyId, status, blockedReason = '') {
    if (!captureIds.length) return;
    await RawCapture.updateMany(
        { _id: { $in: captureIds }, companyId },
        {
            $set: {
                enrichmentStatus: status,
                enrichmentEligible: status !== 'blocked',
                enrichmentBlockedReason: blockedReason,
            },
        },
    );
}

async function enrichOneDomain({ companyId, campaignId, sessionId, domain, captures, userId, isDirectory }) {
    const captureIds = captures.map((c) => c._id);
    await markCapturesStatus(captureIds, companyId, 'pending');

    const seed = pickSeedUrl(captures[0]);
    if (!seed) {
        await upsertEnrichmentDoc({
            companyId, campaignId, sessionId, domain, captureIds, userId,
            patch: {
                enrichmentStatus: 'failed',
                errorReason: 'No website URL on RawCapture',
                confidence: 0,
                missingFields: ['websiteUrl'],
            },
        });
        await markCapturesStatus(captureIds, companyId, 'failed', 'No website URL');
        return { status: 'failed', withPhone: 0, withEmail: 0, withWhatsApp: 0, withFacebook: 0, withInstagram: 0, review: 0 };
    }

    if (isDirectory) {
        // Keep directory as source; do not treat platform contact as supplier contact.
        const titleName = String(captures[0].title || '').split('|')[0].split('-')[0].trim().slice(0, 200);
        const doc = await upsertEnrichmentDoc({
            companyId, campaignId, sessionId, domain, captureIds, userId,
            patch: {
                websiteUrl: seed,
                isDirectorySource: true,
                directoryPlatform: domain,
                directoryProfileUrl: seed,
                companyName: titleName,
                enrichmentStatus: 'review_required',
                confidence: titleName ? 25 : 10,
                errorReason: '',
                missingFields: ['phone', 'email', 'whatsapp', 'official_website'],
                sourceEvidence: [{
                    field: 'directoryProfile',
                    value: titleName || domain,
                    sourceUrl: seed,
                    note: 'Directory listing — supplier identity needs review; platform contacts not used',
                }],
                facebook: {},
                instagram: {},
                phones: [],
                emails: [],
                whatsappNumbers: [],
            },
        });
        await markCapturesStatus(captureIds, companyId, 'blocked', 'Directory source — review required');
        return {
            status: 'review_required',
            withPhone: 0,
            withEmail: 0,
            withWhatsApp: 0,
            withFacebook: 0,
            withInstagram: 0,
            review: 1,
            enrichmentId: doc._id,
        };
    }

    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; }, DOMAIN_ENRICH_TIMEOUT_MS);
    let result;
    try {
        result = await enrichDomainFromWebsite(seed, { maxPages: 5 });
    } finally {
        clearTimeout(timer);
    }

    if (timedOut && !result?.ok) {
        result = { ok: false, error: 'Domain enrichment timed out', pagesVisited: [], data: null };
    }

    if (!result?.ok || !result.data) {
        await upsertEnrichmentDoc({
            companyId, campaignId, sessionId, domain, captureIds, userId,
            patch: {
                websiteUrl: seed,
                enrichmentStatus: 'failed',
                errorReason: String(result?.error || 'Enrichment failed').slice(0, 500),
                pagesVisited: result?.pagesVisited || [],
                confidence: 0,
            },
        });
        await markCapturesStatus(captureIds, companyId, 'failed', result?.error || 'Enrichment failed');
        return { status: 'failed', withPhone: 0, withEmail: 0, withWhatsApp: 0, withFacebook: 0, withInstagram: 0, review: 0 };
    }

    const data = result.data;
    // Prefer Google title if website name empty
    if (!data.companyName) {
        data.companyName = String(captures[0].title || '').split('|')[0].split('-')[0].trim().slice(0, 200);
        if (data.companyName) {
            data.sourceEvidence = [
                ...(data.sourceEvidence || []),
                { field: 'companyName', value: data.companyName, sourceUrl: seed, note: 'from Google result title (unverified)' },
            ];
        }
    }

    const confidence = scoreEnrichmentConfidence(data);
    const missingFields = computeMissingFields(data);
    let enrichmentStatus = 'completed';
    if (missingFields.includes('phone') || missingFields.includes('email')) enrichmentStatus = 'partial';
    if (!data.companyName && !data.emails.length && !data.phones.length) enrichmentStatus = 'failed';

    const doc = await upsertEnrichmentDoc({
        companyId, campaignId, sessionId, domain, captureIds, userId,
        patch: {
            websiteUrl: data.websiteUrl || seed,
            isDirectorySource: false,
            companyName: data.companyName || '',
            legalOrDisplayedName: data.legalOrDisplayedName || '',
            contactPersons: data.contactPersons || [],
            phones: data.phones || [],
            whatsappNumbers: data.whatsappNumbers || [],
            emails: data.emails || [],
            addresses: data.addresses || [],
            city: data.city || '',
            state: data.state || '',
            country: data.country || '',
            facebook: data.facebook || {},
            instagram: data.instagram || {},
            linkedin: data.linkedin || {},
            youtube: data.youtube || {},
            productsServices: data.productsServices || [],
            businessType: data.businessType || 'unknown',
            manufacturerEvidence: data.manufacturerEvidence || '',
            gstin: data.gstin || '',
            gstinSourceUrl: data.gstinSourceUrl || '',
            rejectedPhones: data.rejectedPhones || [],
            sourceEvidence: data.sourceEvidence || [],
            pagesVisited: result.pagesVisited || [],
            enrichmentStatus,
            confidence,
            missingFields,
            errorReason: '',
        },
    });

    await markCapturesStatus(
        captureIds,
        companyId,
        enrichmentStatus === 'failed' ? 'failed' : 'completed',
        '',
    );

    return {
        status: enrichmentStatus,
        withPhone: (data.phones || []).length ? 1 : 0,
        withEmail: (data.emails || []).length ? 1 : 0,
        withWhatsApp: (data.whatsappNumbers || []).length ? 1 : 0,
        withFacebook: data.facebook?.url ? 1 : 0,
        withInstagram: data.instagram?.url ? 1 : 0,
        review: enrichmentStatus === 'review_required' ? 1 : 0,
        enrichmentId: doc._id,
    };
}

const runningJobs = new Set();

async function processJob(jobId) {
    if (runningJobs.has(String(jobId))) return;
    runningJobs.add(String(jobId));
    try {
        let job = await RawCaptureEnrichmentJob.findById(jobId);
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

        let captures;
        if (job.mode === 'selected' && job.selectedRawCaptureIds?.length) {
            // Campaign-wide by explicit IDs (continuous pipeline / multi-query batches)
            captures = await RawCapture.find({
                companyId: job.companyId,
                campaignId: job.campaignId,
                _id: { $in: job.selectedRawCaptureIds },
            }).sort({ firstSeenAt: 1, lastSeenAt: 1 }).lean();
        } else {
            const mongo = captureMongoForSession(session);
            captures = await RawCapture.find(mongo).sort({ lastSeenAt: -1 }).lean();
            if (job.mode === 'retry_failed') {
                captures = captures.filter((c) => c.enrichmentStatus === 'failed' || c.enrichmentStatus === 'blocked');
            } else {
                // all_unverified
                captures = captures.filter((c) => !c.enrichmentStatus || c.enrichmentStatus === 'not_started' || c.enrichmentStatus === 'pending');
            }
        }

        const grouped = groupByDomain(captures);
        job.totalDomains = grouped.size;
        await job.save();

        const entries = [...grouped.entries()];
        let idx = 0;

        async function worker() {
            while (idx < entries.length) {
                const current = await RawCaptureEnrichmentJob.findById(jobId).select('stopRequested').lean();
                if (current?.stopRequested) break;

                const my = idx;
                idx += 1;
                const [domain, list] = entries[my];
                await RawCaptureEnrichmentJob.updateOne({ _id: jobId }, { $set: { currentDomain: domain } });

                const isDirectory = isDirectoryHost(domain);
                let stats;
                try {
                    stats = await enrichOneDomain({
                        companyId: job.companyId,
                        campaignId: job.campaignId,
                        sessionId: job.sessionId,
                        domain,
                        captures: list,
                        userId: job.createdBy,
                        isDirectory,
                    });
                } catch (err) {
                    stats = { status: 'failed', withPhone: 0, withEmail: 0, withWhatsApp: 0, withFacebook: 0, withInstagram: 0, review: 0 };
                    await RawCaptureEnrichmentJob.updateOne({ _id: jobId }, {
                        $set: { lastError: String(err?.message || err).slice(0, 500) },
                        $inc: { failedCount: 1, processedDomains: 1 },
                    });
                    continue;
                }

                const inc = { processedDomains: 1 };
                if (stats.status === 'completed') inc.completedCount = 1;
                else if (stats.status === 'partial') inc.partialCount = 1;
                else if (stats.status === 'failed') inc.failedCount = 1;
                else if (stats.status === 'review_required') {
                    inc.reviewRequiredCount = 1;
                    inc.blockedCount = 1;
                }
                if (stats.withPhone) inc.withPhone = 1;
                if (stats.withEmail) inc.withEmail = 1;
                if (stats.withWhatsApp) inc.withWhatsApp = 1;
                if (stats.withFacebook) inc.withFacebook = 1;
                if (stats.withInstagram) inc.withInstagram = 1;

                await RawCaptureEnrichmentJob.updateOne({ _id: jobId }, { $inc: inc });
            }
        }

        const workers = Array.from({ length: Math.min(MAX_CONCURRENCY, Math.max(1, entries.length)) }, () => worker());
        await Promise.all(workers);

        job = await RawCaptureEnrichmentJob.findById(jobId);
        if (job.stopRequested) {
            job.status = 'stopped';
        } else if (job.failedCount && (job.completedCount || job.partialCount)) {
            job.status = 'partial';
        } else if (job.failedCount && !job.completedCount && !job.partialCount) {
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

export async function startEnrichmentJob({ companyId, user, sessionId, mode = 'all_unverified', rawCaptureIds = [] }) {
    const cid = requireCompanyId(companyId);
    assertEnrichPerm(user);
    const session = await loadSession(cid, sessionId);

    const active = await RawCaptureEnrichmentJob.findOne({
        companyId: cid,
        sessionId,
        status: { $in: ['queued', 'processing'] },
    }).lean();
    if (active) {
        return { job: active, alreadyRunning: true };
    }

    const job = await RawCaptureEnrichmentJob.create({
        companyId: cid,
        campaignId: session.campaignId,
        sessionId,
        mode: mode === 'selected' ? 'selected' : mode === 'retry_failed' ? 'retry_failed' : 'all_unverified',
        selectedRawCaptureIds: (rawCaptureIds || []).filter((id) => mongoose.isValidObjectId(id)),
        status: 'queued',
        createdBy: actorId(user),
    });

    setImmediate(() => {
        processJob(job._id).catch((err) => {
            console.error('CP6 enrichment job failed', job._id, err?.message || err);
        });
    });

    return { job: job.toObject(), alreadyRunning: false };
}

export async function stopEnrichmentJob({ companyId, user, sessionId, jobId }) {
    const cid = requireCompanyId(companyId);
    assertEnrichPerm(user);
    await loadSession(cid, sessionId);
    const filter = { companyId: cid, sessionId };
    if (jobId) filter._id = jobId;
    else filter.status = { $in: ['queued', 'processing'] };

    const job = await RawCaptureEnrichmentJob.findOneAndUpdate(
        filter,
        { $set: { stopRequested: true } },
        { new: true, sort: { createdAt: -1 } },
    );
    if (!job) throw new ApiError(404, 'No active enrichment job');
    return { job };
}

export async function getEnrichmentJobStatus({ companyId, user, sessionId, jobId }) {
    const cid = requireCompanyId(companyId);
    assertViewPerm(user);
    await loadSession(cid, sessionId);
    let job;
    if (jobId) {
        job = await RawCaptureEnrichmentJob.findOne({ _id: jobId, companyId: cid, sessionId }).lean();
    } else {
        job = await RawCaptureEnrichmentJob.findOne({ companyId: cid, sessionId }).sort({ createdAt: -1 }).lean();
    }
    return { job: job || null };
}

export async function listEnrichmentsForSession({ companyId, user, sessionId }) {
    const cid = requireCompanyId(companyId);
    assertViewPerm(user);
    const session = await loadSession(cid, sessionId);
    const items = await RawCaptureEnrichment.find({
        companyId: cid,
        campaignId: session.campaignId,
    }).sort({ updatedAt: -1 }).lean();
    return { items, campaignId: session.campaignId };
}

export async function getEnrichmentDetail({ companyId, user, sessionId, enrichmentId }) {
    const cid = requireCompanyId(companyId);
    assertViewPerm(user);
    const session = await loadSession(cid, sessionId);
    const enrichment = await RawCaptureEnrichment.findOne({
        _id: enrichmentId,
        companyId: cid,
        campaignId: session.campaignId,
    }).lean();
    if (!enrichment) throw new ApiError(404, 'Enrichment record not found');

    const captures = await RawCapture.find({
        _id: { $in: enrichment.rawCaptureIds || [] },
        companyId: cid,
    }).lean();

    return { enrichment, captures };
}

export async function updateEnrichmentReview({ companyId, user, sessionId, enrichmentId, body = {} }) {
    const cid = requireCompanyId(companyId);
    assertEnrichPerm(user);
    const session = await loadSession(cid, sessionId);
    const enrichment = await RawCaptureEnrichment.findOne({
        _id: enrichmentId,
        companyId: cid,
        campaignId: session.campaignId,
    });
    if (!enrichment) throw new ApiError(404, 'Enrichment record not found');

    if (body.reviewStatus && ['unreviewed', 'approved', 'rejected', 'needs_edit'].includes(body.reviewStatus)) {
        enrichment.reviewStatus = body.reviewStatus;
    }
    if (body.ownerOverrides && typeof body.ownerOverrides === 'object') {
        enrichment.ownerOverrides = { ...(enrichment.ownerOverrides || {}), ...body.ownerOverrides };
        // Apply safe scalar overrides without inventing data
        for (const key of ['companyName', 'city', 'state', 'country', 'businessType']) {
            if (body.ownerOverrides[key] != null) enrichment[key] = String(body.ownerOverrides[key]).slice(0, 300);
        }
    }
    enrichment.updatedBy = actorId(user);
    await enrichment.save();
    return { enrichment: enrichment.toObject() };
}

export { processJob };