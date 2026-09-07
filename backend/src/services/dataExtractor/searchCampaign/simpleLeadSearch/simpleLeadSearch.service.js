/**
 * Simple Lead Search orchestration (Checkpoint 5B).
 * Campaign/query writes go through SearchCampaign + SearchQuery service helpers.
 * No direct SearchQuery.create / SearchCampaign.create from this module.
 */
import mongoose from 'mongoose';
import { AssistedCaptureSession } from '../../../../models/assistedCaptureSession.model.js';
import { RawCapture } from '../../../../models/rawCapture.model.js';
import { ApiError } from '../../../../utils/ApiError.js';
import { checkUserPermission } from '../../../../utils/permissionUtils.js';
import {
    assertAssistedCaptureStart,
    assertAssistedCaptureView,
} from '../assistedCapture/permissions.util.js';
import { createAssistedCaptureSession, cancelAssistedCaptureSession, continueAfterManualAction, completeAssistedCaptureSessionByUser } from '../assistedCapture/session.service.js';
import { getPendingCaptureRequest } from '../assistedCapture/captureRequest.service.js';
import { getAgentStatusForCompany, SESSION_UI_LABELS } from '../assistedCapture/agentPresence.service.js';
import { ensureSimpleLeadSearchCampaign } from '../searchCampaign.service.js';
import { ensureSimpleLeadSearchQuery } from '../searchQuery/searchQuery.service.js';
import { SearchQuery } from '../../../../models/searchQuery.model.js';
import { SearchCampaign } from '../../../../models/searchCampaign.model.js';
import { buildCampaignName, buildSimpleQueries, normalizeDisplay, normalizeBusinessTypes, parseRelatedKeywords, parseLocationExpandList, inferLocationScope, validateLocationForScope, suggestMajorCitiesForState, BUSINESS_TYPE_OPTIONS, DEFAULT_BUSINESS_TYPES, SEARCH_MARKETS, INDIA_GLOBAL_SOURCE_OPTIONS, CHINA_SOURCE_OPTIONS, isChinaCountry, isIndiaCountry, suggestIndiaProductSynonyms, INDIA_PRIORITY_CITIES, parseProductModels, sourceHintFromPlatform } from './queryBuilder.util.js';
import { attachStageA, summarizeStageA } from './stageAPreFilter.util.js';
import { buildUnverifiedRawCaptureWorkbook } from './simpleLeadSearch.export.service.js';

function requireCompanyId(companyId) {
    if (!companyId || !mongoose.isValidObjectId(companyId)) {
        throw new ApiError(400, 'Company context required');
    }
    return companyId;
}

function requireObjectId(id, label) {
    if (!id || !mongoose.isValidObjectId(id)) throw new ApiError(404, `${label} not found`);
}

function assertGenerateAndReview(user) {
    if (
        !checkUserPermission(user, 'data_extractor.search_query.generate')
        && !checkUserPermission(user, 'data_extractor.search_query.manage')
    ) {
        throw new ApiError(403, 'Permission denied: data_extractor.search_query.generate required');
    }
    if (
        !checkUserPermission(user, 'data_extractor.search_query.review')
        && !checkUserPermission(user, 'data_extractor.search_query.manage')
    ) {
        throw new ApiError(403, 'Permission denied: data_extractor.search_query.review required');
    }
}

function sanitizeSession(session) {
    if (!session) return null;
    const plain = session.toObject ? session.toObject() : { ...session };
    delete plain.tokenHash;
    return plain;
}

function parseBool(raw, fallback = false) {
    if (raw === true || raw === 'true' || raw === 1 || raw === '1') return true;
    if (raw === false || raw === 'false' || raw === 0 || raw === '0') return false;
    return fallback;
}

