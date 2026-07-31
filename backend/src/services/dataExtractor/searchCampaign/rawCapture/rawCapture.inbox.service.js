/**
 * Raw Capture Inbox list/detail/notes/archive (Checkpoint 3).
 */
import mongoose from 'mongoose';
import { RawCapture } from '../../../../models/rawCapture.model.js';
import { RawCaptureBatch } from '../../../../models/rawCaptureBatch.model.js';
import { ApiError } from '../../../../utils/ApiError.js';
import { getOwnedSearchCampaign } from '../searchCampaign.service.js';
import { actorUserId, assertRawArchive, assertRawManage, assertRawView } from './permissions.util.js';
import { validateListQuery, validateNotesBody } from './validation.js';

function requireCompanyId(companyId) {
    if (!companyId || !mongoose.isValidObjectId(companyId)) {
        throw new ApiError(400, 'Company context required');
    }
    return companyId;
}

function requireObjectId(id, label) {
    if (!id || !mongoose.isValidObjectId(id)) {
        throw new ApiError(404, `${label} not found`);
    }
    return id;
}

function escapeRegex(text = '') {
    return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function loadOwnedCapture(companyId, campaignId, rawCaptureId) {
    requireCompanyId(companyId);
    requireObjectId(campaignId, 'Search campaign');
    requireObjectId(rawCaptureId, 'Raw capture');
    const doc = await RawCapture.findOne({ _id: rawCaptureId, companyId, campaignId }).lean();
    if (!doc) throw new ApiError(404, 'Raw capture not found');
    return doc;
}

export async function listRawCaptures({ companyId, user, campaignId, query }) {
    assertRawView(user);
    const cid = requireCompanyId(companyId);
    await getOwnedSearchCampaign({ companyId: cid, user, campaignId, skipPermCheck: true });
    const filters = validateListQuery(query || {});

    const mongo = { companyId: cid, campaignId };
    if (filters.inboxStatus) {
        mongo.inboxStatus = filters.inboxStatus;
    } else if (!filters.includeArchived) {
        mongo.inboxStatus = { $ne: 'archived' };
    }
    if (filters.queryId) {
        if (!mongoose.isValidObjectId(filters.queryId)) throw new ApiError(404, 'Search query not found');
        mongo.queryId = filters.queryId;
    }
    if (filters.source) mongo.source = filters.source;
    if (filters.querySourceHint) mongo.querySourceHint = filters.querySourceHint;
    if (filters.captureMethod) mongo.captureMethod = filters.captureMethod;
    if (filters.resultTypeHint) mongo.resultTypeHint = filters.resultTypeHint;
    if (filters.displayDomain) {
        mongo.displayDomain = new RegExp(`^${escapeRegex(filters.displayDomain)}$`, 'i');
    }
    if (filters.hasUrl === true) mongo.resultUrlNormalized = { $ne: '' };
    if (filters.hasUrl === false) {
        mongo.$or = [
            { resultUrlNormalized: '' },
            { resultUrlNormalized: null },
            { resultUrlNormalized: { $exists: false } },
        ];
    }
    if (filters.batchId) {
        if (!mongoose.isValidObjectId(filters.batchId)) throw new ApiError(404, 'Capture batch not found');
        mongo.captureBatchId = filters.batchId;
    }
    if (filters.searchText) {
        const rx = new RegExp(escapeRegex(filters.searchText), 'i');
        mongo.$or = [
            { title: rx },
            { snippet: rx },
            { resultUrlNormalized: rx },
            { displayDomain: rx },
        ];
    }
    if (filters.firstSeenFrom || filters.firstSeenTo) {
        mongo.firstSeenAt = {};
        if (filters.firstSeenFrom) mongo.firstSeenAt.$gte = filters.firstSeenFrom;
        if (filters.firstSeenTo) mongo.firstSeenAt.$lte = filters.firstSeenTo;
    }
    if (filters.lastSeenFrom || filters.lastSeenTo) {
        mongo.lastSeenAt = {};
        if (filters.lastSeenFrom) mongo.lastSeenAt.$gte = filters.lastSeenFrom;
        if (filters.lastSeenTo) mongo.lastSeenAt.$lte = filters.lastSeenTo;
    }

    const skip = (filters.page - 1) * filters.limit;
    const [items, total] = await Promise.all([
        RawCapture.find(mongo)
            .sort({ [filters.sort]: filters.sortDir })
            .skip(skip)
            .limit(filters.limit)
            .lean(),
        RawCapture.countDocuments(mongo),
    ]);

    return {
        items,
        pagination: {
            page: filters.page,
            limit: filters.limit,
            total,
            totalPages: Math.max(1, Math.ceil(total / filters.limit)),
        },
    };
}

export async function getRawCapture({ companyId, user, campaignId, rawCaptureId }) {
    assertRawView(user);
    await getOwnedSearchCampaign({ companyId, user, campaignId, skipPermCheck: true });
    return loadOwnedCapture(companyId, campaignId, rawCaptureId);
}

export async function updateRawCaptureNotes({ companyId, user, campaignId, rawCaptureId, body }) {
    assertRawManage(user);
    const cid = requireCompanyId(companyId);
    await getOwnedSearchCampaign({ companyId: cid, user, campaignId, skipPermCheck: true });
    await loadOwnedCapture(cid, campaignId, rawCaptureId);
    const { notes } = validateNotesBody(body || {});
    const userId = actorUserId(user);
    const updated = await RawCapture.findOneAndUpdate(
        { _id: rawCaptureId, companyId: cid, campaignId },
        { $set: { notes, updatedBy: userId } },
        { new: true },
    ).lean();
    if (!updated) throw new ApiError(404, 'Raw capture not found');
    return updated;
}

export async function archiveRawCapture({ companyId, user, campaignId, rawCaptureId }) {
    assertRawArchive(user);
    const cid = requireCompanyId(companyId);
    await getOwnedSearchCampaign({ companyId: cid, user, campaignId, skipPermCheck: true });
    const current = await loadOwnedCapture(cid, campaignId, rawCaptureId);
    if (current.inboxStatus === 'archived') return current;
    const userId = actorUserId(user);
    const updated = await RawCapture.findOneAndUpdate(
        { _id: rawCaptureId, companyId: cid, campaignId },
        {
            $set: {
                inboxStatus: 'archived',
                archivedAt: new Date(),
                archivedBy: userId,
                updatedBy: userId,
            },
        },
        { new: true },
    ).lean();
    if (!updated) throw new ApiError(404, 'Raw capture not found');
    return updated;
}

export async function getRawCaptureBatch({ companyId, user, campaignId, batchId }) {
    assertRawView(user);
    const cid = requireCompanyId(companyId);
    await getOwnedSearchCampaign({ companyId: cid, user, campaignId, skipPermCheck: true });
    requireObjectId(batchId, 'Capture batch');
    const batch = await RawCaptureBatch.findOne({ _id: batchId, companyId: cid, campaignId }).lean();
    if (!batch) throw new ApiError(404, 'Capture batch not found');
    return batch;
}
