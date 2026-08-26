import { DiscoveryJob } from '../../../models/discoveryJob.model.js';
import { DiscoverySourceTask } from '../../../models/discoverySourceTask.model.js';
import { ExtractedLead } from '../../../models/extractedLead.model.js';
import { ApiError } from '../../../utils/ApiError.js';
import { DISCLAIMER } from './providerTypes.js';
import { assertProvidersExecutable, getProvider, listDiscoveryProviders } from './providerRegistry.js';
import { validateImportUrls } from './urlValidation.js';
import { assertResolvedPublicUrl, assertPublicHttpUrl } from './ssrfGuard.js';
import { mergePreviewList, normalizeDomain } from './mergeNormalize.service.js';
import { searchWithSerpApi } from '../providers/serpapiProvider.js';
import { searchWithBrave } from '../providers/braveSearchProvider.js';
import { searchWithPublicHtml } from '../providers/publicHtmlSearchProvider.js';
import { generatePhase1Queries, parseLocationInput } from './queryGenerator.util.js';
import { enrichDomainFromWebsite } from '../searchCampaign/rawCaptureEnrichment/fetch.util.js';
import { isDirectoryHost } from '../searchCampaign/rawCaptureEnrichment/parse.util.js';
import ExcelJS from 'exceljs';
import {
    buildIndiamartBraveQuery,
    enrichIndiamartPublicUrl,
    getIndiamartDiscoveryConfig,
    isIndiamartUrl,
} from './indiamartDiscovery.service.js';
import { enrichRecordsWithGooglePlaces } from '../placesEnrichment.service.js';
import { runManualUrlAdapter } from '../adapters/manualUrlAdapter.js';
import { runExcelImportAdapter } from '../adapters/excelImportAdapter.js';
import { normalizeExtractedRecord } from '../companyNormalizer.service.js';
import { enrichRecordsWithDuplicates, mapDuplicateDisplayLabel } from '../duplicateChecker.service.js';
import { syncMergeReviewsFromJob } from './entityResolution/mergeReview.service.js';
import { scoreExtractorConfidence, normalizeExtractorUrl } from '../extractor.utils.js';
import { getOrCreateExtractorSettings, assertExtractorModuleEnabled } from '../extractor.service.js';
import { applyControlledResultCap, getControlledTestConfig } from '../controlledTestMode.js';
import { convertExtractedToLead } from '../extractorConversion.service.js';
import { applyPostExtractionPhase2, checkCrmDuplicatesForConvert } from './phase2/qualification.service.js';
import { buildPhase2Analytics } from './phase2/analytics.util.js';

function discoveryCfg(settings) {
    return settings?.sourceConnectors?.discovery || {};
}

function audit(job, action, detail = {}) {
    const log = Array.isArray(job.metadata?.auditLog) ? [...job.metadata.auditLog] : [];
    log.push({ at: new Date().toISOString(), action, ...detail });
    job.metadata = { ...(job.metadata || {}), auditLog: log.slice(-200), disclaimer: DISCLAIMER };
}

function clampTarget(n, settings) {
    const cfg = discoveryCfg(settings);
    const maxTarget = Math.min(1000, Math.max(1, Number(cfg.maxTarget) || 1000));
    const v = Math.max(1, Number(n) || Number(cfg.defaultTarget) || 100);
    return Math.min(maxTarget, v);
}

function clampBatch(n, settings) {
    const cfg = discoveryCfg(settings);
    const maxBatch = Math.min(250, Math.max(1, Number(cfg.maxBatchSize) || 250));
    const v = Math.max(1, Number(n) || Number(cfg.defaultBatchSize) || 10);
    return Math.min(maxBatch, v);
}

function batchWindow(job) {
    return Math.max(1, Number(job.batchSize) || 10);
}

function buildQuery(job) {
    return [job.keyword, job.city, job.state, job.country].map((s) => String(s || '').trim()).filter(Boolean).join(' ');
}

async function loadJob(companyId, jobId) {
    const job = await DiscoveryJob.findOne({ _id: jobId, companyId, isDeleted: { $ne: true } });
    if (!job) throw new ApiError(404, 'Discovery job not found');
    return job;
}

function attachDupLabels(records) {
    return (records || []).map((r, idx) => {
        const label = r.duplicateDisplayLabel || r._duplicateLabel || mapDuplicateDisplayLabel(r) || 'NEW';
        return { ...r, _previewIndex: idx, _duplicateLabel: label, duplicateDisplayLabel: label };
    });
}

function crawlMaxPages(depth) {
    const d = Number(depth);
    if (d <= 0) return 1;
    if (d >= 2) return 8;
    return 5;
}

function delayMs(ms) {
    return new Promise((r) => setTimeout(r, Math.max(0, Number(ms) || 0)));
}

const runningDiscoveryLoops = new Set();

function directoryPlatformOf(link) {
    const lower = String(link || '').toLowerCase();
    if (lower.includes('indiamart.com')) return 'indiamart';
    if (lower.includes('tradeindia.com')) return 'tradeindia';
    if (lower.includes('justdial.com')) return 'justdial';
    if (lower.includes('exportersindia.com')) return 'exportersindia';
    return '';
}

function isSocialProfileUrl(link) {
    const lower = String(link || '').toLowerCase();
    return lower.includes('facebook.com')
        || lower.includes('instagram.com')
        || lower.includes('linkedin.com')
        || lower.includes('twitter.com')
        || /(?:^|\/\/)(?:www\.)?x\.com\//i.test(lower)
        || lower.includes('youtube.com')
        || lower.includes('youtu.be');
}

function computeRunStats(job, generatedQueries = []) {
    const records = job.metadata?.previewRecords || [];
    const queries = generatedQueries.length ? generatedQueries : (job.metadata?.generatedQueries || []);
    const queryDone = queries.filter((q) => ['done', 'blocked', 'skipped'].includes(String(q.status || ''))).length;
    const emailsFound = records.filter((r) => r.email).length;
    const phonesFound = records.filter((r) => r.phone || r.mobile || r.whatsappNumber).length;
    const contactsFound = records.filter((r) => r.email || r.phone || r.mobile || r.whatsappNumber).length;
    const websitesProcessed = records.filter((r) => r.rawExtractedData?.enriched
        || r.crawlStatus === 'data_extracted'
        || r.crawlStatus === 'failed').length;
    const failedBlocked = records.filter((r) => ['failed', 'blocked', 'failed_blocked'].includes(String(r.crawlStatus || r.extractionStatus || ''))).length
        + Number(job.metadata?.blockedQueryCount || 0);
    const phase2 = buildPhase2Analytics(job, records);
    return {
        searchQueriesDone: queryDone,
        searchQueriesTotal: queries.length,
        candidatesFound: job.totalRawResults || records.length,
        websitesProcessed,
        contactsFound,
        uniqueCompanies: phase2.uniqueCompanies || job.totalUniqueResults || records.length,
        emailsFound,
        phonesFound,
        failedBlocked,
        aiProcessed: phase2.aiProcessed,
        highlyRelevant: phase2.highlyRelevant,
        relevant: phase2.relevant,
        possible: phase2.possible,
        notRelevant: phase2.notRelevant,
        insufficientInformation: phase2.insufficientInformation,
        potentialDuplicates: phase2.potentialDuplicates,
        convertedToCrmLeads: phase2.convertedToCrmLeads,
        sourceEffectiveness: phase2.sourceEffectiveness,
    };
}

export async function listProvidersForCompany(companyId) {
    const settings = await getOrCreateExtractorSettings(companyId);
    return { providers: listDiscoveryProviders(settings), disclaimer: DISCLAIMER, controlledTestMode: getControlledTestConfig(settings) };
}

