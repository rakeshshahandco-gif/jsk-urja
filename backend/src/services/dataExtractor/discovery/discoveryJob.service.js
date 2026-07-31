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
import { getOrCreateExtractorSettings } from '../extractor.service.js';
import { applyControlledResultCap, getControlledTestConfig } from '../controlledTestMode.js';
import { convertExtractedToLead } from '../extractorConversion.service.js';

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
    const maxTarget = Math.min(1000, Math.max(1, Number(cfg.maxTarget) || 500));
    const v = Math.max(1, Number(n) || Number(cfg.defaultTarget) || 10);
    return Math.min(maxTarget, v);
}

function clampBatch(n, settings) {
    const cfg = discoveryCfg(settings);
    const maxBatch = Math.min(50, Math.max(1, Number(cfg.maxBatchSize) || 50));
    const v = Math.max(1, Number(n) || Number(cfg.defaultBatchSize) || 10);
    return Math.min(maxBatch, v);
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
    targetCompanies,
    batchSize,
    selectedSources = [],
}) {
    if (!financialYear) throw new ApiError(400, 'financialYear is required');
    const kw = String(keyword || '').trim();
    if (!kw || kw.length < 2 || kw.length > 200) throw new ApiError(400, 'Keyword must be 2-200 characters');
    const settings = await getOrCreateExtractorSettings(companyId);
    if (!settings.moduleEnabled) throw new ApiError(403, 'Data Extractor module is not enabled for this company');

    const target = clampTarget(targetCompanies, settings);
    const batch = clampBatch(batchSize, settings);
    const { selected, executable, skipped } = assertProvidersExecutable(selectedSources, settings);
    if (!selected.length) throw new ApiError(400, 'Select at least one source');

    const job = await DiscoveryJob.create({
        companyId,
        financialYear,
        createdBy: userId,
        keyword: kw,
        city: String(city || '').trim(),
        state: String(state || '').trim(),
        country: String(country || '').trim(),
        targetCompanies: target,
        batchSize: batch,
        selectedSources: selected,
        status: 'DRAFT',
        metadata: {
            previewOnly: true,
            previewRecords: [],
            disclaimer: DISCLAIMER,
            skippedSources: skipped,
            executableSources: executable,
            auditLog: [],
        },
    });
    audit(job, 'job_created', { target, batch, selected });
    await job.save();

    for (const id of selected) {
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
    for (const item of items) {
        const link = String(item.link || '').trim();
        if (!link) continue;
        const lower = link.toLowerCase();
        if (seenUrls.has(lower)) continue;
        seenUrls.add(lower);
        if (isIndiamartUrl(link)) {
            records.push({
                companyName: String(item.title || '').split('|')[0].split('-')[0].trim() || 'IndiaMART listing',
                website: '',
                sourcePlatform: 'indiamart',
                sourceUrl: link,
                businessDescription: String(item.snippet || '').trim(),
                city: job.city,
                stateProvince: job.state,
                country: job.country,
                keywords: [job.keyword],
                extractedAt: new Date(),
                confidenceScore: 40,
                socialLinks: {},
                rawExtractedData: {
                    discoveryJobId: String(job._id),
                    sourceProvider: 'indiamart',
                    sourceProviders: [sourceProvider, 'indiamart'].filter(Boolean),
                    indiamartProfileUrl: link,
                    searchKeyword: job.keyword,
                    via: sourceProvider,
                },
            });
            continue;
        }
        if (lower.includes('facebook.com') || lower.includes('instagram.com') || lower.includes('linkedin.com')) {
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
                socialLinks: {
                    facebook: lower.includes('facebook.com') ? link : '',
                    instagram: lower.includes('instagram.com') ? link : '',
                },
                rawExtractedData: {
                    discoveryJobId: String(job._id),
                    sourceProvider,
                    sourceProviders: [sourceProvider],
                    searchKeyword: job.keyword,
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
            rawExtractedData: {
                discoveryJobId: String(job._id),
                sourceProvider,
                sourceProviders: [sourceProvider],
                searchKeyword: job.keyword,
                searchLocation: [job.city, job.state, job.country].filter(Boolean).join(', '),
                searchQuery: query,
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
    const need = Math.max(0, job.targetCompanies - (job.totalUniqueResults || 0));
    if (need <= 0) return { records: [], apiRequests: 0, exhausted: true };
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
    const need = Math.max(0, job.targetCompanies - (job.totalUniqueResults || 0));
    if (need <= 0) return { records: [], apiRequests: 0, exhausted: true };
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
    if (!cfg.publicDiscoveryMode || !braveAvailable) {
        task.status = 'NOT_CONFIGURED';
        task.lastError = 'IndiaMART automatic discovery unavailable. Use Manual URL / Excel import, or enable Public Discovery Mode with Brave Search.';
        return { records: [], apiRequests: 0, statusCode: 'PUBLIC_ACCESS_ONLY' };
    }
    const query = buildIndiamartBraveQuery(job.keyword, job.city, job.state, job.country);
    const result = await processBraveBatch(job, task, settings, query);
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
    const maxSites = Math.min(records.length, ctl.enabled ? ctl.maxWebsites : 10, job.batchSize);
    const errors = [];
    const out = [...records];
    const domainCache = new Set(job.metadata?.enrichedDomains || []);
    for (let i = 0; i < maxSites; i++) {
        const site = out[i]?.website;
        if (!site) continue;
        const domain = out[i].normalizedDomain || normalizeDomain(site);
        if (domain && domainCache.has(domain)) continue;
        try {
            await assertResolvedPublicUrl(site);
            const { records: enriched, errors: fetchErrors } = await runManualUrlAdapter([site]);
            errors.push(...fetchErrors);
            const e = enriched[0];
            if (!e) continue;
            if (domain) domainCache.add(domain);
            out[i] = normalizeExtractedRecord({
                ...out[i],
                companyName: out[i].companyName || e.companyName,
                email: out[i].email || e.email,
                phone: out[i].phone || e.phone,
                mobile: out[i].mobile || e.mobile,
                address: out[i].address || e.address,
                businessDescription: out[i].businessDescription || e.businessDescription,
                socialLinks: { ...(out[i].socialLinks || {}), ...(e.socialLinks || {}) },
                confidenceScore: Math.max(out[i].confidenceScore || 0, e.confidenceScore || 0),
                rawExtractedData: {
                    ...(out[i].rawExtractedData || {}),
                    enriched: true,
                    sourceProviders: [...new Set([...(out[i].rawExtractedData?.sourceProviders || []), 'website_enrichment'])],
                },
            });
        } catch (err) {
            errors.push(site + ': ' + (err.message || 'enrich failed'));
        }
    }
    job.metadata = { ...(job.metadata || {}), enrichedDomains: [...domainCache].slice(-500) };
    return { records: out, errors };
}

async function processOneTick(job, settings) {
    const tasks = await DiscoverySourceTask.find({ jobId: job._id, companyId: job.companyId });
    let fresh = [];
    let warnings = [];
    const cfg = discoveryCfg(settings);
    const allowPaid = cfg.allowPaidFallback === true;

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
    preview = await enrichRecordsWithDuplicates(job.companyId, preview);
    try { await syncMergeReviewsFromJob(job.companyId, job._id, job.createdBy); } catch (_) { /* non-blocking */ }
    preview = attachDupLabels(preview).slice(0, job.targetCompanies);

    const before = job.totalUniqueResults || 0;
    job.totalRawResults += fresh.length;
    job.totalUniqueResults = preview.length;
    job.totalDuplicates = preview.filter((r) => r.duplicateDisplayLabel && r.duplicateDisplayLabel !== 'NEW').length;
    job.metadata = {
        ...(job.metadata || {}),
        previewOnly: true,
        previewRecords: preview,
        disclaimer: DISCLAIMER,
        freeFirstNote: 'Discovery continues until the target is reached, selected sources are exhausted, or configured usage limits are reached.',
        lastWarnings: warnings.slice(-10),
        enrichedDomains: job.metadata?.enrichedDomains || [],
    };
    job.lastProcessedAt = new Date();

    const active = await DiscoverySourceTask.find({
        jobId: job._id,
        companyId: job.companyId,
        status: { $in: ['PENDING', 'RUNNING'] },
        providerId: { $in: ['brave', 'serpapi', 'indiamart'] },
    });
    if (job.totalUniqueResults >= job.targetCompanies) {
        job.status = warnings.length ? 'COMPLETED_WITH_WARNINGS' : 'COMPLETED';
        job.completedAt = new Date();
        audit(job, 'job_completed', { unique: job.totalUniqueResults });
    } else if (!active.length && !fresh.length) {
        job.status = warnings.length ? 'COMPLETED_WITH_WARNINGS' : 'COMPLETED';
        job.completedAt = new Date();
        audit(job, 'job_exhausted', { unique: job.totalUniqueResults });
    }

    await refreshSourceProgress(job);
    await job.save();
    return { added: Math.max(0, job.totalUniqueResults - before), warnings };
}

export async function startDiscoveryJob(companyId, jobId) {
    const settings = await getOrCreateExtractorSettings(companyId);
    const job = await loadJob(companyId, jobId);
    if (!['DRAFT', 'QUEUED', 'PAUSED', 'STOPPED'].includes(job.status)) {
        if (job.status === 'RUNNING') return processContinue(companyId, jobId);
        throw new ApiError(400, `Cannot start job from status ${job.status}`);
    }
    const exec = (job.metadata?.executableSources || []).filter(Boolean);
    if (!exec.length) throw new ApiError(400, 'No executable sources configured for this job');
    job.status = 'RUNNING';
    job.startedAt = job.startedAt || new Date();
    job.resumedAt = new Date();
    audit(job, 'job_started');
    await job.save();
    await processOneTick(job, settings);
    return getDiscoveryJobDetail(companyId, jobId);
}

export async function pauseDiscoveryJob(companyId, jobId) {
    const job = await loadJob(companyId, jobId);
    if (job.status !== 'RUNNING') throw new ApiError(400, 'Only running jobs can be paused');
    job.status = 'PAUSED';
    job.pausedAt = new Date();
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
    audit(job, 'job_resumed');
    await job.save();
    await DiscoverySourceTask.updateMany(
        { jobId: job._id, companyId, status: 'PAUSED' },
        { $set: { status: 'RUNNING' } },
    );
    const settings = await getOrCreateExtractorSettings(companyId);
    await processOneTick(job, settings);
    return getDiscoveryJobDetail(companyId, jobId);
}

export async function stopDiscoveryJob(companyId, jobId) {
    const job = await loadJob(companyId, jobId);
    if (['COMPLETED', 'COMPLETED_WITH_WARNINGS', 'STOPPED'].includes(job.status)) {
        return getDiscoveryJobDetail(companyId, jobId);
    }
    job.status = 'STOPPED';
    job.completedAt = new Date();
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
    const settings = await getOrCreateExtractorSettings(companyId);
    await processOneTick(job, settings);
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

export async function convertDiscoveryPreviewToLead(companyId, jobId, userId, financialYear, { index, recordId } = {}) {
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
