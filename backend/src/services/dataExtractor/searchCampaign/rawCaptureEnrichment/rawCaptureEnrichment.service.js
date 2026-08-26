/**
 * Checkpoint 6A — RawCapture website enrichment orchestration.
 * Does NOT create CRM Leads. Does NOT overwrite RawCapture content fields.
 */
import mongoose from 'mongoose';
import { ApiError } from '../../../../utils/ApiError.js';
import { checkUserPermission } from '../../../../utils/permissionUtils.js';
import { AssistedCaptureSession } from '../../../../models/assistedCaptureSession.model.js';
import { RawCapture } from '../../../../models/rawCapture.model.js';
import { RawCaptureEnrichment, RawCaptureEnrichmentJob } from '../../../../models/rawCaptureEnrichment.model.js';
import { classifyStageA } from '../simpleLeadSearch/stageAPreFilter.util.js';
import { isChinaCountry } from '../simpleLeadSearch/queryBuilder.util.js';
import { SearchCampaign } from '../../../../models/searchCampaign.model.js';
import { crawlCompanyWebsite, resolveDestinationUrl } from '../chinaWebsiteCrawler/crawl.service.js';
import { isMarketplaceHost, isDirectoryHostCn, isSearchEngineHost } from '../chinaWebsiteCrawler/destinationType.util.js';
import { packChinaNotes, unpackChinaNotes } from '../simpleLeadSearch/chinaBilingual.util.js';
import { DOMAIN_ENRICH_TIMEOUT_MS, MAX_CONCURRENCY } from './constants.js';
import { enrichDomainFromWebsite } from './fetch.util.js';
import {
    computeMissingFields,
    isDirectoryHost,
    normalizeDomain,
    scoreEnrichmentConfidence,
} from './parse.util.js';
import { websiteFromInstagramCapture } from '../../socialSources/instagramWebsiteBridge.util.js';
import { fetchPublicHtml } from '../chinaWebsiteCrawler/safeFetch.util.js';
import {
    classifyEntityType,
    extractDirectoryListings,
    isGenericSeoCompanyTitle,
    resolveCanonicalCompanyName,
} from '../simpleLeadSearch/entityClassification.util.js';

function requireCompanyId(companyId) {
    if (!companyId || !mongoose.isValidObjectId(companyId)) throw new ApiError(400, 'Company context required');
    return companyId;
}

function actorId(user) {
    return user?._id || user?.id || null;
}

function assertEnrichPerm(user) {
    if (
        checkUserPermission(user, 'data_extractor.raw_capture.manage')
        || checkUserPermission(user, 'data_extractor.assisted_capture.start')
    ) return;
    throw new ApiError(403, 'Permission denied: enrichment requires raw_capture.manage or assisted_capture.start');
}

function assertViewPerm(user) {
    if (
        checkUserPermission(user, 'data_extractor.raw_capture.view')
        || checkUserPermission(user, 'data_extractor.assisted_capture.view')
    ) return;
    throw new ApiError(403, 'Permission denied');
}

async function loadSession(companyId, sessionId) {
    if (!mongoose.isValidObjectId(sessionId)) throw new ApiError(404, 'Assisted capture session not found');
    const session = await AssistedCaptureSession.findOne({ _id: sessionId, companyId }).lean();
    if (!session) throw new ApiError(404, 'Assisted capture session not found');
    return session;
}

function captureMongoForSession(session) {
    const mongo = { companyId: session.companyId, campaignId: session.campaignId };
    const batchIds = Array.isArray(session.rawCaptureBatchIds) ? session.rawCaptureBatchIds : [];
    if (batchIds.length) mongo.captureBatchId = { $in: batchIds };
    else mongo.queryId = session.queryId;
    return mongo;
}

function pickSeedUrl(capture) {
    return capture._resolvedSeed || capture.resultUrlOriginal || capture.resultUrlNormalized || '';
}

