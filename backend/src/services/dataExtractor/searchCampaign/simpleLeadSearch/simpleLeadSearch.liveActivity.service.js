/**
 * Live Processing Activity feed for Simple Lead Search.
 * Read-only: latest N source records + existing stage docs. Does not cap extraction.
 */
import mongoose from 'mongoose';
import { AssistedCaptureSession } from '../../../../models/assistedCaptureSession.model.js';
import { RawCapture } from '../../../../models/rawCapture.model.js';
import { RawCaptureEnrichment, RawCaptureEnrichmentJob } from '../../../../models/rawCaptureEnrichment.model.js';
import { RawCaptureQualification, RawCaptureQualificationJob } from '../../../../models/rawCaptureQualification.model.js';
import { RawCaptureGenuineness, RawCaptureGenuinenessJob } from '../../../../models/rawCaptureGenuineness.model.js';
import { ApiError } from '../../../../utils/ApiError.js';
import { assertAssistedCaptureView } from '../assistedCapture/permissions.util.js';
import {
    applyLiveFilter,
    buildCurrentHeadline,
    clampLiveLimit,
    mapLiveActivityRow,
    markDuplicateSourceRows,
} from './liveActivity.util.js';

const ACTIVE_JOB = ['queued', 'processing'];

function requireCompanyId(companyId) {
    if (!companyId || !mongoose.isValidObjectId(companyId)) {
        throw new ApiError(400, 'Company context required');
    }
    return companyId;
}

function idSet(list = []) {
    return new Set((list || []).map((x) => String(x)).filter(Boolean));
}

function domainSet(jobs = []) {
    return new Set(
        jobs.map((j) => String(j.currentDomain || '').replace(/^www\./i, '').toLowerCase()).filter(Boolean),
    );
}

async function loadSession(companyId, sessionId) {
    if (!mongoose.isValidObjectId(sessionId)) throw new ApiError(404, 'Session not found');
    const session = await AssistedCaptureSession.findOne({ _id: sessionId, companyId }).lean();
    if (!session) throw new ApiError(404, 'Assisted capture session not found');
    return session;
}

