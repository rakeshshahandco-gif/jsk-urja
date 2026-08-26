import crypto from 'crypto';
import mongoose from 'mongoose';
import ExcelJS from 'exceljs';
import { SearchCampaign } from '../../../models/searchCampaign.model.js';
import { RawCapture } from '../../../models/rawCapture.model.js';
import { ExtractorCompanyIdentity } from '../../../models/extractorCompanyIdentity.model.js';
import { AssistedCaptureSession } from '../../../models/assistedCaptureSession.model.js';
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
import { connectSocialLogin, disconnectSocialLogin, getSocialLoginStatus, discoverWithDirectLogin, verifyExactFacebookGroup } from './directLogin.adapter.js';
import { isExternalBusinessWebsite } from './directLogin.quality.util.js';
import {
    EXPORT_HEADERS,
    exportRowFromPresented,
    presentSocialCapture,
    pickIdentityForCapture,
} from './socialCaptureDisplay.util.js';
import {
    mergeWebsiteIntoStoredNotes,
    stampInstagramWebsiteOnCandidate,
    websiteFromInstagramCapture,
} from './instagramWebsiteBridge.util.js';
import { enrichCapturesNow } from '../searchCampaign/rawCaptureEnrichment/rawCaptureEnrichment.service.js';
import { RawCaptureEnrichment } from '../../../models/rawCaptureEnrichment.model.js';
import {
    INSTAGRAM_BATCH_SIZE,
    INSTAGRAM_INGEST_CHUNK,
    INSTAGRAM_STOP_REASONS,
    instagramCaptureKey,
    splitIntoBatches,
    summarizeInstagramRun,
} from './instagramBatch.util.js';
import {
    beginInstagramExtract,
    endInstagramExtract,
    requestInstagramExtractStop,
} from './instagramExtractControl.util.js';
import {
    FACEBOOK_COMMUNITY_BATCH_SIZE,
    FACEBOOK_COMMUNITY_SEARCH_TYPES,
    FACEBOOK_STOP_REASONS,
    facebookCaptureKey,
    facebookGroupIdFromUrl,
    normalizeFacebookGroupUrl,
    parseExactFacebookGroupSeek,
    canonicalFacebookGroupFromInput,
    presentExactFacebookGroupLookup,
    shapeExactFacebookGroupLookupResponse,
    presentFacebookCommunityRow,
    presentFacebookGroupSearchRow,
    splitIntoBatches as splitFacebookBatches,
    summarizeFacebookCommunityRun,
} from './facebookCommunity.util.js';
import {
    FACEBOOK_MEMBER_DISCOVERY_BATCH,
    FACEBOOK_MEMBER_REVIEW_BATCH,
    FACEBOOK_MEMBER_COLLECTOR_MODES,
    campaignNameForFacebookGroup,
    campaignStateFromStop,
    emptyFacebookMemberCheckpoint,
    mergeFacebookMemberCheckpoint,
    notesHaveGroupUrl,
    FACEBOOK_MEMBER_EXPORT_HEADERS,
    exportFacebookMemberRow,
} from './facebookMemberCollector.util.js';
import {
    beginFacebookExtract,
    beginFacebookGroupSearch,
    endFacebookExtract,
    endFacebookGroupSearch,
    getFacebookExtractProgress,
    getFacebookGroupSearchProgress,
    isFacebookExtractRunning,
    markFacebookGroupSearchMatch,
    publishFacebookGroupSearchRow,
    setFacebookGroupSearchStatus,
    pushFacebookActivity,
    setFacebookExtractUniqueAtStart,
    requestFacebookExtractPause,
    requestFacebookExtractStop,
    tryBeginFacebookExtract,
} from './facebookExtractControl.util.js';
import {
    FACEBOOK_AUTO_MAX_REVIEW_LOOPS,
    FACEBOOK_AUTO_MAX_TECHNICAL_RETRIES,
    FACEBOOK_AUTO_STAGES,
    FACEBOOK_AUTO_WEBSITE_ENRICH_BATCH,
    discoveryModeForAuto,
    duplicateAutoRunMessage,
    facebookAutoRetryDelayMs,
    isFullAutomaticCollectorMode,
    isReviewAllCollectorMode,
    isSameFacebookAutoLock,
    shouldAdvanceToReview,
    shouldContinueAutomaticDiscovery,
    shouldContinueAutomaticReview,
    shouldRetryTechnicalFailure,
} from './facebookAutoRunner.util.js';
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

function assertCanViewCaptures(user) {
    if (
        checkUserPermission(user, 'data_extractor.assisted_capture.view')
        || checkUserPermission(user, 'data_extractor.extractor.view')
        || checkUserPermission(user, 'data_extractor.raw_capture.view')
    ) {
        return;
    }
    throw new ApiError(403, 'Permission denied: cannot view social captures');
}

