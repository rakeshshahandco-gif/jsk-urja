/**
 * Campaign-scoped captured-data visibility + full current-status Excel export.
 * Does not create CRM Leads. Scoped to companyId + campaignId of the SLS session.
 */
import mongoose from 'mongoose';
import { AssistedCaptureSession } from '../../../../models/assistedCaptureSession.model.js';
import { RawCapture } from '../../../../models/rawCapture.model.js';
import { RawCaptureEnrichment } from '../../../../models/rawCaptureEnrichment.model.js';
import { RawCaptureQualification } from '../../../../models/rawCaptureQualification.model.js';
import { RawCaptureGenuineness } from '../../../../models/rawCaptureGenuineness.model.js';
import { SearchCampaign } from '../../../../models/searchCampaign.model.js';
import { SearchQuery } from '../../../../models/searchQuery.model.js';
import { ApiError } from '../../../../utils/ApiError.js';
import { checkUserPermission } from '../../../../utils/permissionUtils.js';
import { assertAssistedCaptureView } from '../assistedCapture/permissions.util.js';
import { buildAllCurrentCapturedDataWorkbook } from './simpleLeadSearch.capturedData.export.service.js';
import { businessTypeMatchRank } from './simpleBusinessType.util.js';
import {
    buildCanonicalVerifiedCompanies,
    isIndependentlyVerifiedDecision,
} from '../rawCaptureGenuineness/canonicalVerifiedCompany.util.js';
import {
    classifyStrictFinalBucket,
    countStrictFinalBuckets,
    STRICT_FINAL_BUCKETS,
    STRICT_FINAL_BUCKET_LABELS,
} from './strictFinalBucket.util.js';
import { normalizeCampaignCity, formatLocationMatchLabel, formatRequestedLocation, formatDetectedLocation } from '../rawCaptureQualification/locationMatch.util.js';
import { RULE_ENGINE_VERSION } from '../rawCaptureQualification/constants.js';
import { RawCaptureLocationRecheckJob } from '../../../../models/rawCaptureQualification.model.js';
import { unpackChinaNotes, chinaSupplierStatusLabel } from './chinaBilingual.util.js';
import { isLikelyChineseBusinessText } from '../chinaWebsiteCrawler/chinaPageExtract.util.js';

const ENRICH_DONE = ['completed', 'partial', 'review_required'];
const QUALIFY_ELIGIBLE = ['strong_match', 'possible_match', 'human_review_required'];
const REJECTED_QUAL = ['rejected', 'rejected_unusable', 'not_relevant'];
const NO_WEBSITE_RE = /no website|no usable website|directory|missing.?url|empty.?url/i;
const TAB_KEYS = [
    'all', 'waiting', 'processing', 'enriched', 'qualified', 'verified',
    'review_required', 'rejected_skipped', 'failed',
    ...STRICT_FINAL_BUCKETS,
];

function requireCompanyId(companyId) {
    if (!companyId || !mongoose.isValidObjectId(companyId)) {
        throw new ApiError(400, 'Company context required');
    }
    return companyId;
}

function requireObjectId(id, label) {
    if (!id || !mongoose.isValidObjectId(id)) throw new ApiError(404, `${label} not found`);
}

function isPendingEnrichStatus(status) {
    return status == null || status === '' || status === 'not_started' || status === 'pending';
}

function firstPhone(list) {
    if (!Array.isArray(list) || !list.length) return '';
    const p = list[0];
    return typeof p === 'string' ? p : (p?.normalized || p?.original || p?.value || '');
}

function firstEmail(list) {
    if (!Array.isArray(list) || !list.length) return '';
    const e = list[0];
    return typeof e === 'string' ? e : (e?.value || e?.address || '');
}

function socialUrl(obj) {
    if (!obj || typeof obj !== 'object') return '';
    return obj.url || obj.handle || '';
}

function classifyExclusiveBucket(cap, enrich, qual, gen) {
    const st = cap.enrichmentStatus;
    const reason = String(cap.enrichmentBlockedReason || '');

    if (isPendingEnrichStatus(st)) return 'waiting';
    if (st === 'processing') return 'processing';

    if (gen) {
        if (gen.systemDecision === 'human_review_required') {
            return 'review_required';
        }
        if (gen.verificationStatus === 'failed') return 'failed';
        // Directory listings are completed pipeline-wise but not independently verified businesses
        return 'completed';
    }
    if (qual && REJECTED_QUAL.includes(qual.systemDecision)) return 'rejected_skipped';
    if (st === 'failed' || st === 'blocked') {
        if (NO_WEBSITE_RE.test(reason) || /directory/i.test(reason)) return 'rejected_skipped';
        return 'failed';
    }
    if (enrich && ENRICH_DONE.includes(enrich.enrichmentStatus)) return 'processing';
    return 'waiting';
}