async function campaignIsChina(campaignId) {
    const camp = await SearchCampaign.findById(campaignId).select('country searchMarket').lean();
    if (!camp) return false;
    return isChinaCountry(camp.country) || camp.searchMarket === 'china_suppliers';
}

function chinaDirectoryLike(urlOrHost) {
    return isMarketplaceHost(urlOrHost) || isDirectoryHostCn(urlOrHost) || isSearchEngineHost(urlOrHost);
}

async function applyChinaCrawlToCaptures(captures, crawl) {
    if (!crawl?.data) return;
    for (const cap of captures) {
        const prev = unpackChinaNotes(cap.notes) || {};
        const notes = packChinaNotes({
            ...prev,
            companyNameOriginal: crawl.data.companyNameOriginal || prev.companyNameOriginal || cap.title || '',
            evidenceOriginal: crawl.data.evidenceOriginal || prev.evidenceOriginal || cap.snippet || '',
            addressOriginal: crawl.data.addressOriginal || prev.addressOriginal || '',
            wechat: crawl.data.publicWeChat || prev.wechat || '',
            phone: crawl.data.phone || prev.phone || '',
            email: crawl.data.email || prev.email || '',
            destinationDomain: crawl.destinationDomain || '',
            destinationType: crawl.destinationType || '',
            crawlStatus: crawl.crawlStatus || '',
            hasChineseOriginal: crawl.data.hasChineseOriginal ? 1 : 0,
            pagesCrawled: (crawl.pagesVisited || []).length,
            discoveredThrough: cap.source || prev.sourceName || '',
            sourceName: cap.source || prev.sourceName || '',
        });
        await RawCapture.updateOne({ _id: cap._id }, { $set: { notes } });
    }
}

function groupByDomain(captures) {
    const map = new Map();
    for (const c of captures) {
        if (String(c.source || '') === 'instagram') {
            const site = websiteFromInstagramCapture(c);
            if (!site) continue;
            c._resolvedSeed = site;
        }
        const domain = normalizeDomain(c._resolvedSeed || c.displayDomain || c.resultUrlNormalized || c.resultUrlOriginal);
        if (!domain) continue;
        if (String(c.source || '') !== 'instagram') {
            const stageA = classifyStageA(c);
            if (stageA.decision === 'rejected') continue;
        }
        if (!map.has(domain)) map.set(domain, []);
        map.get(domain).push(c);
    }
    return map;
}