function parseSearchBody(body = {}) {
    const product = normalizeDisplay(body?.product || body?.targetIndustry || '');
    let city = body?.city != null ? normalizeDisplay(body.city) : '';
    const state = body?.state != null ? normalizeDisplay(body.state) : '';
    let country = body?.country != null ? normalizeDisplay(body.country) : '';
    const excludeKeywords = Array.isArray(body?.excludeKeywords) ? body.excludeKeywords : [];
    const relatedKeywords = parseRelatedKeywords(body?.relatedKeywords ?? body?.relatedKeywordsText ?? '');
    const hasBusinessTypesField = Object.prototype.hasOwnProperty.call(body || {}, 'businessTypes');
    const businessTypes = hasBusinessTypesField
        ? normalizeBusinessTypes(body.businessTypes)
        : [];
    const searchMarketRaw = normalizeDisplay(body?.searchMarket || body?.sourceMode || '').toLowerCase();
    const marketExplicit = SEARCH_MARKETS.includes(searchMarketRaw);
    let searchMarket = marketExplicit
        ? searchMarketRaw
        : (hasBusinessTypesField || body?.locationScope ? 'india_global_web' : '');
    const hasChinaModels = parseProductModels(product).length > 0
        && (isChinaCountry(country) || searchMarket === 'china_suppliers');
    if ((hasChinaModels || isChinaCountry(country)) && (searchMarket === 'india_global_web' || !searchMarket)) {
        searchMarket = 'china_suppliers';
    }
    if (searchMarket === 'china_suppliers' && !country) country = 'China';
    let locationScope = inferLocationScope({
        locationScope: body?.locationScope,
        city,
        state,
        country,
        worldwide: parseBool(body?.worldwide, false) || normalizeDisplay(body?.locationScope).toLowerCase() === 'worldwide',
    });
    // Owner types Country=China with city/state blank — do not require City scope.
    if ((isChinaCountry(country) || searchMarket === 'china_suppliers') && !city && locationScope === 'city') {
        locationScope = 'country';
    }
    const expandStateSearch = parseBool(body?.expandStateSearch, false);
    const expandCountrySearch = parseBool(body?.expandCountrySearch, false);
    let expandCities = parseLocationExpandList(body?.expandCities ?? body?.selectedCities);
    const cityParts = parseLocationExpandList(city);
    if (cityParts.length > 1) {
        city = cityParts[0];
        for (const part of cityParts) {
            if (!expandCities.some((c) => String(c).toLowerCase() === part.toLowerCase())) {
                expandCities.push(part);
            }
        }
    }
    const expandStatesRaw = body?.expandStates ?? body?.selectedStates;
    const expandStates = parseLocationExpandList(expandStatesRaw);
    let relatedForScope = relatedKeywords;
    if (isIndiaCountry(country) && !city && locationScope === 'country') {
        if (!expandCities.length) expandCities = [...INDIA_PRIORITY_CITIES];
        if (!relatedForScope.length) relatedForScope = suggestIndiaProductSynonyms(product);
    }
    if (expandCountrySearch && expandStatesRaw != null && String(expandStatesRaw).trim() !== '' && !expandStates.length) {
        throw new ApiError(400, 'Selected states could not be read. Use comma-separated names such as Guangdong, Zhejiang, Jiangsu, Fujian.');
    }
    const selectedSources = Array.isArray(body?.selectedSources)
        ? body.selectedSources.map((s) => normalizeDisplay(s)).filter(Boolean)
        : [];
    const useScopedBuilder = hasBusinessTypesField
        || Boolean(body?.locationScope)
        || relatedForScope.length > 0
        || Boolean(searchMarket);

    return {
        product,
        city,
        state,
        country,
        excludeKeywords,
        relatedKeywords: relatedForScope,
        businessTypes,
        hasBusinessTypesField,
        searchMarket: searchMarket || 'india_global_web',
        locationScope,
        expandCities: expandStateSearch || expandCountrySearch ? expandCities : (expandCities.length ? expandCities : []),
        expandStates: expandCountrySearch ? expandStates : (expandStates.length ? expandStates : []),
        selectedSources,
        worldwide: locationScope === 'worldwide',
        useScopedBuilder,
        enabledQueryTexts: Array.isArray(body?.enabledQueryTexts)
            ? body.enabledQueryTexts.map((t) => normalizeDisplay(t)).filter(Boolean)
            : null,
        disabledQueryTexts: Array.isArray(body?.disabledQueryTexts)
            ? body.disabledQueryTexts.map((t) => normalizeDisplay(t)).filter(Boolean)
            : [],
    };
}

export function previewSimpleLeadSearchQueries({ body = {} } = {}) {
    const parsed = parseSearchBody(body);
    if (!parsed.product) throw new ApiError(400, 'product is required');

    if (parsed.useScopedBuilder) {
        const loc = validateLocationForScope({
            locationScope: parsed.locationScope,
            city: parsed.city,
            state: parsed.state,
            country: parsed.country,
        });
        if (!loc.ok) throw new ApiError(400, loc.message);
    }

    const typesForBuild = parsed.useScopedBuilder
        ? (parsed.businessTypes.length ? parsed.businessTypes : [...DEFAULT_BUSINESS_TYPES])
        : undefined;

    const planned = buildSimpleQueries({
        product: parsed.product,
        city: parsed.city,
        state: parsed.state,
        country: parsed.country,
        excludeKeywords: parsed.excludeKeywords,
        businessTypes: typesForBuild,
        relatedKeywords: parsed.useScopedBuilder ? parsed.relatedKeywords : undefined,
        locationScope: parsed.useScopedBuilder ? parsed.locationScope : undefined,
        searchMarket: parsed.useScopedBuilder ? parsed.searchMarket : undefined,
        expandCities: parsed.expandCities,
        expandStates: parsed.expandStates,
        worldwide: parsed.worldwide,
    });

    const name = buildCampaignName(parsed.product, parsed.city, parsed.state, {
        locationScope: parsed.locationScope,
        country: parsed.country,
        searchMarket: parsed.searchMarket,
        worldwide: parsed.worldwide,
    });

    return {
        campaignName: name,
        estimatedQueryCount: planned.length,
        locationScope: parsed.locationScope,
        searchMarket: parsed.searchMarket,
        businessTypes: typesForBuild || [],
        relatedKeywords: parsed.relatedKeywords,
        suggestedCities: suggestMajorCitiesForState(parsed.state),
        businessTypeOptions: BUSINESS_TYPE_OPTIONS,
        sourceOptions: parsed.searchMarket === 'china_suppliers' ? CHINA_SOURCE_OPTIONS : INDIA_GLOBAL_SOURCE_OPTIONS,
        platformAdaptersNote: parsed.searchMarket === 'china_suppliers'
            ? 'China discovery is Chinese-native first: direct 1688, then Baidu, Sogou, and 360 Search. Alibaba / Made-in-China / Global Sources are Google-indexed (not native portal capture). Google Web is secondary. Login/CAPTCHA may require manual confirmation. Direct Alibaba API is not claimed complete.'
            : 'First release uses Google assisted visible capture. Direct Alibaba / 1688 / IndiaMART adapters are not claimed complete.',
        queries: planned.map((q, i) => ({
            ...q,
            index: i + 1,
            enabled: true,
        })),
        recommendedQuery: planned.find((q) => q.recommended) || planned[0] || null,
    };
}