function currentStageLabel(bucket, enrich, qual, gen) {
    if (gen) return 'Verified (CP8)';
    if (qual) return 'Qualified (CP7)';
    if (enrich && ENRICH_DONE.includes(enrich.enrichmentStatus)) return 'Enriched (CP6)';
    if (capProcessing(enrich, bucket)) return 'Processing';
    if (bucket === 'waiting') return 'Waiting for enrichment';
    if (bucket === 'failed') return 'Failed';
    if (bucket === 'rejected_skipped') return 'Rejected / Skipped';
    if (bucket === 'review_required') return 'Review required';
    if (bucket === 'completed') return 'Completed';
    return 'Captured';
}

function capProcessing(enrich, bucket) {
    return bucket === 'processing' || (enrich && String(enrich.enrichmentStatus) === 'processing');
}

function failureReason(cap, enrich, qual, gen) {
    return gen?.errorReason
        || gen?.verificationReason
        || qual?.errorReason
        || qual?.decisionReason
        || enrich?.errorReason
        || cap.enrichmentBlockedReason
        || '';
}

function retryAvailable(cap, bucket) {
    if (bucket !== 'failed') return false;
    const reason = String(cap.enrichmentBlockedReason || '');
    if (NO_WEBSITE_RE.test(reason)) return false;
    if (/404|not found|login.?required|blocked|robots|unsupported directory|invalid url|disallow/i.test(reason)) {
        return false;
    }
    return ['failed', 'blocked', 'pending', 'not_started'].includes(String(cap.enrichmentStatus || 'pending'));
}

