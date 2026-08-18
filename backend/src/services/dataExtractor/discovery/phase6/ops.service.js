/**
 * Phase 6 operations: saved searches, schedule, source health, recovery, bulk convert, cleanup.
 */
import { ExtractorSavedSearch } from '../../../../models/extractorSavedSearch.model.js';
import { ExtractorCompanyIdentity } from '../../../../models/extractorCompanyIdentity.model.js';
import { RawCapture } from '../../../../models/rawCapture.model.js';
import { DiscoveryJob } from '../../../../models/discoveryJob.model.js';
import { ApiError } from '../../../../utils/ApiError.js';
import { getSocialLoginStatus } from '../../socialSources/directLogin.adapter.js';
import { createDiscoveryJob, startDiscoveryJob, resumeDiscoveryJob } from '../discoveryJob.service.js';
import { createLead, createTaskFromLead } from '../../../lead.service.js';
import { crmStatusForIdentity } from '../phase5/identity.service.js';
import { computeOperationsDashboard, identityExportRows, recentCampaignAnalytics, mapSocialHealth, nextRunAt, startupDiscoveryRecoveryFilter } from './opsAnalytics.util.js';
import ExcelJS from 'exceljs';
import { AuditLog } from '../../../../models/auditLog.model.js';

export { computeOperationsDashboard, recentCampaignAnalytics, mapSocialHealth, nextRunAt, startupDiscoveryRecoveryFilter };