export async function startSimpleLeadSearch({ companyId, user, body, headers = {} }) {
    const cid = requireCompanyId(companyId);
    assertAssistedCaptureStart(user);
    assertGenerateAndReview(user);

    if (Object.prototype.hasOwnProperty.call(body || {}, 'companyId')) {
        throw new ApiError(400, 'body.companyId is not allowed');
    }

    const parsed = parseSearchBody(body || {});
    const product = parsed.product;
    if (!product) throw new ApiError(400, 'product is required');

    if (parsed.useScopedBuilder) {
        const loc = validateLocationForScope({
            locationScope: parsed.locationScope,
            city: parsed.city,
            state: parsed.state,
            country: parsed.country,
        });
        if (!loc.ok) throw new ApiError(400, loc.message);
    }

    let autoCollectionStopped = null;
    try {
        const { stopCompanyAutoCollection } = await import('./simpleLeadSearch.autoCollection.service.js');
        autoCollectionStopped = await stopCompanyAutoCollection({
            companyId: cid,
            user,
            reason: 'new_search_started',
        });
    } catch {
        autoCollectionStopped = null;
    }

    const city = parsed.city;
    const state = parsed.state;
    const country = parsed.country;
    const excludeKeywords = parsed.excludeKeywords;
    const businessTypes = parsed.useScopedBuilder
        ? (parsed.businessTypes.length ? parsed.businessTypes : [...DEFAULT_BUSINESS_TYPES])
        : [];

    const name = buildCampaignName(product, city, state, {
        locationScope: parsed.locationScope,
        country,
        searchMarket: parsed.searchMarket,
        worldwide: parsed.worldwide,
    });

    const campaignBody = {
        name,
        targetIndustry: product,
        targetProducts: [product],
        city,
        state,
        country,
        includeKeywords: [product, ...parsed.relatedKeywords].filter(Boolean),
        excludeKeywords,
        sources: ['google'],
        minimumQualificationScore: 60,
    };
    if (parsed.useScopedBuilder) {
        campaignBody.businessTypes = businessTypes;
        campaignBody.relatedKeywords = parsed.relatedKeywords;
        campaignBody.locationScope = parsed.locationScope;
        campaignBody.searchMarket = parsed.searchMarket;
        campaignBody.selectedSources = parsed.selectedSources.length
            ? parsed.selectedSources
            : (parsed.searchMarket === 'china_suppliers' ? ['1688', 'baidu', 'sogou', 'so360', 'google_global'] : ['google_web']);
        campaignBody.worldwide = parsed.worldwide;
        campaignBody.expandCities = parsed.expandCities;
        campaignBody.expandStates = parsed.expandStates;
    }

    const { campaign, campaignAction } = await ensureSimpleLeadSearchCampaign({
        companyId: cid,
        user,
        body: campaignBody,
    });

    const planned = buildSimpleQueries({
        product,
        city,
        state,
        country,
        excludeKeywords,
        businessTypes: parsed.useScopedBuilder ? businessTypes : undefined,
        relatedKeywords: parsed.useScopedBuilder ? parsed.relatedKeywords : undefined,
        locationScope: parsed.useScopedBuilder ? parsed.locationScope : undefined,
        searchMarket: parsed.useScopedBuilder ? parsed.searchMarket : undefined,
        expandCities: parsed.expandCities,
        expandStates: parsed.expandStates,
        worldwide: parsed.worldwide,
    });
    if (!planned.length) throw new ApiError(400, 'No search queries could be generated');

    const disabledSet = new Set(parsed.disabledQueryTexts.map((t) => t.toLowerCase()));
    const enabledSet = parsed.enabledQueryTexts
        ? new Set(parsed.enabledQueryTexts.map((t) => t.toLowerCase()))
        : null;

    const filteredPlanned = planned.filter((q) => {
        const key = q.queryText.toLowerCase();
        if (disabledSet.has(key)) return false;
        if (enabledSet && !enabledSet.has(key)) return false;
        return true;
    });
    if (!filteredPlanned.length) throw new ApiError(400, 'No enabled search queries to start');

    const queries = [];
    for (const q of filteredPlanned) {
        const saved = await ensureSimpleLeadSearchQuery({
            companyId: cid,
            user,
            campaignId: campaign._id,
            queryText: q.queryText,
            priorityScore: q.priorityScore,
            queryLanguage: q.queryLanguage,
            sourceHint: sourceHintFromPlatform(q.sourcePlatform),
            selectedCriteria: {
                businessType: q.businessType || '',
                relatedKeyword: q.relatedKeyword || '',
                locationScope: q.locationScope || parsed.locationScope || '',
                locationLabel: q.locationLabel || '',
                queryLanguage: q.queryLanguage || 'en',
                translatedQuery: q.translatedQuery || '',
                sourcePlatform: q.sourcePlatform || 'google',
                searchMarket: parsed.searchMarket || 'india_global_web',
                product,
                ownerDisplayLabel: q.ownerDisplayLabel || '',
            },
        });
        if (!saved.slsCaptureStatus) {
            await SearchQuery.updateOne(
                { _id: saved._id },
                { $set: { slsCaptureStatus: 'pending' } },
            );
            saved.slsCaptureStatus = 'pending';
        }
        queries.push({
            id: String(saved._id),
            queryText: saved.queryText,
            status: saved.status,
            slsCaptureStatus: saved.slsCaptureStatus || 'pending',
            priorityScore: saved.priorityScore,
            businessType: q.businessType || '',
            relatedKeyword: q.relatedKeyword || '',
            queryLanguage: q.queryLanguage || 'en',
            locationLabel: q.locationLabel || '',
            sourcePlatform: q.sourcePlatform || 'google',
            recommended: false,
            enabled: true,
        });
    }

    queries.sort((a, b) => Number(b.priorityScore || 0) - Number(a.priorityScore || 0));
    if (queries[0]) queries[0].recommended = true;

    let selected = queries[0];
    const selectedQueryId = body?.selectedQueryId ? String(body.selectedQueryId).trim() : '';
    if (selectedQueryId) {
        const override = queries.find((q) => q.id === selectedQueryId);
        if (!override) throw new ApiError(400, 'selectedQueryId is not in the generated query list');
        queries.forEach((q) => { q.recommended = q.id === selectedQueryId; });
        selected = override;
    }

    await SearchQuery.updateOne(
        { _id: selected.id, companyId: cid },
        { $set: { slsCaptureStatus: 'opening' } },
    );
    selected.slsCaptureStatus = 'opening';

    const sessionResult = await createAssistedCaptureSession({
        companyId: cid,
        user,
        campaignId: campaign._id,
        queryId: selected.id,
        body: {
            idempotencyKey: String(body?.idempotencyKey || `sls-${cid}-${selected.id}-${Date.now()}`).slice(0, 200),
            sourceHint: sourceHintFromPlatform(selected.sourcePlatform),
            sessionTtlMinutes: body?.sessionTtlMinutes,
            financialYear: body?.financialYear,
        },
        headers,
    });

    await AssistedCaptureSession.updateOne(
        { _id: sessionResult.session._id },
        { $set: { googlePageIndex: 1 } },
    );

    const agentStatus = await getAgentStatusForCompany(cid, {
        sessionId: sessionResult.session?._id,
    });

    return {
        campaign,
        campaignAction,
        searchProfile: {
            product,
            relatedKeywords: parsed.relatedKeywords,
            businessTypes,
            locationScope: parsed.locationScope,
            city,
            state,
            country,
            searchMarket: parsed.searchMarket,
            selectedSources: campaignBody.selectedSources || [],
            worldwide: parsed.worldwide,
        },
        queries: queries.map((q) => ({
            id: q.id,
            queryText: q.queryText,
            status: q.status,
            slsCaptureStatus: q.slsCaptureStatus,
            recommended: q.recommended,
            businessType: q.businessType,
            relatedKeyword: q.relatedKeyword,
            queryLanguage: q.queryLanguage,
            locationLabel: q.locationLabel,
            enabled: true,
        })),
        selectedQuery: {
            id: selected.id,
            queryText: selected.queryText,
            status: selected.status,
            slsCaptureStatus: selected.slsCaptureStatus,
            businessType: selected.businessType,
        },
        session: sanitizeSession(sessionResult.session),
        agentStatus,
        idempotentReplay: Boolean(sessionResult.idempotentReplay),
        autoCollectionStoppedWarning: autoCollectionStopped?.stoppedCount
            ? 'Previous Auto Collection was stopped because a new search started. Completed captures remain saved.'
            : null,
        platformAdaptersNote: 'Assisted Google visible capture is implemented. Direct marketplace platform adapters are not claimed complete.',
        campaignProgress: {
            queryIndex: 1,
            queryTotal: queries.length,
            googlePage: 1,
            uniqueResultsCollected: 0,
            note: 'Accepted counts are result appearances; Unique is campaign unique records.',
        },
    };
}