function mapJoinedRow({ cap, enrich, qual, gen, queryTextById, queryMetaById, index, campaign = {} }) {
    const exclusiveStatus = classifyExclusiveBucket(cap, enrich, qual, gen);
    const qid = cap.queryId ? String(cap.queryId) : '';
    const meta = queryMetaById[qid] || {};
    const addr = Array.isArray(enrich?.addresses) && enrich.addresses[0] ? enrich.addresses[0] : {};
    const contact = Array.isArray(enrich?.contactPersons) && enrich.contactPersons[0] ? enrich.contactPersons[0] : {};
    const companyName = enrich?.canonicalCompanyName || enrich?.companyName || enrich?.legalOrDisplayedName || cap.title || '';
    const bilingual = unpackChinaNotes(cap.notes);
    const hasEnrichDone = Boolean(enrich && ENRICH_DONE.includes(enrich.enrichmentStatus));
    const hasQualified = Boolean(qual);
    const isDirectoryGen = Boolean(enrich?.isDirectorySource)
        || String(gen?.systemDecision || '') === 'directory_or_marketplace_only';
    const hasVerified = Boolean(
        gen
        && gen.verificationStatus !== 'failed'
        && isIndependentlyVerifiedDecision(gen),
    );
    const isDirectoryListing = Boolean(gen && isDirectoryGen);
    const isReview = exclusiveStatus === 'review_required'
        || gen?.systemDecision === 'human_review_required'
        || gen?.genuinenessDecision === 'human_review_required';

    const base = {
        _id: String(cap._id),
        index,
        companyName,
        companyNameOriginal: bilingual?.companyNameOriginal || (cap.title || ''),
        companyNameEnglish: bilingual?.companyNameEnglish || '',
        evidenceOriginal: bilingual?.evidenceOriginal || cap.snippet || '',
        evidenceEnglish: bilingual?.evidenceEnglish || '',
        matchedModels: bilingual?.matchedModels || (meta.relatedKeyword ? [meta.relatedKeyword] : []),
        matchQuality: bilingual?.matchQuality || '',
        wechat: bilingual?.wechat || '',
        wechatPublic: bilingual?.wechat || '',
        sourceName: bilingual?.sourceName || cap.source || '',
        discoveredThrough: bilingual?.discoveredThrough || cap.source || '',
        destinationDomain: bilingual?.destinationDomain || enrich?.chinaCrawl?.destinationDomain || cap.displayDomain || '',
        destinationType: bilingual?.destinationType || enrich?.chinaCrawl?.destinationType || '',
        crawlStatus: bilingual?.crawlStatus || enrich?.chinaCrawl?.crawlStatus || '',
        pagesCrawled: bilingual?.pagesCrawled || enrich?.chinaCrawl?.pagesCrawled || 0,
        internalPagesCrawled: enrich?.chinaCrawl?.internalPagesCrawled || 0,
        hasChineseOriginal: Boolean(bilingual?.hasChineseOriginal)
            || /[\u3400-\u9fff]/.test(`${bilingual?.companyNameOriginal || ''} ${cap.title || ''} ${cap.snippet || ''}`),
        source: cap.source || '',
        sourceLanguage: bilingual ? 'zh' : '',
        chinaVerificationStatus: bilingual?.verificationStatus || '',
        chinaVerificationLabel: chinaSupplierStatusLabel(bilingual?.verificationStatus),
        chinaConfidence: bilingual?.confidence ?? '',
        uscc: bilingual?.uscc || '',
        title: cap.title || '',
        snippet: cap.snippet || '',
        website: enrich?.websiteUrl || cap.resultUrlOriginal || cap.resultUrlNormalized || '',
        sourceUrl: cap.resultUrlOriginal || cap.resultUrlNormalized || '',
        displayDomain: enrich?.canonicalDomain || cap.displayDomain || '',
        businessType: qual?.ownerBusinessTypeOverride || qual?.businessType || enrich?.businessType || meta.businessType || '',
        requestedBusinessType: qual?.requestedBusinessType || '',
        requestedBusinessTypes: Array.isArray(qual?.requestedBusinessTypes) ? qual.requestedBusinessTypes : [],
        detectedBusinessType: qual?.detectedBusinessType || '',
        detectedBusinessTypes: Array.isArray(qual?.detectedBusinessTypes) ? qual.detectedBusinessTypes : [],
        businessTypeMatch: qual?.businessTypeMatch || '',
        businessTypeMatchReason: qual?.businessTypeMatchReason || '',
        searchKeyword: meta.relatedKeyword || '',
        queryUsed: queryTextById[qid] || '',
        googlePageIndex: cap.googlePageIndex ?? cap.pageIndex ?? '',
        resultPosition: cap.resultPosition ?? '',
        city: bilingual?.city || enrich?.city || addr.city || '',
        state: enrich?.state || addr.state || '',
        country: enrich?.country || addr.country || '',
        province: bilingual?.province || '',
        primaryAddress: addr.raw || '',
        allAddresses: Array.isArray(enrich?.addresses)
            ? enrich.addresses.map((a) => `[${a.type || 'Address'}] ${a.raw || ''}`).filter((s) => s.length > 12).join(' || ')
            : '',
        addressCount: Array.isArray(enrich?.addresses) ? enrich.addresses.length : 0,
        confirmedCities: Array.isArray(qual?.confirmedCities) ? qual.confirmedCities.join(', ') : '',
        locationMatch: qual?.locationMatch || '',
        locationMatchLabel: formatLocationMatchLabel(qual?.locationMatch || ''),
        locationClassification: qual?.locationClassification || '',
        locationEvidenceUrl: qual?.locationEvidenceUrl || '',
        officeInSelectedCity: Boolean(qual?.officeInSelectedCity),
        servesSelectedCity: Boolean(qual?.servesSelectedCity),
        requestedLocation: formatRequestedLocation({
            city: qual?.selectedCity || campaign.city,
            state: qual?.selectedState || campaign.state,
            country: qual?.selectedCountry || campaign.country,
        }),
        detectedLocation: formatDetectedLocation({
            city: enrich?.city || addr.city || '',
            state: enrich?.state || addr.state || '',
            country: enrich?.country || addr.country || '',
            confirmedCities: Array.isArray(qual?.confirmedCities) ? qual.confirmedCities : [],
            confirmedStates: Array.isArray(qual?.confirmedStates) ? qual.confirmedStates : [],
        }),
        selectedCity: qual?.selectedCity || '',
        selectedState: qual?.selectedState || '',
        selectedCountry: qual?.selectedCountry || '',
        productMatchStrength: qual?.productMatchStrength || '',
        previousLocationClassification: qual?.previousLocationClassification || '',
        locationRecheckedAt: qual?.locationRecheckedAt || null,
        contactPerson: contact.name || '',
        phone: firstPhone(enrich?.phones) || bilingual?.phone || '',
        whatsapp: firstPhone(enrich?.whatsappNumbers),
        wechatPublic: bilingual?.wechat || '',
        email: firstEmail(enrich?.emails) || bilingual?.email || '',
        facebook: socialUrl(enrich?.facebook),
        instagram: socialUrl(enrich?.instagram),
        linkedin: socialUrl(enrich?.linkedin),
        productsServices: Array.isArray(enrich?.productsServices) ? enrich.productsServices.join('; ') : '',
        captureStatus: cap.inboxStatus || 'captured',
        enrichmentStatus: cap.enrichmentStatus || enrich?.enrichmentStatus || 'not_started',
        qualificationStatus: qual?.ownerDecision || qual?.systemDecision || '',
        relevanceScore: qual?.relevanceScore ?? '',
        genuinenessStatus: (() => {
            if (!gen) return '';
            if (isDirectoryGen && !(gen.ownerReviewStatus === 'approved' || gen.ownerDecision === 'verified_genuine')) {
                return 'directory_listing_not_independently_verified';
            }
            return gen.ownerDecision || gen.systemDecision || gen.genuinenessDecision || '';
        })(),
        genuinenessScore: gen?.genuinenessScore ?? '',
        exclusiveStatus,
        currentStage: currentStageLabel(exclusiveStatus, enrich, qual, gen),
        failureReason: failureReason(cap, enrich, qual, gen),
        retryAvailable: retryAvailable(cap, exclusiveStatus),
        retryCount: Number(cap.enrichmentRetryCount || cap.retryCount || 0),
        capturedAt: cap.firstSeenAt || cap.createdAt || null,
        lastProcessedAt: gen?.verifiedAt || qual?.qualifiedAt || enrich?.lastEnrichedAt || cap.lastSeenAt || null,
        enrichmentId: enrich?._id ? String(enrich._id) : '',
        qualificationId: qual?._id ? String(qual._id) : '',
        genuinenessId: gen?._id ? String(gen._id) : '',
        flags: {
            hasEnrichDone,
            hasQualified,
            hasVerified,
            isDirectoryListing,
            isReview,
            isFailed: exclusiveStatus === 'failed',
            isRejectedSkipped: exclusiveStatus === 'rejected_skipped',
            isWaiting: exclusiveStatus === 'waiting',
            isProcessing: exclusiveStatus === 'processing',
            isCompleted: exclusiveStatus === 'completed',
            isLocationMismatch: Boolean(
                qual?.locationMatch === 'mismatch'
                || (Array.isArray(qual?.unmatchedOrConflictingEvidence)
                    && qual.unmatchedOrConflictingEvidence.includes('location_mismatch')),
            ),
        },
        detail: {
            snippet: cap.snippet || '',
            sourceUrl: cap.resultUrlOriginal || cap.resultUrlNormalized || '',
            pagesVisited: enrich?.pagesVisited || [],
            sourceEvidence: enrich?.sourceEvidence || [],
            qualificationReason: qual?.decisionReason || '',
            genuinenessReason: gen?.verificationReason || '',
            warningSignals: gen?.warningSignals || [],
            positiveSignals: gen?.positiveSignals || [],
            failureReason: failureReason(cap, enrich, qual, gen),
            queryUsed: queryTextById[qid] || '',
            googlePageIndex: cap.googlePageIndex ?? cap.pageIndex ?? '',
        },
    };
    const row = base;
    row.strictFinalBucket = classifyStrictFinalBucket(row);
    return row;
}