export async function createDiscoveryJob({
    companyId,
    userId,
    financialYear,
    keyword,
    city = '',
    state = '',
    country = '',
    location = '',
    targetCompanies,
    batchSize,
    selectedSources = [],
    crawlDepth = 1,
    includeDirectories = true,
}) {
    if (!financialYear) throw new ApiError(400, 'financialYear is required');
    const kw = String(keyword || '').trim();
    if (!kw || kw.length < 2 || kw.length > 200) throw new ApiError(400, 'Keyword must be 2-200 characters');
    const settings = await getOrCreateExtractorSettings(companyId);
    if (!settings.moduleEnabled) throw new ApiError(403, 'Data Extractor module is not enabled for this company');

    const parsedLoc = parseLocationInput(location, { city, state, country });
    const cityN = parsedLoc.city;
    const stateN = parsedLoc.state;
    const countryN = parsedLoc.country;

    const target = clampTarget(targetCompanies, settings);
    const batch = clampBatch(batchSize, settings);
    let requestedSources = Array.isArray(selectedSources) ? selectedSources.filter(Boolean) : [];
    if (!requestedSources.length) {
        requestedSources = ['public_web', 'website_enrichment'];
    }
    if (!requestedSources.includes('public_web') && !requestedSources.includes('brave') && !requestedSources.includes('serpapi')) {
        requestedSources = ['public_web', ...requestedSources];
    }
    if (!requestedSources.includes('website_enrichment')) {
        requestedSources.push('website_enrichment');
    }

    const { selected, executable, skipped } = assertProvidersExecutable(requestedSources, settings);
    if (!executable.length) {
        throw new ApiError(400, 'No executable discovery sources are available. Public web discovery should always be enabled.');
    }

    const depth = [0, 1, 2].includes(Number(crawlDepth)) ? Number(crawlDepth) : 1;
    const generatedQueries = generatePhase1Queries({
        keyword: kw,
        city: cityN,
        state: stateN,
        country: countryN,
        includeDirectories: includeDirectories !== false,
    });

    const job = await DiscoveryJob.create({
        companyId,
        financialYear,
        createdBy: userId,
        keyword: kw,
        city: cityN,
        state: stateN,
        country: countryN,
        targetCompanies: target,
        batchSize: batch,
        selectedSources: selected.length ? selected : executable,
        status: 'DRAFT',
        metadata: {
            previewOnly: true,
            previewRecords: [],
            disclaimer: DISCLAIMER,
            skippedSources: skipped,
            executableSources: executable,
            auditLog: [],
            generatedQueries,
            crawlDepth: depth,
            includeDirectories: includeDirectories !== false,
            pipelineStatus: 'queued',
            unlimitedCollection: true,
            stopReason: '',
            runStats: computeRunStats({ totalRawResults: 0, totalUniqueResults: 0, metadata: { previewRecords: [], generatedQueries } }, generatedQueries),
        },
    });
    audit(job, 'job_created', { target, batch, selected: job.selectedSources, queryCount: generatedQueries.length, crawlDepth: depth });
    await job.save();

    const taskIds = selected.length ? selected : executable;
    for (const id of taskIds) {
        const p = getProvider(id);
        let status = 'PENDING';
        if (!p || p.comingSoon || !p.executable) status = 'NOT_CONFIGURED';
        else if (!p.isConfigured(settings)) status = 'NOT_CONFIGURED';
        else if (!p.isEnabled(settings)) status = 'DISABLED';
        else if (!executable.includes(id)) status = 'DISABLED';
        await DiscoverySourceTask.create({
            jobId: job._id,
            companyId,
            providerId: id,
            status,
        });
    }

    return getDiscoveryJobDetail(companyId, job._id);
}

async function refreshSourceProgress(job) {
    const tasks = await DiscoverySourceTask.find({ jobId: job._id, companyId: job.companyId }).lean();
    const sourceProgress = {};
    for (const t of tasks) {
        sourceProgress[t.providerId] = {
            status: t.status,
            pagesProcessed: t.pagesProcessed,
            rawResults: t.rawResults,
            uniqueResults: t.uniqueResults,
            apiRequests: t.apiRequests,
            lastError: t.lastError || '',
        };
    }
    job.sourceProgress = sourceProgress;
    return tasks;
}

export async function getDiscoveryJobDetail(companyId, jobId) {
    const job = await loadJob(companyId, jobId);
    const tasks = await refreshSourceProgress(job);
    await job.save();
    const obj = job.toObject();
    return {
        ...obj,
        tasks,
        disclaimer: DISCLAIMER,
        previewRecords: attachDupLabels(obj.metadata?.previewRecords || []),
        generatedQueries: obj.metadata?.generatedQueries || [],
        runStats: obj.metadata?.runStats || computeRunStats(obj),
        crawlDepth: obj.metadata?.crawlDepth ?? 1,
    };
}

export async function listDiscoveryJobs(companyId, query = {}) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(query.limit) || 20));
    const q = { companyId, isDeleted: { $ne: true } };
    if (query.status) q.status = String(query.status).toUpperCase();
    const [results, total] = await Promise.all([
        DiscoveryJob.find(q).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
        DiscoveryJob.countDocuments(q),
    ]);
    return { results, total, page, limit, disclaimer: DISCLAIMER };
}