const OPENING_READY_TIMEOUT_MS = 30 * 1000;

async function enforceOpeningReadyTimeout(sessionDoc) {
    if (!sessionDoc) return sessionDoc;
    const status = String(sessionDoc.status || '');

    // Queued with no agent claim within 30s
    if (status === 'queued') {
        const startedMs = sessionDoc.createdAt ? new Date(sessionDoc.createdAt).getTime() : 0;
        if (startedMs && (Date.now() - startedMs) >= OPENING_READY_TIMEOUT_MS) {
            const failMessage = 'No Discovery Agent claimed this session within 30 seconds. Confirm only one agent is running in listen mode against http://127.0.0.1:5100, then click Retry.';
            const updated = await AssistedCaptureSession.findOneAndUpdate(
                {
                    _id: sessionDoc._id,
                    companyId: sessionDoc.companyId,
                    status: 'queued',
                },
                {
                    $set: {
                        status: 'failed',
                        failedAt: new Date(),
                        failCode: 'QUEUE_TIMEOUT',
                        failMessage,
                        pendingCaptureStatus: 'none',
                        pendingCaptureAckedAt: null,
                        pendingNavigationStatus: 'none',
                    },
                },
                { new: true },
            ).lean();
            return updated || { ...sessionDoc, status: 'failed', failCode: 'QUEUE_TIMEOUT', failMessage };
        }
        return sessionDoc;
    }

    if (!['agent_assigned', 'opening'].includes(status)) return sessionDoc;
    if (sessionDoc.browserOpenedAcked) return sessionDoc;

    const startedAt = sessionDoc.tokenDeliveredAt || sessionDoc.updatedAt || sessionDoc.createdAt;
    const startedMs = startedAt ? new Date(startedAt).getTime() : 0;
    const source = String(sessionDoc.source || sessionDoc.sourceHint || 'google').toLowerCase();
    const isAssistedPortal = source === 'baidu' || source === '1688' || source === 'sogou' || source === 'so360';
    const readyMs = isAssistedPortal ? 90 * 1000 : OPENING_READY_TIMEOUT_MS;
    if (!startedMs || (Date.now() - startedMs) < readyMs) return sessionDoc;

    if (isAssistedPortal) {
        const waitMessage = source === '1688'
            ? 'Waiting for User — Complete 1688 verification. The 1688 window is still opening or needs login/CAPTCHA.'
            : `Waiting for User. ${source === 'so360' ? '360 Search' : (source === 'sogou' ? 'Sogou' : 'Baidu')} is still opening or needs verification.`;
        const updated = await AssistedCaptureSession.findOneAndUpdate(
            {
                _id: sessionDoc._id,
                companyId: sessionDoc.companyId,
                status: { $in: ['agent_assigned', 'opening'] },
                browserOpenedAcked: { $ne: true },
            },
            {
                $set: {
                    status: 'manual_action_required',
                    manualActionMessage: waitMessage,
                    failCode: '',
                    failMessage: '',
                    'autoCollection.lastErrorCode': 'waiting_for_user',
                    'autoCollection.lastErrorMessage': waitMessage,
                    'autoCollection.status': 'paused_manual',
                    'autoCollection.discoveryStatus': 'paused',
                    'autoCollection.pauseReason': 'provider_block',
                },
            },
            { new: true },
        ).lean();
        return updated || { ...sessionDoc, status: 'manual_action_required', manualActionMessage: waitMessage };
    }

    const failMessage = 'Google window did not become ready within 30 seconds. Check that Discovery Agent is running with Chrome/Edge, then click Retry.';
    const updated = await AssistedCaptureSession.findOneAndUpdate(
        {
            _id: sessionDoc._id,
            companyId: sessionDoc.companyId,
            status: { $in: ['agent_assigned', 'opening'] },
            browserOpenedAcked: { $ne: true },
        },
        {
            $set: {
                status: 'failed',
                failedAt: new Date(),
                failCode: 'OPENING_TIMEOUT',
                failMessage,
                pendingCaptureStatus: 'none',
                pendingCaptureAckedAt: null,
                pendingNavigationStatus: 'none',
                'autoCollection.lastErrorCode': 'OPENING_TIMEOUT',
                'autoCollection.lastErrorMessage': failMessage,
            },
        },
        { new: true },
    ).lean();
    return updated || { ...sessionDoc, status: 'failed', failCode: 'OPENING_TIMEOUT', failMessage };
}