async function loadCampaignJoinedRows(companyId, campaignId) {
    const [captures, enrichDocs, qualDocs, genDocs, queries, campaign] = await Promise.all([
        RawCapture.find({ companyId, campaignId }).sort({ firstSeenAt: 1, createdAt: 1 }).lean(),
        RawCaptureEnrichment.find({ companyId, campaignId }).lean(),
        RawCaptureQualification.find({ companyId, campaignId }).lean(),
        RawCaptureGenuineness.find({ companyId, campaignId }).lean(),
        SearchQuery.find({ companyId, campaignId }).select('_id queryText selectedCriteria').lean(),
        SearchCampaign.findById(campaignId).select('city state country locationScope').lean(),
    ]);

    const enrichByCapture = new Map();
    for (const e of enrichDocs) {
        for (const cid of (e.rawCaptureIds || [])) {
            const key = String(cid);
            if (!enrichByCapture.has(key)) enrichByCapture.set(key, e);
        }
    }
    const qualByEnrichment = new Map(qualDocs.map((q) => [String(q.enrichmentId), q]));
    const genByQual = new Map(genDocs.map((g) => [String(g.qualificationId), g]));
    const queryTextById = {};
    const queryMetaById = {};
    for (const q of queries) {
        queryTextById[String(q._id)] = q.queryText || '';
        queryMetaById[String(q._id)] = {
            businessType: q.selectedCriteria?.businessType || '',
            relatedKeyword: q.selectedCriteria?.relatedKeyword || '',
            locationScope: q.selectedCriteria?.locationScope || '',
        };
    }

    const rows = captures.map((cap, idx) => {
        const enrich = enrichByCapture.get(String(cap._id)) || null;
        const qual = enrich ? (qualByEnrichment.get(String(enrich._id)) || null) : null;
        const gen = qual ? (genByQual.get(String(qual._id)) || null) : null;
        return mapJoinedRow({
            cap, enrich, qual, gen, queryTextById, queryMetaById, index: idx + 1, campaign: campaign || {},
        });
    });

    return {
        rows,
        stageMetrics: {
            stageEnrichmentDocs: enrichDocs.length,
            stageQualificationDocs: qualDocs.length,
            stageGenuinenessDocs: genDocs.length,
        },
        queryTextById,
        queries,
    };
}

function countTabs(rows) {
    const counts = Object.fromEntries(TAB_KEYS.map((k) => [k, 0]));
    counts.all = rows.length;
    for (const r of rows) {
        if (r.exclusiveStatus === 'waiting') counts.waiting += 1;
        if (r.exclusiveStatus === 'processing') counts.processing += 1;
        if (r.flags.hasEnrichDone) counts.enriched += 1;
        if (r.flags.hasQualified) counts.qualified += 1;
        // Source-appearance count kept for internal metrics; unique count applied later for verified tab
        if (r.flags.hasVerified || r.exclusiveStatus === 'completed') {
            counts.verified += 1;
        }
        if (r.exclusiveStatus === 'review_required' || r.flags.isReview) counts.review_required += 1;
        if (r.exclusiveStatus === 'rejected_skipped') counts.rejected_skipped += 1;
        if (r.exclusiveStatus === 'failed') counts.failed += 1;
        if (r.strictFinalBucket && counts[r.strictFinalBucket] != null) counts[r.strictFinalBucket] += 1;
    }
    return counts;
}

