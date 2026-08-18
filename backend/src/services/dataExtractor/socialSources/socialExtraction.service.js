import crypto from 'crypto';
import mongoose from 'mongoose';
import { SearchCampaign } from '../../../models/searchCampaign.model.js';
import { ApiError } from '../../../utils/ApiError.js';
import { checkUserPermission } from '../../../utils/permissionUtils.js';
import { ingestRawCaptures } from '../searchCampaign/rawCapture/rawCapture.ingestion.service.js';
import { ensureSimpleLeadSearchQuery } from '../searchCampaign/searchQuery/searchQuery.service.js';
import { createAssistedCaptureSession } from '../searchCampaign/assistedCapture/session.service.js';
import { normalizeNameForIndex } from '../searchCampaign/normalize.util.js';
import { discoverFacebookPublic, discoverInstagramPublic } from './publicSearch.adapter.js';
import { connectSocialLogin, disconnectSocialLogin, getSocialLoginStatus, discoverWithDirectLogin } from './directLogin.adapter.js';
import {
    FACEBOOK_MODES,
    FACEBOOK_SEARCH_TYPES,
    INSTAGRAM_MODES,
    INSTAGRAM_SEARCH_TYPES,
    officialApiStatus,
} from './constants.js';
import { isSocialSessionIsolatedFromWhatsApp } from './sessionStore.util.js';

function actorId(user) {
    return user?._id || user?.id || null;
}

function assertCanExtract(user) {
    if (
        checkUserPermission(user, 'data_extractor.assisted_capture.start')
        || checkUserPermission(user, 'data_extractor.search_campaign.manage')
        || checkUserPermission(user, 'data_extractor.extractor.search')
    ) {
        return;
    }
    throw new ApiError(403, 'Permission denied: cannot start Facebook/Instagram extraction');
}

export function getSocialSourceStatus({ platform, companyId }) {
    const login = getSocialLoginStatus({ platform, companyId });
    const api = officialApiStatus(platform);
    return {
        platform,
        publicSearch: { available: true, status: 'connected', message: 'Uses public web discovery (DuckDuckGo/Bing). No Facebook/Instagram login.' },
        directLogin: {
            status: login.status,
            connectedAt: login.connectedAt,
            note: login.note,
            isolatedFromWhatsApp: isSocialSessionIsolatedFromWhatsApp(),
        },
        officialApi: api,
        limitations: platform === 'facebook'
            ? ['Facebook Groups API / group member permissions were deprecated from Graph API v19 (22 Apr 2024). Group Intelligence only uses information visible to the authenticated session — it does not enumerate every member.']
            : ['Instagram Login API is for professional accounts. Follower dumps and group chats are not used as bulk lead sources.'],
    };
}

async function ensureSocialCampaign({ companyId, user, platform, keyword, city }) {
    const name = `${platform === 'instagram' ? 'Instagram' : 'Facebook'} · ${keyword}${city ? ` · ${city}` : ''}`;
    const nameNormalized = normalizeNameForIndex(name);
    let campaign = await SearchCampaign.findOne({
        companyId,
        nameNormalized,
        status: { $in: ['draft', 'active', 'paused'] },
    }).lean();
    if (!campaign) {
        campaign = (await SearchCampaign.create({
            name,
            nameNormalized,
            targetIndustry: keyword,
            targetProducts: [keyword],
            includeKeywords: [keyword],
            city: city || '',
            sources: [platform],
            selectedSources: [platform],
            minimumQualificationScore: 60,
            companyId,
            status: 'active',
            createdBy: actorId(user),
            updatedBy: actorId(user),
        })).toObject();
    }
    return campaign;
}

async function discover({ platform, mode, keyword, location, searchType, companyId, maxResults }) {
    if (mode === 'official_api') {
        const api = officialApiStatus(platform);
        if (!api.configured) {
            return { records: [], errors: [api.message], queries: [] };
        }
        return { records: [], errors: ['Official API mode is configured but limited. Use Public Search or Direct Login for discovery. Group/follower dumps are not implemented.'], queries: [] };
    }
    if (mode === 'direct_login') {
        return discoverWithDirectLogin({ platform, companyId, keyword, location, searchType, maxResults });
    }
    if (platform === 'instagram') {
        return discoverInstagramPublic({ keyword, location, searchType, maxResults });
    }
    return discoverFacebookPublic({ keyword, location, searchType, maxResults });
}