export async function getSimpleLeadSearchStatus({ companyId, user, sessionId }) {
    const cid = requireCompanyId(companyId);
    assertAssistedCaptureView(user);
    requireObjectId(sessionId, 'Assisted capture session');

    let session = await AssistedCaptureSession.findOne({ _id: sessionId, companyId: cid }).lean();
    if (!session) throw new ApiError(404, 'Assisted capture session not found');
    session = await enforceOpeningReadyTimeout(session);

    const pending = await getPendingCaptureRequest({ companyId: cid, sessionId });
    const agentStatus = await getAgentStatusForCompany(cid, { sessionId });

    const captureMongo = {
        companyId: cid,
        campaignId: session.campaignId,
    };

    const [recentRawCaptures, uniqueResultCount, allForStats] = await Promise.all([
        RawCapture.find(captureMongo)
            .sort({ lastSeenAt: -1 })
            .limit(20)
            .select('title displayDomain resultUrlNormalized resultUrlOriginal resultPosition inboxStatus duplicateStatus lastSeenAt firstSeenAt queryId snippet source seenCount')
            .lean(),
        RawCapture.countDocuments(captureMongo),
        RawCapture.find(captureMongo)
            .select('title snippet displayDomain resultUrlNormalized resultUrlOriginal inboxStatus')
            .lean(),
    ]);

    const stageA = summarizeStageA(allForStats);
    const enrichedRecent = recentRawCaptures.map(attachStageA);
    const ownerStopped = Boolean(session.autoCollection?.ownerStoppedAt || session.autoCollection?.stopRequested);
    const handedOff = String(session.autoCollection?.summary?.stopReason || '') === 'handed_off_to_next_query_session';
    let ended = ['completed', 'cancelled', 'expired', 'failed'].includes(session.status);
    // Child source session ended because the campaign moved to the next query — not a campaign end.
    if (ended && handedOff && !ownerStopped) {
        const live = await AssistedCaptureSession.findOne({
            companyId: cid,
            campaignId: session.campaignId,
            status: { $nin: ['completed', 'cancelled', 'expired', 'failed'] },
        }).sort({ updatedAt: -1 }).lean();
        if (live) {
            session = live;
            ended = false;
        } else {
            ended = false;
        }
    }

    // Campaign-wide unique (do not treat session accepted appearances as unique companies)
    const campaignUniqueResultCount = await RawCapture.countDocuments({
        companyId: cid,
        campaignId: session.campaignId,
    });

    let campaignProgress = null;
    try {
        const { buildCampaignProgress, refreshQueryCaptureStats } = await import('./simpleLeadSearch.multiQuery.service.js');
        await refreshQueryCaptureStats({
            companyId: cid,
            campaignId: session.campaignId,
            queryId: session.queryId,
        });
        if (['awaiting_user', 'ready_to_capture'].includes(session.status)) {
            await SearchQuery.updateOne(
                { _id: session.queryId, companyId: cid, slsCaptureStatus: { $in: ['opening', 'pending'] } },
                { $set: { slsCaptureStatus: 'ready' } },
            );
        }
        if (Number(session.captureEventCount || 0) > 0) {
            await SearchQuery.updateOne(
                { _id: session.queryId, companyId: cid, slsCaptureStatus: { $in: ['ready', 'opening', 'pending'] } },
                { $set: { slsCaptureStatus: 'partially_captured' } },
            );
        }
        campaignProgress = await buildCampaignProgress({
            companyId: cid,
            campaignId: session.campaignId,
            session,
        });
    } catch {
        campaignProgress = null;
    }

    let autoCollection = null;
    let autoCollectionSessionId = null;
    let autoCollectionSelectedQuery = null;
    let autoProcessing = null;
    const tickSessionId = String(session._id);
    if (tickSessionId !== String(sessionId)) {
        autoCollectionSessionId = tickSessionId;
    }
    try {
        const autoMod = await import('./simpleLeadSearch.autoCollection.service.js');
        if (session?.autoCollection?.status === 'running') {
            const ticked = await autoMod.tickAutoCollection({ companyId: cid, user, sessionId: tickSessionId });
            if (ticked?.session) {
                session = ticked.session;
                if (ticked.campaignProgress) campaignProgress = ticked.campaignProgress;
                autoCollection = ticked.autoCollection;
                if (ticked.sessionId && String(ticked.sessionId) !== String(sessionId)) {
                    autoCollectionSessionId = String(ticked.sessionId);
                    autoCollectionSelectedQuery = ticked.selectedQuery || null;
                }
            }
        } else if (session?.autoCollection && session.autoCollection.status && session.autoCollection.status !== 'idle') {
            autoCollection = autoMod.progressView(session, campaignProgress);
        }
    } catch {
        autoCollection = null;
    }

    try {
        const pipeMod = await import('./simpleLeadSearch.autoProcessing.service.js');
        const ap = session?.autoProcessing;
        const apStatus = ap?.status || 'idle';
        // Tick whenever workflow may auto-resume (idle/completed/failed + backlog) or is running.
        // Pause / Stop All are respected inside tickAutoProcessing.
        const mayTick = Boolean(
            ap
            && apStatus !== 'paused_owner'
            && apStatus !== 'stopped'
            && (
                ap.enabled
                || ap.ownerWorkflowEnabled
                || ap.startedAt
                || ['running', 'completed', 'failed'].includes(apStatus)
            ),
        );
        if (mayTick) {
            const ticked = await pipeMod.tickAutoProcessing({ companyId: cid, user, sessionId: String(session._id) });
            autoProcessing = ticked?.autoProcessing || null;
            // reload session counts after tick
            const fresh = await AssistedCaptureSession.findOne({ _id: session._id, companyId: cid }).lean();
            if (fresh) session = fresh;
        } else if (ap && apStatus && apStatus !== 'idle') {
            autoProcessing = pipeMod.progressView(session);
        }
    } catch {
        autoProcessing = null;
    }

    // Refresh unique after possible capture tick
    const uniqueFresh = await RawCapture.countDocuments({ companyId: cid, campaignId: session.campaignId });

    return {
        session: sanitizeSession(session),
        agentStatus,
        pendingCapture: pending.pendingCapture,
        pending: pending.pending,
        pendingNavigation: {
            pending: (session.pendingNavigationStatus || 'none') === 'pending',
            status: session.pendingNavigationStatus || 'none',
            googlePageIndex: Number(session.googlePageIndex || 1),
        },
        recentRawCaptures: enrichedRecent,
        sessionUiLabel: SESSION_UI_LABELS[session.status] || session.status,
        sessionEnded: ended,
        sessionEndedMessage: ended && !handedOff ? 'Session ended. Start a new search.' : null,
        campaignActive: !ended,
        ownerErrorMessage: session.status === 'failed'
            ? (session.failMessage || 'Google opening failed. Click Retry to start a new search.')
            : null,
        canRetry: session.status === 'failed',
        campaignProgress,
        autoCollection,
        autoCollectionSessionId,
        autoCollectionSelectedQuery,
        autoProcessing,
        captureStats: {
            visibleResultCount: Number(session.visibleResultCount || 0),
            acceptedCount: Number(session.acceptedCount || 0),
            insertedCount: Number(session.insertedCount || 0),
            updatedExistingCount: Number(session.updatedExistingCount || 0),
            rejectedCount: Number(session.rejectedCount || 0),
            uniqueResultCount: uniqueFresh,
            sessionUniqueResultCount: uniqueResultCount,
            captureEventCount: Number(session.captureEventCount || session.totalEvents || 0),
            googlePageIndex: Number(session.googlePageIndex || 1),
            stageARelevant: stageA.relevant,
            stageAPossibleMatch: stageA.possible_match,
            stageARejected: stageA.rejected,
            stageAReviewRequired: stageA.review_required,
            unwantedRejectedCount: stageA.rejected,
            possibleMatchCount: stageA.possible_match + stageA.review_required,
            note: 'Accepted counts are result appearances; Unique is campaign unique RawCapture records.',
        },
    };
}