function mapCanonicalCompanyToVerifiedRow(company, index) {
    const cs = company.contactSummary || {};
    return {
        _id: String(company.genuinenessId || company.canonicalKey || index),
        index,
        isCanonicalCompany: true,
        companyName: company.companyName || company.uniqueCompany || '',
        uniqueCompany: company.uniqueCompany || company.companyName || '',
        title: company.companyName || '',
        website: company.primaryWebsite || company.websiteUrl || '',
        primaryWebsite: company.primaryWebsite || company.websiteUrl || '',
        sourceUrl: company.primaryWebsite || company.websiteUrl || '',
        displayDomain: company.canonicalDomain || '',
        businessType: company.businessType || '',
        searchKeyword: '',
        queryUsed: '',
        googlePageIndex: '',
        resultPosition: '',
        city: company.city || '',
        state: company.state || '',
        country: '',
        contactPerson: cs.primaryContactPerson || '',
        phone: company.primaryPhone || '',
        primaryPhone: company.primaryPhone || '',
        allPhones: company.allPhones || [],
        whatsapp: company.primaryWhatsApp || '',
        email: company.primaryEmail || '',
        primaryEmail: company.primaryEmail || '',
        allEmails: company.allEmails || [],
        facebook: (cs.facebookAll || [])[0]?.value || '',
        instagram: (cs.instagramAll || [])[0]?.value || '',
        linkedin: (cs.linkedinAll || [])[0]?.value || '',
        productsServices: '',
        captureStatus: 'canonical',
        enrichmentStatus: 'completed',
        qualificationStatus: '',
        relevanceScore: '',
        genuinenessStatus: company.systemDecision || '',
        genuinenessScore: company.genuinenessScore ?? '',
        verificationStatus: company.verificationStatus,
        verificationStatusLabel: company.verificationStatusLabel,
        independentlyVerified: company.independentlyVerified,
        isDirectoryListing: company.isDirectoryListing,
        sourceAppearances: company.sourceAppearances,
        queryCount: company.queryCount,
        evidenceCount: company.evidenceCount,
        evidence: company.evidence || [],
        exclusiveStatus: 'completed',
        currentStage: 'Verified (CP8)',
        failureReason: '',
        retryAvailable: false,
        retryCount: 0,
        capturedAt: company.verifiedAt || company.createdAt || null,
        lastProcessedAt: company.verifiedAt || company.updatedAt || null,
        enrichmentId: company.enrichmentId ? String(company.enrichmentId) : '',
        qualificationId: company.qualificationId ? String(company.qualificationId) : '',
        genuinenessId: company.genuinenessId || '',
        canonicalKey: company.canonicalKey,
        contactSummary: cs,
        phones: company.phones || [],
        emails: company.emails || [],
        whatsappNumbers: company.whatsappNumbers || [],
        flags: {
            hasEnrichDone: true,
            hasQualified: true,
            hasVerified: company.independentlyVerified,
            isDirectoryListing: company.isDirectoryListing,
            isReview: false,
            isFailed: false,
            isRejectedSkipped: false,
            isWaiting: false,
            isProcessing: false,
            isCompleted: true,
            isCanonicalCompany: true,
        },
        detail: {
            snippet: '',
            sourceUrl: company.primaryWebsite || '',
            pagesVisited: [],
            sourceEvidence: [],
            qualificationReason: '',
            genuinenessReason: company.verificationReason || '',
            warningSignals: company.warningSignals || [],
            positiveSignals: company.positiveSignals || [],
            failureReason: '',
            queryUsed: '',
            googlePageIndex: '',
            evidence: company.evidence || [],
            sourceAppearances: company.sourceAppearances,
        },
    };
}

function exclusiveBuckets(rows) {
    const b = {
        waiting: 0, processing: 0, completed: 0,
        reviewRequired: 0, rejectedSkipped: 0, failed: 0,
    };
    for (const r of rows) {
        if (r.exclusiveStatus === 'waiting') b.waiting += 1;
        else if (r.exclusiveStatus === 'processing') b.processing += 1;
        else if (r.exclusiveStatus === 'completed') b.completed += 1;
        else if (r.exclusiveStatus === 'review_required') b.reviewRequired += 1;
        else if (r.exclusiveStatus === 'rejected_skipped') b.rejectedSkipped += 1;
        else if (r.exclusiveStatus === 'failed') b.failed += 1;
    }
    b.total = b.waiting + b.processing + b.completed + b.reviewRequired + b.rejectedSkipped + b.failed;
    return b;
}