async function upsertEnrichmentDoc({ companyId, campaignId, sessionId, domain, captureIds, userId, patch }) {
    const existing = await RawCaptureEnrichment.findOne({ companyId, campaignId, canonicalDomain: domain });
    const mergedIds = [...new Set([
        ...(existing?.rawCaptureIds || []).map(String),
        ...captureIds.map(String),
    ])].map((id) => new mongoose.Types.ObjectId(id));

    const payload = {
        ...patch,
        companyId,
        campaignId,
        sessionId,
        canonicalDomain: domain,
        rawCaptureIds: mergedIds,
        updatedBy: userId,
        lastEnrichedAt: new Date(),
    };
    if (!existing) payload.createdBy = userId;

    const doc = await RawCaptureEnrichment.findOneAndUpdate(
        { companyId, campaignId, canonicalDomain: domain },
        { $set: payload },
        { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    return doc;
}

async function markCapturesStatus(captureIds, companyId, status, blockedReason = '') {
    if (!captureIds.length) return;
    await RawCapture.updateMany(
        { _id: { $in: captureIds }, companyId },
        {
            $set: {
                enrichmentStatus: status,
                enrichmentEligible: status !== 'blocked',
                enrichmentBlockedReason: blockedReason,
            },
        },
    );
}

async function enrichOneDomain({ companyId, campaignId, sessionId, domain, captures, userId, isDirectory, chinaMode = false }) {
    const captureIds = captures.map((c) => c._id);
    await markCapturesStatus(captureIds, companyId, 'pending');

    const seed = pickSeedUrl(captures[0]);
    if (!seed) {
        await upsertEnrichmentDoc({
            companyId, campaignId, sessionId, domain, captureIds, userId,
            patch: {
                enrichmentStatus: 'failed',
                errorReason: 'No website URL on RawCapture',
                confidence: 0,
                missingFields: ['websiteUrl'],
            },
        });
        await markCapturesStatus(captureIds, companyId, 'failed', 'No website URL');
        return { status: 'failed', withPhone: 0, withEmail: 0, withWhatsApp: 0, withFacebook: 0, withInstagram: 0, review: 0 };
    }

    if (chinaMode && chinaDirectoryLike(seed)) {
        isDirectory = true;
    }

    if (isDirectory) {
        // Keep directory as discovery source; do not treat the category title as a company.
        const titleName = String(captures[0].title || '').split('|')[0].split('-')[0].trim().slice(0, 200);
        const classified = classifyEntityType({
            url: seed,
            title: titleName,
            snippet: captures[0].snippet || '',
            enrichment: { isDirectorySource: true, canonicalDomain: domain, websiteUrl: seed },
        });
        let discoveredListings = [];
        try {
            const fetched = await fetchPublicHtml(seed);
            if (fetched?.ok && fetched.html) {
                discoveredListings = extractDirectoryListings(fetched.html, fetched.finalUrl || seed);
            }
        } catch {
            discoveredListings = [];
        }
        const doc = await upsertEnrichmentDoc({
            companyId, campaignId, sessionId, domain, captureIds, userId,
            patch: {
                websiteUrl: seed,
                isDirectorySource: true,
                directoryPlatform: domain,
                directoryProfileUrl: seed,
                companyName: titleName,
                canonicalCompanyName: '',
                entityType: classified.entityType || 'DIRECTORY',
                companyEntityConfidence: 'Low',
                companyNameEvidence: 'Directory/category page — not an individual company.',
                qualificationMode: 'discovery_only',
                discoveredListings,
                enrichmentStatus: 'review_required',
                confidence: 10,
                errorReason: '',
                missingFields: ['phone', 'email', 'whatsapp', 'official_website', 'canonical_company'],
                sourceEvidence: [{
                    field: 'directoryProfile',
                    value: titleName || domain,
                    sourceUrl: seed,
                    note: discoveredListings.length
                        ? `Discovery source — ${discoveredListings.length} listed businesses parsed from public HTML`
                        : 'Directory listing — discovery source only; category title is not a company',
                }],
                facebook: {},
                instagram: {},
                phones: [],
                emails: [],
                whatsappNumbers: [],
            },
        });
        await markCapturesStatus(captureIds, companyId, 'blocked', 'Directory source — review required');
        return {
            status: 'review_required',
            withPhone: 0,
            withEmail: 0,
            withWhatsApp: 0,
            withFacebook: 0,
            withInstagram: 0,
            review: 1,
            enrichmentId: doc._id,
        };
    }

    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; }, DOMAIN_ENRICH_TIMEOUT_MS);
    let result;
    let chinaCrawl = null;
    try {
        if (chinaMode) {
            chinaCrawl = await crawlCompanyWebsite(seed);
            if (chinaCrawl.skippedSiteCrawl) {
                const titleName = String(captures[0].title || '').split('|')[0].split('-')[0].trim().slice(0, 200);
                const doc = await upsertEnrichmentDoc({
                    companyId, campaignId, sessionId, domain, captureIds, userId,
                    patch: {
                        websiteUrl: chinaCrawl.finalUrl || seed,
                        isDirectorySource: true,
                        directoryPlatform: chinaCrawl.destinationDomain || domain,
                        directoryProfileUrl: chinaCrawl.finalUrl || seed,
                        companyName: titleName,
                        enrichmentStatus: 'review_required',
                        confidence: 20,
                        missingFields: ['official_website'],
                        chinaCrawl: {
                            discoveredThrough: captures[0].source || '',
                            destinationType: chinaCrawl.destinationType,
                            destinationDomain: chinaCrawl.destinationDomain,
                            crawlStatus: chinaCrawl.crawlStatus,
                            pagesCrawled: (chinaCrawl.pagesVisited || []).length,
                            internalPagesCrawled: chinaCrawl.internalPagesCrawled || 0,
                            skippedSiteCrawl: true,
                        },
                    },
                });
                await markCapturesStatus(captureIds, companyId, 'blocked', 'Marketplace or directory listing — not a company website crawl');
                await applyChinaCrawlToCaptures(captures, chinaCrawl);
                return {
                    status: 'review_required',
                    withPhone: 0, withEmail: 0, withWhatsApp: 0, withFacebook: 0, withInstagram: 0, review: 1,
                    enrichmentId: doc._id,
                };
            } else if (chinaCrawl.ok && chinaCrawl.data?.parsed) {
                result = {
                    ok: true,
                    error: chinaCrawl.error || '',
                    pagesVisited: chinaCrawl.pagesVisited || [],
                    data: {
                        ...chinaCrawl.data.parsed,
                        websiteUrl: chinaCrawl.data.websiteUrl,
                        canonicalDomain: chinaCrawl.data.canonicalDomain || domain,
                        manufacturerEvidence: chinaCrawl.data.manufacturerEvidence
                            || chinaCrawl.data.parsed.manufacturerEvidence || '',
                    },
                };
            } else {
                result = {
                    ok: false,
                    error: chinaCrawl.error || 'China website crawl failed',
                    pagesVisited: chinaCrawl.pagesVisited || [],
                    data: null,
                };
            }
        }
        if (!result) {
            result = await enrichDomainFromWebsite(seed, { maxPages: chinaMode ? 8 : 5 });
        }
    } finally {
        clearTimeout(timer);
    }

    if (timedOut && !result?.ok) {
        result = { ok: false, error: 'Domain enrichment timed out', pagesVisited: [], data: null };
    }

    if (!result?.ok || !result.data) {
        await upsertEnrichmentDoc({
            companyId, campaignId, sessionId, domain, captureIds, userId,
            patch: {
                websiteUrl: seed,
                enrichmentStatus: 'failed',
                errorReason: String(result?.error || 'Enrichment failed').slice(0, 500),
                pagesVisited: result?.pagesVisited || [],
                confidence: 0,
            },
        });
        await markCapturesStatus(captureIds, companyId, 'failed', result?.error || 'Enrichment failed');
        return { status: 'failed', withPhone: 0, withEmail: 0, withWhatsApp: 0, withFacebook: 0, withInstagram: 0, review: 0 };
    }

    const data = result.data;
    if (chinaCrawl?.data?.companyNameOriginal && !data.companyName) {
        data.companyName = chinaCrawl.data.companyNameOriginal;
    }
    if (chinaCrawl?.data?.phone) {
        data.phones = [
            ...(data.phones || []),
            {
                original: chinaCrawl.data.phone,
                normalized: String(chinaCrawl.data.phone).startsWith('+')
                    ? chinaCrawl.data.phone
                    : `+86${String(chinaCrawl.data.phone).replace(/\D/g, '')}`,
                kind: 'mobile',
                sourceUrl: chinaCrawl.finalUrl || seed,
                labelledWhatsApp: false,
                confidence: 'visible_labelled_phone',
                originalText: chinaCrawl.data.phone,
                reviewRequired: false,
            },
        ];
    }
    if (chinaCrawl?.data?.email) {
        data.emails = [...(data.emails || []), { value: String(chinaCrawl.data.email).toLowerCase(), kind: 'general', sourceUrl: chinaCrawl.finalUrl || seed }];
    }
    if (chinaCrawl?.data?.addressOriginal && !(data.addresses || []).length) {
        data.addresses = [{
            raw: chinaCrawl.data.addressOriginal,
            city: '',
            state: '',
            country: 'China',
            type: 'Office',
            evidenceLabel: 'Chinese website address label',
            confidence: 'medium',
            sourceUrl: chinaCrawl.finalUrl || seed,
        }];
        data.country = 'China';
    }
    // Prefer first-party canonical name; do not use generic SEO Google titles as company name.
    if (!data.companyName || !String(data.canonicalCompanyName || '').trim()) {
        const googleTitle = String(captures[0].title || '').split('|')[0].split('-')[0].trim().slice(0, 200);
        const resolved = resolveCanonicalCompanyName({
            jsonLdName: data.companyName || '',
            legalName: data.legalOrDisplayedName || '',
            googleTitle,
            isDirectory: false,
        });
        if (resolved.name) {
            data.companyName = resolved.name;
            data.canonicalCompanyName = resolved.name;
            data.companyEntityConfidence = resolved.confidence;
            data.companyNameEvidence = resolved.evidence;
        } else if (!data.companyName && googleTitle && !isGenericSeoCompanyTitle(googleTitle)) {
            data.companyName = googleTitle;
            data.sourceEvidence = [
                ...(data.sourceEvidence || []),
                { field: 'companyName', value: data.companyName, sourceUrl: seed, note: 'from Google result title (unverified)' },
            ];
        }
    }

    const confidence = scoreEnrichmentConfidence(data);
    const missingFields = computeMissingFields(data);
    let enrichmentStatus = 'completed';
    if (missingFields.includes('phone') || missingFields.includes('email')) enrichmentStatus = 'partial';
    if (!data.companyName && !data.emails.length && !data.phones.length) enrichmentStatus = 'failed';

    const doc = await upsertEnrichmentDoc({
        companyId, campaignId, sessionId, domain, captureIds, userId,
        patch: {
            websiteUrl: data.websiteUrl || seed,
            isDirectorySource: false,
            companyName: data.companyName || '',
            legalOrDisplayedName: data.legalOrDisplayedName || '',
            canonicalCompanyName: data.canonicalCompanyName || data.companyName || '',
            entityType: 'COMPANY',
            companyEntityConfidence: data.companyEntityConfidence || '',
            companyNameEvidence: data.companyNameEvidence || '',
            qualificationMode: 'company',
            contactPersons: data.contactPersons || [],
            phones: data.phones || [],
            whatsappNumbers: data.whatsappNumbers || [],
            emails: data.emails || [],
            addresses: data.addresses || [],
            city: data.city || '',
            state: data.state || '',
            country: data.country || '',
            facebook: data.facebook || {},
            instagram: data.instagram || {},
            linkedin: data.linkedin || {},
            youtube: data.youtube || {},
            productsServices: data.productsServices || [],
            businessType: data.businessType || 'unknown',
            manufacturerEvidence: data.manufacturerEvidence || '',
            gstin: data.gstin || '',
            gstinSourceUrl: data.gstinSourceUrl || '',
            rejectedPhones: data.rejectedPhones || [],
            sourceEvidence: data.sourceEvidence || [],
            pagesVisited: result.pagesVisited || [],
            chinaCrawl: chinaCrawl ? {
                discoveredThrough: captures[0].source || '',
                destinationType: chinaCrawl.destinationType,
                destinationDomain: chinaCrawl.destinationDomain,
                crawlStatus: chinaCrawl.crawlStatus,
                pagesCrawled: (chinaCrawl.pagesVisited || []).length,
                internalPagesCrawled: chinaCrawl.internalPagesCrawled || 0,
                hasChineseOriginal: Boolean(chinaCrawl.data?.hasChineseOriginal),
                publicWeChat: chinaCrawl.data?.publicWeChat || '',
                companyNameOriginal: chinaCrawl.data?.companyNameOriginal || '',
                evidenceOriginal: String(chinaCrawl.data?.evidenceOriginal || '').slice(0, 400),
            } : {},
            enrichmentStatus,
            confidence,
            missingFields,
            errorReason: '',
        },
    });

    await markCapturesStatus(
        captureIds,
        companyId,
        enrichmentStatus === 'failed' ? 'failed' : 'completed',
        '',
    );
    if (chinaMode && chinaCrawl) {
        await applyChinaCrawlToCaptures(captures, chinaCrawl);
    }

    return {
        status: enrichmentStatus,
        withPhone: (data.phones || []).length ? 1 : 0,
        withEmail: (data.emails || []).length ? 1 : 0,
        withWhatsApp: (data.whatsappNumbers || []).length ? 1 : 0,
        withFacebook: data.facebook?.url ? 1 : 0,
        withInstagram: data.instagram?.url ? 1 : 0,
        review: enrichmentStatus === 'review_required' ? 1 : 0,
        enrichmentId: doc._id,
    };
}