export async function listSessionRawCaptures({ companyId, user, sessionId, query = {} }) {
    const cid = requireCompanyId(companyId);
    assertAssistedCaptureView(user);
    if (
        !checkUserPermission(user, 'data_extractor.raw_capture.view')
        && !checkUserPermission(user, 'data_extractor.raw_capture.manage')
    ) {
        throw new ApiError(403, 'Permission denied: data_extractor.raw_capture.view required');
    }
    requireObjectId(sessionId, 'Assisted capture session');

    const session = await AssistedCaptureSession.findOne({ _id: sessionId, companyId: cid }).lean();
    if (!session) throw new ApiError(404, 'Assisted capture session not found');

    const limit = Math.min(100, Math.max(1, Number(query.limit) || 50));
    const page = Math.max(1, Number(query.page) || 1);
    const skip = (page - 1) * limit;

    const batchIds = Array.isArray(session.rawCaptureBatchIds) ? session.rawCaptureBatchIds : [];
    // Campaign-wide listing so multi-query unique results remain visible after Open Next Query
    const mongo = {
        companyId: cid,
        campaignId: session.campaignId,
    };
    void batchIds;

    const [items, total] = await Promise.all([
        RawCapture.find(mongo).sort({ lastSeenAt: -1 }).skip(skip).limit(limit).lean(),
        RawCapture.countDocuments(mongo),
    ]);

    return {
        items: items.map(attachStageA),
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.max(1, Math.ceil(total / limit)),
        },
        sessionId: String(sessionId),
        stageASummary: summarizeStageA(items),
    };
}

