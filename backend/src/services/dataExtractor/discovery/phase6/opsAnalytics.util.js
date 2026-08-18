/**
 * Phase 6 operational analytics. Uses Phase 5 identities for unique-company counts.
 * Excludes testOnly by default. Does not change Processing / Verify.
 */
import { ExtractorCompanyIdentity } from '../../../../models/extractorCompanyIdentity.model.js';
import { RawCapture } from '../../../../models/rawCapture.model.js';
import { DiscoveryJob } from '../../../../models/discoveryJob.model.js';
import { isTestOnlyRecord, classifySourcePlatform } from '../phase5/identityEvidence.util.js';

const TEST_NOTES = /testOnly\s*=\s*true/i;

export function testOnlyRawFilter() {
    return { notes: { $not: TEST_NOTES } };
}

export function emptySourceRow(source) {
    return {
        source,
        raw: 0,
        uniqueCompanies: 0,
        qualified: 0,
        highlyRelevant: 0,
        email: 0,
        phone: 0,
        website: 0,
        verified: 0,
        converted: 0,
        newCompanies: 0,
        duplicatesEnriched: 0,
        failures: 0,
        blocked: 0,
        usefulRate: 0,
        emailYield: 0,
        qualifiedRate: 0,
    };
}

export function buildDashboardFromIdentities(identities = [], evidenceCount = 0) {
    const genuine = identities.filter((i) => i && i.testOnly !== true && !i.mergedIntoId);
    const cat = {
        'Highly Relevant': 0,
        Relevant: 0,
        'Possibly Relevant': 0,
        'Not Relevant': 0,
        'Insufficient Information': 0,
    };
    let withWebsite = 0;
    let withEmail = 0;
    let withPhone = 0;
    let withBoth = 0;
    let verified = 0;
    let converted = 0;
    let existingCrm = 0;
    let missingLocation = 0;
    let possibleDup = 0;
    const sources = {};

    for (const ident of genuine) {
        const c = ident.qualificationCategory || 'Insufficient Information';
        if (Object.prototype.hasOwnProperty.call(cat, c)) cat[c] += 1;
        if (ident.website) withWebsite += 1;
        if (ident.primaryEmail) withEmail += 1;
        if (ident.primaryPhone) withPhone += 1;
        if (ident.primaryEmail && ident.primaryPhone) withBoth += 1;
        if (ident.verificationSummary?.verifiedGenuine > 0) verified += 1;
        if (ident.crmStatus === 'Converted to Lead' || ident.promotedExtractedLeadId) converted += 1;
        if (['Existing Lead', 'Existing Customer', 'Existing Supplier'].includes(ident.crmStatus)) existingCrm += 1;
        if (!ident.city && !(ident.locations || []).length) missingLocation += 1;
        if (ident.crmStatus === 'Possible CRM Duplicate') possibleDup += 1;
        for (const p of ident.platforms || []) {
            if (!sources[p]) sources[p] = emptySourceRow(p);
            sources[p].uniqueCompanies += 1;
            if (ident.qualificationScore >= 70 || ['Highly Relevant', 'Relevant'].includes(c)) sources[p].qualified += 1;
            if (c === 'Highly Relevant') sources[p].highlyRelevant += 1;
            if (ident.primaryEmail) sources[p].email += 1;
            if (ident.primaryPhone) sources[p].phone += 1;
            if (ident.website) sources[p].website += 1;
            if (ident.verificationSummary?.verifiedGenuine > 0) sources[p].verified += 1;
            if (ident.foundCount > 1) sources[p].duplicatesEnriched += 1;
            else sources[p].newCompanies += 1;
        }
    }

    const n = genuine.length || 1;
    return {
        rawEvidenceRecords: evidenceCount,
        uniqueCompanies: genuine.length,
        highlyRelevant: cat['Highly Relevant'],
        relevant: cat.Relevant,
        possiblyRelevant: cat['Possibly Relevant'],
        notRelevant: cat['Not Relevant'],
        insufficientInformation: cat['Insufficient Information'],
        withWebsite,
        withEmail,
        withPhone,
        withBothEmailPhone: withBoth,
        verifiedCompanies: verified,
        alreadyExistingInCrm: existingCrm,
        newQualifiedCompanies: genuine.filter((i) => ['Highly Relevant', 'Relevant'].includes(i.qualificationCategory) && i.crmStatus === 'New').length,
        convertedToCrmLeads: converted,
        quality: {
            uniqueCompanies: genuine.length,
            withWebsitePct: Math.round((withWebsite / n) * 100),
            withEmailPct: Math.round((withEmail / n) * 100),
            withPhonePct: Math.round((withPhone / n) * 100),
            withBothPct: Math.round((withBoth / n) * 100),
            verifiedPct: Math.round((verified / n) * 100),
            highRelevancePct: Math.round((cat['Highly Relevant'] / n) * 100),
            possibleDuplicatesPct: Math.round((possibleDup / n) * 100),
            missingLocationPct: Math.round((missingLocation / n) * 100),
        },
        sourcePerformance: Object.values(sources).map((row) => ({
            ...row,
            usefulRate: row.uniqueCompanies ? Math.round((row.qualified / row.uniqueCompanies) * 100) : 0,
            emailYield: row.uniqueCompanies ? Math.round((row.email / row.uniqueCompanies) * 100) : 0,
            qualifiedRate: row.uniqueCompanies ? Math.round((row.qualified / row.uniqueCompanies) * 100) : 0,
        })),
    };
}