function escapeRegex(value = '') {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function socialCaptureMongo({ companyId, platform, keyword, location, campaignId, groupUrl = '', q = '', memberFilter = '' }) {
    const mongo = {
        companyId,
        source: platform,
        inboxStatus: { $ne: 'archived' },
    };
    if (campaignId && mongoose.isValidObjectId(campaignId)) {
        mongo.campaignId = campaignId;
    }
    const and = [];
    const kw = String(keyword || '').trim();
    if (kw) {
        const rx = new RegExp(escapeRegex(kw), 'i');
        and.push({
            $or: [
                { notes: new RegExp(`keyword=${escapeRegex(kw)}`, 'i') },
                { title: rx },
                { snippet: rx },
                { sourceRecordId: rx },
            ],
        });
    }
    const loc = String(location || '').trim();
    if (loc) {
        and.push({ notes: new RegExp(`location=${escapeRegex(loc)}`, 'i') });
    }
    const gurl = String(groupUrl || '').replace(/\/$/, '').trim();
    if (gurl) {
        const gid = facebookGroupIdFromUrl(gurl);
        and.push({
            $or: [
                { notes: new RegExp(`groupUrl=${escapeRegex(gurl)}`, 'i') },
                { notes: new RegExp(`parentUrl=${escapeRegex(gurl)}`, 'i') },
                ...(gid ? [{ notes: new RegExp(`parentGroupId=${escapeRegex(gid)}`, 'i') }] : []),
            ],
        });
    }
    const query = String(q || '').trim();
    if (query) {
        const rx = new RegExp(escapeRegex(query), 'i');
        and.push({
            $or: [
                { title: rx },
                { notes: rx },
                { resultUrlNormalized: rx },
                { resultUrlOriginal: rx },
                { snippet: rx },
            ],
        });
    }
    const mf = String(memberFilter || '').trim().toLowerCase();
    if (mf && mf !== 'all') {
        if (mf === 'discovered' || mf === 'pending_review' || mf === 'not_reviewed') {
            and.push({ notes: /reviewStatus=not_reviewed/i });
        } else if (mf === 'reviewed') {
            and.push({ notes: /reviewStatus=reviewed/i });
        } else if (mf === 'relevant') {
            and.push({ notes: /relevance=relevant(;|$)/i });
        } else if (mf === 'not_relevant') {
            and.push({ notes: /relevance=not_relevant/i });
        } else if (mf === 'contactable') {
            and.push({ $or: [{ notes: /(?:^|; )phone=/i }, { notes: /(?:^|; )whatsapp=/i }, { notes: /(?:^|; )email=/i }, { notes: /(?:^|; )website=/i }] });
        } else if (mf === 'phone') {
            and.push({ notes: /(?:^|; )phone=/i });
        } else if (mf === 'whatsapp') {
            and.push({ notes: /(?:^|; )whatsapp=/i });
        } else if (mf === 'email') {
            and.push({ notes: /(?:^|; )email=/i });
        } else if (mf === 'website') {
            and.push({ notes: /(?:^|; )website=/i });
        }
    }
    if (and.length) mongo.$and = and;
    return mongo;
}

async function attachPresentedCaptures(companyId, items = []) {
    const urls = [...new Set(items.map((c) => c.resultUrlNormalized || c.resultUrlOriginal).filter(Boolean))];
    const campaignIds = [...new Set(items.map((c) => c.campaignId).filter(Boolean))];
    const captureIds = items.map((c) => c._id).filter(Boolean);
    const [identities, sessions, enrichments] = await Promise.all([
        urls.length
            ? ExtractorCompanyIdentity.find({
                companyId,
                isDeleted: { $ne: true },
                $or: [
                    { 'social.instagramUrl': { $in: urls } },
                    { 'sourceRefs.sourceUrl': { $in: urls } },
                ],
            }).lean()
            : [],
        campaignIds.length
            ? AssistedCaptureSession.find({ companyId, campaignId: { $in: campaignIds } })
                .sort({ createdAt: -1 })
                .select('_id campaignId')
                .lean()
            : [],
        captureIds.length
            ? RawCaptureEnrichment.find({ companyId, rawCaptureIds: { $in: captureIds } }).lean()
            : [],
    ]);
    const sessionByCampaign = {};
    for (const session of sessions) {
        const key = String(session.campaignId);
        if (!sessionByCampaign[key]) sessionByCampaign[key] = String(session._id);
    }
    return items.map((capture) => presentSocialCapture(
        capture,
        pickIdentityForCapture(identities, capture),
        sessionByCampaign,
        enrichments.find((doc) => (doc.rawCaptureIds || []).some((id) => String(id) === String(capture._id))) || null,
    ));
}

/**
 * Read-only view of existing RawCapture rows for a social platform.
 * Page size is a page size only — it is not a total-result cap.
 */
export async function listSocialCaptures({
    companyId,
    user,
    platform,
    keyword = '',
    location = '',
    campaignId = '',
    groupUrl = '',
    page = 1,
    limit = 20,
    q = '',
    memberFilter = '',
}) {
    assertCanViewCaptures(user);
    const p = normalizeExtractPlatform(platform);
    const lim = Math.min(100, Math.max(1, Number(limit) || 20));
    const pg = Math.max(1, Number(page) || 1);
    const mongo = socialCaptureMongo({ companyId, platform: p, keyword, location, campaignId, groupUrl, q, memberFilter });
    const skip = (pg - 1) * lim;
    const [items, total] = await Promise.all([
        RawCapture.find(mongo).sort({ lastSeenAt: -1 }).skip(skip).limit(lim).lean(),
        RawCapture.countDocuments(mongo),
    ]);
    const results = await attachPresentedCaptures(companyId, items);
    if (p === 'facebook') {
        results.forEach((row, i) => {
            const fb = presentFacebookCommunityRow(items[i], null);
            fb.qualification = row.workflow?.qualificationLabel || fb.qualification;
            fb.verification = row.workflow?.verification || fb.verification;
            fb.crmStatus = row.workflow?.crm || fb.crmStatus;
            fb.aiScore = row.workflow?.qualificationLabel || fb.aiScore;
            row.facebookCommunity = fb;
        });
    }
    const reviewStats = (p === 'facebook' && groupUrl)
        ? await countFacebookGroupReviewStats({ companyId, groupUrl })
        : null;
    return {
        platform: p,
        results,
        reviewStats,
        pagination: {
            page: pg,
            limit: lim,
            total,
            totalPages: Math.max(1, Math.ceil((total || 0) / lim)),
        },
    };
}

const EXPORT_MAX = 10000;

export async function exportSocialCaptures({
    companyId,
    user,
    platform,
    keyword = '',
    location = '',
    campaignId = '',
    groupUrl = '',
    format = 'xlsx',
    scope = '',
}) {
    assertCanViewCaptures(user);
    const p = normalizeExtractPlatform(platform);
    const mongo = socialCaptureMongo({ companyId, platform: p, keyword, location, campaignId, groupUrl });
    if (p === 'facebook' && String(scope) === 'contactable') {
        mongo.$and = [...(mongo.$and || []), {
            $or: [
                { notes: /phone=\+?\d/i },
                { notes: /whatsapp=\+?\d/i },
                { notes: /email=[^\s;]+@/i },
            ],
        }];
    }
    const total = await RawCapture.countDocuments(mongo);
    const items = [];
    const pageSize = p === 'facebook' ? 500 : EXPORT_MAX;
    const hardMax = p === 'facebook' ? 100000 : EXPORT_MAX;
    for (let skip = 0; skip < hardMax; skip += pageSize) {
        const batch = await RawCapture.find(mongo).sort({ lastSeenAt: -1 }).skip(skip).limit(pageSize).lean();
        if (!batch.length) break;
        items.push(...batch);
        if (batch.length < pageSize) break;
    }
    const presented = await attachPresentedCaptures(companyId, items);
    const isFacebook = p === 'facebook';
    const headers = isFacebook ? FACEBOOK_MEMBER_EXPORT_HEADERS : EXPORT_HEADERS;
    const rows = presented.map((row) => (isFacebook ? exportFacebookMemberRow(row) : exportRowFromPresented(row)));
    const stamp = new Date().toISOString().slice(0, 10);
    const base = `${p}-captures-${stamp}`;
    const capped = total > items.length;
    if (format === 'csv') {
        const csvRows = rows.map((cols) => cols.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','));
        return {
            content: [headers.join(','), ...csvRows].join('\n'),
            contentType: 'text/csv; charset=utf-8',
            filename: `${base}.csv`,
            count: rows.length,
            total,
            capped,
        };
    }
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(isFacebook ? 'Facebook members' : 'Instagram captures');
    sheet.addRow(headers);
    rows.forEach((row) => sheet.addRow(row));
    const buffer = await workbook.xlsx.writeBuffer();
    return {
        content: buffer,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        filename: `${base}.xlsx`,
        count: rows.length,
        total,
        capped,
    };
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
        facebook: [
            'Facebook Groups API / group member permissions were deprecated from Graph API v19 (22 Apr 2024). Group Intelligence only uses information visible to the authenticated session — it does not enumerate every member.',
            'Page follower counts are not the same as extracted profiles. Follower lists are often not accessible; related pages and public engagement are used when visible.',
        ],
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

async function ensureSocialCampaign({ companyId, user, platform, keyword, city, groupUrl = '', groupName = '' }) {
    const name = groupUrl
        ? campaignNameForFacebookGroup({ groupName, groupUrl, keyword })
        : `${platformLabel(platform)} · ${keyword}${city ? ` · ${city}` : ''}`;
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
    return records.map((rec) => {
        const hint = String(rec.resultTypeHint || '').trim().toLowerCase();
        const notes = String(rec.notes || '');
        const groupUrl = normalizeFacebookGroupUrl(
            (notes.match(/groupUrl=([^;]+)/i) || [])[1]
            || (notes.match(/parentUrl=([^;]+)/i) || [])[1]
            || '',
        );
        const groupId = facebookGroupIdFromUrl(groupUrl);
        const extra = [
            notes,
            groupId && !/parentGroupId=/i.test(notes) ? `parentGroupId=${groupId}` : '',
            !/sourceKind=facebook_group_member/i.test(notes) ? 'sourceKind=facebook_group_member' : '',
        ].filter(Boolean).join('; ').slice(0, 2000);
        return {
            title: rec.title,
            snippet: rec.snippet,
            resultUrl: rec.resultUrl,
            resultTypeHint: hint === 'facebook_profile' ? 'facebook_profile' : (rec.resultTypeHint || 'unknown'),
            sourceRecordId: rec.sourceRecordId,
            notes: extra,
        };
    });
}

async function countPersistedFacebookGroupMembers({ companyId, groupUrl = '' }) {
    const mongo = socialCaptureMongo({
        companyId,
        platform: 'facebook',
        keyword: '',
        location: '',
        campaignId: '',
        groupUrl,
    });
    return RawCapture.countDocuments(mongo);
}

async function countFacebookGroupReviewStats({ companyId, groupUrl = '' }) {
    const mongo = socialCaptureMongo({
        companyId,
        platform: 'facebook',
        keyword: '',
        location: '',
        campaignId: '',
        groupUrl,
    });
    const [persisted, pending, reviewed, relevant, possibly, notRelevant, phones, emails, websites, whatsapp, contactable] = await Promise.all([
        RawCapture.countDocuments(mongo),
        RawCapture.countDocuments({ ...mongo, $and: [...(mongo.$and || []), { notes: /reviewStatus=not_reviewed/i }] }),
        RawCapture.countDocuments({ ...mongo, $and: [...(mongo.$and || []), { notes: /reviewStatus=reviewed/i }] }),
        RawCapture.countDocuments({ ...mongo, $and: [...(mongo.$and || []), { notes: /relevance=relevant(;|$)/i }] }),
        RawCapture.countDocuments({ ...mongo, $and: [...(mongo.$and || []), { notes: /relevance=possibly_relevant/i }] }),
        RawCapture.countDocuments({ ...mongo, $and: [...(mongo.$and || []), { notes: /relevance=not_relevant/i }] }),
        RawCapture.countDocuments({ ...mongo, $and: [...(mongo.$and || []), { notes: /(?:^|; )phone=/i }] }),
        RawCapture.countDocuments({ ...mongo, $and: [...(mongo.$and || []), { notes: /(?:^|; )email=/i }] }),
        RawCapture.countDocuments({ ...mongo, $and: [...(mongo.$and || []), { notes: /(?:^|; )website=https?:/i }] }),
        RawCapture.countDocuments({ ...mongo, $and: [...(mongo.$and || []), { notes: /(?:^|; )whatsapp=/i }] }),
        RawCapture.countDocuments({
            ...mongo,
            $and: [...(mongo.$and || []), {
                $or: [
                    { notes: /(?:^|; )phone=/i },
                    { notes: /(?:^|; )whatsapp=/i },
                    { notes: /(?:^|; )email=/i },
                    { notes: /(?:^|; )website=https?:/i },
                ],
            }],
        }),
    ]);
    return {
        persisted,
        pending,
        reviewed,
        relevant,
        possibly,
        notRelevant,
        phones,
        emails,
        websites,
        whatsapp,
        contactable,
    };
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
        return discoverInstagramPublic({ keyword, location, searchType });
    }
    if (platform === 'linkedin') {
        return discoverLinkedInPublic({ keyword, location, searchType, maxResults });
    }
    if (platform === 'x') {
        return discoverXPublic({ keyword, location, searchType, maxResults });
    }
    return discoverFacebookPublic({ keyword, location, searchType, maxResults });
}

async function loadInstagramSeenKeys({ companyId, keyword }) {
    const mongo = socialCaptureMongo({ companyId, platform: 'instagram', keyword, location: '', campaignId: '' });
    const rows = await RawCapture.find(mongo)
        .select('resultUrlNormalized resultUrlOriginal sourceRecordId')
        .lean();
    const seen = new Set();
    for (const row of rows) {
        const key = instagramCaptureKey(row);
        if (key) seen.add(key);
    }
    return seen;
}

async function countInstagramStored({ companyId, keyword, location = '' }) {
    const mongo = socialCaptureMongo({ companyId, platform: 'instagram', keyword, location, campaignId: '' });
    return RawCapture.countDocuments(mongo);
}

