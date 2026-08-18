import { DiscoveryJob } from '../../../../models/discoveryJob.model.js';
import { DiscoveryMergeReview } from '../../../../models/discoveryMergeReview.model.js';
import { AiLeadRelevance } from '../../../../models/aiLeadRelevance.model.js';
import { AiCompanyIntelligenceProfile } from '../../../../models/aiCompanyIntelligenceProfile.model.js';
import { Lead } from '../../../../models/lead.model.js';
import Customer from '../../../../models/customer.model.js';
import { Supplier } from '../../../../models/supplier.model.js';
import { ApiError } from '../../../../utils/ApiError.js';
import { checkDuplicateForRecord } from '../../duplicateChecker.service.js';
import { PHASE2_ENGINE_VERSION, QUALIFICATION_CATEGORIES, mapCategoryToLegacyStatus } from './constants.js';
import { buildQualificationInput, collectEmails, collectPhones, collectSourceProviders, collectSourceUrls, identityDomain } from './inputPayload.util.js';
import { qualifyCompany, getPhase2AiProvider } from './aiQualify.util.js';
import { applySmartMerge, snapshot } from './smartMerge.util.js';
import { buildPhase2Analytics, isCanonicalCompany, matchesQualifiedFilters } from './analytics.util.js';

async function loadJob(companyId, jobId) {
    const job = await DiscoveryJob.findOne({ _id: jobId, companyId, isDeleted: { $ne: true } });
    if (!job) throw new ApiError(404, 'Discovery job not found');
    return job;
}

function pendingQualification() {
    return {
        status: 'Pending',
        score: null,
        category: '',
        evidence: [],
        companyTypes: [],
        industryTags: [],
        engineVersion: PHASE2_ENGINE_VERSION,
        engineUsed: '',
        qualifiedAt: null,
        inputHash: '',
        fallbackReason: '',
    };
}

function shouldSkipQualify(rec, inputHash, force) {
    if (force) return false;
    const q = rec.qualification || {};
    if (q.status === 'Manual Override') return true;
    if (q.status === 'Qualified' && q.inputHash === inputHash && q.engineVersion === PHASE2_ENGINE_VERSION) return true;
    return false;
}

function attachCompanyIntelligence(rec, job, qual) {
    const emails = collectEmails(rec);
    const phones = collectPhones(rec);
    const providers = collectSourceProviders(rec);
    const urls = collectSourceUrls(rec);
    const first = rec.firstDiscovered || rec.extractedAt || new Date().toISOString();
    return {
        ...rec,
        alternativeNames: rec.alternativeNames || [],
        additionalEmails: rec.additionalEmails || emails.slice(1),
        additionalPhones: rec.additionalPhones || phones.slice(1),
        sourcesFound: providers.length,
        evidenceUrls: urls,
        firstDiscovered: first,
        lastDiscovered: new Date().toISOString(),
        extractionRunIds: [...new Set([...(rec.extractionRunIds || []), String(job._id)])],
        companyIntelligence: {
            canonicalName: rec.companyName || '',
            alternativeNames: rec.alternativeNames || [],
            domain: identityDomain(rec) || rec.normalizedDomain || '',
            website: rec.website || '',
            emails: { primary: rec.email || emails[0] || '', additional: emails.slice(1) },
            phones: { primary: rec.phone || rec.mobile || phones[0] || '', additional: phones.slice(1) },
            whatsapp: rec.whatsappNumber || '',
            address: rec.address || '',
            city: rec.city || '',
            state: rec.stateProvince || rec.state || '',
            country: rec.country || '',
            businessDescription: rec.businessDescription || '',
            companyTypes: qual.companyTypes || [],
            industryTags: qual.industryTags || [],
            productKeywords: qual.industryTags || [],
            socialUrls: rec.socialLinks || {},
            relevanceScore: qual.score,
            qualificationCategory: rec.qualification?.manualOverride?.category || qual.category,
            aiReasoning: qual.evidence || [],
            discoveredSources: providers,
            evidenceUrls: urls,
            extractionRunIds: [...new Set([...(rec.extractionRunIds || []), String(job._id)])],
            firstDiscovered: first,
            lastDiscovered: new Date().toISOString(),
        },
    };
}