function applyFilters(rows, query = {}) {
    const tab = String(query.tab || 'all').toLowerCase();
    const search = String(query.search || '').trim().toLowerCase();
    const businessType = String(query.businessType || '').trim().toLowerCase();
    const city = String(query.city || '').trim().toLowerCase();
    const state = String(query.state || '').trim().toLowerCase();
    const relevance = String(query.relevance || '').trim().toLowerCase();
    const genuineness = String(query.genuineness || '').trim().toLowerCase();
    const sourceName = String(query.sourceName || query.source || '').trim().toLowerCase();
    const failedOnly = query.failedRetry === '1' || query.failedRetry === 'true';
    const chineseTextOnly = query.chineseTextOnly === '1' || query.chineseTextOnly === 'true';
    const manufacturerEvidence = query.manufacturerEvidence === '1' || query.manufacturerEvidence === 'true';
    const exactModel = query.exactModel === '1' || query.exactModel === 'true';
    const hasPhone = query.hasPhone === '1' || query.hasPhone === 'true';
    const hasWeChat = query.hasWeChat === '1' || query.hasWeChat === 'true';
    const destType = String(query.destinationType || '').trim().toUpperCase();

    let out = rows;
    if (tab && tab !== 'all') {
        out = out.filter((r) => {
            if (tab === 'waiting') return r.exclusiveStatus === 'waiting';
            if (tab === 'processing') return r.exclusiveStatus === 'processing';
            if (tab === 'enriched') return r.flags.hasEnrichDone;
            if (tab === 'qualified') return r.flags.hasQualified;
            if (tab === 'verified') return r.flags.hasVerified && !r.flags.isDirectoryListing;
            if (tab === 'review_required') return r.exclusiveStatus === 'review_required' || r.flags.isReview;
            if (tab === 'rejected_skipped') return r.exclusiveStatus === 'rejected_skipped';
            if (tab === 'failed') return r.exclusiveStatus === 'failed';
            if (tab === 'location_mismatch') return r.flags?.isLocationMismatch || r.strictFinalBucket === 'location_mismatch';
            if (STRICT_FINAL_BUCKETS.includes(tab)) return r.strictFinalBucket === tab;
            return true;
        });
    }
    if (search) {
        out = out.filter((r) => {
            const hay = [
                r.companyName, r.title, r.website, r.sourceUrl, r.displayDomain,
                r.email, r.phone, r.queryUsed, r.city, r.state, r.failureReason,
            ].join(' ').toLowerCase();
            return hay.includes(search);
        });
    }
    if (businessType) out = out.filter((r) => String(r.businessType || '').toLowerCase().includes(businessType));
    if (city) out = out.filter((r) => String(r.city || '').toLowerCase().includes(city));
    if (state) out = out.filter((r) => String(r.state || '').toLowerCase().includes(state));
    if (relevance) out = out.filter((r) => String(r.qualificationStatus || '').toLowerCase().includes(relevance));
    if (genuineness) out = out.filter((r) => String(r.genuinenessStatus || '').toLowerCase().includes(genuineness));
    if (sourceName) {
        out = out.filter((r) => {
            const hay = `${r.sourceName || ''} ${r.source || ''} ${r.chinaVerificationStatus || ''}`.toLowerCase();
            if (sourceName === 'enterprise' || sourceName === 'enterprise_verification') {
                return /gsxt|aiqicha|qichacha|tianyancha|enterprise/.test(hay)
                    || String(r.chinaVerificationStatus || '').startsWith('VERIFIED_')
                    || r.chinaVerificationStatus === 'REGISTERED_BUSINESS_MANUFACTURING_NOT_PROVEN';
            }
            if (sourceName === 'company_website' || sourceName === 'company-website') {
                return String(r.destinationType || '').includes('COMPANY_WEBSITE')
                    || (!/1688|alibaba|made-in-china|globalsources|baidu|sogou|so\.com|google/.test(String(r.displayDomain || '').toLowerCase())
                        && Boolean(r.destinationDomain || r.displayDomain));
            }
            return hay.includes(sourceName) || String(r.sourceUrl || '').toLowerCase().includes(sourceName);
        });
    }
    if (chineseTextOnly) out = out.filter((r) => r.hasChineseOriginal || /[\u3400-\u9fff]/.test(`${r.companyNameOriginal || ''} ${r.title || ''} ${r.evidenceOriginal || ''}`));
    if (manufacturerEvidence) {
        out = out.filter((r) => /厂家|制造商|生产|工厂|manufacturer|factory|POTENTIAL_MANUFACTURER/i.test(
            `${r.evidenceOriginal || ''} ${r.snippet || ''} ${r.chinaVerificationStatus || ''} ${r.businessType || ''}`,
        ));
    }
    if (exactModel) out = out.filter((r) => String(r.matchQuality || '') === 'exact_model' || (Array.isArray(r.matchedModels) && r.matchedModels.length));
    if (hasPhone) out = out.filter((r) => Boolean(r.phone));
    if (hasWeChat) out = out.filter((r) => Boolean(r.wechat || r.wechatPublic));
    if (destType) out = out.filter((r) => String(r.destinationType || '').toUpperCase().includes(destType));
    if (failedOnly) out = out.filter((r) => r.exclusiveStatus === 'failed' && r.retryAvailable);

    const sortKey = String(query.sort || 'capturedAt');
    const sortDir = String(query.sortDir || 'asc').toLowerCase() === 'desc' ? -1 : 1;
    out = [...out].sort((a, b) => {
        const av = a[sortKey] ?? '';
        const bv = b[sortKey] ?? '';
        if (av === bv) return (a.index - b.index) * sortDir;
        if (av == null) return 1;
        if (bv == null) return -1;
        if (av < bv) return -1 * sortDir;
        if (av > bv) return 1 * sortDir;
        return 0;
    });
    return out;
}

