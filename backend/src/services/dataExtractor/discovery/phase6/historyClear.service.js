/**
 * Admin-only Data Extractor history clear.
 * Soft-deletes identities / discovery jobs. Physically deletes unprotected RawCaptures
 * so a fresh Facebook/Instagram search is not blocked by unique fingerprints.
 * Never writes CRM Lead / Customer / Supplier / sales collections.
 */
import mongoose from 'mongoose';
import { ApiError } from '../../../../utils/ApiError.js';
import { AuditLog } from '../../../../models/auditLog.model.js';
import { RawCapture } from '../../../../models/rawCapture.model.js';
import { RawCaptureEnrichment } from '../../../../models/rawCaptureEnrichment.model.js';
import { RawCaptureGenuineness } from '../../../../models/rawCaptureGenuineness.model.js';
import { ExtractorCompanyIdentity } from '../../../../models/extractorCompanyIdentity.model.js';
import { DiscoveryJob } from '../../../../models/discoveryJob.model.js';
import { ExtractorSearchJob } from '../../../../models/extractorSearchJob.model.js';

export const HISTORY_SCOPES = Object.freeze([
    'facebook_current',
    'facebook_all',
    'instagram',
    'web',
    'linkedin_x',
    'saved_search_runs',
    'processing',
    'contactable_prospects',
    'all_extractor',
]);

const SOURCE_SETS = Object.freeze({
    facebook_current: ['facebook'],
    facebook_all: ['facebook'],
    instagram: ['instagram'],
    web: ['google', 'web', 'indiamart'],
    linkedin_x: ['linkedin', 'x'],
    all_extractor: [
        'facebook', 'instagram', 'google', 'web', 'indiamart', 'linkedin', 'x',
        'baidu', '1688', 'sogou', 'so360', 'manual', 'discovery_agent',
    ],
});

const CRM_SAFE_STATUSES = new Set([
    'Converted to Lead', 'Existing Customer', 'Existing Supplier', 'Existing Lead',
]);
const DELETE_CAP = 8000;

export function assertHistoryClearAdmin(user) {
    const role = String(user?.roleName || user?.role?.name || user?.role || '').trim().toLowerCase();
    if (['superadmin', 'admin', 'system admin', 'systemadmin'].includes(role)) return;
    throw new ApiError(403, 'Only admin can clear Data Extractor history');
}