const runningJobs = new Set();

async function processJob(jobId) {
    if (runningJobs.has(String(jobId))) return;
    runningJobs.add(String(jobId));
    try {
        let job = await RawCaptureEnrichmentJob.findById(jobId);
        if (!job) return;
        job.status = 'processing';
        job.startedAt = new Date();
        await job.save();

        const session = await AssistedCaptureSession.findById(job.sessionId).lean();
        if (!session) {
            job.status = 'failed';
            job.lastError = 'Session not found';
            job.finishedAt = new Date();
            await job.save();
            return;
        }

        let captures;
        if (job.mode === 'selected' && job.selectedRawCaptureIds?.length) {
            // Campaign-wide by explicit IDs (continuous pipeline / multi-query batches)
            captures = await RawCapture.find({
                companyId: job.companyId,
                campaignId: job.campaignId,
                _id: { $in: job.selectedRawCaptureIds },
            }).sort({ firstSeenAt: 1, lastSeenAt: 1 }).lean();
        } else {
            const mongo = captureMongoForSession(session);
            captures = await RawCapture.find(mongo).sort({ lastSeenAt: -1 }).lean();
            if (job.mode === 'retry_failed') {
                captures = captures.filter((c) => c.enrichmentStatus === 'failed' || c.enrichmentStatus === 'blocked');
            } else {
                // all_unverified
                captures = captures.filter((c) => !c.enrichmentStatus || c.enrichmentStatus === 'not_started' || c.enrichmentStatus === 'pending');
            }
        }

        const chinaMode = await campaignIsChina(job.campaignId);
        if (chinaMode) {
            for (const c of captures) {
                const seed = c.resultUrlOriginal || c.resultUrlNormalized || '';
                if (!seed) continue;
                try {
                    const dest = await resolveDestinationUrl(seed);
                    if (dest.ok && dest.finalUrl) {
                        c._resolvedSeed = dest.finalUrl;
                        if (dest.rootDomain) c.displayDomain = dest.rootDomain;
                    }
                } catch {
                    /* keep original seed */
                }
            }
        }

        const grouped = groupByDomain(captures);
        job.totalDomains = grouped.size;
        await job.save();

        const entries = [...grouped.entries()];
        let idx = 0;

        async function worker() {
            while (idx < entries.length) {
                const current = await RawCaptureEnrichmentJob.findById(jobId).select('stopRequested').lean();
                if (current?.stopRequested) break;

                const my = idx;
                idx += 1;
                const [domain, list] = entries[my];
                await RawCaptureEnrichmentJob.updateOne({ _id: jobId }, { $set: { currentDomain: domain } });

                const isDirectory = isDirectoryHost(domain) || (chinaMode && chinaDirectoryLike(domain));
                let stats;
                try {
                    stats = await enrichOneDomain({
                        companyId: job.companyId,
                        campaignId: job.campaignId,
                        sessionId: job.sessionId,
                        domain,
                        captures: list,
                        userId: job.createdBy,
                        isDirectory,
                        chinaMode,
                    });
                } catch (err) {
                    stats = { status: 'failed', withPhone: 0, withEmail: 0, withWhatsApp: 0, withFacebook: 0, withInstagram: 0, review: 0 };
                    await RawCaptureEnrichmentJob.updateOne({ _id: jobId }, {
                        $set: { lastError: String(err?.message || err).slice(0, 500) },
                        $inc: { failedCount: 1, processedDomains: 1 },
                    });
                    continue;
                }

                const inc = { processedDomains: 1 };
                if (stats.status === 'completed') inc.completedCount = 1;
                else if (stats.status === 'partial') inc.partialCount = 1;
                else if (stats.status === 'failed') inc.failedCount = 1;
                else if (stats.status === 'review_required') {
                    inc.reviewRequiredCount = 1;
                    inc.blockedCount = 1;
                }
                if (stats.withPhone) inc.withPhone = 1;
                if (stats.withEmail) inc.withEmail = 1;
                if (stats.withWhatsApp) inc.withWhatsApp = 1;
                if (stats.withFacebook) inc.withFacebook = 1;
                if (stats.withInstagram) inc.withInstagram = 1;

                await RawCaptureEnrichmentJob.updateOne({ _id: jobId }, { $inc: inc });
            }
        }

        const workers = Array.from(
            { length: Math.min(chinaMode ? 1 : MAX_CONCURRENCY, Math.max(1, entries.length)) },
            () => worker(),
        );
        await Promise.all(workers);

        job = await RawCaptureEnrichmentJob.findById(jobId);
        if (job.stopRequested) {
            job.status = 'stopped';
        } else if (job.failedCount && (job.completedCount || job.partialCount)) {
            job.status = 'partial';
        } else if (job.failedCount && !job.completedCount && !job.partialCount) {
            job.status = 'failed';
        } else {
            job.status = 'completed';
        }
        job.finishedAt = new Date();
        job.currentDomain = '';
        await job.save();
    } finally {
        runningJobs.delete(String(jobId));
    }
}