async function loadOwnedSession(companyId, sessionId) {
    requireObjectId(sessionId, 'Assisted capture session');
    const session = await AssistedCaptureSession.findOne({ _id: sessionId, companyId }).lean();
    if (!session) throw new ApiError(404, 'Assisted capture session not found');
    return session;
}

export async function listCampaignCapturedData({ companyId, user, sessionId, query = {} }) {
    const cid = requireCompanyId(companyId);
    assertAssistedCaptureView(user);
    if (
        !checkUserPermission(user, 'data_extractor.raw_capture.view')
        && !checkUserPermission(user, 'data_extractor.raw_capture.manage')
    ) {
        throw new ApiError(403, 'Permission denied: data_extractor.raw_capture.view required');
    }
    const session = await loadOwnedSession(cid, sessionId);
    const campaign = await SearchCampaign.findOne({ _id: session.campaignId, companyId: cid }).lean();
    const { rows, stageMetrics, queryTextById } = await loadCampaignJoinedRows(cid, session.campaignId);
    const tabCounts = countTabs(rows);
    const buckets = exclusiveBuckets(rows);
    const strictFinalBuckets = countStrictFinalBuckets(rows);
    const cityNorm = normalizeCampaignCity(campaign?.city || '');
    const latestRecheck = await RawCaptureLocationRecheckJob.findOne({
        companyId: cid,
        sessionId,
    }).sort({ createdAt: -1 }).lean();
    const needsStrictRecheck = rows.some((r) => r.flags?.hasQualified && (
        !r.locationClassification
        || (r.locationMatch === 'match' && !r.officeInSelectedCity && /bangalore|banglore|bengaluru/i.test(String(campaign?.city || '')))
    ));

    const tab = String(query.tab || 'all').toLowerCase();

    // Verified tab: canonical unique companies (group BEFORE filter/sort/pagination)
    if (tab === 'verified') {
        const [enrichments, qualifications, genuinenessDocs, captures] = await Promise.all([
            RawCaptureEnrichment.find({ companyId: cid, campaignId: session.campaignId }).lean(),
            RawCaptureQualification.find({ companyId: cid, campaignId: session.campaignId }).lean(),
            RawCaptureGenuineness.find({ companyId: cid, campaignId: session.campaignId }).lean(),
            RawCapture.find({ companyId: cid, campaignId: session.campaignId }).sort({ firstSeenAt: 1, createdAt: 1 }).lean(),
        ]);
        const allMode = String(query.limit || '').toLowerCase() === 'all';
        const built = buildCanonicalVerifiedCompanies({
            captures,
            enrichments,
            qualifications,
            genuinenessDocs,
            queryTextById,
            options: {
                verifiedOnly: true,
                includeDirectoryListings: false,
                search: query.search || '',
                sort: query.sort || 'sourceAppearances',
                sortDir: query.sortDir || 'desc',
                page: query.page || 1,
                limit: allMode ? null : Math.min(500, Math.max(1, Number(query.limit) || 50)),
            },
        });
        const pageItems = built.items.map((c, idx) => mapCanonicalCompanyToVerifiedRow(c, idx + 1));
        tabCounts.verified = built.counters.uniqueVerifiedCompanies;
        return {
            items: pageItems,
            tabCounts,
            exclusiveBuckets: buckets,
            stageMetrics,
            verifiedCounters: built.counters,
            counters: built.counters,
            pagination: {
                page: built.pagination.page,
                limit: built.pagination.limit,
                total: built.pagination.total,
                campaignTotal: rows.length,
                totalPages: built.pagination.totalPages,
                allMode: built.pagination.allMode,
            },
            campaignId: String(session.campaignId),
            sessionId: String(sessionId),
            note: 'Verified tab returns canonical unique companies. Source appearances remain linked under evidence. RawCapture docs unchanged.',
        };
    }

    const filtered = applyFilters(rows, query);
    const requestedManufacturer = (campaign?.businessTypes || []).some((t) => /manufacturer/i.test(String(t)));
    if (requestedManufacturer && !query.sort) {
        filtered.sort((a, b) => {
            const d = businessTypeMatchRank(a.businessTypeMatch) - businessTypeMatchRank(b.businessTypeMatch);
            if (d) return d;
            return (Number(b.relevanceScore) || 0) - (Number(a.relevanceScore) || 0);
        });
    }
    const nativeSources = new Set(['1688', 'baidu', 'sogou', 'so360']);
    let chineseLanguageRecords = 0;
    let chineseNativeSourceAppearances = 0;
    let englishExportSourceAppearances = 0;
    let chineseCompanyWebsitesCrawled = 0;
    let companiesWithChineseOriginalName = 0;
    let companiesWithPublicPhone = 0;
    let companiesWithPublicWeChat = 0;
    let exactModelMatches = 0;
    let potentialManufacturers = 0;
    for (const r of rows) {
        const orig = `${r.companyNameOriginal || ''} ${r.title || ''} ${r.evidenceOriginal || ''} ${r.snippet || ''}`;
        if (isLikelyChineseBusinessText(orig)) chineseLanguageRecords += 1;
        const src = String(r.sourceName || r.source || '').toLowerCase();
        if (nativeSources.has(src)) chineseNativeSourceAppearances += 1;
        else englishExportSourceAppearances += 1;
        if (Number(r.pagesCrawled || 0) > 0 && String(r.destinationType || '').includes('COMPANY_WEBSITE')) {
            chineseCompanyWebsitesCrawled += 1;
        }
        if (/有限公司/.test(String(r.companyNameOriginal || ''))) companiesWithChineseOriginalName += 1;
        if (r.phone) companiesWithPublicPhone += 1;
        if (r.wechat || r.wechatPublic) companiesWithPublicWeChat += 1;
        if (r.matchQuality === 'exact_model' || (Array.isArray(r.matchedModels) && r.matchedModels.length)) exactModelMatches += 1;
        if (/POTENTIAL_MANUFACTURER|manufacturer|厂家|生产/i.test(`${r.chinaVerificationStatus || ''} ${r.businessType || ''} ${r.evidenceOriginal || ''}`)) {
            potentialManufacturers += 1;
        }
    }

    const allMode = String(query.limit || '').toLowerCase() === 'all';
    const limit = allMode ? filtered.length || 1 : Math.min(500, Math.max(1, Number(query.limit) || 50));
    const page = Math.max(1, Number(query.page) || 1);
    const skip = allMode ? 0 : (page - 1) * limit;
    const pageItems = allMode ? filtered : filtered.slice(skip, skip + limit);

    return {
        items: pageItems,
        tabCounts,
        exclusiveBuckets: buckets,
        strictFinalBuckets,
        strictFinalBucketLabels: STRICT_FINAL_BUCKET_LABELS,
        locationNormalization: {
            entered: cityNorm.entered,
            interpretedAs: cityNorm.display,
            wasCorrected: cityNorm.wasCorrected,
            note: cityNorm.wasCorrected
                ? `Campaign city “${cityNorm.entered}” is interpreted as ${cityNorm.display} for matching. Original value preserved in audit.`
                : '',
        },
        locationRecheck: latestRecheck || null,
        needsStrictRecheck,
        ruleEngineVersion: RULE_ENGINE_VERSION,
        stageMetrics,
        pagination: {
            page: allMode ? 1 : page,
            limit: allMode ? filtered.length : limit,
            total: filtered.length,
            campaignTotal: rows.length,
            totalPages: allMode ? 1 : Math.max(1, Math.ceil(filtered.length / limit)),
            allMode,
        },
        campaignId: String(session.campaignId),
        sessionId: String(sessionId),
        languageStats: {
            chineseNativeSourceAppearances,
            chineseLanguageRecords,
            englishExportSourceAppearances,
            chineseCompanyWebsitesCrawled,
            companiesWithChineseOriginalName,
            companiesWithPublicPhone,
            companiesWithPublicWeChat,
            exactModelMatches,
            potentialManufacturers,
            campaignTotal: rows.length,
        },
        note: 'Exclusive buckets are mutually exclusive and sum to campaignTotal. Stage metrics may overlap.',
    };
}