function mapSearchItemsToRecords(job, items, sourceProvider, query) {
    const records = [];
    const seen = new Set((job.metadata?.previewRecords || []).map((r) => r.normalizedDomain).filter(Boolean));
    const seenUrls = new Set((job.metadata?.previewRecords || []).map((r) => String(r.sourceUrl || '').toLowerCase()).filter(Boolean));
    const locLabel = [job.city, job.state, job.country].filter(Boolean).join(', ');
    for (const item of items) {
        const link = String(item.link || '').trim();
        if (!link) continue;
        const lower = link.toLowerCase();
        if (seenUrls.has(lower)) continue;
        seenUrls.add(lower);
        const dirPlat = directoryPlatformOf(link) || (isIndiamartUrl(link) ? 'indiamart' : '');
        if (dirPlat) {
            records.push({
                companyName: String(item.title || '').split('|')[0].split('-')[0].trim() || `${dirPlat} listing`,
                website: '',
                sourcePlatform: dirPlat === 'indiamart' ? 'indiamart' : (dirPlat === 'tradeindia' ? 'tradeindia' : (dirPlat === 'justdial' ? 'justdial' : (dirPlat === 'exportersindia' ? 'exportersindia' : 'web_search'))),
                sourceUrl: link,
                businessDescription: String(item.snippet || '').trim(),
                city: job.city,
                stateProvince: job.state,
                country: job.country,
                keywords: [job.keyword],
                extractedAt: new Date(),
                confidenceScore: 40,
                crawlStatus: 'candidate_found',
                extractionStatus: 'candidate_found',
                socialLinks: {},
                rawExtractedData: {
                    discoveryJobId: String(job._id),
                    sourceProvider: dirPlat,
                    sourceProviders: [sourceProvider, dirPlat].filter(Boolean),
                    directoryProfileUrl: link,
                    searchKeyword: job.keyword,
                    searchLocation: locLabel,
                    searchQuery: query,
                    via: sourceProvider,
                    isDirectory: true,
                },
            });
            continue;
        }
        if (isSocialProfileUrl(link)) {
            records.push({
                companyName: String(item.title || '').split('|')[0].split('-')[0].trim(),
                website: '',
                sourcePlatform: lower.includes('facebook.com') ? 'facebook_page' : (lower.includes('instagram.com') ? 'instagram_business' : 'web_search'),
                sourceUrl: link,
                businessDescription: String(item.snippet || '').trim(),
                city: job.city,
                stateProvince: job.state,
                country: job.country,
                keywords: [job.keyword],
                extractedAt: new Date(),
                confidenceScore: 35,
                crawlStatus: 'candidate_found',
                extractionStatus: 'candidate_found',
                socialLinks: {
                    facebook: lower.includes('facebook.com') ? link : '',
                    instagram: lower.includes('instagram.com') ? link : '',
                    linkedin: lower.includes('linkedin.com') ? link : '',
                    twitter: (lower.includes('twitter.com') || /(?:^|\/\/)(?:www\.)?x\.com\//i.test(lower)) ? link : '',
                    youtube: (lower.includes('youtube.com') || lower.includes('youtu.be')) ? link : '',
                },
                rawExtractedData: {
                    discoveryJobId: String(job._id),
                    sourceProvider,
                    sourceProviders: [sourceProvider],
                    searchKeyword: job.keyword,
                    searchLocation: locLabel,
                    searchQuery: query,
                    socialOnly: true,
                },
            });
            continue;
        }
        const { domain } = normalizeExtractorUrl(link);
        if (domain && seen.has(domain)) continue;
        if (domain) seen.add(domain);
        const companyName = String(item.title || '').split('|')[0].split('-')[0].trim();
        records.push({
            companyName,
            website: link,
            normalizedDomain: domain,
            sourcePlatform: 'web_search',
            sourceUrl: link,
            businessDescription: String(item.snippet || '').trim(),
            city: job.city,
            stateProvince: job.state,
            country: job.country,
            keywords: [job.keyword],
            extractedAt: new Date(),
            confidenceScore: scoreExtractorConfidence({ companyName, website: link, city: job.city }),
            crawlStatus: 'candidate_found',
            extractionStatus: 'candidate_found',
            socialLinks: {},
            rawExtractedData: {
                discoveryJobId: String(job._id),
                sourceProvider,
                sourceProviders: [sourceProvider],
                searchKeyword: job.keyword,
                searchLocation: locLabel,
                searchQuery: query,
                sourceUrls: [link],
            },
        });
    }
    return records;
}

async function processBraveBatch(job, task, settings, queryOverride = null) {
    const query = queryOverride || buildQuery(job);
    const ctl = getControlledTestConfig(settings);
    const cfg = discoveryCfg(settings);
    const page = Number(task.cursor?.page || 0);
    const maxPages = Math.min(
        ctl.enabled ? Math.min(2, Number(cfg.perJobRequestLimit) || 2) : (Number(cfg.perJobRequestLimit || cfg.maxProviderPagesPerJob) || 20),
        50,
    );
    if (page >= maxPages) {
        task.status = 'EXHAUSTED';
        return { records: [], apiRequests: 0, exhausted: true };
    }
    const need = batchWindow(job);
    const maxResults = Math.min(job.batchSize, need, applyControlledResultCap(job.batchSize, settings));
    const offsetStart = Number(task.cursor?.offset || 0);
    const { items, error, pagesFetched, statusCode, nextOffset } = await searchWithBrave({
        query,
        maxResults,
        settings,
        maxPages: 1,
        offsetStart,
    });
    task.apiRequests += 1;
    task.pagesProcessed += pagesFetched || 1;
    if (error) {
        task.lastError = error;
        task.status = 'FAILED';
        return { records: [], apiRequests: 1, exhausted: false, error, failed: true, statusCode };
    }
    task.cursor = { page: page + 1, offset: nextOffset != null ? nextOffset : offsetStart + 1, query };
    if (!items?.length) {
        task.status = 'EXHAUSTED';
        return { records: [], apiRequests: 1, exhausted: true };
    }
    const records = mapSearchItemsToRecords(job, items, 'brave', query);
    task.rawResults += records.length;
    return { records, apiRequests: 1, exhausted: items.length < 10 };
}

async function processPublicWebBatch(job, task, settings, queryOverride = null) {
    const queries = Array.isArray(job.metadata?.generatedQueries) && job.metadata.generatedQueries.length
        ? job.metadata.generatedQueries
        : generatePhase1Queries({
            keyword: job.keyword,
            city: job.city,
            state: job.state,
            country: job.country,
            includeDirectories: job.metadata?.includeDirectories !== false,
        });
    let qIndex = Number(task.cursor?.queryIndex || 0);
    const need = batchWindow(job);
    if (queryOverride) {
        const maxResults = Math.min(job.batchSize, need, applyControlledResultCap(job.batchSize, settings));
        const { items, error, pagesFetched, statusCode, providerName } = await searchWithPublicHtml({
            query: queryOverride,
            maxResults,
        });
        task.apiRequests += 1;
        task.pagesProcessed += pagesFetched || 1;
        if (error && ['RATE_LIMITED', 'BLOCKED'].includes(statusCode)) {
            task.lastError = error;
            task.status = 'FAILED';
            return { records: [], apiRequests: 1, exhausted: false, error, failed: true, statusCode, generatedQueries: queries };
        }
        const records = mapSearchItemsToRecords(job, items || [], providerName || 'public_web', queryOverride);
        task.rawResults += records.length;
        return { records, apiRequests: 1, exhausted: !(items || []).length, generatedQueries: queries, error: error || '' };
    }
    while (qIndex < queries.length) {
        const planned = queries[qIndex];
        if (['done', 'blocked'].includes(String(planned.status || ''))) {
            qIndex += 1;
            continue;
        }
        const query = planned.queryText;
        const maxResults = Math.min(job.batchSize, need, applyControlledResultCap(job.batchSize, settings), 10);
        await delayMs(Number(discoveryCfg(settings).defaultRequestDelayMs) || 800);
        const { items, error, pagesFetched, statusCode, providerName } = await searchWithPublicHtml({
            query,
            maxResults,
        });
        task.apiRequests += 1;
        task.pagesProcessed += pagesFetched || 1;
        planned.status = (statusCode === 'RATE_LIMITED' || statusCode === 'BLOCKED') ? 'blocked' : 'done';
        planned.lastError = error || '';
        planned.providerName = providerName || 'public_web';
        queries[qIndex] = planned;
        task.cursor = { queryIndex: qIndex + 1, query, providerName };
        if (error && ['RATE_LIMITED', 'BLOCKED'].includes(statusCode)) {
            job.metadata = {
                ...(job.metadata || {}),
                generatedQueries: queries,
                blockedQueryCount: Number(job.metadata?.blockedQueryCount || 0) + 1,
            };
            // Do not endlessly retry; move on to next query on next tick.
            qIndex += 1;
            task.lastError = error;
            const records = mapSearchItemsToRecords(job, items || [], providerName || 'public_web', query);
            task.rawResults += records.length;
            return {
                records,
                apiRequests: 1,
                exhausted: qIndex >= queries.length,
                error,
                failed: false,
                statusCode,
                generatedQueries: queries,
            };
        }
        const records = mapSearchItemsToRecords(job, items || [], providerName || 'public_web', query);
        task.rawResults += records.length;
        job.metadata = { ...(job.metadata || {}), generatedQueries: queries };
        if (!records.length && !items?.length) {
            qIndex += 1;
            continue;
        }
        return {
            records,
            apiRequests: 1,
            exhausted: qIndex + 1 >= queries.length && !(items || []).length,
            generatedQueries: queries,
            error: error || '',
        };
    }
    task.status = 'EXHAUSTED';
    job.metadata = { ...(job.metadata || {}), generatedQueries: queries };
    return { records: [], apiRequests: 0, exhausted: true, generatedQueries: queries };
}

async function processSerpBatch(job, task, settings) {
    const query = buildQuery(job);
    const ctl = getControlledTestConfig(settings);
    const page = Number(task.cursor?.page || 0);
    const maxPages = Math.min(
        ctl.enabled ? ctl.maxSerpApiPages : (Number(discoveryCfg(settings).maxProviderPagesPerJob) || 20),
        50,
    );
    if (page >= maxPages) {
        task.status = 'EXHAUSTED';
        return { records: [], apiRequests: 0, exhausted: true };
    }
    const need = batchWindow(job);
    const maxResults = Math.min(job.batchSize, need, applyControlledResultCap(job.batchSize, settings));
    const { items, error, pagesFetched, statusCode } = await searchWithSerpApi({
        query,
        maxResults,
        settings,
        maxPages: 1,
    });
    task.apiRequests += 1;
    task.pagesProcessed += pagesFetched || 1;
    if (error) {
        task.lastError = error;
        task.status = 'FAILED';
        return { records: [], apiRequests: 1, exhausted: false, error, failed: true, statusCode };
    }
    task.cursor = { page: page + 1, query };
    if (!items?.length) {
        task.status = 'EXHAUSTED';
        return { records: [], apiRequests: 1, exhausted: true };
    }
    const records = mapSearchItemsToRecords(job, items, 'serpapi', query);
    task.rawResults += records.length;
    return { records, apiRequests: 1, exhausted: items.length < 10 };
}

async function processIndiamartTick(job, task, settings, braveAvailable) {
    const cfg = getIndiamartDiscoveryConfig(settings);
    if (!cfg.enabled) {
        task.status = 'DISABLED';
        return { records: [], apiRequests: 0 };
    }
    if (!cfg.publicDiscoveryMode) {
        task.status = 'NOT_CONFIGURED';
        task.lastError = 'IndiaMART automatic discovery is disabled. Directory listings are still found via public site: search queries.';
        return { records: [], apiRequests: 0, statusCode: 'PUBLIC_ACCESS_ONLY' };
    }
    const query = buildIndiamartBraveQuery(job.keyword, job.city, job.state, job.country);
    const result = braveAvailable
        ? await processBraveBatch(job, task, settings, query)
        : await processPublicWebBatch(job, task, settings, query);
    const out = [];
    const blocked = [];
    let delay = cfg.requestDelayMs;
    for (const rec of result.records || []) {
        if (!isIndiamartUrl(rec.sourceUrl)) {
            out.push(rec);
            continue;
        }
        if (delay) await new Promise((r) => setTimeout(r, Math.min(delay, 3000)));
        const enriched = await enrichIndiamartPublicUrl(rec.sourceUrl, settings);
        if (!enriched.record) {
            blocked.push(enriched.status || 'FAILED');
            if (['CAPTCHA_BLOCKED', 'LOGIN_REQUIRED', 'RATE_LIMITED'].includes(enriched.status)) {
                task.lastError = enriched.message || enriched.status;
                if (blocked.filter((b) => b === enriched.status).length >= 2) {
                    task.status = 'FAILED';
                    return {
                        records: out,
                        apiRequests: (result.apiRequests || 0) + 1,
                        failed: true,
                        error: enriched.message,
                        statusCode: enriched.status,
                    };
                }
            }
            out.push(rec);
            continue;
        }
        out.push(normalizeExtractedRecord({
            ...rec,
            ...enriched.record,
            city: rec.city || enriched.record.city,
            rawExtractedData: {
                ...(rec.rawExtractedData || {}),
                ...(enriched.record.rawExtractedData || {}),
                sourceProviders: [...new Set([
                    ...((rec.rawExtractedData || {}).sourceProviders || []),
                    'indiamart',
                    'brave',
                ])],
            },
        }));
        task.uniqueResults += 1;
    }
    task.rawResults += out.length;
    if (result.exhausted) task.status = 'EXHAUSTED';
    if (result.failed) task.status = 'FAILED';
    return { ...result, records: out, blockedCount: blocked.length };
}

async function enrichWebsites(records, settings, job) {
    const cfg = discoveryCfg(settings);
    if (cfg.websiteEnrichmentEnabled === false) return { records, errors: [] };
    const ctl = getControlledTestConfig(settings);
    const depth = [0, 1, 2].includes(Number(job.metadata?.crawlDepth)) ? Number(job.metadata.crawlDepth) : 1;
    const maxPages = crawlMaxPages(depth);
    const maxSites = Math.min(records.length, ctl.enabled ? ctl.maxWebsites : Math.max(job.batchSize, 8), 20);
    const errors = [];
    const out = [...records];
    const domainCache = new Set(job.metadata?.enrichedDomains || []);
    const blockedDomains = new Set(job.metadata?.blockedDomains || []);
    const delay = Math.max(400, Number(cfg.defaultRequestDelayMs) || 1000);

    for (let i = 0; i < maxSites; i++) {
        const rec = out[i];
        const site = rec?.website;
        if (!site) continue;
        if (rec.rawExtractedData?.socialOnly || rec.rawExtractedData?.isDirectory) continue;
        const domain = rec.normalizedDomain || normalizeDomain(site);
        if (domain && (domainCache.has(domain) || blockedDomains.has(domain))) continue;
        if (isDirectoryHost(site) || isDirectoryHost(domain)) continue;
        rec.crawlStatus = 'crawling';
        rec.extractionStatus = 'crawling';
        try {
            await assertResolvedPublicUrl(site);
            if (i > 0) await delayMs(delay);
            const crawled = await enrichDomainFromWebsite(site, { maxPages });
            if (domain) domainCache.add(domain);
            if (!crawled.ok || !crawled.data) {
                const msg = crawled.error || `Website ${domain || site} did not respond within timeout. Candidate retained for later review.`;
                errors.push(msg);
                rec.crawlStatus = /403|429|blocked/i.test(msg) ? 'failed_blocked' : 'failed';
                rec.extractionStatus = rec.crawlStatus;
                rec.rawExtractedData = { ...(rec.rawExtractedData || {}), enrichError: msg, pagesCrawled: crawled.pagesVisited || [] };
                if (/403|429|blocked/i.test(msg) && domain) blockedDomains.add(domain);
                continue;
            }
            const data = crawled.data;
            const emails = data.emails || [];
            const phones = data.phones || [];
            const wa = data.whatsappNumbers || [];
            const primaryEmail = emails[0]?.value || emails[0]?.email || '';
            const primaryPhone = phones[0]?.original || phones[0]?.normalized || '';
            const emailSource = emails[0]?.sourceUrl || (data.sourceEvidence || []).find((e) => e.field === 'email')?.sourceUrl || '';
            const phoneSource = phones[0]?.sourceUrl || (data.sourceEvidence || []).find((e) => e.field === 'phone')?.sourceUrl || '';
            const addr = (data.addresses || [])[0] || {};
            out[i] = normalizeExtractedRecord({
                ...rec,
                companyName: rec.companyName || data.companyName || data.legalOrDisplayedName || '',
                email: rec.email || primaryEmail,
                phone: rec.phone || primaryPhone,
                mobile: rec.mobile || (phones.find((p) => p.kind === 'mobile')?.original || ''),
                whatsappNumber: rec.whatsappNumber || wa[0]?.original || wa[0]?.normalized || '',
                address: rec.address || addr.raw || '',
                city: rec.city || data.city || addr.city || '',
                stateProvince: rec.stateProvince || data.state || addr.state || '',
                country: rec.country || data.country || addr.country || '',
                pincode: rec.pincode || addr.pinCode || '',
                businessDescription: rec.businessDescription || data.productsServices?.slice(0, 8).join(', ') || '',
                productCategories: [...new Set([...(rec.productCategories || []), ...(data.productsServices || [])])].slice(0, 20),
                socialLinks: {
                    ...(rec.socialLinks || {}),
                    facebook: rec.socialLinks?.facebook || data.facebook?.url || '',
                    instagram: rec.socialLinks?.instagram || data.instagram?.url || '',
                    linkedin: rec.socialLinks?.linkedin || data.linkedin?.url || '',
                    youtube: rec.socialLinks?.youtube || data.youtube?.url || '',
                    twitter: rec.socialLinks?.twitter || data.twitter?.url || '',
                },
                confidenceScore: Math.max(rec.confidenceScore || 0, primaryEmail || primaryPhone ? 70 : 45),
                crawlStatus: 'data_extracted',
                extractionStatus: 'data_extracted',
                rawExtractedData: {
                    ...(rec.rawExtractedData || {}),
                    enriched: true,
                    crawlDepth: depth,
                    pagesCrawled: crawled.pagesVisited || [],
                    emails: emails.slice(0, 8),
                    phones: phones.slice(0, 8),
                    emailSourceUrl: emailSource,
                    phoneSourceUrl: phoneSource,
                    sourceEvidence: (data.sourceEvidence || []).slice(0, 40),
                    rawPhone: phones[0]?.original || '',
                    normalizedPhone: phones[0]?.normalized || '',
                    sourceProviders: [...new Set([...(rec.rawExtractedData?.sourceProviders || []), 'website_enrichment'])],
                },
            });
        } catch (err) {
            const msg = `${domain || site} did not respond within timeout. Candidate retained for later review. (${err.message || 'enrich failed'})`;
            errors.push(msg);
            rec.crawlStatus = 'failed';
            rec.extractionStatus = 'failed';
            rec.rawExtractedData = { ...(rec.rawExtractedData || {}), enrichError: msg };
        }
    }
    job.metadata = {
        ...(job.metadata || {}),
        enrichedDomains: [...domainCache].slice(-500),
        blockedDomains: [...blockedDomains].slice(-200),
    };
    return { records: out, errors };
}

async function processOneTick(job, settings) {
    const tasks = await DiscoverySourceTask.find({ jobId: job._id, companyId: job.companyId });
    let fresh = [];
    let warnings = [];
    const cfg = discoveryCfg(settings);
    const allowPaid = cfg.allowPaidFallback === true;
    job.metadata = { ...(job.metadata || {}), pipelineStatus: 'searching' };

    const publicTask = tasks.find((t) => t.providerId === 'public_web' && ['PENDING', 'RUNNING'].includes(t.status));
    if (publicTask) {
        publicTask.status = 'RUNNING';
        const result = await processPublicWebBatch(job, publicTask, settings);
        job.totalApiRequests += result.apiRequests || 0;
        if (result.generatedQueries) {
            job.metadata = { ...(job.metadata || {}), generatedQueries: result.generatedQueries };
        }
        if (result.error) {
            warnings.push(result.error);
            job.errorSummary = [...(job.errorSummary || []), result.error].slice(-20);
        }
        fresh = result.records || [];
        if (result.failed) publicTask.status = 'FAILED';
        else if (result.exhausted && publicTask.status !== 'FAILED') publicTask.status = 'EXHAUSTED';
        await publicTask.save();
    }

    const braveTask = tasks.find((t) => t.providerId === 'brave' && ['PENDING', 'RUNNING'].includes(t.status));
    if (braveTask) {
        braveTask.status = 'RUNNING';
        const result = await processBraveBatch(job, braveTask, settings);
        job.totalApiRequests += result.apiRequests || 0;
        if (result.error) {
            warnings.push(result.error);
            job.errorSummary = [...(job.errorSummary || []), result.error].slice(-20);
        }
        fresh = result.records || [];
        if (result.failed) braveTask.status = 'FAILED';
        else if (result.exhausted && braveTask.status !== 'FAILED') braveTask.status = 'EXHAUSTED';
        await braveTask.save();
    }

    const imTask = tasks.find((t) => t.providerId === 'indiamart' && ['PENDING', 'RUNNING'].includes(t.status));
    if (imTask) {
        imTask.status = 'RUNNING';
        const braveAvailable = !!(settings?.sourceConnectors?.brave?.apiKey || process.env.BRAVE_SEARCH_API_KEY);
        const result = await processIndiamartTick(job, imTask, settings, braveAvailable);
        job.totalApiRequests += result.apiRequests || 0;
        if (result.error) {
            warnings.push(result.error);
            job.errorSummary = [...(job.errorSummary || []), result.error].slice(-20);
        }
        if (result.records?.length) fresh = [...fresh, ...result.records];
        if (result.statusCode === 'PUBLIC_ACCESS_ONLY' && !result.records?.length) {
            imTask.status = 'NOT_CONFIGURED';
        }
        await imTask.save();
    }

    const serpTask = tasks.find((t) => t.providerId === 'serpapi' && ['PENDING', 'RUNNING'].includes(t.status));
    if (serpTask) {
        if (!allowPaid && cfg.serpapiEnabled !== true) {
            serpTask.status = 'DISABLED';
            serpTask.lastError = 'SerpAPI is optional paid fallback and is disabled in Free-First mode';
            await serpTask.save();
        } else {
            serpTask.status = 'RUNNING';
            const result = await processSerpBatch(job, serpTask, settings);
            job.totalApiRequests += result.apiRequests || 0;
            if (result.error) {
                warnings.push(result.error);
                job.errorSummary = [...(job.errorSummary || []), result.error].slice(-20);
            }
            if (result.records?.length) fresh = [...fresh, ...result.records];
            if (result.failed) serpTask.status = 'FAILED';
            else if (result.exhausted && serpTask.status !== 'FAILED') serpTask.status = 'EXHAUSTED';
            await serpTask.save();
        }
    }

    if (fresh.length && tasks.some((t) => t.providerId === 'website_enrichment' && !['DISABLED', 'NOT_CONFIGURED'].includes(t.status))) {
        const enriched = await enrichWebsites(fresh, settings, job);
        fresh = enriched.records;
        warnings.push(...(enriched.errors || []));
        const wt = tasks.find((t) => t.providerId === 'website_enrichment');
        if (wt) {
            wt.status = 'RUNNING';
            wt.uniqueResults += fresh.filter((r) => r.rawExtractedData?.enriched).length;
            await wt.save();
        }
    }

    if (fresh.length && allowPaid && tasks.some((t) => t.providerId === 'google_places' && t.status !== 'DISABLED' && t.status !== 'NOT_CONFIGURED')) {
        try {
            const places = await enrichRecordsWithGooglePlaces(fresh, {
                keyword: job.keyword,
                city: job.city,
                state: job.state,
                country: job.country,
            }, settings);
            fresh = places.records;
            warnings.push(...(places.errors || []));
            job.totalApiRequests += places.enrichedCount || 0;
            const pt = tasks.find((t) => t.providerId === 'google_places');
            if (pt) {
                pt.status = 'RUNNING';
                pt.apiRequests += places.enrichedCount || 0;
                pt.uniqueResults += places.enrichedCount || 0;
                await pt.save();
            }
        } catch (err) {
            warnings.push(err.message || 'Places enrichment failed');
        }
    }

    let preview = [...(job.metadata?.previewRecords || []), ...fresh.map(normalizeExtractedRecord)];
    preview = mergePreviewList(preview);
    try {
        const p2 = await applyPostExtractionPhase2({
            _id: job._id,
            companyId: job.companyId,
            financialYear: job.financialYear,
            keyword: job.keyword,
            city: job.city,
            state: job.state,
            country: job.country,
            totalRawResults: (job.totalRawResults || 0) + fresh.length,
            metadata: { ...(job.metadata || {}), previewRecords: preview },
        });
        preview = p2.preview;
        job.metadata = { ...(job.metadata || {}), phase2Analytics: p2.analytics };
    } catch (_) { /* Phase 2 must never fail Phase 1 extraction */ }
    preview = await enrichRecordsWithDuplicates(job.companyId, preview);
    try { await syncMergeReviewsFromJob(job.companyId, job._id, job.createdBy); } catch (_) { /* non-blocking */ }
    preview = attachDupLabels(preview);
    preview = preview.map((r) => {
        if (r.duplicateDisplayLabel && r.duplicateDisplayLabel !== 'NEW' && r.crawlStatus !== 'data_extracted') {
            return { ...r, crawlStatus: 'duplicate_detected', extractionStatus: 'duplicate_detected' };
        }
        return r;
    });

    const before = job.totalUniqueResults || 0;
    job.totalRawResults += fresh.length;
    job.totalUniqueResults = preview.length;
    job.totalDuplicates = preview.filter((r) => r.duplicateDisplayLabel && r.duplicateDisplayLabel !== 'NEW').length;
    const runStats = computeRunStats({ ...job.toObject?.() || job, metadata: { ...(job.metadata || {}), previewRecords: preview } });
    job.metadata = {
        ...(job.metadata || {}),
        previewOnly: true,
        previewRecords: preview,
        disclaimer: DISCLAIMER,
        pipelineStatus: job.status === 'RUNNING' ? 'searching' : (job.metadata?.pipelineStatus || 'searching'),
        runStats,
        freeFirstNote: 'Batch size is an operational limit only. Collection continues until queries/pages are exhausted, the user stops, or a provider is blocked — not because a result cap was reached.',
        lastWarnings: warnings.slice(-10),
        enrichedDomains: job.metadata?.enrichedDomains || [],
    };
    job.lastProcessedAt = new Date();

    const active = await DiscoverySourceTask.find({
        jobId: job._id,
        companyId: job.companyId,
        status: { $in: ['PENDING', 'RUNNING'] },
        providerId: { $in: ['public_web', 'brave', 'serpapi', 'indiamart'] },
    });
    if (!active.length && !fresh.length) {
        job.status = warnings.length ? 'COMPLETED_WITH_WARNINGS' : 'COMPLETED';
        job.completedAt = new Date();
        job.metadata.pipelineStatus = 'completed';
        job.metadata.stopReason = 'exhausted';
        audit(job, 'job_exhausted', { unique: job.totalUniqueResults, batchSize: job.batchSize, totalCaptured: job.totalRawResults });
    }

    await refreshSourceProgress(job);
    await job.save();
    try {
        const { consolidateCompanyIdentities } = await import('./phase5/identity.service.js');
        await consolidateCompanyIdentities({
            companyId: job.companyId,
            userId: job.createdBy,
            financialYear: job.financialYear,
            limit: 400,
        });
    } catch (_) { /* Phase 5 identity must never fail Phase 1 extraction */ }
    return { added: Math.max(0, job.totalUniqueResults - before), warnings };
}

function kickDiscoveryLoop(companyId, jobId) {
    const key = String(jobId);
    if (runningDiscoveryLoops.has(key)) return;
    runningDiscoveryLoops.add(key);
    setImmediate(async () => {
        try {
            const settings = await getOrCreateExtractorSettings(companyId);
            for (let i = 0; i < 250; i += 1) {
                const current = await loadJob(companyId, jobId);
                if (current.status !== 'RUNNING') break;
                await processOneTick(current, settings);
                const after = await loadJob(companyId, jobId);
                if (after.status !== 'RUNNING') break;
                await delayMs(1200);
            }
        } catch (err) {
            try {
                const failed = await loadJob(companyId, jobId);
                if (failed.status === 'RUNNING') {
                    failed.status = 'FAILED';
                    failed.errorSummary = [...(failed.errorSummary || []), err?.message || 'Discovery loop failed'].slice(-20);
                    failed.metadata = { ...(failed.metadata || {}), pipelineStatus: 'failed' };
                    await failed.save();
                }
            } catch {
                /* ignore */
            }
        } finally {
            runningDiscoveryLoops.delete(key);
        }
    });
}

export async function startDiscoveryJob(companyId, jobId) {
    const job = await loadJob(companyId, jobId);
    if (!['DRAFT', 'QUEUED', 'PAUSED', 'STOPPED'].includes(job.status)) {
        if (job.status === 'RUNNING') {
            kickDiscoveryLoop(companyId, jobId);
            return getDiscoveryJobDetail(companyId, jobId);
        }
        throw new ApiError(400, `Cannot start job from status ${job.status}`);
    }
    const exec = (job.metadata?.executableSources || []).filter(Boolean);
    if (!exec.length) throw new ApiError(400, 'No executable sources configured for this job');
    job.status = 'RUNNING';
    job.startedAt = job.startedAt || new Date();
    job.resumedAt = new Date();
    job.metadata = { ...(job.metadata || {}), pipelineStatus: 'searching' };
    audit(job, 'job_started');
    await job.save();
    kickDiscoveryLoop(companyId, jobId);
    return getDiscoveryJobDetail(companyId, jobId);
}

export async function pauseDiscoveryJob(companyId, jobId) {
    const job = await loadJob(companyId, jobId);
    if (job.status !== 'RUNNING') throw new ApiError(400, 'Only running jobs can be paused');
    job.status = 'PAUSED';
    job.pausedAt = new Date();
    job.metadata = { ...(job.metadata || {}), pipelineStatus: 'paused', stopReason: 'paused' };
    audit(job, 'job_paused');
    await job.save();
    await DiscoverySourceTask.updateMany(
        { jobId: job._id, companyId, status: 'RUNNING' },
        { $set: { status: 'PAUSED' } },
    );
    return getDiscoveryJobDetail(companyId, jobId);
}

export async function resumeDiscoveryJob(companyId, jobId) {
    const job = await loadJob(companyId, jobId);
    if (job.status !== 'PAUSED') throw new ApiError(400, 'Only paused jobs can be resumed');
    job.status = 'RUNNING';
    job.resumedAt = new Date();
    job.metadata = { ...(job.metadata || {}), pipelineStatus: 'searching', stopReason: '' };
    audit(job, 'job_resumed');
    await job.save();
    await DiscoverySourceTask.updateMany(
        { jobId: job._id, companyId, status: 'PAUSED' },
        { $set: { status: 'PENDING' } },
    );
    kickDiscoveryLoop(companyId, jobId);
    return getDiscoveryJobDetail(companyId, jobId);
}

export async function stopDiscoveryJob(companyId, jobId) {
    const job = await loadJob(companyId, jobId);
    if (['COMPLETED', 'COMPLETED_WITH_WARNINGS', 'STOPPED'].includes(job.status)) {
        return getDiscoveryJobDetail(companyId, jobId);
    }
    job.status = 'STOPPED';
    job.completedAt = new Date();
    job.metadata = { ...(job.metadata || {}), pipelineStatus: 'completed', stopReason: 'manually_stopped' };
    audit(job, 'job_stopped');
    await job.save();
    return getDiscoveryJobDetail(companyId, jobId);
}

export async function processContinue(companyId, jobId) {
    const settings = await getOrCreateExtractorSettings(companyId);
    const job = await loadJob(companyId, jobId);
    if (job.status === 'PAUSED') throw new ApiError(400, 'Job is paused');
    if (job.status === 'STOPPED') throw new ApiError(400, 'Job is stopped');
    if (['COMPLETED', 'COMPLETED_WITH_WARNINGS'].includes(job.status)) {
        return getDiscoveryJobDetail(companyId, jobId);
    }
    if (job.status !== 'RUNNING') {
        job.status = 'RUNNING';
        await job.save();
    }
    await processOneTick(job, settings);
    kickDiscoveryLoop(companyId, jobId);
    return getDiscoveryJobDetail(companyId, jobId);
}

export async function retryFailedSources(companyId, jobId) {
    const job = await loadJob(companyId, jobId);
    await DiscoverySourceTask.updateMany(
        { jobId: job._id, companyId, status: 'FAILED' },
        { $set: { status: 'PENDING', lastError: '' } },
    );
    job.status = 'RUNNING';
    audit(job, 'retry_failed_sources');
    await job.save();
    kickDiscoveryLoop(companyId, jobId);
    return getDiscoveryJobDetail(companyId, jobId);
}

export async function saveDiscoveryDrafts(companyId, jobId, userId, financialYear, { indices, selectedIndices, all } = {}) {
    const indexList = indices || selectedIndices;
    const job = await loadJob(companyId, jobId);
    const preview = job.metadata?.previewRecords || [];
    if (!preview.length) throw new ApiError(400, 'No preview records on this job');
    let selected = preview;
    if (!all && Array.isArray(indexList) && indexList.length) {
        const set = new Set(indexList.map((i) => Number(i)));
        selected = preview.filter((_, idx) => set.has(idx));
    }
    if (!selected.length) throw new ApiError(400, 'No records selected');
    const docs = selected.map((r) => {
        const { _previewIndex, _isDuplicate, _duplicateLabel, duplicateDisplayLabel, _mergedDraft, ...rest } = r;
        return {
            ...rest,
            companyId,
            financialYear: financialYear || job.financialYear,
            status: 'draft',
            duplicateStatus: rest.duplicateStatus || 'none',
            createdBy: userId,
            extractedAt: rest.extractedAt || new Date(),
            rawExtractedData: {
                ...(rest.rawExtractedData || {}),
                discoveryJobId: String(job._id),
                duplicateDisplayLabel,
            },
        };
    });
    const inserted = await ExtractedLead.insertMany(docs);
    job.metadata = {
        ...(job.metadata || {}),
        savedCount: (job.metadata?.savedCount || 0) + inserted.length,
        lastSavedAt: new Date(),
    };
    audit(job, 'drafts_saved', { count: inserted.length });
    await job.save();
    return { saved: inserted.length, records: inserted };
}

export async function exportDiscoveryJob(companyId, jobId, format = 'csv') {
    const job = await loadJob(companyId, jobId);
    const records = attachDupLabels(job.metadata?.previewRecords || []);
    const headers = [
        'Company', 'Email', 'Phone', 'Website', 'Address', 'City', 'State', 'Country',
        'Business Description', 'Source', 'Source URL', 'Facebook', 'Instagram', 'LinkedIn', 'X/Twitter',
        'Search Keyword', 'Search Location', 'Date Found', 'Email Source', 'Phone Source', 'Original Query', 'Crawl Status',
    ];
    const rowData = records.map((r) => {
        const raw = r.rawExtractedData || {};
        return [
            r.companyName || '',
            r.email || '',
            r.phone || r.mobile || r.whatsappNumber || '',
            r.website || '',
            r.address || '',
            r.city || '',
            r.stateProvince || '',
            r.country || '',
            r.businessDescription || '',
            r.sourcePlatform || raw.sourceProvider || '',
            r.sourceUrl || '',
            r.socialLinks?.facebook || '',
            r.socialLinks?.instagram || '',
            r.socialLinks?.linkedin || '',
            r.socialLinks?.twitter || '',
            raw.searchKeyword || job.keyword || '',
            raw.searchLocation || [job.city, job.state, job.country].filter(Boolean).join(', '),
            r.extractedAt ? new Date(r.extractedAt).toISOString() : (job.createdAt ? new Date(job.createdAt).toISOString() : ''),
            raw.emailSourceUrl || '',
            raw.phoneSourceUrl || '',
            raw.searchQuery || '',
            r.crawlStatus || '',
        ];
    });
    if (format === 'xlsx' || format === 'excel') {
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Extraction');
        sheet.addRow(headers);
        rowData.forEach((row) => sheet.addRow(row));
        const buffer = await workbook.xlsx.writeBuffer();
        return {
            format: 'xlsx',
            content: buffer,
            contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            filename: `extraction-${String(job.keyword || 'run').replace(/\s+/g, '-').slice(0, 40)}.xlsx`,
        };
    }
    const rows = rowData.map((cols) => cols.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    return {
        format: 'csv',
        content: csv,
        contentType: 'text/csv',
        filename: `extraction-${String(job.keyword || 'run').replace(/\s+/g, '-').slice(0, 40)}.csv`,
    };
}

export async function importDiscoveryUrls({ companyId, userId, financialYear, urls = [], keyword = 'Manual URL Import' }) {
    if (!financialYear) throw new ApiError(400, 'financialYear is required');
    const settings = await getOrCreateExtractorSettings(companyId);
    if (!settings.moduleEnabled) throw new ApiError(403, 'Data Extractor module is not enabled');
    const { accepted, rejected } = validateImportUrls(urls);
    if (!accepted.length) throw new ApiError(400, 'No valid public URLs to import');

    const job = await DiscoveryJob.create({
        companyId,
        financialYear,
        createdBy: userId,
        keyword: String(keyword || 'Manual URL Import').trim(),
        targetCompanies: Math.min(500, accepted.length),
        batchSize: Math.min(10, accepted.length),
        selectedSources: ['manual_url'],
        status: 'RUNNING',
        startedAt: new Date(),
        metadata: { previewOnly: true, previewRecords: [], disclaimer: DISCLAIMER, rejectedUrls: rejected, auditLog: [] },
    });
    await DiscoverySourceTask.create({ jobId: job._id, companyId, providerId: 'manual_url', status: 'RUNNING' });

    const records = [];
    for (const item of accepted) {
        try {
            if (item.type === 'indiamart') {
                const enriched = await enrichIndiamartPublicUrl(item.url, settings);
                if (enriched.record) {
                    records.push(normalizeExtractedRecord({
                        ...enriched.record,
                        rawExtractedData: {
                            ...(enriched.record.rawExtractedData || {}),
                            discoveryJobId: String(job._id),
                            sourceProvider: 'indiamart',
                            sourceProviders: ['manual_url', 'indiamart'],
                            urlType: 'indiamart',
                        },
                    }));
                } else {
                    records.push(normalizeExtractedRecord({
                        companyName: item.url,
                        website: '',
                        sourcePlatform: 'indiamart',
                        sourceUrl: item.url,
                        confidenceScore: 25,
                        rawExtractedData: {
                            discoveryJobId: String(job._id),
                            sourceProvider: 'indiamart',
                            sourceProviders: ['manual_url', 'indiamart'],
                            urlType: 'indiamart',
                            skipReason: enriched.message || enriched.status,
                        },
                    }));
                    if (['CAPTCHA_BLOCKED', 'LOGIN_REQUIRED', 'RATE_LIMITED'].includes(enriched.status)) {
                        rejected.push({ url: item.url, reason: enriched.message || enriched.status });
                    }
                }
            } else if (item.type === 'website' || item.type === 'trade_listing') {

                await assertResolvedPublicUrl(item.url);
                const { records: enriched } = await runManualUrlAdapter([item.url]);
                const e = enriched[0] || {
                    companyName: normalizeDomain(item.url) || item.url,
                    website: item.url,
                    sourcePlatform: 'manual_url',
                    sourceUrl: item.url,
                    confidenceScore: 20,
                };
                records.push(normalizeExtractedRecord({
                    ...e,
                    rawExtractedData: {
                        ...(e.rawExtractedData || {}),
                        discoveryJobId: String(job._id),
                        sourceProvider: 'manual_url',
                        sourceProviders: ['manual_url'],
                        urlType: item.type,
                    },
                }));
            } else {
                records.push(normalizeExtractedRecord({
                    companyName: item.url,
                    website: '',
                    sourcePlatform: item.type === 'facebook_page' ? 'facebook_page' : 'instagram_business',
                    sourceUrl: item.url,
                    socialLinks: {
                        facebook: item.type === 'facebook_page' ? item.url : '',
                        instagram: item.type === 'instagram_profile' ? item.url : '',
                    },
                    confidenceScore: 30,
                    rawExtractedData: {
                        discoveryJobId: String(job._id),
                        sourceProvider: 'manual_url',
                        sourceProviders: ['manual_url', item.type],
                        urlType: item.type,
                        publicSocialOnly: true,
                    },
                }));
            }
        } catch (err) {
            rejected.push({ url: item.url, reason: err.message || 'Failed' });
        }
    }

    let preview = mergePreviewList(records);
    preview = await enrichRecordsWithDuplicates(companyId, preview);
    preview = attachDupLabels(preview);
    job.totalRawResults = accepted.length;
    job.totalUniqueResults = preview.length;
    job.totalRejected = rejected.length;
    job.status = 'COMPLETED';
    job.completedAt = new Date();
    job.metadata.previewRecords = preview;
    job.metadata.rejectedUrls = rejected;
    audit(job, 'urls_imported', { accepted: accepted.length, rejected: rejected.length });
    await job.save();
    return getDiscoveryJobDetail(companyId, job._id);
}

export async function testDiscoveryProvider(companyId, providerId) {
    const settings = await getOrCreateExtractorSettings(companyId);
    const p = getProvider(providerId);
    if (!p) throw new ApiError(404, 'Unknown provider');
    if (p.comingSoon) return { ok: false, message: 'Coming Soon / Provider Not Configured' };
    return p.healthCheck(settings);
}


const DISCOVERY_IMPORT_MAX_ROWS = 500;
const DISCOVERY_IMPORT_MAX_BYTES = 10 * 1024 * 1024;

function isValidEmail(email) {
    const e = String(email || '').trim();
    if (!e) return true;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

export async function importDiscoveryFile({
    companyId,
    userId,
    financialYear,
    buffer,
    fileName = '',
    columnMapping = {},
    confirm = false,
}) {
    if (!financialYear) throw new ApiError(400, 'financialYear is required');
    const settings = await getOrCreateExtractorSettings(companyId);
    if (!settings.moduleEnabled) throw new ApiError(403, 'Data Extractor module is not enabled');
    if (!Buffer.isBuffer(buffer)) throw new ApiError(400, 'File buffer is required');
    if (buffer.length > DISCOVERY_IMPORT_MAX_BYTES) {
        throw new ApiError(400, 'File exceeds maximum size of 10MB');
    }
    const ext = String(fileName || '').toLowerCase();
    if (!/\.(xlsx|xls|csv)$/.test(ext)) {
        throw new ApiError(400, 'Only .xlsx, .xls or .csv files are allowed');
    }
    // .xls binary is not supported by ExcelJS xlsx loader
    if (ext.endsWith('.xls') && !ext.endsWith('.xlsx')) {
        throw new ApiError(400, 'Legacy .xls is not supported. Please upload .xlsx or .csv');
    }

    const { records, errors, rowCount } = await runExcelImportAdapter({ buffer, fileName, columnMapping });
    if (rowCount > DISCOVERY_IMPORT_MAX_ROWS) {
        throw new ApiError(400, 'Import exceeds maximum of ' + DISCOVERY_IMPORT_MAX_ROWS + ' rows');
    }

    const headers = [];
    if (records[0]?.rawExtractedData?.importRow) {
        headers.push(...Object.keys(records[0].rawExtractedData.importRow));
    }

    const validated = [];
    const rowErrors = [...(errors || [])];
    const seenDomains = new Set();
    const seenPhones = new Set();
    const seenEmails = new Set();

    for (let i = 0; i < records.length; i++) {
        const r = normalizeExtractedRecord(records[i]);
        const name = String(r.companyName || '').trim();
        if (!name) {
            rowErrors.push('Row ' + (i + 2) + ': company name is required');
            continue;
        }
        if (r.email && !isValidEmail(r.email)) {
            rowErrors.push('Row ' + (i + 2) + ': invalid email');
            continue;
        }
        if (r.website) {
            try {
                assertPublicHttpUrl(r.website);
            } catch (err) {
                rowErrors.push('Row ' + (i + 2) + ': invalid website — ' + (err.message || 'invalid'));
                continue;
            }
        }
        const domain = r.normalizedDomain || normalizeDomain(r.website);
        const phone = String(r.phone || r.mobile || '').replace(/\D/g, '');
        const email = String(r.email || '').trim().toLowerCase();
        let withinFileDup = false;
        if (domain && seenDomains.has(domain)) withinFileDup = true;
        if (phone.length >= 8 && seenPhones.has(phone.slice(-10))) withinFileDup = true;
        if (email && seenEmails.has(email)) withinFileDup = true;
        if (domain) seenDomains.add(domain);
        if (phone.length >= 8) seenPhones.add(phone.slice(-10));
        if (email) seenEmails.add(email);

        const fb = r.socialLinks?.facebook || r.rawExtractedData?.facebookPageUrl || '';
        const ig = r.socialLinks?.instagram || r.rawExtractedData?.instagramProfileUrl || '';
        validated.push({
            ...r,
            companyName: name,
            normalizedDomain: domain,
            rawExtractedData: {
                ...(r.rawExtractedData || {}),
                sourceProvider: 'excel_import',
                sourceProviders: ['excel_import'],
                withinFileDuplicate: withinFileDup,
                facebookPageUrl: fb,
                instagramProfileUrl: ig,
            },
            socialLinks: {
                ...(r.socialLinks || {}),
                facebook: fb,
                instagram: ig,
            },
        });
    }

    let preview = await enrichRecordsWithDuplicates(companyId, validated);
    preview = mergePreviewList(preview);
    preview = attachDupLabels(preview);

    const mappingPreview = {
        headers,
        suggestedMapping: columnMapping && Object.keys(columnMapping).length
            ? columnMapping
            : {
                companyName: 'companyName',
                website: 'website',
                email: 'email',
                phone: 'phone',
                city: 'city',
                state: 'state',
                country: 'country',
                facebookPageUrl: 'facebookPageUrl',
                instagramProfileUrl: 'instagramProfileUrl',
            },
        supportedFields: [
            'companyName', 'legalName', 'website', 'email', 'phone', 'address', 'city', 'state',
            'country', 'postalCode', 'businessDescription', 'facebookPageUrl', 'instagramProfileUrl',
            'linkedinCompanyUrl', 'sourceUrl',
        ],
    };

    if (!confirm) {
        return {
            previewOnly: true,
            rowCount,
            accepted: preview.length,
            errors: rowErrors.slice(0, 50),
            mappingPreview,
            previewRecords: preview.slice(0, 100),
            disclaimer: DISCLAIMER,
        };
    }

    if (!preview.length) throw new ApiError(400, 'No valid rows to import');

    const job = await DiscoveryJob.create({
        companyId,
        financialYear,
        createdBy: userId,
        keyword: 'Excel/CSV Import',
        targetCompanies: Math.min(500, preview.length),
        batchSize: 10,
        selectedSources: ['excel_import'],
        status: 'COMPLETED',
        startedAt: new Date(),
        completedAt: new Date(),
        totalRawResults: rowCount,
        totalUniqueResults: preview.length,
        totalDuplicates: preview.filter((r) => r.duplicateDisplayLabel && r.duplicateDisplayLabel !== 'NEW').length,
        totalRejected: rowErrors.length,
        metadata: {
            previewOnly: true,
            previewRecords: preview,
            mappingPreview,
            importErrors: rowErrors.slice(0, 100),
            disclaimer: DISCLAIMER,
            auditLog: [{ at: new Date().toISOString(), action: 'excel_imported', count: preview.length }],
        },
    });
    await DiscoverySourceTask.create({
        jobId: job._id,
        companyId,
        providerId: 'excel_import',
        status: 'COMPLETED',
        rawResults: rowCount,
        uniqueResults: preview.length,
    });
    return getDiscoveryJobDetail(companyId, job._id);
}

export async function convertDiscoveryPreviewToLead(companyId, jobId, userId, financialYear, { index, recordId, confirmCrmDuplicate } = {}) {
    const job = await loadJob(companyId, jobId);
    if (recordId) {
        const result = await convertExtractedToLead(companyId, recordId, userId);
        job.totalConverted = (job.totalConverted || 0) + 1;
        audit(job, 'converted_to_lead', { recordId: String(recordId) });
        await job.save();
        return { ...result, discoveryJobId: String(job._id) };
    }
    const preview = job.metadata?.previewRecords || [];
    const idx = Number(index);
    if (!Number.isInteger(idx) || idx < 0 || idx >= preview.length) {
        throw new ApiError(400, 'Valid preview index is required');
    }
    const rec = preview[idx];
    if (rec?.duplicateDisplayLabel === 'ALREADY_CONVERTED' || rec?.status === 'converted' || rec?.convertedRecordId) {
        throw new ApiError(400, 'Record already converted');
    }
    if (!confirmCrmDuplicate) {
        const crm = await checkCrmDuplicatesForConvert(companyId, rec);
        if (crm.matches.length) {
            return {
                converted: false,
                needsCrmDuplicateReview: true,
                duplicateStatus: crm.duplicateStatus,
                matches: crm.matches,
                previewIndex: idx,
                companyName: rec.companyName || '',
            };
        }
    }
    const { _previewIndex, _isDuplicate, _duplicateLabel, duplicateDisplayLabel, _mergedDraft, ...rest } = rec;
    const [inserted] = await ExtractedLead.insertMany([{
        ...rest,
        companyId,
        financialYear: financialYear || job.financialYear,
        status: 'approved',
        approvedBy: userId,
        createdBy: userId,
        extractedAt: rest.extractedAt || new Date(),
        rawExtractedData: {
            ...(rest.rawExtractedData || {}),
            discoveryJobId: String(job._id),
            duplicateDisplayLabel,
            discoveryApprovedForConvert: true,
        },
    }]);
    try {
        const result = await convertExtractedToLead(companyId, inserted._id, userId);
        const leadId = result?.lead?._id || result?.leadId || result?._id;
        preview[idx] = {
            ...rec,
            status: 'converted',
            duplicateDisplayLabel: 'ALREADY_CONVERTED',
            convertedRecordType: 'lead',
            convertedRecordId: leadId ? String(leadId) : String(inserted._id),
            convertedAt: new Date().toISOString(),
        };
        job.metadata = { ...(job.metadata || {}), previewRecords: preview };
        job.totalConverted = (job.totalConverted || 0) + 1;
        audit(job, 'converted_to_lead', { previewIndex: idx, leadId: leadId ? String(leadId) : '' });
        await job.save();
        return { ...result, discoveryJobId: String(job._id), extractedLeadId: String(inserted._id) };
    } catch (err) {
        if (/already converted/i.test(err?.message || '')) {
            throw err;
        }
        // leave draft if conversion failed
        throw err;
    }
}