export async function startEnrichmentJob({ companyId, user, sessionId, mode = 'all_unverified', rawCaptureIds = [] }) {
    const cid = requireCompanyId(companyId);
    assertEnrichPerm(user);
    const session = await loadSession(cid, sessionId);

    const active = await RawCaptureEnrichmentJob.findOne({
        companyId: cid,
        sessionId,
        status: { $in: ['queued', 'processing'] },
    }).lean();
    if (active) {
        return { job: active, alreadyRunning: true };
    }

    const job = await RawCaptureEnrichmentJob.create({
        companyId: cid,
        campaignId: session.campaignId,
        sessionId,
        mode: mode === 'selected' ? 'selected' : mode === 'retry_failed' ? 'retry_failed' : 'all_unverified',
        selectedRawCaptureIds: (rawCaptureIds || []).filter((id) => mongoose.isValidObjectId(id)),
        status: 'queued',
        createdBy: actorId(user),
    });

    setImmediate(() => {
        processJob(job._id).catch((err) => {
            console.error('CP6 enrichment job failed', job._id, err?.message || err);
        });
    });

    return { job: job.toObject(), alreadyRunning: false };
}

/**
 * Run existing Phase 1 website enrichment now for already-loaded captures.
 * Instagram seeds come from notes/snippet website — not instagram.com.
 */