async function persistIntelligence(companyId, job, rec, idx, qual) {
    const recordKey = `dex-p2:${job._id}:${identityDomain(rec) || rec.normalizedDomain || ('name:' + String(rec.companyName || '').slice(0, 40) + ':' + idx)}`;
    try {
        await AiLeadRelevance.findOneAndUpdate(
            { companyId, recordKey, isDeleted: { $ne: true } },
            {
                $set: {
                    companyId,
                    financialYear: job.financialYear,
                    discoveryJobId: job._id,
                    previewIndex: idx,
                    recordKey,
                    companyName: rec.companyName || '',
                    status: mapCategoryToLegacyStatus(qual.category),
                    relevanceScore: qual.score || 0,
                    explanation: (qual.evidence || []).join('; ').slice(0, 2000),
                    evidenceSnippets: (qual.evidence || []).slice(0, 8),
                    searchKeyword: job.keyword || '',
                    selectedLocation: [job.city, job.state, job.country].filter(Boolean).join(', '),
                    engineVersion: PHASE2_ENGINE_VERSION,
                    rawPayload: {
                        phase2: true,
                        category: qual.category,
                        companyTypes: qual.companyTypes,
                        industryTags: qual.industryTags,
                        inputHash: qual.inputHash,
                        engineUsed: qual.engineUsed,
                    },
                },
            },
            { upsert: true, new: true },
        );
    } catch (_) { /* collection optional */ }

    try {
        await AiCompanyIntelligenceProfile.findOneAndUpdate(
            { companyId, recordKey, isDeleted: { $ne: true } },
            {
                $set: {
                    companyId,
                    financialYear: job.financialYear,
                    discoveryJobId: job._id,
                    previewIndex: idx,
                    recordKey,
                    companyName: rec.companyName || '',
                    status: qual.category === 'Insufficient Information' ? 'LOW_CONFIDENCE' : 'GENERATED',
                    shortSummary: (qual.evidence || [])[0] || '',
                    standardSummary: (qual.evidence || []).join(' ').slice(0, 600),
                    customerType: (qual.companyTypes || []).join(' + '),
                    secondaryIndustries: qual.industryTags || [],
                    relevanceSnapshot: {
                        score: qual.score,
                        category: qual.category,
                        evidence: qual.evidence,
                    },
                    confidence: qual.score || 0,
                    evidenceReferences: (qual.evidence || []).map((e) => ({ text: e })),
                    sourceUrls: collectSourceUrls(rec),
                    engineUsed: qual.engineUsed || 'heuristic',
                    modelVersion: PHASE2_ENGINE_VERSION,
                    fallbackUsed: qual.engineUsed !== 'openai',
                    fallbackReason: qual.fallbackReason || '',
                    generatedAt: new Date(),
                    rawPayload: rec.companyIntelligence || {},
                },
            },
            { upsert: true, new: true },
        );
    } catch (_) { /* collection optional */ }
}

export async function applyPostExtractionPhase2(job) {
    const previewIn = job.metadata?.previewRecords || [];
    const stamped = previewIn.map((r) => ({
        ...r,
        qualification: r.qualification || pendingQualification(),
        lastDiscovered: new Date().toISOString(),
        firstDiscovered: r.firstDiscovered || r.extractedAt || new Date().toISOString(),
        extractionRunIds: [...new Set([...(r.extractionRunIds || []), String(job._id)])],
    }));
    const merged = applySmartMerge(stamped, { jobId: job._id });
    let createdReviews = 0;
    for (const pair of merged.reviewPairs) {
        try {
            const existing = await DiscoveryMergeReview.findOne({
                companyId: job.companyId,
                discoveryJobId: job._id,
                previewIndex: pair.previewIndexA,
                'candidateRef.previewIndexB': pair.previewIndexB,
                status: 'open',
                isDeleted: { $ne: true },
            });
            if (existing) continue;
            await DiscoveryMergeReview.create({
                companyId: job.companyId,
                financialYear: job.financialYear,
                discoveryJobId: job._id,
                previewIndex: pair.previewIndexA,
                status: 'open',
                decision: 'MANUAL_REVIEW_REQUIRED',
                matchScore: pair.mergeConfidence,
                reasons: pair.reasons,
                recordA: pair.recordA,
                recordB: pair.recordB,
                candidateRef: {
                    type: 'preview_pair',
                    previewIndexB: pair.previewIndexB,
                    mergeConfidence: pair.mergeConfidence,
                    phase2: true,
                },
                auditLog: [{ at: new Date().toISOString(), action: 'phase2_review_created' }],
            });
            createdReviews += 1;
            const rec = merged.preview[pair.previewIndexA];
            if (rec) {
                rec.phase2Merge = {
                    ...(rec.phase2Merge || {}),
                    duplicateStatus: 'review',
                    mergeConfidence: pair.mergeConfidence,
                    pairedPreviewIndex: pair.previewIndexB,
                };
            }
        } catch (_) { /* non-blocking */ }
    }
    const analytics = buildPhase2Analytics(job, merged.preview);
    return {
        preview: merged.preview,
        autoMerged: merged.autoMerged.length,
        reviewPairs: merged.reviewPairs.length,
        createdReviews,
        analytics,
    };
}