export async function listLiveProcessingActivity({ companyId, user, sessionId, query = {} }) {
    const cid = requireCompanyId(companyId);
    assertAssistedCaptureView(user);
    const session = await loadSession(cid, sessionId);
    const campaignId = session.campaignId;
    const limit = clampLiveLimit(query.limit, 50);
    const filter = String(query.filter || 'all').toLowerCase();
    const window = Math.min(100, Math.max(limit, 50));

    const [recentCaps, recentEns, recentQuals, recentGens, captureTotal] = await Promise.all([
        RawCapture.find({ companyId: cid, campaignId })
            .sort({ lastSeenAt: -1, updatedAt: -1 })
            .limit(window)
            .select('_id')
            .lean(),
        RawCaptureEnrichment.find({ companyId: cid, campaignId })
            .sort({ updatedAt: -1 })
            .limit(window)
            .select('rawCaptureIds')
            .lean(),
        RawCaptureQualification.find({ companyId: cid, campaignId })
            .sort({ updatedAt: -1 })
            .limit(window)
            .select('enrichmentId')
            .lean(),
        RawCaptureGenuineness.find({ companyId: cid, campaignId })
            .sort({ updatedAt: -1 })
            .limit(window)
            .select('enrichmentId qualificationId')
            .lean(),
        RawCapture.countDocuments({ companyId: cid, campaignId }),
    ]);

    const captureIds = new Set(recentCaps.map((c) => String(c._id)));
    for (const e of recentEns) {
        for (const id of (e.rawCaptureIds || [])) captureIds.add(String(id));
    }

    const needEnrichIds = [
        ...recentQuals.map((q) => q.enrichmentId),
        ...recentGens.map((g) => g.enrichmentId),
    ].filter(Boolean);
    if (needEnrichIds.length) {
        const extraEn = await RawCaptureEnrichment.find({
            _id: { $in: needEnrichIds },
            companyId: cid,
        }).select('rawCaptureIds').lean();
        for (const e of extraEn) {
            for (const id of (e.rawCaptureIds || [])) captureIds.add(String(id));
        }
    }

    const ids = [...captureIds].filter((id) => mongoose.isValidObjectId(id)).slice(0, 200);
    const captures = ids.length
        ? await RawCapture.find({ _id: { $in: ids }, companyId: cid, campaignId }).lean()
        : [];

    const [enrichDocs, eJobs, qJobs, vJobs] = await Promise.all([
        ids.length
            ? RawCaptureEnrichment.find({
                companyId: cid,
                campaignId,
                rawCaptureIds: { $in: ids },
            }).lean()
            : Promise.resolve([]),
        RawCaptureEnrichmentJob.find({ companyId: cid, campaignId, status: { $in: ACTIVE_JOB } }).lean(),
        RawCaptureQualificationJob.find({ companyId: cid, campaignId, status: { $in: ACTIVE_JOB } }).lean(),
        RawCaptureGenuinenessJob.find({ companyId: cid, campaignId, status: { $in: ACTIVE_JOB } }).lean(),
    ]);
    const enrichIds = enrichDocs.map((e) => e._id);
    const qualDocs = enrichIds.length
        ? await RawCaptureQualification.find({ companyId: cid, campaignId, enrichmentId: { $in: enrichIds } }).lean()
        : [];
    const qualIds = qualDocs.map((q) => q._id);
    const genDocs = qualIds.length
        ? await RawCaptureGenuineness.find({ companyId: cid, campaignId, qualificationId: { $in: qualIds } }).lean()
        : [];

    const jobs = {
        enriching: {
            captureIds: idSet(eJobs.flatMap((j) => j.selectedRawCaptureIds || [])),
            domains: domainSet(eJobs),
            currentDomain: eJobs[0]?.currentDomain || '',
        },
        qualifying: {
            enrichmentIds: idSet(qJobs.flatMap((j) => j.selectedEnrichmentIds || [])),
            domains: domainSet(qJobs),
            currentDomain: qJobs[0]?.currentDomain || '',
        },
        verifying: {
            qualificationIds: idSet(vJobs.flatMap((j) => j.selectedQualificationIds || [])),
            domains: domainSet(vJobs),
            currentDomain: vJobs[0]?.currentDomain || '',
        },
    };

    const enrichByCapture = new Map();
    for (const e of enrichDocs) {
        for (const cidCap of (e.rawCaptureIds || [])) {
            const key = String(cidCap);
            if (!enrichByCapture.has(key)) enrichByCapture.set(key, e);
        }
    }
    const qualByEnrichment = new Map(qualDocs.map((q) => [String(q.enrichmentId), q]));
    const genByQual = new Map(genDocs.map((g) => [String(g.qualificationId), g]));

    let rows = captures.map((cap) => {
        const enrich = enrichByCapture.get(String(cap._id)) || null;
        const qual = enrich ? (qualByEnrichment.get(String(enrich._id)) || null) : null;
        const gen = qual ? (genByQual.get(String(qual._id)) || null) : null;
        return mapLiveActivityRow({ cap, enrich, qual, gen, jobs });
    });

    rows.sort((a, b) => String(b.lastActivity || '').localeCompare(String(a.lastActivity || '')));
    markDuplicateSourceRows(rows);
    const windowRows = rows.slice(0, limit);
    const items = applyLiveFilter(windowRows, filter);
    const headline = buildCurrentHeadline(windowRows, jobs);

    return {
        items,
        headline,
        displayLimit: limit,
        displayed: items.length,
        windowSize: windowRows.length,
        campaignCaptureCount: captureTotal,
        extractionNotCapped: true,
        filter: filter === 'all' || ['processing', 'verified', 'review', 'rejected', 'failed'].includes(filter)
            ? filter
            : 'all',
        note: 'Display window only. RawCapture / processing / campaign size are not limited by this panel.',
        campaignId: String(campaignId),
        sessionId: String(session._id),
    };
}