export async function startSocialExtraction({
    companyId,
    user,
    headers = {},
    platform,
    mode,
    keyword,
    location = '',
    searchType,
    maxResults = 20,
}) {
    assertCanExtract(user);
    const p = platform === 'instagram' ? 'instagram' : 'facebook';
    const m = String(mode || 'public_search');
    const allowedModes = p === 'instagram' ? INSTAGRAM_MODES : FACEBOOK_MODES;
    if (!allowedModes.includes(m)) throw new ApiError(400, 'Invalid extraction mode');
    const types = p === 'instagram' ? INSTAGRAM_SEARCH_TYPES : FACEBOOK_SEARCH_TYPES;
    const st = String(searchType || (p === 'instagram' ? 'business_profiles' : 'pages'));
    if (!types.includes(st)) throw new ApiError(400, 'Invalid search type');
    const kw = String(keyword || '').trim();
    if (kw.length < 2) throw new ApiError(400, 'Keyword is required');

    const found = await discover({
        platform: p,
        mode: m,
        keyword: kw,
        location,
        searchType: st,
        companyId,
        maxResults: Math.min(40, Math.max(5, Number(maxResults) || 20)),
    });

    if (!found.records.length) {
        return {
            ingested: 0,
            records: [],
            errors: found.errors.length ? found.errors : ['No public matches for this keyword. Direct Login may be required for additional results.'],
            queries: found.queries || [],
            processingUrl: '',
            sessionId: '',
            campaignId: '',
            note: 'Nothing was sent to Processing because no candidates were found.',
        };
    }

    const campaign = await ensureSocialCampaign({ companyId, user, platform: p, keyword: kw, city: location });
    const query = await ensureSimpleLeadSearchQuery({
        companyId,
        user,
        campaignId: campaign._id,
        queryText: `${kw}${location ? ` ${location}` : ''}`.trim(),
        sourceHint: p,
        priorityScore: 100,
        selectedCriteria: { socialMode: m, socialSearchType: st },
    });

    const ingest = await ingestRawCaptures({
        companyId,
        user,
        campaignId: campaign._id,
        body: {
            queryId: String(query._id),
            source: p,
            querySourceHint: p,
            captureMethod: m === 'direct_login' ? 'assisted_visible' : 'api_batch',
            idempotencyKey: `social-${p}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
            records: found.records.slice(0, 100),
        },
    });

    const sessionWrap = await createAssistedCaptureSession({
        companyId,
        user,
        campaignId: campaign._id,
        queryId: query._id,
        body: { sourceHint: p, financialYear: headers['x-financial-year'] || '' },
        headers,
    });

    return {
        ingested: ingest?.acceptedCount ?? found.records.length,
        batch: ingest?.batch || null,
        records: found.records,
        errors: found.errors || [],
        queries: found.queries || [],
        campaignId: String(campaign._id),
        queryId: String(query._id),
        sessionId: String(sessionWrap.session?._id || ''),
        processingUrl: sessionWrap.session?._id ? `/data-extractor/runs/${sessionWrap.session._id}` : '/data-extractor/simple-lead-search',
        note: 'Candidates were ingested into the existing Processing → Verified Data pipeline. Open Processing to enrich, qualify, verify, export, or Convert to Lead. Highly Relevant is never auto-converted.',
        limitations: getSocialSourceStatus({ platform: p, companyId }).limitations,
    };
}

export async function connectDirect({ companyId, user, platform }) {
    assertCanExtract(user);
    void mongoose;
    return connectSocialLogin({ platform, companyId });
}

export async function disconnectDirect({ companyId, user, platform }) {
    assertCanExtract(user);
    return disconnectSocialLogin({ platform, companyId });
}