export async function enrichCapturesNow({ companyId, user, sessionId = null, captures = [] }) {
    const cid = requireCompanyId(companyId);
    assertEnrichPerm(user);
    if (!captures.length) return { results: [], skipped: 0 };
    let session = null;
    if (sessionId) {
        session = await loadSession(cid, sessionId);
    }
    const grouped = groupByDomain(captures);
    const results = [];
    for (const [domain, list] of grouped.entries()) {
        const isDirectory = isDirectoryHost(domain);
        const stats = await enrichOneDomain({
            companyId: cid,
            campaignId: session?.campaignId || list[0].campaignId,
            sessionId: session?._id || sessionId || list[0].sessionId || null,
            domain,
            captures: list,
            userId: actorId(user),
            isDirectory,
            chinaMode: false,
        });
        results.push({
            domain,
            rawCaptureIds: list.map((c) => String(c._id)),
            ...stats,
        });
    }
    return {
        results,
        skipped: Math.max(0, captures.length - [...grouped.values()].flat().length),
    };
}

export async function stopEnrichmentJob({ companyId, user, sessionId, jobId }) {
    const cid = requireCompanyId(companyId);
    assertEnrichPerm(user);
    await loadSession(cid, sessionId);
    const filter = { companyId: cid, sessionId };
    if (jobId) filter._id = jobId;
    else filter.status = { $in: ['queued', 'processing'] };

    const job = await RawCaptureEnrichmentJob.findOneAndUpdate(
        filter,
        { $set: { stopRequested: true } },
        { new: true, sort: { createdAt: -1 } },
    );
    if (!job) throw new ApiError(404, 'No active enrichment job');
    return { job };
}