async function loadOwnedSession(companyId, sessionId) {
    requireObjectId(sessionId, 'Assisted capture session');
    const session = await AssistedCaptureSession.findOne({ _id: sessionId, companyId }).lean();
    if (!session) throw new ApiError(404, 'Assisted capture session not found');
    return session;
}

export async function stopSimpleLeadSearch({ companyId, user, sessionId }) {
    const cid = requireCompanyId(companyId);
    await loadOwnedSession(cid, sessionId);
    const { ownerStopPersistentRun } = await import('./simpleLeadSearch.autoCollection.service.js');
    const stopped = await ownerStopPersistentRun({ companyId: cid, user, sessionId, reason: 'owner_stop' });
    return {
        session: stopped.session,
        autoCollection: stopped.autoCollection,
        campaignProgress: stopped.campaignProgress,
        sessionEnded: true,
        alreadyStopped: Boolean(stopped.alreadyStopped),
        sessionEndedMessage: stopped.alreadyStopped
            ? 'Search is already stopped.'
            : (stopped.sessionEndedMessage || 'STOPPED BY USER. Start a new search.'),
        message: stopped.message,
        preserved: stopped.preserved || {
            rawCaptures: true,
            campaign: true,
            searchQuery: true,
            sessionHistory: true,
        },
    };
}