export async function exportAllCurrentCampaignData({ companyId, user, sessionId }) {
    const cid = requireCompanyId(companyId);
    assertAssistedCaptureView(user);
    if (
        !checkUserPermission(user, 'data_extractor.raw_capture.view')
        && !checkUserPermission(user, 'data_extractor.raw_capture.manage')
    ) {
        throw new ApiError(403, 'Permission denied: data_extractor.raw_capture.view required');
    }
    const session = await loadOwnedSession(cid, sessionId);
    const campaign = await SearchCampaign.findOne({ _id: session.campaignId, companyId: cid }).lean();
    const { rows, stageMetrics, queries } = await loadCampaignJoinedRows(cid, session.campaignId);
    const tabCounts = countTabs(rows);
    const buckets = exclusiveBuckets(rows);

    const buffer = await buildAllCurrentCapturedDataWorkbook({
        rows,
        campaign: campaign || {},
        session,
        tabCounts,
        exclusiveBuckets: buckets,
        stageMetrics,
        queries,
    });

    const safeName = String(campaign?.name || 'campaign').replace(/[^\w\-]+/g, '_').slice(0, 60);
    return {
        buffer,
        filename: `sls-all-current-${safeName}-${rows.length}.xlsx`,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        rowCount: rows.length,
        sheetNames: [
            'Campaign Summary',
            'All Captured Records',
            'Waiting Processing',
            'Enriched Contact Data',
            'Qualified Records',
            'Verified Records',
            'Review Required',
            'Failed Skipped',
            'Location Mismatch',
            'Company Locations',
            'Generated Queries',
        ],
        campaignId: String(session.campaignId),
        note: 'CRM Lead creation remains OFF. Export includes all current-campaign captures with present stage/status.',
    };
}