export async function getEnrichmentJobStatus({ companyId, user, sessionId, jobId }) {
    const cid = requireCompanyId(companyId);
    assertViewPerm(user);
    await loadSession(cid, sessionId);
    let job;
    if (jobId) {
        job = await RawCaptureEnrichmentJob.findOne({ _id: jobId, companyId: cid, sessionId }).lean();
    } else {
        job = await RawCaptureEnrichmentJob.findOne({ companyId: cid, sessionId }).sort({ createdAt: -1 }).lean();
    }
    return { job: job || null };
}

export async function listEnrichmentsForSession({ companyId, user, sessionId }) {
    const cid = requireCompanyId(companyId);
    assertViewPerm(user);
    const session = await loadSession(cid, sessionId);
    const items = await RawCaptureEnrichment.find({
        companyId: cid,
        campaignId: session.campaignId,
    }).sort({ updatedAt: -1 }).lean();
    return { items, campaignId: session.campaignId };
}

export async function getEnrichmentDetail({ companyId, user, sessionId, enrichmentId }) {
    const cid = requireCompanyId(companyId);
    assertViewPerm(user);
    const session = await loadSession(cid, sessionId);
    const enrichment = await RawCaptureEnrichment.findOne({
        _id: enrichmentId,
        companyId: cid,
        campaignId: session.campaignId,
    }).lean();
    if (!enrichment) throw new ApiError(404, 'Enrichment record not found');

    const captures = await RawCapture.find({
        _id: { $in: enrichment.rawCaptureIds || [] },
        companyId: cid,
    }).lean();

    return { enrichment, captures };
}

export async function updateEnrichmentReview({ companyId, user, sessionId, enrichmentId, body = {} }) {
    const cid = requireCompanyId(companyId);
    assertEnrichPerm(user);
    const session = await loadSession(cid, sessionId);
    const enrichment = await RawCaptureEnrichment.findOne({
        _id: enrichmentId,
        companyId: cid,
        campaignId: session.campaignId,
    });
    if (!enrichment) throw new ApiError(404, 'Enrichment record not found');

    if (body.reviewStatus && ['unreviewed', 'approved', 'rejected', 'needs_edit'].includes(body.reviewStatus)) {
        enrichment.reviewStatus = body.reviewStatus;
    }
    if (body.ownerOverrides && typeof body.ownerOverrides === 'object') {
        enrichment.ownerOverrides = { ...(enrichment.ownerOverrides || {}), ...body.ownerOverrides };
        // Apply safe scalar overrides without inventing data
        for (const key of ['companyName', 'city', 'state', 'country', 'businessType']) {
            if (body.ownerOverrides[key] != null) enrichment[key] = String(body.ownerOverrides[key]).slice(0, 300);
        }
    }
    enrichment.updatedBy = actorId(user);
    await enrichment.save();
    return { enrichment: enrichment.toObject() };
}

export { processJob };