export function escapeRegex(text = '') {
    return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function isProtectedIdentity(ident = {}) {
    if (ident.promotedExtractedLeadId) return true;
    if (CRM_SAFE_STATUSES.has(String(ident.crmStatus || ''))) return true;
    if (Number(ident.verificationSummary?.verifiedGenuine || 0) > 0) return true;
    if ((ident.sourceRefs || []).some((r) => /verified_genuine|rejected_unusable/i.test(String(r.ownerDecision || ''))
        || /verified_genuine|owner_verified/i.test(String(r.verificationStatus || '')))) return true;
    if (ident.outreach?.doNotContact === true) return true;
    return false;
}

export function identityHasRemainingEvidence(ident = {}) {
    if ((ident.sourceRefs || []).length) return true;
    if (String(ident.primaryPhone || '').trim() || String(ident.primaryEmail || '').trim()) return true;
    const site = String(ident.website || '');
    if (site && !/facebook\.com\/groups\//i.test(site) && !/instagram\.com\/(p|reel)\//i.test(site)) return true;
    const social = ident.social || {};
    if (social.instagramUrl && !/instagram\.com\/(p|reel|explore)\//i.test(social.instagramUrl)) return true;
    if (social.linkedinCompanyUrl || social.xUrl) return true;
    if (social.facebookUrl && !/facebook\.com\/groups\//i.test(social.facebookUrl)) return true;
    return false;
}

export function buildCaptureFilter(companyId, query = {}) {
    const scope = String(query.scope || 'facebook_current');
    if (!HISTORY_SCOPES.includes(scope)) throw new ApiError(400, 'Invalid history scope');
    const mongo = { companyId, inboxStatus: { $ne: 'archived' } };
    const sources = SOURCE_SETS[scope];
    if (sources) mongo.source = sources.length === 1 ? sources[0] : { $in: sources };
    const and = [];
    const kw = String(query.keyword || '').trim();
    const loc = String(query.location || '').trim();
    const useKeyword = Boolean(kw) && (scope === 'facebook_current' || query.matchKeyword === true || query.matchKeyword === 'true');
    const useLocation = Boolean(loc) && (scope === 'facebook_current' || query.matchLocation === true || query.matchLocation === 'true');
    if (useKeyword) {
        const rx = new RegExp(escapeRegex(kw), 'i');
        and.push({
            $or: [
                { notes: new RegExp(`keyword=${escapeRegex(kw)}`, 'i') },
                { title: rx },
                { snippet: rx },
            ],
        });
    }
    if (useLocation) {
        and.push({ notes: new RegExp(`location=${escapeRegex(loc)}`, 'i') });
    }
    if (query.campaignId && mongoose.isValidObjectId(query.campaignId)) {
        mongo.campaignId = query.campaignId;
    }
    if (query.from || query.to) {
        mongo.lastSeenAt = {};
        if (query.from) mongo.lastSeenAt.$gte = new Date(query.from);
        if (query.to) mongo.lastSeenAt.$lte = new Date(query.to);
    }
    if (and.length) mongo.$and = and;
    return { scope, mongo, sources: sources || [] };
}

function touchesCaptures(scope) {
    return Boolean(SOURCE_SETS[scope]);
}

function touchesJobs(scope) {
    return ['saved_search_runs', 'processing', 'all_extractor'].includes(scope);
}

async function loadProtectedCaptureIdSet(companyId, captures) {
    const protectedIds = new Set();
    for (const cap of captures) {
        if (cap.promotedExtractedLeadId) protectedIds.add(String(cap._id));
    }
    const genuineness = await RawCaptureGenuineness.find({
        companyId,
        $or: [
            { ownerDecision: { $in: ['verified_genuine', 'rejected_unusable'] } },
            { ownerReviewStatus: { $in: ['approved', 'rejected'] } },
        ],
    }).select('enrichmentId').limit(2000).lean();
    const enrIds = genuineness.map((g) => g.enrichmentId).filter(Boolean);
    if (enrIds.length) {
        const enrs = await RawCaptureEnrichment.find({ _id: { $in: enrIds } }).select('rawCaptureIds').lean();
        const captureSet = new Set(captures.map((c) => String(c._id)));
        for (const enr of enrs) {
            for (const id of enr.rawCaptureIds || []) {
                if (captureSet.has(String(id))) protectedIds.add(String(id));
            }
        }
    }
    const idents = await ExtractorCompanyIdentity.find({
        companyId,
        isDeleted: { $ne: true },
        $or: [
            { promotedExtractedLeadId: { $ne: null } },
            { 'verificationSummary.verifiedGenuine': { $gt: 0 } },
        ],
    }).select('sourceRefs promotedExtractedLeadId verificationSummary crmStatus').lean();
    const urlSet = new Set(captures.map((c) => c.resultUrlNormalized).filter(Boolean));
    for (const ident of idents) {
        if (!isProtectedIdentity(ident)) continue;
        for (const ref of ident.sourceRefs || []) {
            if (ref.rawCaptureId) protectedIds.add(String(ref.rawCaptureId));
            if (ref.sourceUrl && urlSet.has(ref.sourceUrl)) {
                const hit = captures.find((c) => c.resultUrlNormalized === ref.sourceUrl);
                if (hit) protectedIds.add(String(hit._id));
            }
        }
    }
    return protectedIds;
}

export async function previewHistoryClear(companyId, query = {}) {
    const { scope, mongo } = buildCaptureFilter(companyId, query);
    const captures = touchesCaptures(scope)
        ? await RawCapture.find(mongo).select('_id source title notes resultUrlNormalized promotedExtractedLeadId lastSeenAt').limit(DELETE_CAP).lean()
        : [];
    const protectedCaptureIds = await loadProtectedCaptureIdSet(companyId, captures);
    const keepProtected = query.includeProtected !== true && query.includeProtected !== 'true';
    const deletable = captures.filter((c) => !(keepProtected && protectedCaptureIds.has(String(c._id))));
    const protectedCaptures = captures.filter((c) => protectedCaptureIds.has(String(c._id)));

    const bySource = { facebook: 0, instagram: 0, web: 0, linkedin: 0, x: 0, other: 0 };
    for (const c of deletable) {
        if (c.source === 'facebook') bySource.facebook += 1;
        else if (c.source === 'instagram') bySource.instagram += 1;
        else if (c.source === 'google' || c.source === 'web' || c.source === 'indiamart') bySource.web += 1;
        else if (c.source === 'linkedin') bySource.linkedin += 1;
        else if (c.source === 'x') bySource.x += 1;
        else bySource.other += 1;
    }

    const jobFilter = { companyId, isDeleted: { $ne: true } };
    if (query.keyword) jobFilter.keyword = new RegExp(escapeRegex(query.keyword), 'i');
    if (query.location) {
        jobFilter.$or = [
            { city: new RegExp(escapeRegex(query.location), 'i') },
            { keyword: new RegExp(escapeRegex(query.location), 'i') },
        ];
    }
    const discoveryCount = touchesJobs(scope) || scope === 'all_extractor' || scope === 'saved_search_runs'
        ? await DiscoveryJob.countDocuments(jobFilter)
        : 0;
    const processingCount = touchesJobs(scope) || scope === 'processing' || scope === 'all_extractor'
        ? await ExtractorSearchJob.countDocuments({ companyId, 'metadata.historyClearedAt': { $exists: false } })
        : 0;
    const savedCount = 0;

    const captureIds = deletable.map((c) => String(c._id));
    const urls = deletable.map((c) => c.resultUrlNormalized).filter(Boolean);
    const identityQ = { companyId, isDeleted: { $ne: true }, mergedIntoId: null };
    if (captureIds.length || urls.length) {
        identityQ.$or = [
            ...(captureIds.length ? [{ 'sourceRefs.rawCaptureId': { $in: captureIds } }] : []),
            ...(urls.length ? [{ 'sourceRefs.sourceUrl': { $in: urls } }] : []),
        ];
    }
    const identities = ((scope === 'contactable_prospects' || (touchesCaptures(scope) && (captureIds.length || urls.length))))
        ? await ExtractorCompanyIdentity.find(identityQ).limit(DELETE_CAP).lean()
        : [];
    const protectedIdentities = identities.filter(isProtectedIdentity);
    const identitiesAffected = identities.filter((i) => keepProtected ? !isProtectedIdentity(i) : true);

    return {
        scope,
        keepProtected,
        counts: {
            facebookRawCaptures: bySource.facebook,
            instagramRecords: bySource.instagram,
            webRecords: bySource.web,
            linkedinRecords: bySource.linkedin,
            xRecords: bySource.x,
            otherRecords: bySource.other,
            rawCapturesToClear: deletable.length,
            discoveryJobs: discoveryCount,
            processingJobs: processingCount,
            savedSearchesAffected: savedCount,
            companyIdentitiesAffected: identitiesAffected.length,
            protectedVerifiedConverted: protectedCaptures.length + protectedIdentities.length,
            protectedVerified: protectedIdentities.filter((i) => Number(i.verificationSummary?.verifiedGenuine || 0) > 0).length
                + protectedCaptures.filter((c) => !c.promotedExtractedLeadId).length,
            convertedSkipped: identities.filter((i) => i.promotedExtractedLeadId || i.crmStatus === 'Converted to Lead').length
                + protectedCaptures.filter((c) => c.promotedExtractedLeadId).length,
            facebookCommunityRecords: bySource.facebook,
        },
        samples: deletable.slice(0, 8).map((c) => ({ source: c.source, title: c.title })),
        protectedNote: keepProtected
            ? 'Verified Genuine, Rejected, and converted-to-Lead records will be kept.'
            : 'Protected records will also be cleared because includeProtected was selected.',
        crmNote: 'CRM Leads, Customers, Suppliers, Sales, Purchases, Accounts, GST, Tasks, and WhatsApp are never deleted.',
    };
}

async function listRetainedRows(companyId, query, keepProtected) {
    if (!keepProtected) return [];
    const { scope, mongo } = buildCaptureFilter(companyId, query);
    if (!touchesCaptures(scope)) return [];
    const leftover = await RawCapture.find(mongo).select('title resultUrlNormalized promotedExtractedLeadId').limit(40).lean();
    const urls = leftover.map((c) => c.resultUrlNormalized).filter(Boolean);
    const idents = urls.length
        ? await ExtractorCompanyIdentity.find({
            companyId,
            isDeleted: { $ne: true },
            $or: [
                { 'sourceRefs.sourceUrl': { $in: urls } },
                { 'social.facebookUrl': { $in: urls } },
            ],
        }).select('canonicalName platforms website promotedExtractedLeadId crmStatus verificationSummary sourceRefs social').lean()
        : [];
    return leftover.map((cap) => {
        const ident = idents.find((i) => (i.sourceRefs || []).some((r) => r.sourceUrl === cap.resultUrlNormalized)
            || i.social?.facebookUrl === cap.resultUrlNormalized);
        let reason = 'Retained — verified/protected';
        if (cap.promotedExtractedLeadId || ident?.promotedExtractedLeadId || ident?.crmStatus === 'Converted to Lead') {
            reason = 'Retained — converted Lead';
        } else if ((ident?.platforms || []).some((p) => ['web', 'google', 'indiamart'].includes(p)) || ident?.website) {
            reason = 'Retained — also supported by Google';
        }
        return { title: cap.title || ident?.canonicalName || '', reason };
    });
}

export async function executeHistoryClear(companyId, user, body = {}) {
    assertHistoryClearAdmin(user);
    if (body.confirm !== true) throw new ApiError(400, 'Confirmation required');
    if (String(body.confirmText || '').trim().toUpperCase() !== 'CLEAR') {
        throw new ApiError(400, 'Type CLEAR to confirm');
    }
    const scope = String(body.scope || 'facebook_current');
    if (scope === 'all_extractor' && body.confirmAll !== true) {
        throw new ApiError(400, 'Clear All Extractor History requires a second confirmation');
    }
    if (body.includeProtected === true && body.confirmProtected !== true) {
        throw new ApiError(400, 'Clearing protected records requires an extra confirmation');
    }
    const preview = await previewHistoryClear(companyId, body);
    const { mongo } = buildCaptureFilter(companyId, body);
    const keepProtected = body.includeProtected !== true;
    const userId = user?._id || user?.id || null;
    const now = new Date();

    let rawDeleted = 0;
    let identitiesArchived = 0;
    let discoveryArchived = 0;
    let processingArchived = 0;
    const deletedIds = [];
    const deletedUrls = [];

    if (touchesCaptures(scope)) {
        const captures = await RawCapture.find(mongo).limit(DELETE_CAP).lean();
        const protectedIds = keepProtected ? await loadProtectedCaptureIdSet(companyId, captures) : new Set();
        const toDelete = captures.filter((c) => !protectedIds.has(String(c._id)));
        deletedIds.push(...toDelete.map((c) => String(c._id)));
        deletedUrls.push(...toDelete.map((c) => c.resultUrlNormalized).filter(Boolean));
        if (toDelete.length) {
            const res = await RawCapture.deleteMany({ companyId, _id: { $in: toDelete.map((c) => c._id) } });
            rawDeleted = res.deletedCount || 0;
        }
    }

    if (deletedIds.length || deletedUrls.length || scope === 'contactable_prospects' || scope === 'all_extractor') {
        const identFilter = { companyId, isDeleted: { $ne: true } };
        if (deletedIds.length || deletedUrls.length) {
            identFilter.$or = [
                ...(deletedIds.length ? [{ 'sourceRefs.rawCaptureId': { $in: deletedIds } }] : []),
                ...(deletedUrls.length ? [{ 'sourceRefs.sourceUrl': { $in: deletedUrls } }] : []),
            ];
        }
        const idents = await ExtractorCompanyIdentity.find(identFilter).limit(DELETE_CAP);
        for (const ident of idents) {
            if (keepProtected && isProtectedIdentity(ident.toObject ? ident.toObject() : ident)) continue;
            ident.sourceRefs = (ident.sourceRefs || []).filter((r) => {
                if (deletedIds.includes(String(r.rawCaptureId || ''))) return false;
                if (r.sourceUrl && deletedUrls.includes(r.sourceUrl)) return false;
                return true;
            });
            ident.mergeHistory = [...(ident.mergeHistory || []), {
                action: 'history_cleared',
                at: now.toISOString(),
                by: String(userId || ''),
                scope,
            }].slice(-50);
            if (!identityHasRemainingEvidence(ident) && !(keepProtected && isProtectedIdentity(ident))) {
                ident.isDeleted = true;
                identitiesArchived += 1;
            }
            ident.updatedBy = userId;
            await ident.save();
        }
    }

    if (touchesJobs(scope) || scope === 'saved_search_runs' || scope === 'all_extractor') {
        const jobFilter = { companyId, isDeleted: { $ne: true } };
        if (body.keyword && scope !== 'all_extractor') jobFilter.keyword = new RegExp(escapeRegex(body.keyword), 'i');
        const jobs = await DiscoveryJob.updateMany(jobFilter, { $set: { isDeleted: true } });
        discoveryArchived = jobs.modifiedCount || 0;
    }
    if (scope === 'processing' || scope === 'all_extractor') {
        const jobs = await ExtractorSearchJob.updateMany(
            { companyId, 'metadata.historyClearedAt': { $exists: false } },
            { $set: { 'metadata.historyClearedAt': now } },
        );
        processingArchived = jobs.modifiedCount || 0;
    }

    const result = {
        ...preview,
        executed: true,
        rawCapturesDeleted: rawDeleted,
        identitiesArchived,
        discoveryJobsArchived: discoveryArchived,
        processingJobsArchived: processingArchived,
        reason: String(body.reason || '').slice(0, 300),
        at: now.toISOString(),
        by: String(userId || ''),
        retained: await listRetainedRows(companyId, body, keepProtected),
    };
    try {
        await AuditLog.create({
            user: userId,
            action: 'DELETE',
            module: 'data_extractor',
            description: 'extractor history clear',
            details: {
                scope,
                keyword: body.keyword || '',
                location: body.location || '',
                rawCapturesDeleted: rawDeleted,
                identitiesArchived,
                discoveryJobsArchived: discoveryArchived,
                processingJobsArchived: processingArchived,
                keepProtected,
                reason: result.reason,
            },
        });
    } catch {
        /* audit must not block */
    }
    return result;
}
