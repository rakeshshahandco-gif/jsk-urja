import mongoose from 'mongoose';
import { SearchCampaign } from '../../../models/searchCampaign.model.js';
import { ApiError } from '../../../utils/ApiError.js';
import { checkUserPermission } from '../../../utils/permissionUtils.js';
import {
    SEARCH_CAMPAIGN_STATUS_TRANSITIONS,
} from './constants.js';
import { assertValidStatus, normalizeNameForIndex, normalizeDisplayString } from './normalize.util.js';
import {
    validateCreateBody,
    validateListQuery,
    validateStatusBody,
    validateUpdateBody,
} from './validation.js';
import {
    assertSearchCampaignManage,
    assertSearchCampaignView,
    actorUserId,
} from './permissions.util.js';

function requireCompanyId(companyId) {
    if (!companyId || !mongoose.isValidObjectId(companyId)) {
        throw new ApiError(400, 'Company context required');
    }
    return companyId;
}

function requireCampaignId(campaignId) {
    if (!campaignId || !mongoose.isValidObjectId(campaignId)) {
        throw new ApiError(404, 'Search campaign not found');
    }
    return campaignId;
}

function escapeRegex(text = '') {
    return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function loadOwnedCampaign(companyId, campaignId) {
    requireCompanyId(companyId);
    requireCampaignId(campaignId);
    const doc = await SearchCampaign.findOne({ _id: campaignId, companyId }).lean();
    if (!doc) {
        // Prefer not-found over leaking existence across tenants.
        throw new ApiError(404, 'Search campaign not found');
    }
    return doc;
}

function assertTransition(fromStatus, toStatus) {
    assertValidStatus(toStatus);
    const allowed = SEARCH_CAMPAIGN_STATUS_TRANSITIONS[fromStatus] || [];
    if (!allowed.includes(toStatus)) {
        throw new ApiError(400, `Invalid status transition: ${fromStatus} -> ${toStatus}`);
    }
}

function applyArchiveFields(update, userId, toStatus) {
    if (toStatus === 'archived') {
        update.archivedAt = new Date();
        update.archivedBy = userId || null;
    }
}

export async function createSearchCampaign({ companyId, user, body }) {
    assertSearchCampaignManage(user);
    const cid = requireCompanyId(companyId);
    const payload = validateCreateBody(body || {});
    const userId = actorUserId(user);
    const doc = await SearchCampaign.create({
        ...payload,
        companyId: cid,
        status: 'draft',
        createdBy: userId,
        updatedBy: userId,
        archivedAt: null,
        archivedBy: null,
    });
    return doc.toObject();
}

export async function listSearchCampaigns({ companyId, user, query }) {
    assertSearchCampaignView(user);
    const cid = requireCompanyId(companyId);
    const filters = validateListQuery(query || {});

    const mongo = { companyId: cid };
    if (filters.status) {
        mongo.status = filters.status;
    } else if (!filters.includeArchived) {
        mongo.status = { $ne: 'archived' };
    }
    if (filters.targetIndustry) {
        mongo.targetIndustry = new RegExp(`^${escapeRegex(filters.targetIndustry)}$`, 'i');
    }
    if (filters.source) {
        mongo.sources = filters.source;
    }
    if (filters.searchText) {
        const rx = new RegExp(escapeRegex(filters.searchText), 'i');
        mongo.$or = [
            { name: rx },
            { targetIndustry: rx },
            { targetProducts: rx },
            { includeKeywords: rx },
        ];
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
        SearchCampaign.find(mongo)
            .sort({ [filters.sort]: filters.sortDir })
            .skip(skip)
            .limit(filters.limit)
            .lean(),
        SearchCampaign.countDocuments(mongo),
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

export async function getSearchCampaign({ companyId, user, campaignId }) {
    assertSearchCampaignView(user);
    return loadOwnedCampaign(companyId, campaignId);
}

/** Read-only company-scoped campaign load for SearchQuery (Checkpoint 2). */
export async function getOwnedSearchCampaign({ companyId, user, campaignId, skipPermCheck = false }) {
    if (!skipPermCheck) {
        assertSearchCampaignView(user);
    }
    return loadOwnedCampaign(companyId, campaignId);
}


export async function updateSearchCampaign({ companyId, user, campaignId, body }) {
    assertSearchCampaignManage(user);
    await loadOwnedCampaign(companyId, campaignId);
    const payload = validateUpdateBody(body || {});
    const userId = actorUserId(user);
    const updated = await SearchCampaign.findOneAndUpdate(
        { _id: campaignId, companyId },
        { $set: { ...payload, updatedBy: userId } },
        { new: true },
    ).lean();
    if (!updated) throw new ApiError(404, 'Search campaign not found');
    return updated;
}

export async function changeSearchCampaignStatus({ companyId, user, campaignId, body }) {
    assertSearchCampaignManage(user);
    const current = await loadOwnedCampaign(companyId, campaignId);
    const { status } = validateStatusBody(body || {});
    assertTransition(current.status, status);
    const userId = actorUserId(user);
    const $set = { status, updatedBy: userId };
    applyArchiveFields($set, userId, status);
    const updated = await SearchCampaign.findOneAndUpdate(
        { _id: campaignId, companyId },
        { $set },
        { new: true },
    ).lean();
    if (!updated) throw new ApiError(404, 'Search campaign not found');
    return updated;
}

export async function archiveSearchCampaign({ companyId, user, campaignId }) {
    assertSearchCampaignManage(user);
    const current = await loadOwnedCampaign(companyId, campaignId);
    if (current.status === 'archived') {
        return current;
    }
    assertTransition(current.status, 'archived');
    const userId = actorUserId(user);
    const $set = {
        status: 'archived',
        updatedBy: userId,
        archivedAt: new Date(),
        archivedBy: userId,
    };
    const updated = await SearchCampaign.findOneAndUpdate(
        { _id: campaignId, companyId },
        { $set },
        { new: true },
    ).lean();
    if (!updated) throw new ApiError(404, 'Search campaign not found');
    return updated;
}

/**
 * Checkpoint 5B — restricted campaign create/reuse for Simple Lead Search only.
 * Allows search_campaign.manage OR assisted_capture.start|manage.
 * Does NOT grant general SearchCampaign CRUD; normal create still requires manage.
 * Reuses validateCreateBody + status transitions (draft → active).
 */
function assertSimpleLeadSearchCampaignCreate(user) {
    if (
        checkUserPermission(user, 'data_extractor.search_campaign.manage')
        || checkUserPermission(user, 'data_extractor.assisted_capture.start')
        || checkUserPermission(user, 'data_extractor.assisted_capture.manage')
    ) {
        return;
    }
    throw new ApiError(
        403,
        'Permission denied: cannot create campaign (need search_campaign.manage or assisted_capture.start)',
    );
}

function normalizeMatchKey(value = '') {
    return normalizeDisplayString(value || '', { field: 'match' }).toLowerCase();
}

async function findReusableSimpleLeadSearchCampaign(companyId, {
    nameNormalized,
    targetIndustry,
    city,
    state,
    country,
    locationScope = '',
    searchMarket = '',
    businessTypesKey = '',
    relatedKeywordsKey = '',
    expandCitiesKey = '',
    worldwide = false,
    createdBy = null,
}) {
    const ownerId = createdBy || null;
    const byName = await SearchCampaign.findOne({
        companyId,
        nameNormalized,
        status: { $ne: 'archived' },
        ...(ownerId ? { createdBy: ownerId } : {}),
    }).lean();
    if (byName) {
        // Legacy Simple Lead Search (no scope/business-type profile): name match is enough.
        if (!locationScope && !businessTypesKey) return byName;
        const sameProfile = (
            normalizeMatchKey(byName.locationScope || '') === normalizeMatchKey(locationScope)
            && normalizeMatchKey(byName.searchMarket || 'india_global_web') === normalizeMatchKey(searchMarket || 'india_global_web')
            && normalizeMatchKey((byName.businessTypes || []).map((t) => String(t).toLowerCase()).sort().join('|')) === normalizeMatchKey(businessTypesKey)
            && normalizeMatchKey((byName.relatedKeywords || []).map((t) => String(t).toLowerCase()).sort().join('|')) === normalizeMatchKey(relatedKeywordsKey)
            && Boolean(byName.worldwide) === Boolean(worldwide)
            && normalizeMatchKey(byName.city) === normalizeMatchKey(city)
            && normalizeMatchKey(byName.state) === normalizeMatchKey(state)
            && normalizeMatchKey(byName.country) === normalizeMatchKey(country)
        );
        if (sameProfile) return byName;
    }

    const productKey = normalizeMatchKey(targetIndustry);
    const cityKey = normalizeMatchKey(city);
    const stateKey = normalizeMatchKey(state);
    const countryKey = normalizeMatchKey(country);
    const scopeKey = normalizeMatchKey(locationScope);
    const marketKey = normalizeMatchKey(searchMarket || 'india_global_web');
    const btKey = normalizeMatchKey(businessTypesKey);
    const rkKey = normalizeMatchKey(relatedKeywordsKey);
    const expandKey = normalizeMatchKey(expandCitiesKey);

    const candidates = await SearchCampaign.find({
        companyId,
        status: { $ne: 'archived' },
        ...(ownerId ? { createdBy: ownerId } : {}),
    }).lean();

    return candidates.find((c) => {
        const cBt = (c.businessTypes || []).map((t) => String(t).toLowerCase()).sort().join('|');
        const cRk = (c.relatedKeywords || []).map((t) => String(t).toLowerCase()).sort().join('|');
        const cExpand = (c.expandCities || []).map((t) => String(t).toLowerCase()).sort().join('|');
        return normalizeMatchKey(c.targetIndustry) === productKey
            && normalizeMatchKey(c.city) === cityKey
            && normalizeMatchKey(c.state) === stateKey
            && normalizeMatchKey(c.country) === countryKey
            && normalizeMatchKey(c.locationScope || '') === scopeKey
            && normalizeMatchKey(c.searchMarket || 'india_global_web') === marketKey
            && normalizeMatchKey(cBt) === btKey
            && normalizeMatchKey(cRk) === rkKey
            && normalizeMatchKey(cExpand) === expandKey
            && Boolean(c.worldwide) === Boolean(worldwide);
    }) || null;
}

/**
 * Create or reuse a restricted Simple Lead Search campaign.
 * Server-controlled: sources=['google'], status via draft→active, audit from auth.
 * Rejects client companyId/status/audit via validateCreateBody.
 */
export async function ensureSimpleLeadSearchCampaign({ companyId, user, body }) {
    assertSimpleLeadSearchCampaignCreate(user);
    const cid = requireCompanyId(companyId);

    if (Object.prototype.hasOwnProperty.call(body || {}, 'companyId')) {
        throw new ApiError(400, 'body.companyId is not allowed');
    }

    // Force google-only sources regardless of client input.
    const createBody = {
        ...(body || {}),
        sources: ['google'],
        minimumQualificationScore: body?.minimumQualificationScore ?? 60,
    };
    // validateCreateBody rejects status + forbidden audit/company fields
    const payload = validateCreateBody(createBody);
    payload.sources = ['google'];
    if (!payload.nameNormalized) {
        payload.nameNormalized = normalizeNameForIndex(payload.name);
    }

    let campaign = await findReusableSimpleLeadSearchCampaign(cid, {
        nameNormalized: payload.nameNormalized,
        targetIndustry: payload.targetIndustry,
        city: payload.city || '',
        state: payload.state || '',
        country: payload.country || '',
        locationScope: payload.locationScope || '',
        searchMarket: payload.searchMarket || 'india_global_web',
        businessTypesKey: (payload.businessTypes || []).map((t) => String(t).toLowerCase()).sort().join('|'),
        relatedKeywordsKey: (payload.relatedKeywords || []).map((t) => String(t).toLowerCase()).sort().join('|'),
        expandCitiesKey: (payload.expandCities || []).map((t) => String(t).toLowerCase()).sort().join('|'),
        worldwide: Boolean(payload.worldwide),
        createdBy: actorUserId(user),
    });

    if (campaign) {
        if (campaign.status === 'draft') {
            assertTransition(campaign.status, 'active');
            const userId = actorUserId(user);
            campaign = await SearchCampaign.findOneAndUpdate(
                { _id: campaign._id, companyId: cid },
                { $set: { status: 'active', updatedBy: userId } },
                { new: true },
            ).lean();
        }
        return { campaign, campaignAction: 'reused' };
    }

    const userId = actorUserId(user);
    const draft = await SearchCampaign.create({
        ...payload,
        companyId: cid,
        status: 'draft',
        createdBy: userId,
        createdByName: String(user?.name || user?.fullName || user?.username || '').trim(),
        updatedBy: userId,
        archivedAt: null,
        archivedBy: null,
    });

    assertTransition('draft', 'active');
    const active = await SearchCampaign.findOneAndUpdate(
        { _id: draft._id, companyId: cid },
        { $set: { status: 'active', updatedBy: userId } },
        { new: true },
    ).lean();

    return { campaign: active, campaignAction: 'created' };
}

/** Route inventory helper for tests — hard delete must never exist. */
export function searchCampaignHardDeleteSupported() {
    return false;
}