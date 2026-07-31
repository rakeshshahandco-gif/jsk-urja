/**
 * SearchQuery CRUD + lifecycle (Checkpoint 2).
 * No RawCapture, browser automation, or hard delete.
 */
import crypto from 'crypto';
import mongoose from 'mongoose';
import { SearchQuery } from '../../../../models/searchQuery.model.js';
import { ApiError } from '../../../../utils/ApiError.js';
import {
    CAMPAIGN_ELIGIBLE_FOR_GENERATE,
    CAMPAIGN_READONLY_STATUSES,
    SEARCH_QUERY_EDITABLE_STATUSES,
    SEARCH_QUERY_MEANING_FIELDS,
    SEARCH_QUERY_STATUS_TRANSITIONS,
} from './constants.js';
import {
    buildSearchUrl,
    normalizeQueryKey,
    queryTokenSignature,
} from './normalize.util.js';
import {
    actorUserId,
    assertQueryGenerate,
    assertQueryManage,
    assertQueryOpen,
    assertQueryReview,
    assertQueryView,
} from './permissions.util.js';
import { generateQueryCandidates, isNearDuplicateText } from './queryGenerator.service.js';
import {
    validateBulkBody,
    validateGenerationOptions,
    validateListQuery,
    validateManualCreateBody,
    validateRejectBody,
    validateUpdateBody,
} from './validation.js';
import { getOwnedSearchCampaign } from '../searchCampaign.service.js';

function requireCompanyId(companyId) {
    if (!companyId || !mongoose.isValidObjectId(companyId)) {
        throw new ApiError(400, 'Company context required');
    }
    return companyId;
}

function requireObjectId(id, label = 'Resource') {
    if (!id || !mongoose.isValidObjectId(id)) {
        throw new ApiError(404, `${label} not found`);
    }
    return id;
}