export function applyEvidenceRawCounts(dashboard, captures = []) {
    const genuine = captures.filter((c) => !isTestOnlyRecord(c));
    dashboard.rawEvidenceRecords = genuine.length;
    const bySource = {};
    for (const cap of genuine) {
        const p = classifySourcePlatform({ source: cap.source, url: cap.resultUrlNormalized || cap.resultUrlOriginal });
        if (!bySource[p]) bySource[p] = 0;
        bySource[p] += 1;
    }
    for (const row of dashboard.sourcePerformance) {
        row.raw = bySource[row.source] || 0;
    }
    for (const [source, raw] of Object.entries(bySource)) {
        if (!dashboard.sourcePerformance.find((r) => r.source === source)) {
            dashboard.sourcePerformance.push({ ...emptySourceRow(source), raw });
        }
    }
    return dashboard;
}

export async function computeOperationsDashboard(companyId, query = {}) {
    const identQ = { companyId, isDeleted: { $ne: true }, mergedIntoId: null, testOnly: { $ne: true } };
    if (query.keyword) identQ.keywords = new RegExp(String(query.keyword).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    if (query.city || query.location) {
        identQ.$or = [
            { city: new RegExp(String(query.city || query.location), 'i') },
            { locations: new RegExp(String(query.location || query.city), 'i') },
        ];
    }
    if (query.source) identQ.platforms = query.source;
    const identities = await ExtractorCompanyIdentity.find(identQ).limit(5000).lean();
    const capQ = { companyId, ...testOnlyRawFilter() };
    if (query.source) capQ.source = query.source;
    const evidenceCount = await RawCapture.countDocuments(capQ);
    const sampleCaps = await RawCapture.find(capQ).select('source resultUrlNormalized resultUrlOriginal notes snippet title').limit(4000).lean();
    const dash = buildDashboardFromIdentities(identities, evidenceCount);
    applyEvidenceRawCounts(dash, sampleCaps);
    dash.keyword = query.keyword || '';
    dash.location = query.location || query.city || '';
    return dash;
}

export function identityExportRows(identities = []) {
    return identities.filter((i) => i.testOnly !== true).map((i) => ({
        Company: i.canonicalName,
        CanonicalCompanyName: i.canonicalName,
        CompanyType: i.companyType || '',
        IndustryTags: (i.industryTags || []).join('; '),
        AIScore: i.qualificationScore ?? '',
        Qualification: i.qualificationCategory || '',
        PrimaryEmail: i.primaryEmail || '',
        AdditionalEmails: (i.additionalEmails || []).map((e) => e.value || e).join('; '),
        PrimaryPhone: i.primaryPhone || '',
        AdditionalPhones: (i.additionalPhones || []).map((p) => p.value || p).join('; '),
        Website: i.website || '',
        Address: i.address || '',
        City: i.city || '',
        State: i.state || '',
        Country: i.country || '',
        Facebook: i.social?.facebookUrl || '',
        Instagram: i.social?.instagramUrl || '',
        LinkedIn: i.social?.linkedinCompanyUrl || '',
        X: i.social?.xUrl || '',
        IndiaMART: (i.directories || []).find((d) => d.kind === 'indiamart')?.url || '',
        TradeIndia: (i.directories || []).find((d) => d.kind === 'tradeindia')?.url || '',
        OtherSources: (i.directories || []).map((d) => d.url).join('; '),
        SourcePlatformCount: i.sourcePlatformCount || 0,
        EvidenceCount: i.evidenceRecordCount || 0,
        VerificationSummary: i.verificationSummary?.status || '',
        CRMStatus: i.crmStatus || '',
        SearchKeywords: (i.keywords || []).join('; '),
        FirstDiscovered: i.firstDiscoveredAt || '',
        LastSeen: i.lastSeenAt || '',
        Completeness: i.completeness ?? '',
        SourcePlatforms: (i.platforms || []).join('; '),
    }));
}

export function campaignAnalyticsFromJob(job = {}) {
    const preview = job.metadata?.previewRecords || [];
    const genuine = preview.filter((r) => !isTestOnlyRecord(r));
    return {
        jobId: job._id ? String(job._id) : '',
        keyword: job.keyword,
        location: [job.city, job.state, job.country].filter(Boolean).join(', '),
        status: job.status,
        stopReason: job.metadata?.stopReason || '',
        batchSize: job.batchSize,
        totalCaptured: job.totalRawResults || genuine.length,
        uniqueCompanies: job.totalUniqueResults || genuine.filter((r) => r.phase2Merge?.mergedIntoPreviewIndex == null).length,
        queriesGenerated: (job.metadata?.generatedQueries || []).length,
        unlimitedCollection: job.metadata?.unlimitedCollection !== false,
        pipelineStatus: job.metadata?.pipelineStatus || '',
        runtimeMs: job.startedAt && job.lastProcessedAt
            ? new Date(job.lastProcessedAt) - new Date(job.startedAt)
            : 0,
    };
}

export async function recentCampaignAnalytics(companyId, limit = 10) {
    const jobs = await DiscoveryJob.find({ companyId, isDeleted: { $ne: true } }).sort({ createdAt: -1 }).limit(limit).lean();
    return jobs.map(campaignAnalyticsFromJob);
}

const SOURCE_HEALTH_MAP = {
    connected: 'Connected',
    disconnected: 'Login Required',
    expired: 'Session Expired',
};

export function mapSocialHealth(status) {
    return SOURCE_HEALTH_MAP[status] || 'Disconnected';
}

export function startupDiscoveryRecoveryFilter() {
    return {
        status: { $in: ['RUNNING', 'RECOVERING'] },
        isDeleted: { $ne: true },
    };
}

export function nextRunAt(schedule = {}, from = new Date()) {
    if (!schedule.enabled || !schedule.frequency || schedule.frequency === 'off') return null;
    const d = new Date(from);
    d.setSeconds(0, 0);
    d.setHours(Number(schedule.hour) || 9, Number(schedule.minute) || 0, 0, 0);
    if (schedule.frequency === 'daily') {
        if (d <= from) d.setDate(d.getDate() + 1);
        return d;
    }
    if (schedule.frequency === 'weekly') {
        const want = Number(schedule.weekday);
        const wd = Number.isFinite(want) ? want : 1;
        while (d.getDay() !== wd || d <= from) d.setDate(d.getDate() + 1);
        return d;
    }
    if (schedule.frequency === 'monthly') {
        if (d <= from) d.setMonth(d.getMonth() + 1);
        return d;
    }
    return null;
}