export async function continueSimpleLeadSearchAfterManual({ companyId, user, sessionId }) {
    const cid = requireCompanyId(companyId);
    const session = await loadOwnedSession(cid, sessionId);
    if (session.status === 'cancelled' || session.autoCollection?.ownerStoppedAt || session.autoCollection?.stopRequested) {
        throw new ApiError(400, 'STOPPED BY USER. This search will not resume. Start a new search.');
    }
    const updated = await continueAfterManualAction({
        companyId: cid,
        user,
        campaignId: session.campaignId,
        queryId: session.queryId,
        sessionId,
    });
    return {
        session: updated,
        sessionUiLabel: SESSION_UI_LABELS[updated.status] || updated.status,
        message: 'Manual action acknowledged. Click Capture Visible Results when the Google results page is ready.',
    };
}

export async function completeSimpleLeadSearch({ companyId, user, sessionId }) {
    const cid = requireCompanyId(companyId);
    const session = await loadOwnedSession(cid, sessionId);
    const updated = await completeAssistedCaptureSessionByUser({
        companyId: cid,
        user,
        campaignId: session.campaignId,
        queryId: session.queryId,
        sessionId,
    });
    return {
        session: updated,
        sessionEnded: true,
        sessionEndedMessage: 'Session ended. Start a new search.',
    };
}

async function collectExportContext(companyId, sessionId) {
    const session = await loadOwnedSession(companyId, sessionId);
    const batchIds = Array.isArray(session.rawCaptureBatchIds) ? session.rawCaptureBatchIds : [];
    const mongo = { companyId, campaignId: session.campaignId };
    if (batchIds.length) mongo.captureBatchId = { $in: batchIds };
    else mongo.queryId = session.queryId;

    const [records, campaign, query] = await Promise.all([
        RawCapture.find(mongo).sort({ lastSeenAt: -1 }).limit(5000).lean(),
        SearchCampaign.findOne({ _id: session.campaignId, companyId }).lean(),
        SearchQuery.findOne({ _id: session.queryId, companyId }).lean(),
    ]);

    const queryIds = [...new Set(records.map((r) => String(r.queryId || '')).filter(Boolean))];
    const queries = queryIds.length
        ? await SearchQuery.find({ _id: { $in: queryIds }, companyId }).select('_id queryText selectedCriteria').lean()
        : [];
    const queryTextById = {};
    const queryMetaById = {};
    for (const q of queries) {
        queryTextById[String(q._id)] = q.queryText || '';
        queryMetaById[String(q._id)] = {
            businessType: q.selectedCriteria?.businessType || '',
            relatedKeyword: q.selectedCriteria?.relatedKeyword || '',
            locationScope: q.selectedCriteria?.locationScope || '',
            locationLabel: q.selectedCriteria?.locationLabel || '',
            queryLanguage: q.selectedCriteria?.queryLanguage || 'en',
            sourcePlatform: q.selectedCriteria?.sourcePlatform || 'google',
        };
    }

    return {
        session,
        records,
        campaign,
        query,
        queryTextById,
        queryMetaById,
        summary: {
            campaignName: campaign?.name || '',
            queryText: query?.queryText || '',
            sessionStatus: session.status,
            visibleResultCount: session.visibleResultCount || 0,
            acceptedCount: session.acceptedCount || 0,
            insertedCount: session.insertedCount || 0,
            updatedExistingCount: session.updatedExistingCount || 0,
            rejectedCount: session.rejectedCount || 0,
            captureEventCount: session.captureEventCount || session.totalEvents || 0,
        },
    };
}

export async function exportSimpleLeadSearchResults({ companyId, user, sessionId }) {
    const cid = requireCompanyId(companyId);
    assertAssistedCaptureView(user);
    if (
        !checkUserPermission(user, 'data_extractor.raw_capture.view')
        && !checkUserPermission(user, 'data_extractor.raw_capture.manage')
    ) {
        throw new ApiError(403, 'Permission denied: data_extractor.raw_capture.view required');
    }

    const ctx = await collectExportContext(cid, sessionId);
    const buffer = await buildUnverifiedRawCaptureWorkbook({
        records: ctx.records,
        summary: ctx.summary,
        queryTextById: ctx.queryTextById,
        queryMetaById: ctx.queryMetaById,
        campaign: ctx.campaign || {},
    });
    const safeName = String(ctx.summary.campaignName || 'simple-lead-search')
        .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
        .slice(0, 80);
    return {
        buffer,
        filename: `${safeName}-unverified-${Date.now()}.xlsx`,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        rowCount: ctx.records.length,
    };
}

export async function stopAndExportSimpleLeadSearch({ companyId, user, sessionId }) {
    const stopped = await stopSimpleLeadSearch({ companyId, user, sessionId });
    const exported = await exportSimpleLeadSearchResults({ companyId, user, sessionId });
    return { ...exported, session: stopped.session, sessionEndedMessage: stopped.sessionEndedMessage };
}

export async function getAgentStatus({ companyId, user, sessionId }) {
    requireCompanyId(companyId);
    assertAssistedCaptureView(user);
    return getAgentStatusForCompany(companyId, { sessionId });
}