function resolveIndices(preview, { mode, indices } = {}) {
    if (mode === 'one') {
        const idx = Number(indices?.[0]);
        if (!Number.isInteger(idx) || idx < 0 || idx >= preview.length) throw new ApiError(400, 'Valid index is required');
        return [idx];
    }
    if (mode === 'selected') {
        const list = (indices || []).map(Number).filter((i) => Number.isInteger(i) && i >= 0 && i < preview.length);
        if (!list.length) throw new ApiError(400, 'Select at least one company');
        return [...new Set(list)];
    }
    if (mode === 'retry_failed') {
        return preview.map((r, i) => (isCanonicalCompany(r) && r.qualification?.status === 'Failed' ? i : -1)).filter((i) => i >= 0);
    }
    return preview.map((r, i) => {
        if (!isCanonicalCompany(r)) return -1;
        const st = r.qualification?.status;
        if (!st || st === 'Pending' || st === 'Failed') return i;
        return -1;
    }).filter((i) => i >= 0);
}

export async function qualifyDiscoveryJob(companyId, jobId, userId, {
    mode = 'all_unprocessed',
    indices = [],
    force = false,
    forceUnavailable = false,
} = {}) {
    const job = await loadJob(companyId, jobId);
    let preview = [...(job.metadata?.previewRecords || [])];
    if (!preview.length) throw new ApiError(400, 'No extracted companies to qualify yet');

    const target = resolveIndices(preview, { mode, indices });
    const provider = getPhase2AiProvider();
    let processed = 0;
    let skipped = 0;
    let failed = 0;
    const BATCH = 8;

    for (let offset = 0; offset < target.length; offset += BATCH) {
        const slice = target.slice(offset, offset + BATCH);
        for (const idx of slice) {
            const rec = preview[idx];
            if (!rec || !isCanonicalCompany(rec)) {
                skipped += 1;
                continue;
            }
            const { payload, inputHash } = buildQualificationInput({ job, record: rec });
            if (shouldSkipQualify(rec, inputHash, force)) {
                skipped += 1;
                continue;
            }
            preview[idx] = {
                ...rec,
                qualification: { ...(rec.qualification || pendingQualification()), status: 'Processing' },
            };
            const result = await qualifyCompany({ job, payload, forceUnavailable });
            let nextStatus = 'Qualified';
            if (forceUnavailable) nextStatus = 'Failed';
            else if (result.statusHint === 'Failed') nextStatus = 'Failed';

            const qual = {
                status: nextStatus,
                score: result.score,
                category: result.category,
                evidence: result.evidence,
                companyTypes: result.companyTypes,
                industryTags: result.industryTags,
                searchIntent: result.searchIntent,
                engineVersion: PHASE2_ENGINE_VERSION,
                engineUsed: result.engineUsed,
                model: result.model || '',
                qualifiedAt: new Date().toISOString(),
                inputHash,
                fallbackReason: result.fallbackReason || '',
                fieldConfidence: result.fieldConfidence,
                qualifiedBy: userId ? String(userId) : null,
                manualOverride: rec.qualification?.manualOverride || null,
                feedback: rec.qualification?.feedback || null,
            };
            if (rec.qualification?.manualOverride?.category) {
                qual.status = 'Manual Override';
                qual.category = rec.qualification.manualOverride.category;
            }
            let updated = { ...rec, qualification: qual };
            updated = attachCompanyIntelligence(updated, job, qual);
            preview[idx] = updated;
            if (nextStatus === 'Failed' || nextStatus === 'Pending') failed += 1;
            else processed += 1;
            await persistIntelligence(companyId, job, updated, idx, { ...qual, inputHash });
        }
        job.metadata = {
            ...(job.metadata || {}),
            previewRecords: preview,
            phase2Analytics: buildPhase2Analytics(job, preview),
        };
        await job.save();
    }

    const analytics = buildPhase2Analytics(job, preview);
    job.metadata = { ...(job.metadata || {}), previewRecords: preview, phase2Analytics: analytics };
    const log = Array.isArray(job.metadata.auditLog) ? job.metadata.auditLog : [];
    log.push({
        at: new Date().toISOString(),
        action: 'phase2_qualify',
        mode,
        processed,
        skipped,
        failed,
        aiAvailable: provider.available,
    });
    job.metadata.auditLog = log.slice(-200);
    await job.save();

    return {
        processed,
        skipped,
        failed,
        total: target.length,
        aiAvailable: provider.available,
        aiReason: provider.reason || '',
        analytics,
        jobId: String(job._id),
    };
}

