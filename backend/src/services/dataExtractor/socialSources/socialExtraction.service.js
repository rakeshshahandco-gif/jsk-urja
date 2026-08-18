import crypto from 'crypto';
import mongoose from 'mongoose';
import { SearchCampaign } from '../../../models/searchCampaign.model.js';
import { ApiError } from '../../../utils/ApiError.js';
import { checkUserPermission } from '../../../utils/permissionUtils.js';
import { ingestRawCaptures } from '../searchCampaign/rawCapture/rawCapture.ingestion.service.js';
import { ensureSimpleLeadSearchQuery } from '../searchCampaign/searchQuery/searchQuery.service.js';
import { createAssistedCaptureSession } from '../searchCampaign/assistedCapture/session.service.js';
import { normalizeNameForIndex } from '../searchCampaign/normalize.util.js';
import { enrichDomainFromWebsite } from '../searchCampaign/rawCaptureEnrichment/fetch.util.js';
import { fetchPublicHtml } from '../searchCampaign/chinaWebsiteCrawler/safeFetch.util.js';
import { parsePageBundle } from '../searchCampaign/rawCaptureEnrichment/parse.util.js';
import { discoverFacebookPublic, discoverInstagramPublic, discoverLinkedInPublic, discoverXPublic } from './publicSearch.adapter.js';
import { connectSocialLogin, disconnectSocialLogin, getSocialLoginStatus, discoverWithDirectLogin } from './directLogin.adapter.js';
import { isExternalBusinessWebsite } from './directLogin.quality.util.js';
import {
    FACEBOOK_MODES,
    FACEBOOK_SEARCH_TYPES,
    INSTAGRAM_MODES,
    INSTAGRAM_SEARCH_TYPES,
    LINKEDIN_MODES,
    LINKEDIN_SEARCH_TYPES,
    X_MODES,
    X_SEARCH_TYPES,
    officialApiStatus,
} from './constants.js';
import { isSocialSessionIsolatedFromWhatsApp } from './sessionStore.util.js';
import { buildPublicUrlTestCandidate, PUBLIC_URL_TEST_MODE } from './linkedinX.publicUrl.util.js';

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
    throw new ApiError(403, 'Permission denied: cannot start social source extraction');
}

function normalizeExtractPlatform(platform) {
    const p = String(platform || '').toLowerCase() === 'twitter' ? 'x' : String(platform || '').toLowerCase();
    if (!['facebook', 'instagram', 'linkedin', 'x'].includes(p)) {
        throw new ApiError(400, 'Unsupported social platform');
    }
    return p;
}

function platformLabel(platform) {
    return { facebook: 'Facebook', instagram: 'Instagram', linkedin: 'LinkedIn', x: 'X' }[platform] || platform;
}

function modesFor(platform) {
    if (platform === 'instagram') return INSTAGRAM_MODES;
    if (platform === 'linkedin') return LINKEDIN_MODES;
    if (platform === 'x') return X_MODES;
    return FACEBOOK_MODES;
}

function typesFor(platform) {
    if (platform === 'instagram') return INSTAGRAM_SEARCH_TYPES;
    if (platform === 'linkedin') return LINKEDIN_SEARCH_TYPES;
    if (platform === 'x') return X_SEARCH_TYPES;
    return FACEBOOK_SEARCH_TYPES;
}

function defaultSearchType(platform) {
    if (platform === 'instagram') return 'business_profiles';
    if (platform === 'linkedin') return 'companies';
    if (platform === 'x') return 'profiles';
    return 'pages';
}

export function getSocialSourceStatus({ platform, companyId }) {
    const p = normalizeExtractPlatform(platform);
    const login = getSocialLoginStatus({ platform: p, companyId });
    const api = officialApiStatus(p);
    const limitations = {
        facebook: ['Facebook Groups API / group member permissions were deprecated from Graph API v19 (22 Apr 2024). Group Intelligence only uses information visible to the authenticated session — it does not enumerate every member.'],
        instagram: ['Instagram Login API is for professional accounts. Follower dumps and group chats are not used as bulk lead sources.'],
        linkedin: ['LinkedIn is used for company and professional discovery. Private emails, mobile numbers, and hidden connections are not extracted. Company websites are preferred for contact enrichment.'],
        x: ['X posts are treated as evidence for the author/business account, not as separate CRM companies. System routes such as /home and /explore are rejected.'],
    };
    return {
        platform: p,
        publicSearch: { available: true, status: 'connected', message: `Uses public web discovery (DuckDuckGo/Bing). No ${platformLabel(p)} login.` },
        directLogin: {
            status: login.status,
            connectedAt: login.connectedAt,
            note: login.note,
            isolatedFromWhatsApp: isSocialSessionIsolatedFromWhatsApp(),
        },
        officialApi: api,
        limitations: limitations[p] || [],
    };
}