async function ingestInstagramBatches({
    companyId,
    user,
    campaign,
    query,
    headers,
    records,
    shouldStop,
    mode,
    alreadyIngested = [],
}) {
    const batchesMeta = [];
    const ingestedIds = [...alreadyIngested];
    let ingestedCount = 0;
    const chunks = splitIntoBatches(records, INSTAGRAM_BATCH_SIZE);
    for (const chunk of chunks) {
        if (shouldStop?.()) break;
        const ingest = await ingestRawCaptures({
            companyId,
            user,
            campaignId: campaign._id,
            body: {
                queryId: String(query._id),
                source: 'instagram',
                querySourceHint: 'instagram',
                captureMethod: mode === 'direct_login' ? 'assisted_visible' : 'api_batch',
                idempotencyKey: `social-instagram-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
                records: toIngestRecords(chunk.records).slice(0, INSTAGRAM_INGEST_CHUNK),
            },
        });
        ingestedCount += ingest?.acceptedCount ?? chunk.records.length;
        ingestedIds.push(...(ingest?.rawCaptureIds || []));
        batchesMeta.push({
            index: chunk.index,
            newCount: chunk.newCount,
            records: chunk.records,
        });
    }
    return { batchesMeta, ingestedCount, ingestedIds, stoppedEarly: Boolean(shouldStop?.()) };
}

async function runInstagramExtraction({
    companyId,
    user,
    headers = {},
    mode,
    keyword,
    location = '',
    searchType,
}) {
    const ctl = beginInstagramExtract(companyId);
    try {
        const seen = await loadInstagramSeenKeys({ companyId, keyword });
        const discoverOpts = {
            platform: 'instagram',
            companyId,
            keyword,
            location,
            searchType,
            seenKeys: seen,
            shouldStop: ctl.shouldStop,
            batchSize: INSTAGRAM_BATCH_SIZE,
        };
        const found = mode === 'direct_login'
            ? await discoverWithDirectLogin(discoverOpts)
            : await discoverInstagramPublic({
                keyword,
                location,
                searchType,
                seenKeys: seen,
                shouldStop: ctl.shouldStop,
            });

        if (keyword && found.records.length) {
            found.records.forEach(stampInstagramWebsiteOnCandidate);
        }

        const stopReason = found.stopReason
            || resolveStopFromFound(found, ctl.shouldStop());
        const alreadyKnown = Number(found.alreadyKnown || 0);

        if (!found.records.length) {
            const totalCaptured = await countInstagramStored({ companyId, keyword, location });
            return {
                ingested: 0,
                records: [],
                errors: found.errors?.length ? found.errors : ['No additional Instagram profiles were available for this keyword.'],
                queries: found.queries || [],
                processingUrl: '',
                sessionId: '',
                campaignId: '',
                note: 'Nothing new was sent to Processing.',
                groupMeta: found.groupMeta || null,
                metrics: found.metrics || null,
                instagramRun: summarizeInstagramRun({
                    batchSize: INSTAGRAM_BATCH_SIZE,
                    batches: [],
                    newThisRun: 0,
                    alreadyKnown,
                    totalCaptured,
                    stopReason: stopReason || INSTAGRAM_STOP_REASONS.SOURCE_EXHAUSTED,
                }),
            };
        }

        const campaign = await ensureSocialCampaign({ companyId, user, platform: 'instagram', keyword, city: location });
        const query = await ensureSimpleLeadSearchQuery({
            companyId,
            user,
            campaignId: campaign._id,
            queryText: `${keyword}${location ? ` ${location}` : ''}`.trim(),
            sourceHint: 'instagram',
            priorityScore: 100,
            selectedCriteria: { socialMode: mode, socialSearchType: searchType },
        });

        const ingestWrap = await ingestInstagramBatches({
            companyId,
            user,
            campaign,
            query,
            headers,
            records: found.records,
            shouldStop: ctl.shouldStop,
            mode,
        });
        const finalStop = ctl.shouldStop()
            ? INSTAGRAM_STOP_REASONS.USER_STOP
            : (stopReason || INSTAGRAM_STOP_REASONS.SOURCE_EXHAUSTED);

        const sessionWrap = await createAssistedCaptureSession({
            companyId,
            user,
            campaignId: campaign._id,
            queryId: query._id,
            body: { sourceHint: 'instagram', financialYear: headers['x-financial-year'] || '' },
            headers,
        });

        if ((ingestWrap.ingestedIds || []).length) {
            const sid = sessionWrap.session?._id || null;
            setImmediate(() => {
                enrichInstagramCapturedWebsites({
                    companyId,
                    user,
                    captureIds: ingestWrap.ingestedIds,
                    sessionId: sid,
                }).catch((err) => {
                    console.error('Instagram website enrichment failed', err?.message || err);
                });
            });
        }

        const totalCaptured = await countInstagramStored({ companyId, keyword, location });
        return {
            ingested: ingestWrap.ingestedCount,
            batch: null,
            records: found.records,
            errors: found.errors || [],
            queries: found.queries || [],
            campaignId: String(campaign._id),
            queryId: String(query._id),
            sessionId: String(sessionWrap.session?._id || ''),
            processingUrl: sessionWrap.session?._id ? `/data-extractor/runs/${sessionWrap.session._id}` : '/data-extractor/simple-lead-search',
            note: 'Candidates were ingested into the existing Processing → Verified Data pipeline. Open Processing to enrich, qualify, verify, export, or Convert to Lead. Highly Relevant is never auto-converted.',
            limitations: getSocialSourceStatus({ platform: 'instagram', companyId }).limitations,
            groupMeta: found.groupMeta || null,
            metrics: found.metrics || null,
            instagramRun: summarizeInstagramRun({
                batchSize: INSTAGRAM_BATCH_SIZE,
                batches: ingestWrap.batchesMeta,
                newThisRun: ingestWrap.ingestedCount,
                alreadyKnown,
                totalCaptured,
                stopReason: finalStop,
                lastBatchNew: ingestWrap.batchesMeta[ingestWrap.batchesMeta.length - 1]?.newCount || 0,
            }),
        };
    } finally {
        endInstagramExtract(companyId);
    }
}

function resolveStopFromFound(found, stopRequested) {
    if (stopRequested) return INSTAGRAM_STOP_REASONS.USER_STOP;
    if ((found.errors || []).some((e) => /session_expired/i.test(String(e)))) {
        return INSTAGRAM_STOP_REASONS.SESSION_EXPIRED;
    }
    if (found.metrics?.challenge) return INSTAGRAM_STOP_REASONS.SOURCE_SAFETY_PAUSE;
    if ((found.errors || []).some((e) => /failed|timeout|crash/i.test(String(e)))) {
        return INSTAGRAM_STOP_REASONS.TECHNICAL_FAILURE;
    }
    return INSTAGRAM_STOP_REASONS.SOURCE_EXHAUSTED;
}

export function stopInstagramExtraction({ companyId, user }) {
    assertCanExtract(user);
    return requestInstagramExtractStop(companyId);
}

export function stopFacebookExtraction({ companyId, user }) {
    assertCanExtract(user);
    return requestFacebookExtractStop(companyId);
}

export function pauseFacebookExtraction({ companyId, user }) {
    assertCanExtract(user);
    return requestFacebookExtractPause(companyId);
}

export function facebookExtractProgress({ companyId, user }) {
    assertCanViewCaptures(user);
    const live = getFacebookExtractProgress(companyId);
    const startedAt = live.startedAt || live.progress?.updatedAt || 0;
    const search = getFacebookGroupSearchProgress(companyId);
    return {
        ...live,
        runTimeMs: live.running && startedAt ? Date.now() - startedAt : 0,
        currentStage: live.progress?.currentStage || live.progress?.status || '',
        attentionRequired: Boolean(live.progress?.attentionRequired),
        groupSearch: search,
        activity: live.activity || search.activity || [],
    };
}

export async function getFacebookMemberCampaign({ companyId, user, groupUrl = '', keyword = '' }) {
    assertCanViewCaptures(user);
    const url = normalizeFacebookGroupUrl(groupUrl);
    const nameNormHint = url ? campaignNameForFacebookGroup({ groupUrl: url, keyword }) : '';
    let campaign = null;
    if (url) {
        campaign = await SearchCampaign.findOne({
            companyId,
            'facebookMemberCollector.groupUrl': url,
        }).lean();
        if (!campaign && nameNormHint) {
            campaign = await SearchCampaign.findOne({
                companyId,
                nameNormalized: normalizeNameForIndex(nameNormHint),
            }).lean();
        }
    }
    const live = getFacebookExtractProgress(companyId);
    const ck = campaign?.facebookMemberCollector || emptyFacebookMemberCheckpoint({ groupUrl: url });
    const stats = url ? await countFacebookGroupReviewStats({ companyId, groupUrl: url }) : null;
    const awaitingReview = stats ? stats.pending : 0;
    return {
        campaignId: campaign?._id ? String(campaign._id) : '',
        checkpoint: ck,
        awaitingReview,
        running: live.running,
        stopRequested: live.stopRequested,
        progress: live.progress,
        discoveryBatchSize: FACEBOOK_MEMBER_DISCOVERY_BATCH,
        reviewBatchSize: FACEBOOK_MEMBER_REVIEW_BATCH,
        campaignLabel: ck.groupName ? `Facebook Group — ${ck.groupName}` : 'Facebook Group',
        alreadyRunning: Boolean(live.running),
        attentionRequired: Boolean(live.progress?.attentionRequired),
        currentStage: live.progress?.currentStage || ck.campaignState || ck.status || '',
        summary: {
            displayedMembers: ck.displayedMemberCount || live.progress?.displayedMemberCount || '',
            uniqueDiscovered: stats ? stats.persisted : Number(ck.uniqueMembersCollected || 0),
            pendingReview: awaitingReview,
            reviewed: stats ? stats.reviewed : Number(ck.profilesReviewed || live.progress?.reviewed || 0),
            relevant: stats ? stats.relevant : Number(ck.relevant || live.progress?.relevant || 0),
            possiblyRelevant: stats ? stats.possibly : 0,
            notRelevant: stats ? stats.notRelevant : 0,
            contactable: stats ? stats.contactable : Number(ck.contactable || ck.newCompanies || 0),
            phones: stats ? stats.phones : Number(ck.phones || live.progress?.phones || 0),
            whatsapp: stats ? stats.whatsapp : Number(ck.whatsapp || live.progress?.whatsapp || 0),
            emails: stats ? stats.emails : Number(ck.emails || live.progress?.emails || 0),
            websites: stats ? stats.websites : Number(ck.websites || live.progress?.websites || 0),
            alreadyKnown: Number(ck.alreadyKnown || live.progress?.alreadyKnown || 0),
            newThisRun: Number(live.newThisRun || 0),
            currentBatch: Number(ck.currentBatch || live.progress?.currentBatch || 0),
            lastActivity: ck.lastSuccessfulAt || '',
            runTimeMs: live.running && live.startedAt ? Date.now() - live.startedAt : 0,
            currentStage: live.progress?.currentStage || ck.campaignState || '',
            status: live.progress?.status || ck.status || '',
            stopReason: ck.stopReason || live.progress?.stopReason || '',
        },
    };
}

export async function findFacebookGroups({
    companyId,
    user,
    keyword,
    location = '',
}) {
    assertCanExtract(user);
    const kw = String(keyword || '').trim();
    if (kw.length < 2) throw new ApiError(400, 'Keyword is required');
    const login = getSocialLoginStatus({ platform: 'facebook', companyId });
    beginFacebookGroupSearch(companyId, { kind: 'find', keyword: kw });
    let found;
    try {
        found = login.status === 'connected'
            ? await discoverWithDirectLogin({
                platform: 'facebook',
                companyId,
                keyword: kw,
                location,
                searchType: 'groups',
                maxResults: 40,
                onGroupFound: (rec) => publishFacebookGroupSearchRow(companyId, presentFacebookGroupSearchRow(rec)),
            })
            : await discoverFacebookPublic({ keyword: kw, location, searchType: 'groups', maxResults: 15 });
        for (const rec of found.records || []) {
            publishFacebookGroupSearchRow(companyId, presentFacebookGroupSearchRow(rec));
        }
    } finally {
        endFacebookGroupSearch(companyId, { keepRows: true });
    }
    const groups = (found.records || []).map((rec) => presentFacebookGroupSearchRow(rec)).filter((g) => g.groupUrl);
    return {
        groups,
        source: login.status === 'connected' ? 'direct_login' : 'public_search',
        errors: found.errors || [],
        metrics: found.metrics || null,
        note: groups.length
            ? 'Click Analyze Members on the exact group URL/ID. Same names stay separate. Paste is optional.'
            : (login.status === 'connected'
                ? 'No Facebook groups were visible for this keyword in the logged-in session. Try My Joined Groups.'
                : 'Direct Facebook Login is disconnected. Public web fallback ran; join status is Unknown. Connect to search logged-in Facebook groups.'),
    };
}

export async function listJoinedFacebookGroups({
    companyId,
    user,
    groupId = '',
    q = '',
}) {
    assertCanExtract(user);
    const login = getSocialLoginStatus({ platform: 'facebook', companyId });
    if (login.status !== 'connected') {
        throw new ApiError(400, 'Connect Direct Facebook Login first, then open My Joined Groups.');
    }
    const seekGroupId = parseExactFacebookGroupSeek(groupId) || parseExactFacebookGroupSeek(q);
    beginFacebookGroupSearch(companyId, { kind: 'joined', keyword: 'joined groups', seekGroupId });
    let found;
    try {
        found = await discoverWithDirectLogin({
            platform: 'facebook',
            companyId,
            keyword: 'joined groups',
            location: '',
            searchType: 'joined_groups',
            seekGroupId,
            onGroupFound: (rec) => publishFacebookGroupSearchRow(companyId, presentFacebookGroupSearchRow(rec)),
            onProgress: (patch = {}) => {
                if (patch.status) setFacebookGroupSearchStatus(companyId, patch.status);
                if (patch.exactFound && seekGroupId) markFacebookGroupSearchMatch(companyId, seekGroupId);
            },
        });
        for (const rec of found.records || []) {
            const row = presentFacebookGroupSearchRow(rec);
            publishFacebookGroupSearchRow(companyId, row);
            if (seekGroupId && row.groupId === seekGroupId) markFacebookGroupSearchMatch(companyId, seekGroupId);
        }
    } finally {
        endFacebookGroupSearch(companyId, { keepRows: true });
    }
    const groups = (found.records || []).map((rec) => presentFacebookGroupSearchRow(rec)).filter((g) => g.groupUrl);
    const matched = seekGroupId ? groups.find((g) => g.groupId === seekGroupId) : null;
    return {
        groups,
        matchedGroup: matched || null,
        seekGroupId,
        exactFound: Boolean(matched),
        inspected: groups.length,
        source: 'direct_login',
        errors: found.errors || [],
        metrics: found.metrics || null,
        note: matched
            ? 'Exact Group Found. Confirm the selected group, then press Run Full Group Automatically.'
            : (groups.length
                ? (seekGroupId
                    ? `Inspected ${groups.length} joined groups. Exact Group ID ${seekGroupId} was not among the groups Facebook exposed.`
                    : 'These are groups Facebook showed as joined/managed for this session. Click Select on the exact group ID.')
                : 'No joined groups were visible in this Facebook session.'),
    };
}

export async function lookupExactFacebookGroup({
    companyId,
    user,
    groupId = '',
    groupUrl = '',
    q = '',
}) {
    assertCanExtract(user);
    if (isFacebookExtractRunning(companyId)) {
        throw new ApiError(409, 'A Facebook collection is already running. Pause or stop it before Find Exact Group.');
    }
    const login = getSocialLoginStatus({ platform: 'facebook', companyId });
    if (login.status !== 'connected') {
        throw new ApiError(400, 'Connect Direct Facebook Login first, then Find Exact Group.');
    }
    const built = canonicalFacebookGroupFromInput(groupUrl || groupId || q);
    if (!built.groupUrl) {
        throw new ApiError(400, 'Enter a numeric Facebook Group ID or exact group URL.');
    }
    endFacebookGroupSearch(companyId, { keepRows: false });
    const found = await verifyExactFacebookGroup({ companyId, groupUrl: built.groupUrl });
    if (!found?.ok) {
        return shapeExactFacebookGroupLookupResponse({
            built,
            error: found?.error || 'Facebook page did not open.',
            attentionRequired: Boolean(found?.attentionRequired),
        });
    }
    const group = presentExactFacebookGroupLookup({
        requestedUrl: built.groupUrl,
        landing: found.landing || {},
    });
    if (group.groupId && built.groupId && String(group.groupId) !== String(built.groupId)) {
        return shapeExactFacebookGroupLookupResponse({
            built,
            error: 'Facebook opened a different page than the requested Group ID.',
        });
    }
    if (!group.ok) {
        return shapeExactFacebookGroupLookupResponse({
            built,
            error: 'The exact group page did not show a recognizable Facebook group.',
        });
    }
    return shapeExactFacebookGroupLookupResponse({ group, built });
}

async function loadFacebookSeenKeys({ companyId, keyword, groupUrl = '' }) {
    const mongo = socialCaptureMongo({ companyId, platform: 'facebook', keyword, location: '', campaignId: '' });
    const rows = await RawCapture.find(mongo).select('resultUrlNormalized resultUrlOriginal sourceRecordId notes').lean();
    const seen = new Set();
    const wantGroup = String(groupUrl || '').replace(/\/$/, '');
    for (const row of rows) {
        if (wantGroup && !notesHaveGroupUrl(row.notes, wantGroup)) continue;
        const key = facebookCaptureKey(row);
        if (key) seen.add(key);
    }
    return seen;
}

async function loadPendingFacebookMemberCards({
    companyId,
    keyword,
    groupUrl,
    limit = FACEBOOK_MEMBER_REVIEW_BATCH,
    reviewPriority = 'all',
}) {
    const mongo = socialCaptureMongo({
        companyId,
        platform: 'facebook',
        keyword: groupUrl ? '' : keyword,
        location: '',
        campaignId: '',
        groupUrl,
    });
    const and = [{ notes: /reviewStatus=not_reviewed/i }];
    const pri = String(reviewPriority || 'all');
    if (pri === 'has_website') and.push({ notes: /website=https?:/i });
    if (pri === 'has_company') and.push({ notes: /company=[^;]{2,}/i });
    const rows = await RawCapture.find({
        ...mongo,
        $and: [...(mongo.$and || []), ...and],
    }).select('resultUrlNormalized resultUrlOriginal title snippet notes').sort({ createdAt: 1 }).limit(Math.max(1, Number(limit) || 8)).lean();
    const want = String(groupUrl || '').replace(/\/$/, '');
    return (rows || []).filter((row) => !want || notesHaveGroupUrl(row.notes, want)).map((row) => ({
        href: row.resultUrlNormalized || row.resultUrlOriginal,
        name: row.title || '',
        cardText: row.snippet || '',
    })).filter((c) => c.href);
}

async function runFacebookCommunityExtraction({
    companyId,
    user,
    headers = {},
    mode,
    keyword,
    location = '',
    searchType,
    groupUrl = '',
    groupName = '',
    collectorMode = FACEBOOK_MEMBER_COLLECTOR_MODES.NEXT_BATCH,
    reviewPriority = 'all',
    autoReviewAfterDiscovery = false,
    ctl: sharedCtl = null,
    skipLifecycle = false,
}) {
    if (mode === 'public_search' && ['page_audience', 'page_engagement', 'related_pages', 'group_intelligence'].includes(searchType)) {
        return {
            ingested: 0,
            records: [],
            errors: [searchType === 'group_intelligence'
                ? 'Group Intelligence requires Direct Facebook Login so Chrome can open the selected group People tab.'
                : 'Page Audience / Engagement / Related Pages require Direct Facebook Login. Public search cannot enumerate followers.'],
            facebookCommunityRun: summarizeFacebookCommunityRun({
                batchSize: FACEBOOK_COMMUNITY_BATCH_SIZE,
                stopReason: FACEBOOK_STOP_REASONS.SOURCE_EXHAUSTED,
                analytics: {
                    followerListAccessible: false,
                    followerListNote: 'Follower count may be visible after login; follower list is not available via public search.',
                },
            }),
            note: 'Direct Facebook Login is required for page community intelligence.',
        };
    }

    if (!sharedCtl && !skipLifecycle && isFacebookExtractRunning(companyId)) {
        const live = getFacebookExtractProgress(companyId);
        const same = isSameFacebookAutoLock({
            runningGroupId: live.groupId || live.progress?.groupId,
            runningGroupUrl: live.groupUrl || live.progress?.groupUrl,
            groupId: facebookGroupIdFromUrl(groupUrl),
            groupUrl,
        });
        return {
            ingested: 0,
            records: [],
            alreadyRunning: true,
            sameGroup: same,
            errors: [duplicateAutoRunMessage({ sameGroup: same })],
            note: duplicateAutoRunMessage({ sameGroup: same }),
            facebookCommunityRun: summarizeFacebookCommunityRun({
                batchSize: FACEBOOK_MEMBER_DISCOVERY_BATCH,
                stopReason: '',
                analytics: live.progress || {},
            }),
        };
    }

    let ownedCtl = false;
    const ctl = sharedCtl || beginFacebookExtract(companyId, {
        groupUrl,
        groupName,
        groupId: facebookGroupIdFromUrl(groupUrl),
    });
    if (!sharedCtl) ownedCtl = true;
    ctl.setProgress({
        groupTitle: groupName || '',
        groupUrl: groupUrl || '',
        peopleTabStatus: 'starting',
        status: 'Starting',
    });
    let memberCampaign = null;
    try {
        if (searchType === 'group_intelligence' && groupUrl) {
            memberCampaign = await ensureSocialCampaign({
                companyId,
                user,
                platform: 'facebook',
                keyword,
                city: location,
                groupUrl,
                groupName,
            });
            setFacebookExtractUniqueAtStart(
                companyId,
                Number(memberCampaign?.facebookMemberCollector?.uniqueMembersCollected || 0),
            );
        }
        const persistMemberCheckpoint = async (analytics = {}, stopReason = '', { addCounts = true } = {}) => {
            if (!memberCampaign?._id) return null;
            const prev = memberCampaign.facebookMemberCollector || emptyFacebookMemberCheckpoint({ groupUrl, groupName });
            const next = mergeFacebookMemberCheckpoint(prev, {
                groupUrl: analytics.groupUrl || groupUrl,
                groupName: analytics.groupTitle || groupName,
                displayedMemberCount: analytics.displayedMemberCount || prev.displayedMemberCount,
                privacy: analytics.privacy || prev.privacy,
                peopleTabStatus: analytics.peopleTabStatus || prev.peopleTabStatus,
                peopleUrl: analytics.peopleUrl || prev.peopleUrl,
                scrollPass: (Number(prev.scrollPass) || 0) + (addCounts ? (Number(analytics.scrollPass) || 0) : 0),
                lastScrollHeight: analytics.scrollHeight,
                uniqueMembersCollected: Object.prototype.hasOwnProperty.call(analytics, 'persistedMembers')
                    ? Number(analytics.persistedMembers) || 0
                    : (addCounts
                        ? (Number(prev.uniqueMembersCollected) || 0) + (Number(analytics.uniqueMembersCollected) || 0)
                        : (Number(prev.uniqueMembersCollected) || 0)),
                profilesDiscovered: Object.prototype.hasOwnProperty.call(analytics, 'persistedMembers')
                    ? Number(analytics.persistedMembers) || 0
                    : (addCounts
                        ? (Number(prev.profilesDiscovered) || 0) + (Number(analytics.profilesDiscovered || analytics.uniqueMembersCollected) || 0)
                        : (Number(prev.profilesDiscovered) || 0)),
                profilesReviewed: addCounts
                    ? (Number(prev.profilesReviewed) || 0) + (Number(analytics.accessibleProfilesReviewed) || 0)
                    : (Number(prev.profilesReviewed) || 0),
                qualifiedProfiles: addCounts
                    ? (Number(prev.qualifiedProfiles) || 0) + (Number(analytics.relevant) || 0)
                    : (Number(prev.qualifiedProfiles) || 0),
                relevant: addCounts
                    ? (Number(prev.relevant) || 0) + (Number(analytics.relevant) || 0)
                    : (Number(prev.relevant) || 0),
                newCompanies: addCounts
                    ? (Number(prev.newCompanies) || 0) + (Number(analytics.newUniqueCompanies) || 0)
                    : (Number(prev.newCompanies) || 0),
                websites: addCounts
                    ? (Number(prev.websites) || 0) + (Number(analytics.websites) || 0)
                    : (Number(prev.websites) || 0),
                phones: addCounts
                    ? (Number(prev.phones) || 0) + (Number(analytics.phones) || 0)
                    : (Number(prev.phones) || 0),
                emails: addCounts
                    ? (Number(prev.emails) || 0) + (Number(analytics.emails) || 0)
                    : (Number(prev.emails) || 0),
                alreadyKnown: addCounts
                    ? (Number(prev.alreadyKnown) || 0) + (Number(analytics.alreadyKnown) || 0)
                    : (Number(prev.alreadyKnown) || 0),
                currentBatch: (Number(prev.currentBatch) || 0) + (addCounts ? (Number(analytics.currentBatchDelta) || 1) : 0),
                stopReason,
                campaignState: campaignStateFromStop({
                    collectorMode,
                    stopReason,
                    paused: stopReason === FACEBOOK_STOP_REASONS.MANUAL_STOP,
                }),
                status: stopReason === FACEBOOK_STOP_REASONS.MANUAL_STOP
                    ? 'paused'
                    : (stopReason === FACEBOOK_STOP_REASONS.BATCH_COMPLETE ? 'batch_complete' : stopReason),
                lastSuccessfulAt: new Date().toISOString(),
            });
            await SearchCampaign.updateOne(
                { _id: memberCampaign._id, companyId },
                { $set: { facebookMemberCollector: next } },
            );
            memberCampaign.facebookMemberCollector = next;
            return next;
        };
        const seen = await loadFacebookSeenKeys({ companyId, keyword, groupUrl });
        let query = null;
        if (memberCampaign?._id) {
            query = await ensureSimpleLeadSearchQuery({
                companyId,
                user,
                campaignId: memberCampaign._id,
                queryText: `${keyword}${location ? ` ${location}` : ''}`.trim(),
                sourceHint: 'facebook',
                priorityScore: 100,
                selectedCriteria: { socialMode: mode, socialSearchType: searchType, collectorMode },
            });
        }
        const ingestChunk = async (chunkRecords) => {
            if (!chunkRecords?.length) return 0;
            if (!memberCampaign?._id || !query?._id) {
                throw new ApiError(500, 'persistence_failure: campaign or search query was not ready to save members.');
            }
            const ingest = await ingestRawCaptures({
                companyId,
                user,
                campaignId: memberCampaign._id,
                body: {
                    queryId: String(query._id),
                    source: 'facebook',
                    querySourceHint: 'facebook',
                    captureMethod: 'assisted_visible',
                    idempotencyKey: `social-facebook-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
                    records: toIngestRecords(chunkRecords).slice(0, 100),
                },
            });
            const accepted = Number(ingest?.acceptedCount || 0);
            if (accepted <= 0) {
                const why = ingest?.validationErrors?.[0]?.message
                    || ingest?.failureMessage
                    || ingest?.failureCode
                    || 'No member rows were accepted by the database.';
                throw new ApiError(500, `persistence_failure: ${why}`);
            }
            return accepted;
        };
        const pendingCards = (collectorMode === FACEBOOK_MEMBER_COLLECTOR_MODES.REVIEW_NEXT
            || collectorMode === FACEBOOK_MEMBER_COLLECTOR_MODES.REVIEW_ALL)
            ? await loadPendingFacebookMemberCards({
                companyId,
                keyword,
                groupUrl,
                limit: collectorMode === FACEBOOK_MEMBER_COLLECTOR_MODES.REVIEW_ALL
                    ? FACEBOOK_MEMBER_REVIEW_BATCH * 8
                    : FACEBOOK_MEMBER_REVIEW_BATCH,
                reviewPriority,
            })
            : [];
        const found = mode === 'direct_login'
            ? await discoverWithDirectLogin({
                platform: 'facebook',
                companyId,
                keyword,
                location,
                searchType,
                seenKeys: seen,
                shouldStop: ctl.shouldStop,
                batchSize: FACEBOOK_COMMUNITY_BATCH_SIZE,
                groupUrl,
                groupName,
                onProgress: (patch = {}) => {
                    ctl.setProgress(patch);
                    if (patch.peopleTabStatus === 'open' && patch.status !== 'Loading More') {
                        pushFacebookActivity(companyId, 'Opened People tab');
                    }
                    if (/loading more/i.test(String(patch.status || patch.peopleTabStatus || ''))) {
                        pushFacebookActivity(companyId, 'Loading more members');
                    }
                    if (/reviewing/i.test(String(patch.status || patch.peopleTabStatus || ''))) {
                        pushFacebookActivity(companyId, patch.lastMemberName
                            ? `Reviewing ${patch.lastMemberName}`
                            : 'Reviewing member');
                    }
                    if (patch.lastMemberName && /DISCOVERING|Running/i.test(String(patch.status || ''))) {
                        pushFacebookActivity(companyId, `Found ${patch.lastMemberName}`);
                    }
                },
                collectorMode,
                autoReviewAfterDiscovery,
                pendingCards,
                onMemberCard: (collectorMode === FACEBOOK_MEMBER_COLLECTOR_MODES.FULL_DISCOVERY
                    || collectorMode === FACEBOOK_MEMBER_COLLECTOR_MODES.FULL_AUTOMATIC
                    || collectorMode === FACEBOOK_MEMBER_COLLECTOR_MODES.NEXT_BATCH)
                    ? async (rec, analytics) => {
                        const name = rec.title || analytics?.lastMemberName || 'member';
                        pushFacebookActivity(companyId, `Seen ${name}`);
                        ctl.setProgress({
                            lastFoundName: name,
                            lastFoundAt: new Date().toISOString(),
                            status: 'DISCOVERING',
                        });
                    }
                    : undefined,
                onDiscoveryBatch: (collectorMode === FACEBOOK_MEMBER_COLLECTOR_MODES.FULL_DISCOVERY
                    || collectorMode === FACEBOOK_MEMBER_COLLECTOR_MODES.FULL_AUTOMATIC
                    || collectorMode === FACEBOOK_MEMBER_COLLECTOR_MODES.NEXT_BATCH)
                    ? async (chunk, analytics) => {
                        try {
                            const saved = await ingestChunk(chunk || []);
                            const persisted = await countPersistedFacebookGroupMembers({ companyId, groupUrl });
                            ctl.setProgress({
                                uniqueMembersCollected: persisted,
                                persistedMembers: persisted,
                                currentBatch: analytics.currentBatch,
                                status: 'DISCOVERING',
                                lastCheckpoint: new Date().toISOString(),
                            });
                            pushFacebookActivity(companyId, `Persisted ${saved} members (total ${persisted})`);
                            await persistMemberCheckpoint({
                                ...analytics,
                                persistedMembers: persisted,
                                uniqueMembersCollected: persisted,
                                profilesDiscovered: persisted,
                                currentBatchDelta: 1,
                            }, FACEBOOK_STOP_REASONS.BATCH_COMPLETE);
                            return saved;
                        } catch (err) {
                            const persisted = await countPersistedFacebookGroupMembers({ companyId, groupUrl }).catch(() => 0);
                            await persistMemberCheckpoint({
                                ...analytics,
                                persistedMembers: persisted,
                                uniqueMembersCollected: persisted,
                                profilesDiscovered: persisted,
                            }, FACEBOOK_STOP_REASONS.PERSISTENCE_FAILURE, { addCounts: false });
                            throw err;
                        }
                    }
                    : undefined,
            })
            : await discoverFacebookPublic({ keyword, location, searchType });

        const flushedDiscovery = collectorMode === FACEBOOK_MEMBER_COLLECTOR_MODES.FULL_DISCOVERY
            || collectorMode === FACEBOOK_MEMBER_COLLECTOR_MODES.FULL_AUTOMATIC
            || collectorMode === FACEBOOK_MEMBER_COLLECTOR_MODES.NEXT_BATCH;
        if (mode === 'direct_login' && found.records.length && !flushedDiscovery) {
            for (let i = 0; i < found.records.length; i += 5) {
                await bridgeCompanyWebsites(found.records.slice(i, i + 5));
            }
        }

        const stopReason = found.stopReason
            || (ctl.shouldStop() ? FACEBOOK_STOP_REASONS.MANUAL_STOP : FACEBOOK_STOP_REASONS.SOURCE_EXHAUSTED);

        if (!found.records.length && !flushedDiscovery) {
            const checkpoint = await persistMemberCheckpoint(found.communityMeta || found.groupMeta || {}, stopReason, { addCounts: false });
            return {
                ingested: 0,
                records: [],
                errors: found.errors?.length ? found.errors : ['No additional Facebook community candidates were accessible.'],
                groupMeta: found.groupMeta || null,
                metrics: found.metrics || null,
                facebookMemberCampaign: checkpoint,
                facebookCommunityRun: summarizeFacebookCommunityRun({
                    batchSize: FACEBOOK_MEMBER_DISCOVERY_BATCH,
                    alreadyKnown: found.alreadyKnown || 0,
                    stopReason,
                    analytics: found.communityMeta || found.groupMeta || null,
                }),
                note: 'Nothing new was sent to Processing. Checkpoint was saved.',
            };
        }

        const campaign = memberCampaign || await ensureSocialCampaign({
            companyId, user, platform: 'facebook', keyword, city: location, groupUrl, groupName,
        });
        if (!query) {
            query = await ensureSimpleLeadSearchQuery({
                companyId,
                user,
                campaignId: campaign._id,
                queryText: `${keyword}${location ? ` ${location}` : ''}`.trim(),
                sourceHint: 'facebook',
                priorityScore: 100,
                selectedCriteria: { socialMode: mode, socialSearchType: searchType, collectorMode },
            });
        }

        let ingestedCount = 0;
        const batchesMeta = [];
        if (!flushedDiscovery && found.records.length) {
            const chunks = splitFacebookBatches(found.records, FACEBOOK_COMMUNITY_BATCH_SIZE);
            for (const chunk of chunks) {
                if (ctl.shouldStop()) break;
                const ingest = await ingestRawCaptures({
                    companyId,
                    user,
                    campaignId: campaign._id,
                    body: {
                        queryId: String(query._id),
                        source: 'facebook',
                        querySourceHint: 'facebook',
                        captureMethod: mode === 'direct_login' ? 'assisted_visible' : 'api_batch',
                        idempotencyKey: `social-facebook-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
                        records: toIngestRecords(chunk.records).slice(0, 100),
                    },
                });
                ingestedCount += ingest?.acceptedCount ?? chunk.records.length;
                batchesMeta.push({ index: chunk.index, newCount: chunk.newCount });
            }
        } else {
            ingestedCount = Number(found.communityMeta?.uniqueMembersCollected) || found.records.length || 0;
        }

        const sessionWrap = await createAssistedCaptureSession({
            companyId,
            user,
            campaignId: campaign._id,
            queryId: query._id,
            body: { sourceHint: 'facebook', financialYear: headers['x-financial-year'] || '' },
            headers,
        });
        const totalCaptured = await RawCapture.countDocuments(
            socialCaptureMongo({ companyId, platform: 'facebook', keyword, location, campaignId: '' }),
        );
        return {
            ingested: ingestedCount,
            records: found.records,
            errors: found.errors || [],
            campaignId: String(campaign._id),
            queryId: String(query._id),
            sessionId: String(sessionWrap.session?._id || ''),
            processingUrl: sessionWrap.session?._id ? `/data-extractor/runs/${sessionWrap.session._id}` : '/data-extractor/simple-lead-search',
            note: 'Facebook community candidates entered the existing Processing → Verified Data pipeline. Convert to Lead stays manual.',
            groupMeta: found.groupMeta || null,
            metrics: found.metrics || null,
            facebookCommunityRun: summarizeFacebookCommunityRun({
                batchSize: FACEBOOK_MEMBER_DISCOVERY_BATCH,
                batches: batchesMeta,
                newThisRun: ingestedCount,
                alreadyKnown: found.alreadyKnown || 0,
                totalCaptured,
                stopReason: ctl.shouldStop() ? FACEBOOK_STOP_REASONS.MANUAL_STOP : stopReason,
                analytics: found.communityMeta || found.groupMeta || null,
            }),
            facebookMemberCampaign: await persistMemberCheckpoint(
                found.communityMeta || found.groupMeta || {},
                ctl.shouldStop() ? FACEBOOK_STOP_REASONS.MANUAL_STOP : stopReason,
                { addCounts: !flushedDiscovery },
            ),
        };
    } finally {
        if (ownedCtl && !skipLifecycle) endFacebookExtract(companyId);
    }
}

function sleepMs(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function persistAutoCampaignStatus(companyId, groupUrl, patch = {}) {
    const url = normalizeFacebookGroupUrl(groupUrl);
    if (!url) return;
    await SearchCampaign.updateOne(
        { companyId, 'facebookMemberCollector.groupUrl': url },
        {
            $set: {
                'facebookMemberCollector.lastSuccessfulAt': new Date().toISOString(),
                ...Object.fromEntries(Object.entries(patch).map(([k, v]) => [`facebookMemberCollector.${k}`, v])),
            },
        },
    );
}

async function applyFacebookGroupReviewStats(ctl, companyId, groupUrl) {
    const stats = await countFacebookGroupReviewStats({ companyId, groupUrl });
    ctl?.setProgress?.({
        uniqueMembersCollected: stats.persisted,
        persistedMembers: stats.persisted,
        pendingReview: stats.pending,
        reviewed: stats.reviewed,
        relevant: stats.relevant,
        possiblyRelevant: stats.possibly,
        notRelevant: stats.notRelevant,
        phones: stats.phones,
        emails: stats.emails,
        websites: stats.websites,
        whatsapp: stats.whatsapp,
        contactable: stats.contactable,
    });
    await persistAutoCampaignStatus(companyId, groupUrl, {
        uniqueMembersCollected: stats.persisted,
        profilesReviewed: stats.reviewed,
        awaitingReview: stats.pending,
        relevant: stats.relevant,
        phones: stats.phones,
        emails: stats.emails,
        websites: stats.websites,
        whatsapp: stats.whatsapp,
        contactable: stats.contactable,
    });
    return stats;
}

/** Review only members already saved in raw_captures. Internal batch = 8. No discovery. */
async function runFacebookPendingReviewLoop({
    shared,
    companyId,
    groupUrl,
    ctl,
    finish,
}) {
    ctl.setProgress({ currentStage: FACEBOOK_AUTO_STAGES.REVIEWING, status: 'REVIEWING' });
    pushFacebookActivity(companyId, 'Reviewing persisted pending members');
    for (let loops = 0; loops < FACEBOOK_AUTO_MAX_REVIEW_LOOPS; loops += 1) {
        if (ctl.shouldStop()) {
            await finish({
                currentStage: FACEBOOK_AUTO_STAGES.PAUSED,
                status: ctl.wasPaused() ? 'Paused' : 'Stopped',
            });
            return 'paused';
        }
        const pending = await loadPendingFacebookMemberCards({
            companyId,
            keyword: '',
            groupUrl,
            limit: FACEBOOK_MEMBER_REVIEW_BATCH,
            reviewPriority: 'all',
        });
        const stats = await applyFacebookGroupReviewStats(ctl, companyId, groupUrl);
        if (!shouldContinueAutomaticReview({
            pendingCount: pending.length,
            shouldStop: ctl.shouldStop(),
            loops,
        })) {
            break;
        }
        pushFacebookActivity(
            companyId,
            `Reviewing next ${pending.length} persisted members (${stats.reviewed} reviewed, ${stats.pending} pending)`,
        );
        const reviewed = await runFacebookCommunityExtraction({
            ...shared,
            collectorMode: FACEBOOK_MEMBER_COLLECTOR_MODES.REVIEW_NEXT,
            reviewPriority: 'all',
        });
        const rStop = reviewed.stopReason || '';
        if (rStop === FACEBOOK_STOP_REASONS.SESSION_ATTENTION_REQUIRED
            || rStop === FACEBOOK_STOP_REASONS.SESSION_EXPIRED) {
            await finish({
                currentStage: FACEBOOK_AUTO_STAGES.ATTENTION,
                status: 'Facebook Attention Required',
                attentionRequired: true,
                stopReason: rStop,
                stopNote: 'Progress has been saved. Resolve the issue in the logged-in Facebook browser and click Continue.',
            });
            return 'attention';
        }
        const after = await applyFacebookGroupReviewStats(ctl, companyId, groupUrl);
        if (after.reviewed === stats.reviewed) {
            const why = reviewed.errors?.[0]
                || reviewed.note
                || 'Review batch did not update any persisted members.';
            const sessionGone = /disconnect|expired|attention|login/i.test(`${why} ${reviewed.session?.status || ''}`);
            await finish({
                currentStage: sessionGone ? FACEBOOK_AUTO_STAGES.ATTENTION : FACEBOOK_AUTO_STAGES.REVIEWING,
                status: sessionGone ? 'Facebook Attention Required' : 'REVIEWING',
                attentionRequired: sessionGone,
                stopReason: sessionGone ? FACEBOOK_STOP_REASONS.SESSION_EXPIRED : rStop,
                stopNote: sessionGone
                    ? 'Facebook session needs attention. Reconnect Direct Facebook Login, then Resume or Review All Pending. Persisted members were kept.'
                    : why,
            });
            return sessionGone ? 'attention' : 'stalled';
        }
    }
    await applyFacebookGroupReviewStats(ctl, companyId, groupUrl);
    return 'ok';
}

async function runFacebookPostReviewStages({
    shared,
    companyId,
    user,
    keyword,
    location,
    groupUrl,
    ctl,
    finish,
    discoveryStop = '',
}) {
    if (ctl.shouldStop()) {
        await finish({
            currentStage: FACEBOOK_AUTO_STAGES.PAUSED,
            status: ctl.wasPaused() ? 'Paused' : 'Stopped',
        });
        return 'paused';
    }

    ctl.setProgress({ currentStage: FACEBOOK_AUTO_STAGES.WEBSITE_ENRICHMENT, status: 'WEBSITE ENRICHMENT' });
    pushFacebookActivity(companyId, 'Website enrichment started');
    const mongo = socialCaptureMongo({
        companyId,
        platform: 'facebook',
        keyword: groupUrl ? '' : keyword,
        location: groupUrl ? '' : location,
        campaignId: '',
        groupUrl,
    });
    const siteCaps = await RawCapture.find({
        ...mongo,
        notes: /website=https?:/i,
    }).sort({ updatedAt: -1 }).limit(40).lean();
    for (let i = 0; i < siteCaps.length && !ctl.shouldStop(); i += FACEBOOK_AUTO_WEBSITE_ENRICH_BATCH) {
        const slice = siteCaps.slice(i, i + FACEBOOK_AUTO_WEBSITE_ENRICH_BATCH);
        try {
            await enrichCapturesNow({ companyId, user, captures: slice });
            pushFacebookActivity(companyId, 'Website found');
        } catch {
            /* keep discovered members */
        }
    }

    if (ctl.shouldStop()) {
        await finish({
            currentStage: FACEBOOK_AUTO_STAGES.PAUSED,
            status: ctl.wasPaused() ? 'Paused' : 'Stopped',
        });
        return 'paused';
    }

    ctl.setProgress({ currentStage: FACEBOOK_AUTO_STAGES.CONSOLIDATING, status: 'CONSOLIDATING' });
    try {
        const { consolidateCompanyIdentities } = await import('../discovery/phase5/identity.service.js');
        await consolidateCompanyIdentities({
            companyId,
            userId: user?._id || user?.id || null,
            includeRawCaptures: true,
            includeDiscoveryPreview: false,
            limit: 400,
        });
    } catch {
        /* compatible reuse only */
    }

    await finish({
        currentStage: FACEBOOK_AUTO_STAGES.COMPLETE,
        status: 'FULL GROUP PROCESSING COMPLETE',
        stopReason: discoveryStop || FACEBOOK_STOP_REASONS.SOURCE_EXHAUSTED,
        attentionRequired: false,
    });
    return 'ok';
}

export async function startFacebookReviewAllPendingRun({
    companyId,
    user,
    headers = {},
    keyword,
    location = '',
    groupUrl = '',
    groupName = '',
}) {
    assertCanExtract(user);
    const exactGroupUrl = normalizeFacebookGroupUrl(groupUrl);
    const groupId = facebookGroupIdFromUrl(exactGroupUrl);
    const live = getFacebookExtractProgress(companyId);
    if (live.running) {
        const same = isSameFacebookAutoLock({
            runningGroupId: live.groupId || live.progress?.groupId,
            runningGroupUrl: live.groupUrl || live.progress?.groupUrl,
            groupId,
            groupUrl: exactGroupUrl,
        });
        return {
            accepted: false,
            started: false,
            alreadyRunning: true,
            sameGroup: same,
            ingested: 0,
            message: duplicateAutoRunMessage({ sameGroup: same }),
            note: duplicateAutoRunMessage({ sameGroup: same }),
            errors: [duplicateAutoRunMessage({ sameGroup: same })],
        };
    }
    const begun = tryBeginFacebookExtract(companyId, {
        groupId,
        groupUrl: exactGroupUrl,
        groupName,
        auto: true,
    });
    if (!begun.ok) {
        return {
            accepted: false,
            started: false,
            alreadyRunning: true,
            ingested: 0,
            message: duplicateAutoRunMessage({ sameGroup: true }),
            note: duplicateAutoRunMessage({ sameGroup: true }),
            errors: [duplicateAutoRunMessage({ sameGroup: true })],
        };
    }
    const ctl = begun.ctl;
    ctl.setProgress({
        currentStage: FACEBOOK_AUTO_STAGES.REVIEWING,
        status: 'REVIEWING',
        groupTitle: groupName,
        groupUrl: exactGroupUrl,
        groupId,
        auto: true,
        attentionRequired: false,
    });
    setImmediate(() => {
        runFacebookReviewAllPendingLoop({
            companyId,
            user,
            headers,
            keyword,
            location,
            groupUrl: exactGroupUrl,
            groupName,
            ctl,
        }).catch((err) => {
            ctl.setProgress({
                currentStage: FACEBOOK_AUTO_STAGES.TECHNICAL_FAILURE,
                status: 'technical_failure',
                stopNote: String(err?.message || err),
            });
        }).finally(() => {
            endFacebookExtract(companyId);
        });
    });
    return {
        accepted: true,
        started: true,
        ingested: 0,
        alreadyRunning: false,
        note: 'Automatic review of persisted pending members started. Progress updates on this screen without a page reload.',
        facebookCommunityRun: {
            analytics: {
                status: 'REVIEWING',
                currentStage: FACEBOOK_AUTO_STAGES.REVIEWING,
                groupTitle: groupName,
                groupUrl: exactGroupUrl,
            },
        },
    };
}

async function runFacebookReviewAllPendingLoop({
    companyId,
    user,
    headers,
    keyword,
    location,
    groupUrl,
    groupName,
    ctl,
}) {
    const finish = async (patch) => {
        ctl.setProgress(patch);
        if (/complete/i.test(String(patch.currentStage || patch.status || ''))) {
            pushFacebookActivity(companyId, 'Pending profile review complete');
        }
        await persistAutoCampaignStatus(companyId, groupUrl, {
            campaignState: patch.currentStage || '',
            status: patch.status || '',
            stopReason: patch.stopReason || '',
        });
    };
    const shared = {
        companyId,
        user,
        headers,
        mode: 'direct_login',
        keyword,
        location,
        searchType: 'group_intelligence',
        groupUrl,
        groupName,
        ctl,
        skipLifecycle: true,
    };
    const reviewOutcome = await runFacebookPendingReviewLoop({
        shared,
        companyId,
        groupUrl,
        ctl,
        finish,
    });
    if (reviewOutcome === 'paused' || reviewOutcome === 'attention') return;
    const leftover = await loadPendingFacebookMemberCards({
        companyId,
        keyword: '',
        groupUrl,
        limit: 1,
        reviewPriority: 'all',
    });
    if (leftover.length) {
        const stats = await applyFacebookGroupReviewStats(ctl, companyId, groupUrl);
        await finish({
            currentStage: FACEBOOK_AUTO_STAGES.REVIEWING,
            status: 'REVIEWING',
            stopNote: `Reviewed persisted members in batches of 8. ${stats.pending} still pending.`,
        });
        return;
    }
    await runFacebookPostReviewStages({
        shared,
        companyId,
        user,
        keyword,
        location,
        groupUrl,
        ctl,
        finish,
        discoveryStop: FACEBOOK_STOP_REASONS.BATCH_COMPLETE,
    });
}

export async function startFacebookFullAutomaticRun({
    companyId,
    user,
    headers = {},
    keyword,
    location = '',
    groupUrl = '',
    groupName = '',
    reviewPriority = 'high_relevance',
    autoReviewAfterDiscovery = true,
}) {
    assertCanExtract(user);
    const exactGroupUrl = normalizeFacebookGroupUrl(groupUrl);
    const groupId = facebookGroupIdFromUrl(exactGroupUrl);
    const live = getFacebookExtractProgress(companyId);
    if (live.running) {
        const same = isSameFacebookAutoLock({
            runningGroupId: live.groupId || live.progress?.groupId,
            runningGroupUrl: live.groupUrl || live.progress?.groupUrl,
            groupId,
            groupUrl: exactGroupUrl,
        });
        return {
            accepted: false,
            started: false,
            alreadyRunning: true,
            sameGroup: same,
            ingested: 0,
            message: duplicateAutoRunMessage({ sameGroup: same }),
            note: duplicateAutoRunMessage({ sameGroup: same }),
            errors: [duplicateAutoRunMessage({ sameGroup: same })],
        };
    }
    const begun = tryBeginFacebookExtract(companyId, {
        groupId,
        groupUrl: exactGroupUrl,
        groupName,
        auto: true,
    });
    if (!begun.ok) {
        return {
            accepted: false,
            started: false,
            alreadyRunning: true,
            ingested: 0,
            message: duplicateAutoRunMessage({ sameGroup: true }),
            note: duplicateAutoRunMessage({ sameGroup: true }),
            errors: [duplicateAutoRunMessage({ sameGroup: true })],
        };
    }
    const ctl = begun.ctl;
    ctl.setProgress({
        currentStage: FACEBOOK_AUTO_STAGES.DISCOVERING,
        status: 'Running',
        groupTitle: groupName,
        groupUrl: exactGroupUrl,
        groupId,
        auto: true,
        attentionRequired: false,
    });
    setImmediate(() => {
        runFacebookFullAutomaticLoop({
            companyId,
            user,
            headers,
            keyword,
            location,
            groupUrl: exactGroupUrl,
            groupName,
            reviewPriority: reviewPriority || 'high_relevance',
            autoReview: autoReviewAfterDiscovery !== false,
            ctl,
        }).catch((err) => {
            ctl.setProgress({
                currentStage: FACEBOOK_AUTO_STAGES.TECHNICAL_FAILURE,
                status: 'technical_failure',
                stopNote: String(err?.message || err),
            });
        }).finally(() => {
            endFacebookExtract(companyId);
        });
    });
    return {
        accepted: true,
        started: true,
        ingested: 0,
        alreadyRunning: false,
        note: 'Automatic Facebook group collection started. Progress updates on this screen without a page reload.',
        facebookCommunityRun: {
            analytics: {
                status: 'Running',
                currentStage: FACEBOOK_AUTO_STAGES.DISCOVERING,
                groupTitle: groupName,
                groupUrl: exactGroupUrl,
            },
        },
    };
}

async function runFacebookFullAutomaticLoop({
    companyId,
    user,
    headers,
    keyword,
    location,
    groupUrl,
    groupName,
    reviewPriority,
    autoReview,
    ctl,
}) {
    const finish = async (patch) => {
        ctl.setProgress(patch);
        if (/complete/i.test(String(patch.currentStage || patch.status || ''))) {
            pushFacebookActivity(companyId, 'Full group processing complete');
        }
        await persistAutoCampaignStatus(companyId, groupUrl, {
            campaignState: patch.currentStage || '',
            status: patch.status || '',
            stopReason: patch.stopReason || '',
        });
    };
    const shared = {
        companyId,
        user,
        headers,
        mode: 'direct_login',
        keyword,
        location,
        searchType: 'group_intelligence',
        groupUrl,
        groupName,
        ctl,
        skipLifecycle: true,
    };
    let discoveryStop = '';
    ctl.setProgress({ currentStage: FACEBOOK_AUTO_STAGES.DISCOVERING, status: 'DISCOVERING' });

    for (let attempt = 1; attempt <= FACEBOOK_AUTO_MAX_TECHNICAL_RETRIES; attempt += 1) {
        if (ctl.shouldStop()) {
            discoveryStop = ctl.wasPaused() ? 'manual_pause' : FACEBOOK_STOP_REASONS.MANUAL_STOP;
            break;
        }
        try {
            const found = await runFacebookCommunityExtraction({
                ...shared,
                collectorMode: discoveryModeForAuto(),
                reviewPriority,
            });
            discoveryStop = found.stopReason || found.facebookCommunityRun?.stopReason || '';
            if (found.alreadyRunning) return;
            if (discoveryStop === FACEBOOK_STOP_REASONS.SESSION_ATTENTION_REQUIRED
                || discoveryStop === FACEBOOK_STOP_REASONS.SESSION_EXPIRED) {
                await finish({
                    currentStage: FACEBOOK_AUTO_STAGES.ATTENTION,
                    status: 'Facebook Attention Required',
                    attentionRequired: true,
                    stopReason: discoveryStop,
                    stopNote: 'Progress has been saved. Resolve the issue in the logged-in Facebook browser and click Continue.',
                });
                return;
            }
            if (ctl.shouldStop() || discoveryStop === FACEBOOK_STOP_REASONS.MANUAL_STOP) {
                await finish({
                    currentStage: FACEBOOK_AUTO_STAGES.PAUSED,
                    status: ctl.wasPaused() ? 'Paused' : 'Stopped',
                });
                return;
            }
            if (discoveryStop === FACEBOOK_STOP_REASONS.SOURCE_EXHAUSTED) break;
            if (shouldContinueAutomaticDiscovery({ stopReason: discoveryStop, shouldStop: ctl.shouldStop() })) {
                continue;
            }
            if (shouldRetryTechnicalFailure({ attempt, stopReason: discoveryStop || 'technical_failure' })) {
                await sleepMs(facebookAutoRetryDelayMs(attempt));
                continue;
            }
            break;
        } catch (err) {
            if (!shouldRetryTechnicalFailure({ attempt, stopReason: 'technical_failure' })) {
                await finish({
                    currentStage: FACEBOOK_AUTO_STAGES.TECHNICAL_FAILURE,
                    status: 'technical_failure',
                    stopNote: String(err?.message || err),
                });
                return;
            }
            await sleepMs(facebookAutoRetryDelayMs(attempt));
        }
    }

    if (ctl.shouldStop()) {
        await finish({
            currentStage: FACEBOOK_AUTO_STAGES.PAUSED,
            status: ctl.wasPaused() ? 'Paused' : 'Stopped',
        });
        return;
    }

    if (!shouldAdvanceToReview({ stopReason: discoveryStop, autoReview, shouldStop: ctl.shouldStop() })) {
        await finish({
            currentStage: discoveryStop === FACEBOOK_STOP_REASONS.SOURCE_EXHAUSTED
                ? FACEBOOK_AUTO_STAGES.SOURCE_EXHAUSTED
                : FACEBOOK_AUTO_STAGES.COMPLETE,
            status: discoveryStop === FACEBOOK_STOP_REASONS.SOURCE_EXHAUSTED ? 'Source Exhausted' : 'Complete',
            stopReason: discoveryStop,
        });
        return;
    }

    const reviewOutcome = await runFacebookPendingReviewLoop({
        shared,
        companyId,
        groupUrl,
        ctl,
        finish,
    });
    if (reviewOutcome === 'paused' || reviewOutcome === 'attention') return;
    await runFacebookPostReviewStages({
        shared,
        companyId,
        user,
        keyword,
        location,
        groupUrl,
        ctl,
        finish,
        discoveryStop,
    });
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
    groupUrl = '',
    groupName = '',
    collectorMode = '',
    reviewPriority = 'all',
    autoReviewAfterDiscovery = true,
}) {
    assertCanExtract(user);
    const p = normalizeExtractPlatform(platform);
    const m = String(mode || 'public_search');
    const allowedModes = modesFor(p);
    if (!allowedModes.includes(m)) throw new ApiError(400, 'Invalid extraction mode');
    const types = typesFor(p);
    const st = String(searchType || defaultSearchType(p));
    if (!types.includes(st)) throw new ApiError(400, 'Invalid search type');
    const exactGroupUrl = p === 'facebook' ? normalizeFacebookGroupUrl(groupUrl) : '';
    const kw = String(keyword || groupName || '').trim() || (exactGroupUrl ? 'group' : '');
    if (kw.length < 2) throw new ApiError(400, 'Keyword is required');
    if (p === 'facebook' && st === 'group_intelligence' && !exactGroupUrl) {
        throw new ApiError(400, 'Select an exact Facebook Group URL (Find Groups → Analyze Group, or paste the group URL).');
    }

    if (p === 'instagram') {
        return runInstagramExtraction({
            companyId,
            user,
            headers,
            mode: m,
            keyword: kw,
            location,
            searchType: st,
        });
    }
    if (p === 'facebook' && FACEBOOK_COMMUNITY_SEARCH_TYPES.includes(st)) {
        if (isFullAutomaticCollectorMode(collectorMode) && st === 'group_intelligence') {
            return startFacebookFullAutomaticRun({
                companyId,
                user,
                headers,
                keyword: kw,
                location,
                groupUrl: exactGroupUrl,
                groupName: String(groupName || '').trim(),
                reviewPriority: String(reviewPriority || 'high_relevance'),
                autoReviewAfterDiscovery: autoReviewAfterDiscovery !== false,
            });
        }
        if (isReviewAllCollectorMode(collectorMode) && st === 'group_intelligence') {
            return startFacebookReviewAllPendingRun({
                companyId,
                user,
                headers,
                keyword: kw,
                location,
                groupUrl: exactGroupUrl,
                groupName: String(groupName || '').trim(),
            });
        }
        return runFacebookCommunityExtraction({
            companyId,
            user,
            headers,
            mode: m,
            keyword: kw,
            location,
            searchType: st,
            groupUrl: exactGroupUrl,
            groupName: String(groupName || '').trim(),
            collectorMode: String(collectorMode || FACEBOOK_MEMBER_COLLECTOR_MODES.NEXT_BATCH),
            reviewPriority: String(reviewPriority || 'all'),
            autoReviewAfterDiscovery: autoReviewAfterDiscovery === true,
        });
    }

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

export async function enrichInstagramCapturedWebsites({
    companyId,
    user,
    keyword = '',
    location = '',
    campaignId = '',
    captureIds = [],
    sessionId = null,
}) {
    assertCanExtract(user);
    const ids = (captureIds || []).filter((id) => mongoose.isValidObjectId(id));
    const mongo = ids.length
        ? { companyId, source: 'instagram', _id: { $in: ids } }
        : socialCaptureMongo({ companyId, platform: 'instagram', keyword, location, campaignId });
    const captures = await RawCapture.find(mongo).lean();
    if (!captures.length) {
        return {
            considered: 0,
            withWebsite: 0,
            skippedWithoutWebsite: 0,
            results: [],
            skipped: 0,
            note: 'No Instagram RawCaptures matched.',
        };
    }
    const snippetById = new Map(captures.map((c) => [String(c._id), c.snippet]));
    const withWebsite = [];
    for (const cap of captures) {
        const site = websiteFromInstagramCapture(cap);
        if (!site) continue;
        const nextNotes = mergeWebsiteIntoStoredNotes(cap.notes, site);
        await RawCapture.updateOne(
            { _id: cap._id, companyId },
            { $set: { notes: nextNotes, enrichmentEligible: true } },
        );
        cap.notes = nextNotes;
        cap.website = site;
        withWebsite.push(cap);
    }

    let ran = { results: [], skipped: captures.length };
    if (withWebsite.length) {
        let sid = sessionId;
        if (!sid && withWebsite[0].campaignId) {
            const session = await AssistedCaptureSession.findOne({
                companyId,
                campaignId: withWebsite[0].campaignId,
            }).sort({ createdAt: -1 }).select('_id').lean();
            sid = session?._id || null;
        }
        ran = await enrichCapturesNow({
            companyId,
            user,
            sessionId: sid,
            captures: withWebsite,
        });
    }

    const after = await RawCapture.find({ _id: { $in: captures.map((c) => c._id) } })
        .select('_id snippet enrichmentStatus qualificationStatus promotedExtractedLeadId')
        .lean();
    for (const row of after) {
        const original = snippetById.get(String(row._id));
        if (original != null && row.snippet !== original) {
            await RawCapture.updateOne({ _id: row._id, companyId }, { $set: { snippet: original } });
        }
    }

    const urls = captures.map((c) => c.resultUrlNormalized || c.resultUrlOriginal).filter(Boolean);
    const identities = urls.length
        ? await ExtractorCompanyIdentity.find({
            companyId,
            isDeleted: { $ne: true },
            $or: [
                { 'social.instagramUrl': { $in: urls } },
                { 'sourceRefs.sourceUrl': { $in: urls } },
            ],
        }).lean()
        : [];
    const enrichDocs = withWebsite.length
        ? await RawCaptureEnrichment.find({ companyId, rawCaptureIds: { $in: withWebsite.map((c) => c._id) } }).lean()
        : [];
    for (const cap of captures) {
        const ident = pickIdentityForCapture(identities, cap);
        if (!ident) continue;
        const notesMap = {};
        for (const part of String(cap.notes || '').split(';')) {
            const idx = part.indexOf('=');
            if (idx < 1) continue;
            notesMap[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
        }
        const searchLoc = String(notesMap.location || '').trim().toLowerCase();
        const identCity = String(ident.city || '').trim();
        if (searchLoc && identCity && identCity.toLowerCase() === searchLoc) {
            const presented = presentSocialCapture(
                cap,
                ident,
                {},
                enrichDocs.find((d) => (d.rawCaptureIds || []).some((id) => String(id) === String(cap._id))) || null,
            );
            const evidenceCity = presented.websiteEnriched?.city || presented.instagram?.city || '';
            await ExtractorCompanyIdentity.updateOne(
                { _id: ident._id, companyId },
                { $set: { city: evidenceCity } },
            );
        }
    }

    return {
        considered: captures.length,
        withWebsite: withWebsite.length,
        skippedWithoutWebsite: captures.length - withWebsite.length,
        results: ran.results || [],
        skipped: ran.skipped || 0,
        note: 'Phase 1 website crawler ran only for Instagram-discovered external websites. No Verify and no Convert to Lead.',
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