function escapeRegex(text = '') {
    return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function assertTransition(fromStatus, toStatus) {
    const allowed = SEARCH_QUERY_STATUS_TRANSITIONS[fromStatus] || [];
    if (!allowed.includes(toStatus)) {
        throw new ApiError(400, `Invalid status transition: ${fromStatus} -> ${toStatus}`);
    }
}

async function loadOwnedQuery(companyId, campaignId, queryId) {
    requireCompanyId(companyId);
    requireObjectId(campaignId, 'Search campaign');
    requireObjectId(queryId, 'Search query');
    const doc = await SearchQuery.findOne({ _id: queryId, companyId, campaignId }).lean();
    if (!doc) throw new ApiError(404, 'Search query not found');
    return doc;
}

async function loadEligibleCampaign(companyId, campaignId, user, { forGenerate = false, explicitPaused = false } = {}) {
    const campaign = await getOwnedSearchCampaign({ companyId, user, campaignId, skipPermCheck: true });
    if (CAMPAIGN_READONLY_STATUSES.includes(campaign.status)) {
        throw new ApiError(400, `Campaign is ${campaign.status} and read-only for queries`);
    }
    if (forGenerate) {
        if (!CAMPAIGN_ELIGIBLE_FOR_GENERATE.includes(campaign.status)) {
            throw new ApiError(400, `Cannot generate queries for campaign status: ${campaign.status}`);
        }
        if (campaign.status === 'paused' && !explicitPaused) {
            throw new ApiError(400, 'Paused campaign requires explicitGenerateWhilePaused=true to generate');
        }
    }
    return campaign;
}

function newGenerationGroupId() {
    return `gq_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
}

async function existingNormalizedSet(companyId, campaignId) {
    const rows = await SearchQuery.find(
        { companyId, campaignId, status: { $ne: 'archived' } },
        { queryNormalized: 1, queryText: 1 },
    ).lean();
    const exact = new Set(rows.map((r) => r.queryNormalized));
    const near = new Set(rows.map((r) => queryTokenSignature(r.queryText)));
    return { exact, near };
}

async function insertGeneratedDocs({
    companyId,
    campaignId,
    userId,
    candidates,
    generationMethod,
    generationGroupId,
    parentQueryId = null,
    regenerationReason = '',
    existingExact,
    existingNear,
}) {
    let exactDuplicatesSkipped = 0;
    let nearDuplicatesSkipped = 0;
    let inserted = 0;
    const created = [];

    let seq = 0;
    for (const c of candidates) {
        seq += 1;
        if (existingExact.has(c.queryNormalized)) {
            exactDuplicatesSkipped += 1;
            continue;
        }
        if (existingNear.has(c.tokenSignature || queryTokenSignature(c.queryText))) {
            nearDuplicatesSkipped += 1;
            continue;
        }

        const doc = {
            companyId,
            campaignId,
            queryText: c.queryText,
            queryNormalized: c.queryNormalized,
            sourceHint: c.sourceHint,
            queryType: c.queryType,
            status: 'generated',
            generationMethod,
            generationGroupId,
            generationSequence: seq,
            parentQueryId: parentQueryId || null,
            regenerationReason: regenerationReason || '',
            generatedFrom: c.generatedFrom || {},
            selectedCriteria: c.selectedCriteria || {},
            searchUrl: buildSearchUrl(c.sourceHint, c.queryText),
            priorityScore: c.priorityScore ?? 50,
            openedCount: 0,
            captureCount: 0,
            resultCount: 0,
            notes: '',
            createdBy: userId,
            updatedBy: userId,
        };

        try {
            const saved = await SearchQuery.create(doc);
            existingExact.add(c.queryNormalized);
            existingNear.add(c.tokenSignature || queryTokenSignature(c.queryText));
            inserted += 1;
            created.push(saved.toObject());
        } catch (err) {
            if (err && (err.code === 11000 || String(err.message || '').includes('E11000'))) {
                exactDuplicatesSkipped += 1;
                existingExact.add(c.queryNormalized);
                continue;
            }
            throw err;
        }
    }

    return { created, inserted, exactDuplicatesSkipped, nearDuplicatesSkipped };
}

export async function generateSearchQueries({ companyId, user, campaignId, body }) {
    assertQueryGenerate(user);
    const cid = requireCompanyId(companyId);
    const options = validateGenerationOptions(body || {});
    const campaign = await loadEligibleCampaign(cid, campaignId, user, {
        forGenerate: true,
        explicitPaused: options.explicitGenerateWhilePaused,
    });
    const userId = actorUserId(user);
    const generationGroupId = newGenerationGroupId();

    const { items, stats } = generateQueryCandidates(campaign, options);
    const existing = await existingNormalizedSet(cid, campaignId);
    const insertResult = await insertGeneratedDocs({
        companyId: cid,
        campaignId,
        userId,
        candidates: items,
        generationMethod: 'automatic',
        generationGroupId,
        existingExact: existing.exact,
        existingNear: existing.near,
    });

    return {
        queries: insertResult.created,
        stats: {
            requested: stats.requested,
            generated: stats.generated,
            inserted: insertResult.inserted,
            exactDuplicatesSkipped: stats.exactDuplicatesSkipped + insertResult.exactDuplicatesSkipped,
            nearDuplicatesSkipped: stats.nearDuplicatesSkipped + insertResult.nearDuplicatesSkipped,
            rejectedAsLowQuality: stats.rejectedAsLowQuality,
            generationGroupId,
            sourcesUsed: stats.sourcesUsed,
            locationUsed: stats.locationUsed,
        },
    };
}

export async function regenerateSearchQueries({ companyId, user, campaignId, body }) {
    assertQueryGenerate(user);
    const cid = requireCompanyId(companyId);
    const options = validateGenerationOptions(body || {}, { allowRegenExtras: true });
    const campaign = await loadEligibleCampaign(cid, campaignId, user, {
        forGenerate: true,
        explicitPaused: options.explicitGenerateWhilePaused,
    });
    const userId = actorUserId(user);
    const generationGroupId = newGenerationGroupId();

    let parentQueryId = null;
    if (options.parentQueryId) {
        const parent = await loadOwnedQuery(cid, campaignId, options.parentQueryId);
        parentQueryId = parent._id;
    }

    const { items, stats } = generateQueryCandidates(campaign, options);
    // Prefer slightly different templates on regenerate by keeping candidates but DB dedupe handles overlap
    const existing = await existingNormalizedSet(cid, campaignId);
    const insertResult = await insertGeneratedDocs({
        companyId: cid,
        campaignId,
        userId,
        candidates: items.map((c) => ({ ...c, queryType: c.queryType === 'manual' ? 'regenerated' : c.queryType })),
        generationMethod: 'regenerated',
        generationGroupId,
        parentQueryId,
        regenerationReason: options.regenerationReason || '',
        existingExact: existing.exact,
        existingNear: existing.near,
    });

    return {
        queries: insertResult.created,
        stats: {
            requested: stats.requested,
            generated: stats.generated,
            inserted: insertResult.inserted,
            exactDuplicatesSkipped: stats.exactDuplicatesSkipped + insertResult.exactDuplicatesSkipped,
            nearDuplicatesSkipped: stats.nearDuplicatesSkipped + insertResult.nearDuplicatesSkipped,
            rejectedAsLowQuality: stats.rejectedAsLowQuality,
            generationGroupId,
            parentQueryId,
            regenerationReason: options.regenerationReason || '',
        },
    };
}

export async function createManualSearchQuery({ companyId, user, campaignId, body }) {
    assertQueryManage(user);
    const cid = requireCompanyId(companyId);
    await loadEligibleCampaign(cid, campaignId, user, { forGenerate: false });
    const payload = validateManualCreateBody(body || {});
    const userId = actorUserId(user);
    const queryNormalized = normalizeQueryKey(payload.queryText);

    const existing = await SearchQuery.findOne({
        companyId: cid,
        campaignId,
        queryNormalized,
        status: { $ne: 'archived' },
    }).lean();
    if (existing) {
        throw new ApiError(409, 'Duplicate query already exists for this campaign');
    }

    // Near-duplicate check
    const siblings = await SearchQuery.find(
        { companyId: cid, campaignId, status: { $ne: 'archived' } },
        { queryText: 1 },
    ).lean();
    for (const s of siblings) {
        if (isNearDuplicateText(payload.queryText, s.queryText)) {
            throw new ApiError(409, 'Near-duplicate query already exists for this campaign');
        }
    }

    try {
        const doc = await SearchQuery.create({
            companyId: cid,
            campaignId,
            queryText: payload.queryText,
            queryNormalized,
            sourceHint: payload.sourceHint,
            queryType: payload.queryType || 'manual',
            status: 'draft',
            generationMethod: 'manual',
            generationGroupId: '',
            generationSequence: 0,
            searchUrl: buildSearchUrl(payload.sourceHint, payload.queryText),
            notes: payload.notes || '',
            priorityScore: 50,
            createdBy: userId,
            updatedBy: userId,
        });
        return doc.toObject();
    } catch (err) {
        if (err && err.code === 11000) {
            throw new ApiError(409, 'Duplicate query already exists for this campaign');
        }
        throw err;
    }
}

/**
 * Checkpoint 5B — create-or-reuse + approve a server-generated Simple Lead Search query.
 * Requires generate (create path) + review (via approveSearchQuery). Does NOT require manage.
 * Reuses validateManualCreateBody, normalizeQueryKey, exact/near-dup handling, and audit fields.
 * Does not weaken createManualSearchQuery (still manage-gated).
 */
export async function ensureSimpleLeadSearchQuery({
    companyId,
    user,
    campaignId,
    queryText,
    priorityScore = 50,
    selectedCriteria = null,
    queryLanguage = '',
}) {
    assertQueryGenerate(user);
    const cid = requireCompanyId(companyId);
    await loadEligibleCampaign(cid, campaignId, user, { forGenerate: false });

    const payload = validateManualCreateBody({
        queryText,
        sourceHint: 'google',
        queryType: 'manual',
    });
    const userId = actorUserId(user);
    const queryNormalized = normalizeQueryKey(payload.queryText);
    if (!queryNormalized) {
        throw new ApiError(
            400,
            'Generated query text could not be saved. Unicode product text must be preserved — please retry.',
        );
    }
    const score = Number.isFinite(Number(priorityScore)) ? Number(priorityScore) : 50;
    const criteriaPatch = selectedCriteria && typeof selectedCriteria === 'object'
        ? { selectedCriteria }
        : {};
    if (queryLanguage) {
        criteriaPatch.selectedCriteria = {
            ...(criteriaPatch.selectedCriteria || {}),
            queryLanguage: String(queryLanguage).slice(0, 12),
        };
    }

    async function reuseAndMaybeApprove(existing) {
        if (Object.keys(criteriaPatch).length) {
            await SearchQuery.updateOne(
                { _id: existing._id, companyId: cid, campaignId },
                { $set: { ...criteriaPatch, updatedBy: userId } },
            );
        }
        if (existing.status === 'draft' || existing.status === 'generated') {
            return approveSearchQuery({
                companyId: cid,
                user,
                campaignId,
                queryId: existing._id,
            });
        }
        if (existing.status === 'rejected') {
            return existing;
        }
        if (Number(existing.priorityScore) !== score) {
            const updated = await SearchQuery.findOneAndUpdate(
                { _id: existing._id, companyId: cid, campaignId },
                { $set: { priorityScore: score, updatedBy: userId, ...criteriaPatch } },
                { new: true },
            ).lean();
            return updated || existing;
        }
        if (Object.keys(criteriaPatch).length) {
            const updated = await SearchQuery.findOne({ _id: existing._id, companyId: cid }).lean();
            return updated || existing;
        }
        return existing;
    }

    const exact = await SearchQuery.findOne({
        companyId: cid,
        campaignId,
        queryNormalized,
        status: { $ne: 'archived' },
    }).lean();
    if (exact) {
        return reuseAndMaybeApprove(exact);
    }

    // Near-duplicate: safely reuse rather than fail the SLS workflow
    const siblings = await SearchQuery.find(
        { companyId: cid, campaignId, status: { $ne: 'archived' } },
        { queryText: 1, status: 1, priorityScore: 1, _id: 1 },
    ).lean();
    for (const s of siblings) {
        if (isNearDuplicateText(payload.queryText, s.queryText)) {
            return reuseAndMaybeApprove(s);
        }
    }

    let created;
    try {
        const doc = await SearchQuery.create({
            companyId: cid,
            campaignId,
            queryText: payload.queryText,
            queryNormalized,
            sourceHint: payload.sourceHint,
            queryType: payload.queryType || 'manual',
            status: 'draft',
            generationMethod: 'manual',
            generationGroupId: '',
            generationSequence: 0,
            searchUrl: buildSearchUrl(payload.sourceHint, payload.queryText),
            notes: '',
            priorityScore: score,
            slsCaptureStatus: 'pending',
            selectedCriteria: criteriaPatch.selectedCriteria || {},
            createdBy: userId,
            updatedBy: userId,
        });
        created = doc.toObject();
    } catch (err) {
        if (err && err.code === 11000) {
            const raced = await SearchQuery.findOne({
                companyId: cid,
                campaignId,
                queryNormalized,
                status: { $ne: 'archived' },
            }).lean();
            if (raced) return reuseAndMaybeApprove(raced);
            throw new ApiError(409, 'Duplicate query already exists for this campaign');
        }
        throw err;
    }

    return approveSearchQuery({
        companyId: cid,
        user,
        campaignId,
        queryId: created._id,
    });
}

export async function listSearchQueries({ companyId, user, campaignId, query }) {
    assertQueryView(user);
    const cid = requireCompanyId(companyId);
    await getOwnedSearchCampaign({ companyId: cid, user, campaignId, skipPermCheck: true });
    const filters = validateListQuery(query || {});

    const mongo = { companyId: cid, campaignId };
    if (filters.status) {
        mongo.status = filters.status;
    } else if (filters.approvedOnly) {
        mongo.status = { $in: ['approved', 'opened'] };
    } else if (!filters.includeArchived) {
        mongo.status = { $ne: 'archived' };
    }
    if (filters.sourceHint) mongo.sourceHint = filters.sourceHint;
    if (filters.queryType) mongo.queryType = filters.queryType;
    if (filters.generationMethod) mongo.generationMethod = filters.generationMethod;
    if (filters.generationGroupId) mongo.generationGroupId = filters.generationGroupId;
    if (filters.searchText) {
        mongo.queryText = new RegExp(escapeRegex(filters.searchText), 'i');
    }
    if (filters.createdFrom || filters.createdTo) {
        mongo.createdAt = {};
        if (filters.createdFrom) mongo.createdAt.$gte = filters.createdFrom;
        if (filters.createdTo) mongo.createdAt.$lte = filters.createdTo;
    }
    if (filters.updatedFrom || filters.updatedTo) {
        mongo.updatedAt = {};
        if (filters.updatedFrom) mongo.updatedAt.$gte = filters.updatedFrom;
        if (filters.updatedTo) mongo.updatedAt.$lte = filters.updatedTo;
    }

    const skip = (filters.page - 1) * filters.limit;
    const [items, total] = await Promise.all([
        SearchQuery.find(mongo)
            .sort({ [filters.sort]: filters.sortDir })
            .skip(skip)
            .limit(filters.limit)
            .lean(),
        SearchQuery.countDocuments(mongo),
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

export async function getSearchQuery({ companyId, user, campaignId, queryId }) {
    assertQueryView(user);
    await getOwnedSearchCampaign({ companyId, user, campaignId, skipPermCheck: true });
    return loadOwnedQuery(companyId, campaignId, queryId);
}

export async function updateSearchQuery({ companyId, user, campaignId, queryId, body }) {
    assertQueryManage(user);
    const cid = requireCompanyId(companyId);
    await loadEligibleCampaign(cid, campaignId, user, { forGenerate: false });
    const current = await loadOwnedQuery(cid, campaignId, queryId);
    const payload = validateUpdateBody(body || {});
    const userId = actorUserId(user);

    const meaningChange = SEARCH_QUERY_MEANING_FIELDS.some(
        (field) => Object.prototype.hasOwnProperty.call(payload, field),
    );
    const notesOnly = Object.prototype.hasOwnProperty.call(payload, 'notes') && !meaningChange;

    // Preferred: do not mutate approved/opened search meaning — create derived draft
    if (!SEARCH_QUERY_EDITABLE_STATUSES.includes(current.status)) {
        if (current.status === 'archived') {
            throw new ApiError(400, 'Archived queries cannot be edited');
        }
        // Metadata-only (notes) allowed in-place on approved/opened without derivation
        if (notesOnly && (current.status === 'approved' || current.status === 'opened' || current.status === 'captured')) {
            const updated = await SearchQuery.findOneAndUpdate(
                { _id: queryId, companyId: cid, campaignId },
                { $set: { notes: payload.notes, updatedBy: userId } },
                { new: true },
            ).lean();
            if (!updated) throw new ApiError(404, 'Search query not found');
            return { query: updated, derived: false };
        }
        if (meaningChange && (current.status === 'approved' || current.status === 'opened')) {
            const queryText = payload.queryText != null ? payload.queryText : current.queryText;
            const sourceHint = payload.sourceHint != null ? payload.sourceHint : current.sourceHint;
            const queryType = payload.queryType != null ? payload.queryType : 'regenerated';
            const queryNormalized = normalizeQueryKey(queryText);
            // Same normalized text+source cannot create a second active row; queryType-only → in-place.
            if (
                queryNormalized === current.queryNormalized
                && sourceHint === current.sourceHint
                && Object.prototype.hasOwnProperty.call(payload, 'queryType')
            ) {
                const $set = { queryType: payload.queryType, updatedBy: userId };
                if (payload.notes != null) $set.notes = payload.notes;
                const updated = await SearchQuery.findOneAndUpdate(
                    { _id: queryId, companyId: cid, campaignId },
                    { $set },
                    { new: true },
                ).lean();
                if (!updated) throw new ApiError(404, 'Search query not found');
                return { query: updated, derived: false };
            }
            const dup = await SearchQuery.findOne({
                companyId: cid,
                campaignId,
                queryNormalized,
                status: { $ne: 'archived' },
            }).lean();
            if (dup) {
                throw new ApiError(409, 'Derived query would duplicate an existing query');
            }
            const derived = await SearchQuery.create({
                companyId: cid,
                campaignId,
                queryText,
                queryNormalized,
                sourceHint,
                queryType,
                status: 'draft',
                generationMethod: 'manual',
                parentQueryId: current._id,
                regenerationReason: 'Derived from approved/opened query edit',
                searchUrl: buildSearchUrl(sourceHint, queryText),
                notes: payload.notes != null ? payload.notes : current.notes,
                priorityScore: current.priorityScore,
                createdBy: userId,
                updatedBy: userId,
            });
            return { query: derived.toObject(), derived: true };
        }
        throw new ApiError(400, `Cannot edit query in status: ${current.status}`);
    }

    const $set = { updatedBy: userId };
    if (payload.notes != null) $set.notes = payload.notes;
    if (payload.queryType != null) $set.queryType = payload.queryType;
    if (payload.sourceHint != null) {
        $set.sourceHint = payload.sourceHint;
        $set.searchUrl = buildSearchUrl(payload.sourceHint, payload.queryText || current.queryText);
    }
    if (payload.queryText != null) {
        $set.queryText = payload.queryText;
        $set.queryNormalized = normalizeQueryKey(payload.queryText);
        $set.searchUrl = buildSearchUrl(payload.sourceHint || current.sourceHint, payload.queryText);
        const dup = await SearchQuery.findOne({
            companyId: cid,
            campaignId,
            queryNormalized: $set.queryNormalized,
            status: { $ne: 'archived' },
            _id: { $ne: current._id },
        }).lean();
        if (dup) throw new ApiError(409, 'Duplicate query already exists for this campaign');
    }

    try {
        const updated = await SearchQuery.findOneAndUpdate(
            { _id: queryId, companyId: cid, campaignId },
            { $set },
            { new: true },
        ).lean();
        if (!updated) throw new ApiError(404, 'Search query not found');
        return { query: updated, derived: false };
    } catch (err) {
        if (err && err.code === 11000) throw new ApiError(409, 'Duplicate query already exists for this campaign');
        throw err;
    }
}

export async function approveSearchQuery({ companyId, user, campaignId, queryId }) {
    assertQueryReview(user);
    const cid = requireCompanyId(companyId);
    await getOwnedSearchCampaign({ companyId: cid, user, campaignId, skipPermCheck: true });
    const current = await loadOwnedQuery(cid, campaignId, queryId);
    assertTransition(current.status, 'approved');
    const userId = actorUserId(user);
    const updated = await SearchQuery.findOneAndUpdate(
        { _id: queryId, companyId: cid, campaignId },
        {
            $set: {
                status: 'approved',
                approvedAt: new Date(),
                approvedBy: userId,
                rejectedAt: null,
                rejectedBy: null,
                rejectionReason: '',
                updatedBy: userId,
            },
        },
        { new: true },
    ).lean();
    if (!updated) throw new ApiError(404, 'Search query not found');
    return updated;
}

export async function rejectSearchQuery({ companyId, user, campaignId, queryId, body }) {
    assertQueryReview(user);
    const cid = requireCompanyId(companyId);
    await getOwnedSearchCampaign({ companyId: cid, user, campaignId, skipPermCheck: true });
    const current = await loadOwnedQuery(cid, campaignId, queryId);
    assertTransition(current.status, 'rejected');
    const { rejectionReason } = validateRejectBody(body || {});
    const userId = actorUserId(user);
    const updated = await SearchQuery.findOneAndUpdate(
        { _id: queryId, companyId: cid, campaignId },
        {
            $set: {
                status: 'rejected',
                rejectedAt: new Date(),
                rejectedBy: userId,
                rejectionReason: rejectionReason || '',
                updatedBy: userId,
            },
        },
        { new: true },
    ).lean();
    if (!updated) throw new ApiError(404, 'Search query not found');
    return updated;
}

export async function openSearchQuery({ companyId, user, campaignId, queryId }) {
    assertQueryOpen(user);
    const cid = requireCompanyId(companyId);
    await getOwnedSearchCampaign({ companyId: cid, user, campaignId, skipPermCheck: true });
    const current = await loadOwnedQuery(cid, campaignId, queryId);
    if (['archived', 'rejected'].includes(current.status)) {
        throw new ApiError(400, `Cannot open query in status: ${current.status}`);
    }
    if (current.status === 'approved') {
        assertTransition(current.status, 'opened');
    } else if (current.status === 'opened') {
        assertTransition(current.status, 'opened');
    } else if (current.status === 'captured') {
        // Captured queries may be re-opened; keep status captured.
        assertTransition(current.status, 'captured');
    } else if (!['generated', 'draft'].includes(current.status)) {
        // generated/draft: record open counts only without forcing opened.
    }

    const userId = actorUserId(user);
    const $set = {
        lastOpenedAt: new Date(),
        lastOpenedBy: userId,
        updatedBy: userId,
    };
    if (current.status === 'approved' || current.status === 'opened') {
        $set.status = 'opened';
    }
    // captured: leave status as captured
    if (!current.searchUrl) {
        $set.searchUrl = buildSearchUrl(current.sourceHint, current.queryText);
    }

    const updated = await SearchQuery.findOneAndUpdate(
        { _id: queryId, companyId: cid, campaignId },
        { $set, $inc: { openedCount: 1 } },
        { new: true },
    ).lean();
    if (!updated) throw new ApiError(404, 'Search query not found');

    return {
        query: updated,
        searchUrl: updated.searchUrl || buildSearchUrl(updated.sourceHint, updated.queryText),
        openedCount: updated.openedCount,
        lastOpenedAt: updated.lastOpenedAt,
    };
}

export async function archiveSearchQuery({ companyId, user, campaignId, queryId }) {
    assertQueryManage(user);
    const cid = requireCompanyId(companyId);
    await getOwnedSearchCampaign({ companyId: cid, user, campaignId, skipPermCheck: true });
    const current = await loadOwnedQuery(cid, campaignId, queryId);
    if (current.status === 'archived') return current;
    assertTransition(current.status, 'archived');
    const userId = actorUserId(user);
    const updated = await SearchQuery.findOneAndUpdate(
        { _id: queryId, companyId: cid, campaignId },
        {
            $set: {
                status: 'archived',
                archivedAt: new Date(),
                archivedBy: userId,
                updatedBy: userId,
            },
        },
        { new: true },
    ).lean();
    if (!updated) throw new ApiError(404, 'Search query not found');
    return updated;
}

export async function bulkApproveSearchQueries({ companyId, user, campaignId, body }) {
    assertQueryReview(user);
    const cid = requireCompanyId(companyId);
    await getOwnedSearchCampaign({ companyId: cid, user, campaignId, skipPermCheck: true });
    const { queryIds } = validateBulkBody(body || {});
    const results = { approved: [], failed: [] };
    for (const id of queryIds) {
        try {
            const q = await approveSearchQuery({ companyId: cid, user, campaignId, queryId: id });
            results.approved.push(q._id);
        } catch (err) {
            results.failed.push({ queryId: id, message: err.message || 'failed', statusCode: err.statusCode || 400 });
        }
    }
    return results;
}

export async function bulkRejectSearchQueries({ companyId, user, campaignId, body }) {
    assertQueryReview(user);
    const cid = requireCompanyId(companyId);
    await getOwnedSearchCampaign({ companyId: cid, user, campaignId, skipPermCheck: true });
    const validated = validateBulkBody(body || {});
    const results = { rejected: [], failed: [] };
    for (const id of validated.queryIds) {
        try {
            const q = await rejectSearchQuery({
                companyId: cid,
                user,
                campaignId,
                queryId: id,
                body: { rejectionReason: validated.rejectionReason || '' },
            });
            results.rejected.push(q._id);
        } catch (err) {
            results.failed.push({ queryId: id, message: err.message || 'failed', statusCode: err.statusCode || 400 });
        }
    }
    return results;
}

export function searchQueryHardDeleteSupported() {
    return false;
}