async function ensureSocialCampaign({ companyId, user, platform, keyword, city }) {
    const name = `${platformLabel(platform)} · ${keyword}${city ? ` · ${city}` : ''}`;
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

function flattenContact(list = []) {
    return (list || []).map((x) => {
        if (typeof x === 'string') return x;
        return x?.value || x?.email || x?.raw || x?.original || x?.normalized || '';
    }).filter(Boolean);
}

function websiteFromRecord(rec = {}) {
    if (rec.website && isExternalBusinessWebsite(rec.website)) return rec.website;
    const m = String(rec.notes || '').match(/website=(https?:\/\/[^\s;]+)/i);
    return m && isExternalBusinessWebsite(m[1]) ? m[1] : '';
}

function toIngestRecords(records = []) {
    return records.map((rec) => ({
        title: rec.title,
        snippet: rec.snippet,
        resultUrl: rec.resultUrl,
        resultTypeHint: rec.resultTypeHint,
        sourceRecordId: rec.sourceRecordId,
        notes: rec.notes,
    }));
}

/**
 * If Facebook/Instagram exposed an external company website, run the existing
 * Phase 1 website crawler against that domain (not the social HTML).
 */
async function bridgeCompanyWebsites(records = []) {
    let bridged = 0;
    for (const rec of records) {
        const site = websiteFromRecord(rec);
        if (!site) continue;
        if (bridged >= 5) break;
        bridged += 1;
        let crawled = null;
        try {
            crawled = await enrichDomainFromWebsite(site, { maxPages: 4 });
        } catch (err) {
            crawled = { ok: false, error: String(err?.message || err) };
        }
        if (!crawled?.ok) {
            try {
                const fetched = await fetchPublicHtml(site);
                if (fetched.ok) {
                    crawled = {
                        ok: true,
                        data: parsePageBundle(fetched.html, fetched.finalUrl || site),
                        pagesVisited: [fetched.finalUrl || site],
                    };
                }
            } catch {
                /* keep failed crawl */
            }
        }
        if (crawled?.ok && crawled.data) {
            const emails = flattenContact(crawled.data.emails).slice(0, 3);
            const phones = flattenContact(crawled.data.phones).slice(0, 3);
            const city = crawled.data.city || '';
            rec.snippet = `${rec.snippet || ''} Website crawl (${site}): ${emails.join(', ')} ${phones.join(', ')} ${city}`.trim().slice(0, 2000);
            rec.notes = `${rec.notes || ''}; websiteCrawl=ok${emails.length ? `; emails=${emails.join(',')}` : ''}${phones.length ? `; phones=${phones.join(',')}` : ''}${city ? `; city=${city}` : ''}`.slice(0, 2000);
        } else {
            rec.notes = `${rec.notes || ''}; websiteCrawl=failed`.slice(0, 2000);
        }
    }
    return records;
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
    if (platform === 'linkedin') {
        return discoverLinkedInPublic({ keyword, location, searchType, maxResults });
    }
    if (platform === 'x') {
        return discoverXPublic({ keyword, location, searchType, maxResults });
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
    const p = normalizeExtractPlatform(platform);
    const m = String(mode || 'public_search');
    const allowedModes = modesFor(p);
    if (!allowedModes.includes(m)) throw new ApiError(400, 'Invalid extraction mode');
    const types = typesFor(p);
    const st = String(searchType || defaultSearchType(p));
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

    if (m === 'direct_login' && found.records.length) {
        await bridgeCompanyWebsites(found.records);
    }

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
            groupMeta: found.groupMeta || null,
            metrics: found.metrics || null,
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
            records: toIngestRecords(found.records).slice(0, 100),
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
        groupMeta: found.groupMeta || null,
        metrics: found.metrics || null,
    };
}

export async function ingestPublicSocialUrl({
    companyId,
    user,
    headers = {},
    platform,
    publicUrl,
    website = '',
    keyword = '',
    location = '',
    title = '',
    snippet = '',
    testOnly,
}) {
    assertCanExtract(user);
    const p = normalizeExtractPlatform(platform);
    if (p !== 'linkedin' && p !== 'x') {
        throw new ApiError(400, 'Test Public URL is only available for LinkedIn and X');
    }
    const rec = buildPublicUrlTestCandidate({
        platform: p,
        publicUrl,
        website,
        keyword: keyword || (p === 'linkedin' ? 'Home Automation' : 'Phase4CFixture'),
        location: location || (p === 'linkedin' ? 'Mumbai' : ''),
        title,
        snippet,
        testOnly,
    });
    if (rec.website) {
        await bridgeCompanyWebsites([rec]);
    }

    const kw = rec.notes.match(/keyword=([^;]+)/)?.[1] || (p === 'linkedin' ? 'Home Automation' : 'Phase4CFixture');
    const loc = rec.notes.match(/location=([^;]+)/)?.[1] || '';
    const campaign = await ensureSocialCampaign({ companyId, user, platform: p, keyword: kw, city: loc });
    const query = await ensureSimpleLeadSearchQuery({
        companyId,
        user,
        campaignId: campaign._id,
        queryText: `${kw}${loc ? ` ${loc}` : ''}`.trim(),
        sourceHint: p,
        priorityScore: 100,
        selectedCriteria: { socialMode: PUBLIC_URL_TEST_MODE, socialSearchType: rec.resultTypeHint },
    });

    const ingest = await ingestRawCaptures({
        companyId,
        user,
        campaignId: campaign._id,
        body: {
            queryId: String(query._id),
            source: p,
            querySourceHint: p,
            captureMethod: 'manual_url',
            idempotencyKey: `social-${p}-urltest-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
            records: toIngestRecords([rec]),
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
        ingested: ingest?.acceptedCount ?? 1,
        insertedCount: ingest?.insertedCount ?? 0,
        updatedExistingCount: ingest?.updatedExistingCount ?? 0,
        duplicate: Number(ingest?.insertedCount || 0) === 0 && Number(ingest?.acceptedCount || 0) > 0,
        batch: ingest || null,
        records: [rec],
        campaignId: String(campaign._id),
        queryId: String(query._id),
        sessionId: String(sessionWrap.session?._id || ''),
        processingUrl: sessionWrap.session?._id ? `/data-extractor/runs/${sessionWrap.session._id}` : '/data-extractor/simple-lead-search',
        mode: PUBLIC_URL_TEST_MODE,
        testOnly: rec.testOnly === true,
        note: rec.testOnly
            ? 'Test-only fixture was sent to existing Processing. It is not a genuine business record and must not be verified as genuine.'
            : 'Public URL candidate was sent to the existing Processing → Verified Data pipeline. Direct Login remains not validated. Convert to Lead stays manual.',
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