async function opsAudit(userId, description, details = {}) {
    if (!userId) return;
    const allowed = new Set(['CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'EXPORT', 'PRINT', 'APPROVE', 'CANCEL', 'REOPEN', 'OTHER']);
    const action = allowed.has(details.action) ? details.action : 'OTHER';
    try {
        await AuditLog.create({
            user: userId,
            action,
            module: 'data_extractor',
            description,
            details,
        });
    } catch {
        /* audit must never block extraction */
    }
}

export async function getSourceHealth({ companyId } = {}) {
    const now = new Date().toISOString();
    const jobs = await DiscoveryJob.find({ companyId, isDeleted: { $ne: true } }).sort({ lastProcessedAt: -1 }).limit(8).lean();
    const lastWeb = jobs.find((j) => (j.selectedSources || []).some((s) => ['public_web', 'brave', 'serpapi', 'indiamart'].includes(s)));
    const fb = getSocialLoginStatus({ platform: 'facebook', companyId });
    const ig = getSocialLoginStatus({ platform: 'instagram', companyId });
    const li = getSocialLoginStatus({ platform: 'linkedin', companyId });
    const x = getSocialLoginStatus({ platform: 'x', companyId });
    const row = (source, status, extra = {}) => ({
        source,
        status,
        lastSuccess: extra.lastSuccess || null,
        lastError: extra.lastError || extra.note || '',
        lastChecked: extra.lastChecked || now,
        reconnect: ['Login Required', 'Session Expired', 'Disconnected'].includes(status),
        cookies: undefined,
        tokens: undefined,
        password: undefined,
    });
    return {
        sources: [
            row('Web', lastWeb ? 'Ready' : 'Ready', { lastSuccess: lastWeb?.lastProcessedAt || lastWeb?.completedAt, lastError: (lastWeb?.errorSummary || [])[0] }),
            row('IndiaMART/Public', 'Ready', { lastSuccess: lastWeb?.lastProcessedAt }),
            row('Facebook', mapSocialHealth(fb.status), { lastSuccess: fb.connectedAt, lastChecked: fb.lastCheckedAt, lastError: fb.note }),
            row('Instagram', mapSocialHealth(ig.status), { lastSuccess: ig.connectedAt, lastChecked: ig.lastCheckedAt, lastError: ig.note }),
            row('LinkedIn', li.status === 'connected' ? 'Connected' : 'Login Required', {
                lastSuccess: li.connectedAt,
                lastChecked: li.lastCheckedAt,
                lastError: li.status === 'connected' ? '' : 'LinkedIn Direct = NOT VALIDATED',
            }),
            row('X', x.status === 'connected' ? 'Connected' : 'Login Required', {
                lastSuccess: x.connectedAt,
                lastChecked: x.lastCheckedAt,
                lastError: x.status === 'connected' ? '' : 'X Direct = NOT VALIDATED',
            }),
        ],
        linkedinDirectValidated: li.status === 'connected',
        xDirectValidated: x.status === 'connected',
    };
}

export async function listSavedSearches(companyId) {
    return ExtractorSavedSearch.find({ companyId, isDeleted: { $ne: true } }).sort({ updatedAt: -1 }).limit(100).lean();
}

export async function createSavedSearch(companyId, userId, body = {}) {
    const keyword = String(body.keyword || '').trim();
    if (keyword.length < 2) throw new ApiError(400, 'Keyword is required');
    const schedule = {
        enabled: false,
        frequency: 'off',
        weekday: 1,
        hour: 9,
        minute: 0,
        timezone: 'Asia/Kolkata',
        ...(body.schedule || {}),
        enabled: body.schedule?.enabled === true,
    };
    if (!schedule.enabled) schedule.frequency = 'off';
    schedule.nextRunAt = nextRunAt(schedule);
    const doc = await ExtractorSavedSearch.create({
        companyId,
        financialYear: body.financialYear || '',
        name: String(body.name || `${keyword}${body.location ? ` — ${body.location}` : ''}`).slice(0, 200),
        keyword,
        location: String(body.location || '').trim(),
        selectedSources: Array.isArray(body.selectedSources) ? body.selectedSources.slice(0, 12) : ['public_web'],
        batchSize: Math.min(250, Math.max(1, Number(body.batchSize) || 25)),
        crawlDepth: [0, 1, 2].includes(Number(body.crawlDepth)) ? Number(body.crawlDepth) : 1,
        includeDirectories: body.includeDirectories !== false,
        qualificationThreshold: String(body.qualificationThreshold || ''),
        active: body.active !== false,
        schedule,
        createdBy: userId,
        updatedBy: userId,
    });
    await opsAudit(userId, 'search created', { action: 'CREATE', savedSearchId: String(doc._id), keyword });
    return doc.toObject();
}

export async function updateSavedSearch(companyId, userId, id, body = {}) {
    const doc = await ExtractorSavedSearch.findOne({ _id: id, companyId, isDeleted: { $ne: true } });
    if (!doc) throw new ApiError(404, 'Saved search not found');
    if (body.name != null) doc.name = String(body.name).slice(0, 200);
    if (body.active != null) doc.active = body.active === true;
    if (body.schedule) {
        doc.schedule = {
            ...(doc.schedule || {}),
            ...body.schedule,
            enabled: body.schedule.enabled === true,
        };
        if (!doc.schedule.enabled) doc.schedule.frequency = 'off';
        doc.schedule.nextRunAt = nextRunAt(doc.schedule);
    }
    doc.updatedBy = userId;
    await doc.save();
    await opsAudit(userId, 'search updated', { action: 'UPDATE', savedSearchId: String(doc._id), keyword: doc.keyword, scheduled: doc.schedule?.enabled === true });
    return doc.toObject();
}

export async function archiveSavedSearch(companyId, userId, id) {
    const doc = await ExtractorSavedSearch.findOne({ _id: id, companyId, isDeleted: { $ne: true } });
    if (!doc) throw new ApiError(404, 'Saved search not found');
    doc.isDeleted = true;
    doc.active = false;
    doc.schedule = { ...(doc.schedule || {}), enabled: false };
    doc.updatedBy = userId;
    await doc.save();
    await opsAudit(userId, 'saved search archived', { action: 'DELETE', savedSearchId: String(doc._id) });
    return { ok: true };
}

export async function runSavedSearch(companyId, userId, id, { financialYear, headers } = {}) {
    void headers;
    const saved = await ExtractorSavedSearch.findOne({ _id: id, companyId, isDeleted: { $ne: true } });
    if (!saved) throw new ApiError(404, 'Saved search not found');
    const active = await DiscoveryJob.findOne({
        companyId,
        keyword: saved.keyword,
        status: { $in: ['RUNNING', 'QUEUED', 'RECOVERING'] },
        isDeleted: { $ne: true },
    }).lean();
    if (active) {
        throw new ApiError(409, 'A run is already active for this search. Overlapping campaigns are blocked.');
    }
    const beforeCount = await ExtractorCompanyIdentity.countDocuments({
        companyId, isDeleted: { $ne: true }, testOnly: { $ne: true }, mergedIntoId: null,
        keywords: saved.keyword,
    });
    const job = await createDiscoveryJob({
        companyId,
        userId,
        financialYear: financialYear || saved.financialYear || 'NA',
        keyword: saved.keyword,
        location: saved.location,
        batchSize: saved.batchSize,
        selectedSources: saved.selectedSources,
        crawlDepth: saved.crawlDepth,
        includeDirectories: saved.includeDirectories,
        targetCompanies: saved.batchSize,
    });
    const started = await startDiscoveryJob(companyId, job._id);
    saved.lastRunId = String(job._id);
    saved.lastIncremental = { previousUnique: beforeCount, jobId: String(job._id), at: new Date().toISOString() };
    saved.schedule = { ...(saved.schedule || {}), lastRunAt: new Date(), lastJobId: String(job._id), lastStatus: 'started' };
    await saved.save();
    await opsAudit(userId, 'run started', { action: 'OTHER', savedSearchId: String(saved._id), jobId: String(job._id), keyword: saved.keyword });
    return {
        job: started,
        previousUnique: beforeCount,
        note: 'Repeat run uses Phase 5 identity to classify Known / Updated / New after consolidation. Batch size does not cap total collection.',
    };
}

export async function dueScheduledSearches(now = new Date()) {
    return ExtractorSavedSearch.find({
        isDeleted: { $ne: true },
        active: true,
        'schedule.enabled': true,
        'schedule.nextRunAt': { $lte: now },
    }).limit(20).lean();
}

export async function tickScheduledSearches({ now = new Date() } = {}) {
    const due = await dueScheduledSearches(now);
    const results = [];
    for (const saved of due) {
        try {
            const running = await DiscoveryJob.findOne({
                companyId: saved.companyId,
                status: { $in: ['RUNNING', 'QUEUED', 'RECOVERING'] },
                isDeleted: { $ne: true },
            }).lean();
            if (running) {
                await ExtractorSavedSearch.updateOne({ _id: saved._id }, {
                    $set: { 'schedule.nextRunAt': new Date(now.getTime() + 15 * 60 * 1000), 'schedule.lastStatus': 'previous_run_active' },
                });
                results.push({ id: String(saved._id), skipped: 'previous_run_active' });
                continue;
            }
            await runSavedSearch(saved.companyId, saved.createdBy, saved._id, { financialYear: saved.financialYear });
            await ExtractorSavedSearch.updateOne({ _id: saved._id }, {
                $set: { 'schedule.nextRunAt': nextRunAt(saved.schedule, now), 'schedule.lastRunAt': now },
            });
            results.push({ id: String(saved._id), ok: true });
        } catch (err) {
            results.push({ id: String(saved._id), error: String(err?.message || err).slice(0, 200) });
        }
    }
    return { processed: due.length, results };
}

export async function previewBulkConvert(companyId, ids = []) {
    const unique = [...new Set((ids || []).map(String))].slice(0, 50);
    const rows = await ExtractorCompanyIdentity.find({
        _id: { $in: unique },
        companyId,
        isDeleted: { $ne: true },
        testOnly: { $ne: true },
    }).lean();
    const summary = { selected: unique.length, ready: 0, potentialCrmDuplicates: 0, missingMinimum: 0, items: [] };
    for (const ident of rows) {
        const missing = !ident.canonicalName || !(ident.website || ident.primaryEmail || ident.primaryPhone);
        const crm = await crmStatusForIdentity(companyId, ident);
        const dup = ['Existing Lead', 'Existing Customer', 'Existing Supplier', 'Possible CRM Duplicate'].includes(crm.crmStatus)
            || (ident.promotedExtractedLeadId);
        let status = 'ready';
        if (missing) { status = 'missing_minimum'; summary.missingMinimum += 1; }
        else if (dup) { status = 'crm_duplicate'; summary.potentialCrmDuplicates += 1; }
        else summary.ready += 1;
        summary.items.push({
            id: String(ident._id),
            company: ident.canonicalName,
            status,
            crmStatus: crm.crmStatus,
            crmMatchRefs: crm.crmMatchRefs,
        });
    }
    return summary;
}

export async function executeBulkConvert(companyId, user, { ids = [], confirm = false, assignedTo, createFollowUp } = {}) {
    if (confirm !== true) throw new ApiError(400, 'Bulk convert requires explicit confirmation');
    const preview = await previewBulkConvert(companyId, ids);
    const out = { created: [], skipped: [], failed: [], followUpRequested: Boolean(createFollowUp), assignedTo: assignedTo || null };
    for (const item of preview.items) {
        if (item.status !== 'ready') {
            out.skipped.push(item);
            continue;
        }
        try {
            const ident = await ExtractorCompanyIdentity.findOne({ _id: item.id, companyId });
            const converted = await createLead({
                companyId,
                source: 'data_extractor',
                status: 'new',
                customerName: ident.canonicalName,
                customerMobile: ident.primaryPhone || '',
                customerEmail: ident.primaryEmail || '',
                assignedTo: assignedTo || null,
                notes: [
                    'Lead Source: Data Extractor',
                    `Source Platforms: ${(ident.platforms || []).join(', ')}`,
                    `Search Keyword: ${(ident.keywords || []).join(', ')}`,
                    ident.website ? `Website: ${ident.website}` : '',
                ].filter(Boolean).join('\n'),
            }, user?._id || user?.id);
            ident.promotedExtractedLeadId = converted?._id || converted?.leadId || ident.promotedExtractedLeadId;
            ident.crmStatus = 'Converted to Lead';
            await ident.save();
            if (createFollowUp && user) {
                try {
                    await createTaskFromLead(converted._id, {
                        title: `Call ${ident.canonicalName}`,
                        assigneeId: assignedTo || undefined,
                    }, user, {});
                } catch {
                    /* follow-up is optional; lead create already succeeded */
                }
            }
            out.created.push({ id: item.id, leadId: String(converted?._id || converted?.leadId || '') });
        } catch (err) {
            out.failed.push({ id: item.id, error: String(err?.message || err).slice(0, 200) });
        }
    }
    await opsAudit(user?._id || user?.id, 'bulk convert', { action: 'CREATE', created: out.created.length, skipped: out.skipped.length, failed: out.failed.length });
    return out;
}

export const EXPORT_CURSOR_BATCH = 500;

export function identityExportFilter(companyId, query = {}) {
    const q = { companyId, isDeleted: { $ne: true }, mergedIntoId: null, testOnly: { $ne: true } };
    if (query.keyword) q.keywords = new RegExp(String(query.keyword).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    if (query.source) q.platforms = query.source;
    if (query.crmStatus) q.crmStatus = query.crmStatus;
    return q;
}

export async function exportIdentitiesWorkbook(companyId, query = {}) {
    const q = identityExportFilter(companyId, query);
    const total = await ExtractorCompanyIdentity.countDocuments(q);
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Consolidated Companies');
    const cursor = ExtractorCompanyIdentity.find(q).sort({ lastSeenAt: -1 }).batchSize(EXPORT_CURSOR_BATCH).cursor();
    let columnsSet = false;
    let count = 0;
    for await (const ident of cursor) {
        const row = identityExportRows([ident])[0];
        if (!row) continue;
        if (!columnsSet) {
            ws.columns = Object.keys(row).map((k) => ({ header: k, key: k, width: 22 }));
            columnsSet = true;
        }
        ws.addRow(row);
        count += 1;
    }
    if (!columnsSet) {
        ws.columns = [{ header: 'Company', key: 'Company', width: 22 }];
    }
    const buf = await wb.xlsx.writeBuffer();
    return { buffer: Buffer.from(buf), fileName: 'consolidated-companies.xlsx', count, total };
}

export async function previewTestDataCleanup(companyId) {
    const identityCount = await ExtractorCompanyIdentity.countDocuments({ companyId, testOnly: true });
    const captureCount = await RawCapture.countDocuments({ companyId, notes: /testOnly\s*=\s*true/i });
    return { testOnlyIdentities: identityCount, testOnlyRawCaptures: captureCount };
}

export async function cleanupTestData(companyId, userId, { confirm = false } = {}) {
    if (confirm !== true) throw new ApiError(400, 'Test-data cleanup requires confirmation');
    const preview = await previewTestDataCleanup(companyId);
    const ident = await ExtractorCompanyIdentity.updateMany(
        { companyId, testOnly: true },
        { $set: { isDeleted: true, updatedBy: userId } },
    );
    const result = { ...preview, identitiesArchived: ident.modifiedCount || 0, rawCapturesDeleted: 0, note: 'Genuine records were not modified. RawCapture test fixtures were not physically deleted.' };
    await opsAudit(userId, 'test-data cleanup', { action: 'DELETE', ...result });
    return result;
}

export async function recoverStaleDiscoveryJobsOnStartup({ staleMs = 15 * 60 * 1000 } = {}) {
    void staleMs;
    const stale = await DiscoveryJob.find(startupDiscoveryRecoveryFilter()).limit(25);
    const summary = { recovered: 0, paused: 0 };
    for (const job of stale) {
        job.status = 'PAUSED';
        job.metadata = { ...(job.metadata || {}), pipelineStatus: 'recovering', stopReason: 'paused' };
        await job.save();
        summary.recovered += 1;
        try {
            await resumeDiscoveryJob(job.companyId, job._id);
        } catch {
            job.status = 'PAUSED';
            job.metadata = { ...(job.metadata || {}), pipelineStatus: 'paused', stopReason: 'paused' };
            await job.save();
            summary.paused += 1;
        }
    }
    return summary;
}