export async function overrideQualification(companyId, jobId, userId, { index, category }) {
    if (!QUALIFICATION_CATEGORIES.includes(category)) throw new ApiError(400, 'Invalid qualification category');
    const job = await loadJob(companyId, jobId);
    const preview = [...(job.metadata?.previewRecords || [])];
    const idx = Number(index);
    if (!Number.isInteger(idx) || idx < 0 || idx >= preview.length) throw new ApiError(400, 'Valid index is required');
    const rec = preview[idx];
    const prevCat = rec.qualification?.category || '';
    rec.qualification = {
        ...(rec.qualification || pendingQualification()),
        status: 'Manual Override',
        category,
        manualOverride: {
            category,
            previousCategory: prevCat,
            at: new Date().toISOString(),
            by: userId ? String(userId) : null,
        },
    };
    preview[idx] = rec;
    job.metadata = { ...(job.metadata || {}), previewRecords: preview, phase2Analytics: buildPhase2Analytics(job, preview) };
    await job.save();
    return { index: idx, qualification: rec.qualification };
}

export async function feedbackQualification(companyId, jobId, userId, { index, verdict, correctedCategory }) {
    const v = String(verdict || '').toLowerCase();
    if (!['correct', 'wrong'].includes(v)) throw new ApiError(400, 'verdict must be correct or wrong');
    if (v === 'wrong' && correctedCategory && !QUALIFICATION_CATEGORIES.includes(correctedCategory)) {
        throw new ApiError(400, 'Invalid corrected category');
    }
    const job = await loadJob(companyId, jobId);
    const preview = [...(job.metadata?.previewRecords || [])];
    const idx = Number(index);
    if (!Number.isInteger(idx) || idx < 0 || idx >= preview.length) throw new ApiError(400, 'Valid index is required');
    const rec = preview[idx];
    const prevCat = rec.qualification?.category || '';
    rec.qualification = {
        ...(rec.qualification || pendingQualification()),
        feedback: {
            verdict: v,
            correctedCategory: v === 'wrong' ? (correctedCategory || '') : '',
            at: new Date().toISOString(),
            by: userId ? String(userId) : null,
        },
    };
    if (v === 'wrong' && correctedCategory) {
        rec.qualification.status = 'Manual Override';
        rec.qualification.category = correctedCategory;
        rec.qualification.manualOverride = {
            category: correctedCategory,
            previousCategory: prevCat,
            at: new Date().toISOString(),
            by: userId ? String(userId) : null,
            fromFeedback: true,
        };
    }
    preview[idx] = rec;
    job.metadata = { ...(job.metadata || {}), previewRecords: preview };
    await job.save();
    return { index: idx, qualification: rec.qualification };
}

export function listQualifiedCompanies(job, query = {}) {
    const records = job.metadata?.previewRecords || job.previewRecords || [];
    const defaultCats = String(query.categories || '') === '' && !query.category
        ? ['Highly Relevant', 'Relevant']
        : null;
    const q = defaultCats ? { ...query, categories: defaultCats.join(',') } : query;
    if (query.categories === 'all' || query.view === 'all') {
        Object.assign(q, { categories: '' });
        delete q.categories;
    }
    const filtered = records
        .map((rec, index) => ({ rec, index }))
        .filter(({ rec }) => {
            if (query.categories === 'all' || query.view === 'all') return isCanonicalCompany(rec);
            return matchesQualifiedFilters(rec, q);
        });
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 50));
    const start = (page - 1) * limit;
    const results = filtered.slice(start, start + limit).map(({ rec, index }) => ({
        previewIndex: index,
        companyName: rec.companyName || '',
        score: rec.qualification?.score ?? null,
        qualification: rec.qualification?.manualOverride?.category || rec.qualification?.category || 'Qualification Pending',
        qualificationStatus: rec.qualification?.status || 'Pending',
        companyTypes: rec.qualification?.companyTypes || [],
        industryTags: rec.qualification?.industryTags || [],
        city: rec.city || '',
        state: rec.stateProvince || rec.state || '',
        phone: rec.phone || rec.mobile || '',
        email: rec.email || '',
        website: rec.website || '',
        sourcesFound: rec.sourcesFound || collectSourceProviders(rec).length,
        sourceProviders: collectSourceProviders(rec),
        lastFound: rec.lastDiscovered || rec.extractedAt || null,
        evidence: rec.qualification?.evidence || [],
        duplicateStatus: rec.phase2Merge?.duplicateStatus || rec.duplicateDisplayLabel || '',
        convertedRecordId: rec.convertedRecordId || '',
        fieldConfidence: rec.qualification?.fieldConfidence || null,
        manualOverride: rec.qualification?.manualOverride || null,
        feedback: rec.qualification?.feedback || null,
    }));
    return {
        total: filtered.length,
        page,
        limit,
        defaultView: !(query.categories === 'all' || query.view === 'all'),
        results,
        analytics: job.metadata?.phase2Analytics || buildPhase2Analytics(job, records),
    };
}

export async function getPhase2Analytics(companyId, jobId) {
    const job = await loadJob(companyId, jobId);
    const records = job.metadata?.previewRecords || [];
    const analytics = buildPhase2Analytics(job, records);
    job.metadata = { ...(job.metadata || {}), phase2Analytics: analytics };
    await job.save();
    return analytics;
}

export async function checkCrmDuplicatesForConvert(companyId, record) {
    const base = await checkDuplicateForRecord(companyId, record);
    const matches = [...(base.duplicateMatchRefs || [])];
    const name = String(record.companyName || '').trim();
    if (name.length >= 6) {
        const re = new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
        const lead = await Lead.findOne({ companyId, customerName: re, isDeleted: { $ne: true } }).select('_id customerName').lean();
        if (lead) matches.push({ type: 'lead', refId: lead._id, matchScore: 75, matchField: 'companyName', label: lead.customerName });
        const customer = await Customer.findOne({ companyId, customerName: re, isDeleted: { $ne: true } }).select('_id customerName').lean();
        if (customer) matches.push({ type: 'customer', refId: customer._id, matchScore: 80, matchField: 'companyName', label: customer.customerName });
        const supplier = await Supplier.findOne({ companyId, supplierName: re, isDeleted: { $ne: true } }).select('_id supplierName').lean();
        if (supplier) matches.push({ type: 'supplier', refId: supplier._id, matchScore: 80, matchField: 'companyName', label: supplier.supplierName });
    }
    const maxScore = matches.reduce((m, r) => Math.max(m, r.matchScore || 0), 0);
    return {
        duplicateStatus: maxScore >= 90 ? 'confirmed_duplicate' : (matches.length ? 'possible_duplicate' : 'none'),
        matches,
    };
}

export { snapshot };
