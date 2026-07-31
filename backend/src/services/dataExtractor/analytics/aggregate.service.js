import mongoose from 'mongoose';
import { ExtractedLead } from '../../../models/extractedLead.model.js';
import { DiscoveryJob } from '../../../models/discoveryJob.model.js';
import { DiscoverySourceTask } from '../../../models/discoverySourceTask.model.js';
import { AiLeadRelevance } from '../../../models/aiLeadRelevance.model.js';
import { AiIndustryClassification } from '../../../models/aiIndustryClassification.model.js';
import { AiProductRecommendation } from '../../../models/aiProductRecommendation.model.js';
import { AiContactIntelligence } from '../../../models/aiContactIntelligence.model.js';
import { AiCompanyIntelligenceProfile } from '../../../models/aiCompanyIntelligenceProfile.model.js';
import { AiLeadScore } from '../../../models/aiLeadScore.model.js';
import { AiSimilarCompanyResult } from '../../../models/aiSimilarCompanyResult.model.js';
import { AiMarketIntelligence } from '../../../models/aiMarketIntelligence.model.js';
import { AiCrmEnrichmentDraft } from '../../../models/aiCrmEnrichmentDraft.model.js';
import { AiCrmEnrichmentTransaction } from '../../../models/aiCrmEnrichmentTransaction.model.js';
import { AiSalesWorkflowDraft } from '../../../models/aiSalesWorkflowDraft.model.js';
import { AiSalesWorkflowTransaction } from '../../../models/aiSalesWorkflowTransaction.model.js';
import { AiClassificationBatchJob } from '../../../models/aiClassificationBatchJob.model.js';
import { AiProductRecommendationBatchJob } from '../../../models/aiProductRecommendationBatchJob.model.js';
import { AiContactIntelligenceBatchJob } from '../../../models/aiContactIntelligenceBatchJob.model.js';
import { AiCompanyIntelligenceBatchJob } from '../../../models/aiCompanyIntelligenceBatchJob.model.js';
import { AiLeadScoreBatchJob } from '../../../models/aiLeadScoreBatchJob.model.js';
import { AiSimilarCompanyBatchJob } from '../../../models/aiSimilarCompanyBatchJob.model.js';
import { AiCrmEnrichmentBatchJob } from '../../../models/aiCrmEnrichmentBatchJob.model.js';
import { AiSalesWorkflowBatchJob } from '../../../models/aiSalesWorkflowBatchJob.model.js';
import { KPI_DEFINITIONS } from './constants.js';
import { getAnalyticsSettings } from './settings.service.js';
import { buildMatch, pct, fingerprint, assertNoSecrets, filterSummary } from './filters.util.js';
import { canDrillDown, isAggregateOnly } from './permissions.util.js';

const APPLIED_TX = ['APPLIED', 'PARTIALLY_APPLIED'];
const CREATE_LEAD_ACTION = 'CREATE_LEAD_DRAFT';
const HIGH_PRIORITY = ['HIGH', 'CRITICAL'];
const RELEVANT_STATUSES = ['RELEVANT', 'POSSIBLY_RELEVANT'];

function oid(id) {
    if (!id) return id;
    if (id instanceof mongoose.Types.ObjectId) return id;
    if (mongoose.Types.ObjectId.isValid(id)) return new mongoose.Types.ObjectId(String(id));
    return id;
}

function baseEnvelope(filters, metrics, extra = {}) {
    const payload = {
        generatedAt: new Date(),
        dataThrough: new Date(),
        filters: filterSummary(filters),
        filterFingerprint: fingerprint(filters),
        metrics,
        readOnly: true,
        noProviderCalls: true,
        noAiCalls: true,
        noCrmWrites: true,
        ...extra,
    };
    assertNoSecrets(payload);
    return payload;
}

function leadMatch(companyId, filters) {
    const m = buildMatch(oid(companyId), filters, { mode: 'lead' });
    delete m.isDeleted;
    if (filters.source) m.sourcePlatform = filters.source;
    return m;
}

function intelMatch(companyId, filters, extra = {}) {
    return { ...buildMatch(oid(companyId), filters, { mode: 'intel' }), ...extra };
}

function txMatch(companyId, filters, dateField = 'appliedAt') {
    const f = { ...filters, dateField };
    const m = buildMatch(oid(companyId), f, { mode: 'tx' });
    return m;
}

async function groupBy(Model, match, field, limit = 25) {
    const rows = await Model.aggregate([
        { $match: match },
        { $group: { _id: `$${field}`, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: limit },
        { $project: { _id: 0, key: { $ifNull: ['$_id', '(blank)'] }, count: 1 } },
    ]);
    return rows;
}

async function avgField(Model, match, field) {
    const rows = await Model.aggregate([
        { $match: match },
        { $group: { _id: null, avg: { $avg: `$${field}` }, count: { $sum: 1 } } },
    ]);
    return rows[0] ? { avg: Math.round((rows[0].avg || 0) * 100) / 100, count: rows[0].count } : { avg: 0, count: 0 };
}

function drillHints(moduleKey, user) {
    const allowed = canDrillDown(user, moduleKey);
    return {
        allowed,
        aggregateOnly: isAggregateOnly(user) || !allowed,
        notice: allowed ? null : 'Aggregate-only: record-level drill-down denied',
    };
}

export async function getExecutiveSummary(companyId, filters, user) {
    const settings = await getAnalyticsSettings(companyId);
    const lm = leadMatch(companyId, filters);
    const im = intelMatch(companyId, filters);
    const scoreM = intelMatch(companyId, filters);
    const crmTx = txMatch(companyId, filters, 'appliedAt');
    const swTx = txMatch(companyId, filters, 'appliedAt');

    const [
        discoveredCompanies,
        duplicateCount,
        uniqueApprox,
        approvedLeads,
        rejectedLeads,
        relevantCompanies,
        irrelevantCompanies,
        highPriorityLeads,
        scoreStats,
        withDecisionMaker,
        productAccepted,
        similarCandidates,
        approvedForEnrichment,
        crmLeadsCreated,
        crmRecordsEnriched,
        assignmentTxs,
        followUpTxs,
        taskAgg,
        pendingReviews,
        outdatedScores,
        failedBatches,
    ] = await Promise.all([
        ExtractedLead.countDocuments(lm),
        ExtractedLead.countDocuments({
            ...lm,
            $or: [{ status: 'duplicate' }, { duplicateStatus: 'confirmed_duplicate' }],
        }),
        ExtractedLead.countDocuments({
            ...lm,
            status: { $ne: 'duplicate' },
            duplicateStatus: { $ne: 'confirmed_duplicate' },
        }),
        ExtractedLead.countDocuments({ ...lm, status: 'approved' }),
        ExtractedLead.countDocuments({ ...lm, status: 'rejected' }),
        AiLeadRelevance.countDocuments({ ...im, status: { $in: RELEVANT_STATUSES } }),
        AiLeadRelevance.countDocuments({ ...im, status: 'IRRELEVANT' }),
        AiLeadScore.countDocuments({ ...scoreM, priority: { $in: HIGH_PRIORITY } }),
        avgField(AiLeadScore, scoreM, 'finalScore'),
        AiContactIntelligence.countDocuments({
            ...im,
            $or: [
                { 'primaryContact.isDecisionMakerCandidate': true },
                { 'contacts.isDecisionMakerCandidate': true },
                { decisionMakerScore: { $gte: 50 } },
            ],
        }),
        AiProductRecommendation.countDocuments({ ...im, status: { $in: ['ACCEPTED', 'RECOMMENDED'] } }),
        AiSimilarCompanyResult.countDocuments(im),
        AiSimilarCompanyResult.countDocuments({ ...im, status: 'APPROVED_FOR_ENRICHMENT' }),
        AiCrmEnrichmentTransaction.countDocuments({
            ...crmTx,
            actionType: CREATE_LEAD_ACTION,
            status: 'APPLIED',
        }),
        AiCrmEnrichmentTransaction.countDocuments({
            ...crmTx,
            actionType: { $ne: CREATE_LEAD_ACTION },
            status: { $in: APPLIED_TX },
        }),
        AiSalesWorkflowTransaction.countDocuments({
            ...swTx,
            status: { $in: APPLIED_TX },
            'appliedValues.assignedTo': { $exists: true, $nin: [null, ''] },
        }),
        AiSalesWorkflowTransaction.countDocuments({
            ...swTx,
            status: { $in: APPLIED_TX },
            followUpApplied: { $exists: true, $ne: null },
        }),
        AiSalesWorkflowTransaction.aggregate([
            { $match: { ...swTx, status: { $in: APPLIED_TX } } },
            { $project: { n: { $size: { $ifNull: ['$appliedTaskIds', []] } } } },
            { $group: { _id: null, tasks: { $sum: '$n' } } },
        ]),
        Promise.all([
            AiIndustryClassification.countDocuments({ ...im, status: 'MANUAL_REVIEW_REQUIRED' }),
            AiLeadRelevance.countDocuments({ ...im, status: 'MANUAL_REVIEW' }),
            AiLeadScore.countDocuments({ ...scoreM, status: 'MANUAL_REVIEW_REQUIRED' }),
            AiCrmEnrichmentDraft.countDocuments({ ...im, status: { $in: ['MATCH_REVIEW_REQUIRED', 'FIELD_REVIEW_REQUIRED', 'READY_FOR_APPROVAL'] } }),
        ]).then((a) => a.reduce((s, n) => s + n, 0)),
        AiLeadScore.countDocuments({ ...scoreM, status: 'OUTDATED' }),
        Promise.all([
            AiClassificationBatchJob.countDocuments({ companyId: oid(companyId), isDeleted: { $ne: true }, status: 'FAILED' }),
            AiLeadScoreBatchJob.countDocuments({ companyId: oid(companyId), isDeleted: { $ne: true }, status: 'FAILED' }),
            AiCrmEnrichmentBatchJob.countDocuments({ companyId: oid(companyId), isDeleted: { $ne: true }, status: 'FAILED' }),
            AiSalesWorkflowBatchJob.countDocuments({ companyId: oid(companyId), isDeleted: { $ne: true }, status: 'FAILED' }),
        ]).then((a) => a.reduce((s, n) => s + n, 0)),
    ]);

    const tasksCreated = taskAgg[0]?.tasks || 0;
    const metrics = {
        discoveredCompanies,
        uniqueCompanies: uniqueApprox,
        duplicateCount,
        relevantCompanies,
        approvedLeads,
        rejectedLeads,
        irrelevantCompanies,
        highPriorityLeads,
        averageLeadScore: scoreStats.avg,
        scoredLeads: scoreStats.count,
        companiesWithDecisionMaker: withDecisionMaker,
        productOpportunities: productAccepted,
        similarCompanyCandidates: similarCandidates,
        approvedForEnrichment,
        crmLeadsCreated,
        crmRecordsEnriched,
        assignmentsApplied: assignmentTxs,
        tasksCreated,
        followUpsScheduled: followUpTxs,
        pendingManualReviews: pendingReviews,
        outdatedRecords: outdatedScores,
        failedBatchJobs: failedBatches,
        draftNote: 'CRM drafts are not counted as converted leads',
    };

    return baseEnvelope(filters, metrics, {
        kpiDefinitions: KPI_DEFINITIONS,
        drillDownHints: drillHints('executive', user),
        settingsVersion: settings.version,
        topNLimit: settings.topNLimit,
    });
}

export async function getFunnel(companyId, filters, user) {
    const lm = leadMatch(companyId, filters);
    const im = intelMatch(companyId, filters);
    const scoreM = intelMatch(companyId, filters);
    const crmTx = txMatch(companyId, filters, 'appliedAt');
    const swTx = txMatch(companyId, filters, 'appliedAt');

    const stages = [];
    const discovered = await ExtractedLead.countDocuments(lm);
    stages.push({ id: 'discovery', label: 'Discovery', count: discovered, metricType: 'record_count' });

    const unique = await ExtractedLead.countDocuments({
        ...lm,
        status: { $ne: 'duplicate' },
        duplicateStatus: { $ne: 'confirmed_duplicate' },
    });
    stages.push({ id: 'unique_entity', label: 'Unique Entity', count: unique, metricType: 'unique_company_count' });

    const classified = await AiIndustryClassification.countDocuments({
        ...im,
        status: { $in: ['CLASSIFIED', 'LOW_CONFIDENCE', 'MULTIPLE_POSSIBILITIES'] },
    });
    stages.push({ id: 'classified', label: 'Classified', count: classified, metricType: 'record_count' });

    const relevant = await AiLeadRelevance.countDocuments({ ...im, status: { $in: RELEVANT_STATUSES } });
    stages.push({ id: 'relevant', label: 'Relevant', count: relevant, metricType: 'record_count' });

    const product = await AiProductRecommendation.countDocuments({
        ...im,
        status: { $in: ['RECOMMENDED', 'ACCEPTED', 'MANUAL_REVIEW', 'LOW_CONFIDENCE'] },
    });
    stages.push({ id: 'product_opportunity', label: 'Product Opportunity', count: product, metricType: 'record_count' });

    const contact = await AiContactIntelligence.countDocuments({
        ...im,
        status: { $in: ['CONTACT_FOUND', 'GENERIC_CONTACT_ONLY', 'MULTIPLE_CONTACTS'] },
    });
    stages.push({ id: 'contact_available', label: 'Contact Available', count: contact, metricType: 'record_count' });

    const profile = await AiCompanyIntelligenceProfile.countDocuments({
        ...im,
        status: { $in: ['GENERATED', 'APPROVED', 'LOW_CONFIDENCE', 'MANUAL_REVIEW_REQUIRED', 'LOCKED'] },
    });
    stages.push({ id: 'company_profile', label: 'Company Profile', count: profile, metricType: 'record_count' });

    const scored = await AiLeadScore.countDocuments({
        ...scoreM,
        status: { $in: ['SCORED', 'LOW_CONFIDENCE', 'APPROVED', 'LOCKED', 'MANUAL_REVIEW_REQUIRED'] },
    });
    stages.push({ id: 'lead_scored', label: 'Lead Scored', count: scored, metricType: 'record_count' });

    const highPri = await AiLeadScore.countDocuments({ ...scoreM, priority: { $in: HIGH_PRIORITY } });
    stages.push({ id: 'high_priority', label: 'High Priority', count: highPri, metricType: 'record_count' });

    const approvedEnrich = await AiSimilarCompanyResult.countDocuments({ ...im, status: 'APPROVED_FOR_ENRICHMENT' });
    const readyDrafts = await AiCrmEnrichmentDraft.countDocuments({
        ...im,
        status: { $in: ['APPROVED', 'READY_FOR_APPROVAL'] },
    });
    stages.push({
        id: 'approved_for_enrichment',
        label: 'Approved for Enrichment',
        count: approvedEnrich + readyDrafts,
        metricType: 'record_count',
    });

    const crmCreated = await AiCrmEnrichmentTransaction.countDocuments({
        ...crmTx,
        actionType: CREATE_LEAD_ACTION,
        status: 'APPLIED',
    });
    const crmLinked = await AiCrmEnrichmentTransaction.countDocuments({
        ...crmTx,
        actionType: { $ne: CREATE_LEAD_ACTION },
        status: { $in: APPLIED_TX },
    });
    stages.push({
        id: 'crm_lead_or_linked',
        label: 'CRM Lead Created or Existing Linked',
        count: crmCreated + crmLinked,
        metricType: 'transaction_count',
        breakdown: { crmLeadsCreated: crmCreated, crmRecordsEnriched: crmLinked },
    });

    const assigned = await AiSalesWorkflowTransaction.countDocuments({
        ...swTx,
        status: { $in: APPLIED_TX },
        'appliedValues.assignedTo': { $exists: true, $nin: [null, ''] },
    });
    stages.push({ id: 'assigned', label: 'Assigned', count: assigned, metricType: 'transaction_count' });

    const taskOrFollow = await AiSalesWorkflowTransaction.countDocuments({
        ...swTx,
        status: { $in: APPLIED_TX },
        $or: [
            { 'appliedTaskIds.0': { $exists: true } },
            { followUpApplied: { $exists: true, $ne: null } },
        ],
    });
    stages.push({ id: 'task_followup', label: 'Task/Follow-up Created', count: taskOrFollow, metricType: 'transaction_count' });

    const enriched = stages.map((s, i) => {
        const prev = i === 0 ? null : stages[i - 1].count;
        return {
            ...s,
            conversionFromPreviousPct: prev == null ? 100 : pct(s.count, prev),
            conversionFromDiscoveredPct: pct(s.count, discovered),
            dropOffFromPrevious: prev == null ? 0 : Math.max(0, prev - s.count),
            dropOffFromPreviousPct: prev == null ? 0 : pct(Math.max(0, prev - s.count), prev),
        };
    });

    return baseEnvelope(filters, { stages: enriched, discovered }, {
        dimensions: { stageCount: enriched.length },
        drillDownHints: drillHints('executive', user),
        kpiDefinitions: {
            discoveredCompanies: KPI_DEFINITIONS.discoveredCompanies,
            crmLeadsCreated: KPI_DEFINITIONS.crmLeadsCreated,
            assignmentsApplied: KPI_DEFINITIONS.assignmentsApplied,
        },
    });
}

export async function getDiscoveryAnalytics(companyId, filters, user) {
    const settings = await getAnalyticsSettings(companyId);
    const topN = settings.topNLimit;
    const lm = leadMatch(companyId, filters);
    const jm = buildMatch(oid(companyId), filters, { mode: 'job' });
    delete jm.isDeleted;
    if (filters.financialYear) jm.financialYear = filters.financialYear;

    const [bySource, jobsByStatus, sourceTasksByStatus, byProvider, totalLeads, totalJobs, zeroResultJobs] = await Promise.all([
        groupBy(ExtractedLead, lm, 'sourcePlatform', topN),
        groupBy(DiscoveryJob, { ...jm, isDeleted: { $ne: true } }, 'status', topN),
        DiscoverySourceTask.aggregate([
            { $match: { companyId: oid(companyId) } },
            { $group: { _id: '$status', count: { $sum: 1 }, apiRequests: { $sum: '$apiRequests' }, rawResults: { $sum: '$rawResults' } } },
            { $sort: { count: -1 } },
            { $project: { _id: 0, key: '$_id', count: 1, apiRequests: 1, rawResults: 1 } },
        ]),
        DiscoverySourceTask.aggregate([
            { $match: { companyId: oid(companyId) } },
            { $group: { _id: '$providerId', count: { $sum: 1 }, failed: { $sum: { $cond: [{ $eq: ['$status', 'FAILED'] }, 1, 0] } }, apiRequests: { $sum: '$apiRequests' }, uniqueResults: { $sum: '$uniqueResults' } } },
            { $sort: { count: -1 } },
            { $limit: topN },
            { $project: { _id: 0, providerId: '$_id', count: 1, failed: 1, apiRequests: 1, uniqueResults: 1 } },
        ]),
        ExtractedLead.countDocuments(lm),
        DiscoveryJob.countDocuments({ ...jm, isDeleted: { $ne: true } }),
        DiscoveryJob.countDocuments({ ...jm, isDeleted: { $ne: true }, totalRawResults: { $lte: 0 } }),
    ]);

    const dupBySource = await ExtractedLead.aggregate([
        { $match: { ...lm, $or: [{ status: 'duplicate' }, { duplicateStatus: 'confirmed_duplicate' }] } },
        { $group: { _id: '$sourcePlatform', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: topN },
        { $project: { _id: 0, key: '$_id', count: 1 } },
    ]);

    return baseEnvelope(filters, {
        totalDiscovered: totalLeads,
        totalJobs,
        zeroResultJobs,
        bySource,
        duplicateRateBySource: dupBySource.map((r) => ({
            ...r,
            ratePct: pct(r.count, bySource.find((s) => s.key === r.key)?.count || 0),
        })),
        jobsByStatus,
        sourceTasksByStatus,
        byProvider,
    }, {
        dimensions: { bySource, byProvider },
        drillDownHints: drillHints('discovery', user),
    });
}

export async function getDataQualityAnalytics(companyId, filters, user) {
    const lm = leadMatch(companyId, filters);
    const im = intelMatch(companyId, filters);
    const eligible = await ExtractedLead.countDocuments(lm);
    const blank = (field) => ExtractedLead.countDocuments({
        ...lm,
        $or: [{ [field]: { $exists: false } }, { [field]: null }, { [field]: '' }],
    });

    const [
        missingWebsite, missingEmail, missingPhone, missingAddress, missingCity, missingState,
        missingIndustry, missingCustomerType, lowConfClass, manualReviewClass,
        outdatedScores, outdatedProfiles, lockedContacts, noPublicContact, possibleDup,
    ] = await Promise.all([
        blank('website'),
        blank('email'),
        ExtractedLead.countDocuments({
            ...lm,
            $and: [
                { $or: [{ phone: { $in: [null, ''] } }, { phone: { $exists: false } }] },
                { $or: [{ mobile: { $in: [null, ''] } }, { mobile: { $exists: false } }] },
            ],
        }),
        blank('address'),
        blank('city'),
        blank('stateProvince'),
        AiIndustryClassification.countDocuments({
            ...im,
            $or: [{ primaryIndustry: { $in: [null, ''] } }, { status: 'MANUAL_REVIEW_REQUIRED' }],
        }),
        AiIndustryClassification.countDocuments({ ...im, $or: [{ customerType: { $in: [null, ''] } }] }),
        AiIndustryClassification.countDocuments({ ...im, status: 'LOW_CONFIDENCE' }),
        AiIndustryClassification.countDocuments({ ...im, status: 'MANUAL_REVIEW_REQUIRED' }),
        AiLeadScore.countDocuments({ ...im, status: 'OUTDATED' }),
        AiCompanyIntelligenceProfile.countDocuments({ ...im, status: 'OUTDATED' }),
        AiContactIntelligence.countDocuments({ ...im, locked: true }),
        AiContactIntelligence.countDocuments({ ...im, status: 'NO_PUBLIC_CONTACT' }),
        ExtractedLead.countDocuments({ ...lm, duplicateStatus: 'possible_duplicate' }),
    ]);

    const missing = {
        website: { count: missingWebsite, of: eligible, pct: pct(missingWebsite, eligible) },
        email: { count: missingEmail, of: eligible, pct: pct(missingEmail, eligible) },
        phone: { count: missingPhone, of: eligible, pct: pct(missingPhone, eligible) },
        address: { count: missingAddress, of: eligible, pct: pct(missingAddress, eligible) },
        city: { count: missingCity, of: eligible, pct: pct(missingCity, eligible) },
        state: { count: missingState, of: eligible, pct: pct(missingState, eligible) },
        industry: { count: missingIndustry, of: eligible, pct: pct(missingIndustry, eligible) },
        customerType: { count: missingCustomerType, of: eligible, pct: pct(missingCustomerType, eligible) },
        decisionMakerContact: { count: noPublicContact, of: eligible, pct: pct(noPublicContact, eligible) },
    };

    return baseEnvelope(filters, {
        eligibleCompanies: eligible,
        missing,
        lowConfidenceClassification: lowConfClass,
        manualReviewClassification: manualReviewClass,
        outdatedScores,
        outdatedProfiles,
        lockedContacts,
        possibleDuplicates: possibleDup,
    }, {
        drillDownHints: drillHints('discovery', user),
    });
}

export async function getLeadScoringAnalytics(companyId, filters, user) {
    const settings = await getAnalyticsSettings(companyId);
    const topN = settings.topNLimit;
    const match = intelMatch(companyId, filters);
    const bands = settings.scoreBands || [];

    const [byPriority, byGrade, byStatus, byEngine, stats, overridden, aiAdjusted, fallback] = await Promise.all([
        groupBy(AiLeadScore, match, 'priority', topN),
        groupBy(AiLeadScore, match, 'grade', topN),
        groupBy(AiLeadScore, match, 'status', topN),
        groupBy(AiLeadScore, match, 'engineUsed', topN),
        AiLeadScore.aggregate([
            { $match: match },
            {
                $group: {
                    _id: null,
                    count: { $sum: 1 },
                    avg: { $avg: '$finalScore' },
                    min: { $min: '$finalScore' },
                    max: { $max: '$finalScore' },
                    scores: { $push: '$finalScore' },
                },
            },
        ]),
        AiLeadScore.countDocuments({ ...match, manuallyApproved: true }),
        AiLeadScore.countDocuments({ ...match, aiAdjustment: { $ne: null } }),
        AiLeadScore.countDocuments({ ...match, fallbackUsed: true }),
    ]);

    const scoreDist = [];
    for (const b of bands) {
        const count = await AiLeadScore.countDocuments({
            ...match,
            finalScore: { $gte: b.min, $lte: b.max },
        });
        scoreDist.push({ id: b.id, label: b.label, min: b.min, max: b.max, count });
    }

    const row = stats[0] || { count: 0, avg: 0, min: 0, max: 0, scores: [] };
    const sorted = (row.scores || []).slice().sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length === 0 ? 0
        : sorted.length % 2 ? sorted[mid]
            : Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 100) / 100;

    const highPriority = await AiLeadScore.countDocuments({ ...match, priority: { $in: HIGH_PRIORITY } });
    const byIndustry = await groupBy(AiLeadScore, match, 'inputSnapshots.primaryIndustry', topN).catch(() => []);

    return baseEnvelope(filters, {
        total: row.count,
        averageScore: Math.round((row.avg || 0) * 100) / 100,
        medianScore: median,
        minScore: row.min || 0,
        maxScore: row.max || 0,
        highPriority,
        manuallyOverridden: overridden,
        aiAdjustmentUsed: aiAdjusted,
        ruleFallback: fallback,
        scoreDistribution: scoreDist,
        byPriority,
        byGrade,
        byStatus,
        byEngine,
    }, {
        dimensions: { byPriority, byGrade, byIndustry },
        drillDownHints: drillHints('lead_intelligence', user),
        kpiDefinitions: { highPriorityLeads: KPI_DEFINITIONS.highPriorityLeads },
    });
}

export async function getIndustryAnalytics(companyId, filters, user) {
    const settings = await getAnalyticsSettings(companyId);
    const topN = settings.topNLimit;
    const match = intelMatch(companyId, filters);

    const [byPrimary, byParent, bySub, byCustomerType, byStatus, total] = await Promise.all([
        groupBy(AiIndustryClassification, match, 'primaryIndustry', topN),
        groupBy(AiIndustryClassification, match, 'parentIndustry', topN),
        groupBy(AiIndustryClassification, match, 'subIndustry', topN),
        groupBy(AiIndustryClassification, match, 'customerType', topN),
        groupBy(AiIndustryClassification, match, 'status', topN),
        AiIndustryClassification.countDocuments(match),
    ]);

    const relevantByIndustry = await AiLeadRelevance.aggregate([
        { $match: { ...intelMatch(companyId, filters), status: { $in: RELEVANT_STATUSES } } },
        { $group: { _id: '$primaryIndustry', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: topN },
        { $project: { _id: 0, key: { $ifNull: ['$_id', '(blank)'] }, count: 1 } },
    ]);

    return baseEnvelope(filters, {
        total,
        byPrimaryIndustry: byPrimary,
        byParentIndustry: byParent,
        bySubIndustry: bySub,
        byCustomerType,
        byStatus,
        relevantByIndustry,
    }, {
        dimensions: { byPrimary, byCustomerType },
        drillDownHints: drillHints('lead_intelligence', user),
    });
}

export async function getProductAnalytics(companyId, filters, user) {
    const settings = await getAnalyticsSettings(companyId);
    const topN = settings.topNLimit;
    const match = intelMatch(companyId, filters);
    if (filters.product) {
        match['primaryRecommendation.productName'] = filters.product;
    }

    const [total, byStatus, byEngine, primaryProducts, crossSell, upsell, bundles, avgOpp] = await Promise.all([
        AiProductRecommendation.countDocuments(match),
        groupBy(AiProductRecommendation, match, 'status', topN),
        groupBy(AiProductRecommendation, match, 'engineUsed', topN),
        AiProductRecommendation.aggregate([
            { $match: match },
            { $group: { _id: '$primaryRecommendation.productName', count: { $sum: 1 }, avgScore: { $avg: '$opportunityScore' } } },
            { $sort: { count: -1 } },
            { $limit: topN },
            { $project: { _id: 0, product: { $ifNull: ['$_id', '(blank)'] }, count: 1, avgScore: { $round: ['$avgScore', 2] } } },
        ]),
        AiProductRecommendation.countDocuments({ ...match, 'crossSellOpportunities.0': { $exists: true } }),
        AiProductRecommendation.countDocuments({ ...match, 'upsellOpportunities.0': { $exists: true } }),
        AiProductRecommendation.countDocuments({ ...match, 'bundleRecommendations.0': { $exists: true } }),
        avgField(AiProductRecommendation, match, 'opportunityScore'),
    ]);

    return baseEnvelope(filters, {
        total,
        averageOpportunityScore: avgOpp.avg,
        byStatus,
        byEngine,
        topProducts: primaryProducts,
        crossSellCount: crossSell,
        upsellCount: upsell,
        bundleCount: bundles,
        note: 'No revenue or deal-value forecasts are computed',
    }, {
        dimensions: { topProducts: primaryProducts, byStatus },
        drillDownHints: drillHints('product', user),
    });
}

export async function getContactAnalytics(companyId, filters, user) {
    const settings = await getAnalyticsSettings(companyId);
    const topN = settings.topNLimit;
    const match = intelMatch(companyId, filters);

    const [
        total, byStatus, withAny, withNamed, withDm, genericOnly, locked, missing,
        byRole, byDept, bySeniority,
    ] = await Promise.all([
        AiContactIntelligence.countDocuments(match),
        groupBy(AiContactIntelligence, match, 'status', topN),
        AiContactIntelligence.countDocuments({
            ...match,
            status: { $in: ['CONTACT_FOUND', 'GENERIC_CONTACT_ONLY', 'MULTIPLE_CONTACTS'] },
        }),
        AiContactIntelligence.countDocuments({
            ...match,
            $or: [
                { 'primaryContact.isNamedEmail': true },
                { 'primaryContact.contactName': { $nin: [null, ''] } },
            ],
        }),
        AiContactIntelligence.countDocuments({
            ...match,
            $or: [
                { 'primaryContact.isDecisionMakerCandidate': true },
                { decisionMakerScore: { $gte: 50 } },
            ],
        }),
        AiContactIntelligence.countDocuments({ ...match, status: 'GENERIC_CONTACT_ONLY' }),
        AiContactIntelligence.countDocuments({ ...match, locked: true }),
        AiContactIntelligence.countDocuments({ ...match, status: 'NO_PUBLIC_CONTACT' }),
        AiContactIntelligence.aggregate([
            { $match: match },
            { $unwind: { path: '$contacts', preserveNullAndEmptyArrays: false } },
            { $group: { _id: '$contacts.contactRoleCategory', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: topN },
            { $project: { _id: 0, key: { $ifNull: ['$_id', 'Unknown'] }, count: 1 } },
        ]),
        AiContactIntelligence.aggregate([
            { $match: match },
            { $unwind: { path: '$contacts', preserveNullAndEmptyArrays: false } },
            { $group: { _id: '$contacts.department', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: topN },
            { $project: { _id: 0, key: { $ifNull: ['$_id', 'Unknown'] }, count: 1 } },
        ]),
        AiContactIntelligence.aggregate([
            { $match: match },
            { $unwind: { path: '$contacts', preserveNullAndEmptyArrays: false } },
            { $group: { _id: '$contacts.seniority', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: topN },
            { $project: { _id: 0, key: { $ifNull: ['$_id', 'Unknown'] }, count: 1 } },
        ]),
    ]);

    return baseEnvelope(filters, {
        total,
        companiesWithAnyContact: withAny,
        companiesWithNamedContact: withNamed,
        companiesWithDecisionMaker: withDm,
        genericEmailOnly: genericOnly,
        lockedContacts: locked,
        missingContacts: missing,
        byStatus,
        roleDistribution: byRole,
        departmentDistribution: byDept,
        seniorityDistribution: bySeniority,
        privacyNote: 'No private/hidden contact values are returned',
    }, {
        dimensions: { byStatus, roleDistribution: byRole },
        drillDownHints: drillHints('contact', user),
    });
}

export async function getCompanyIntelligenceAnalytics(companyId, filters, user) {
    const settings = await getAnalyticsSettings(companyId);
    const topN = settings.topNLimit;
    const match = intelMatch(companyId, filters);

    const [total, byStatus, byEngine, approved, lowConf, review, locked, outdated, avgConf, byIndustry] = await Promise.all([
        AiCompanyIntelligenceProfile.countDocuments(match),
        groupBy(AiCompanyIntelligenceProfile, match, 'status', topN),
        groupBy(AiCompanyIntelligenceProfile, match, 'engineUsed', topN),
        AiCompanyIntelligenceProfile.countDocuments({ ...match, status: 'APPROVED' }),
        AiCompanyIntelligenceProfile.countDocuments({ ...match, status: 'LOW_CONFIDENCE' }),
        AiCompanyIntelligenceProfile.countDocuments({ ...match, status: 'MANUAL_REVIEW_REQUIRED' }),
        AiCompanyIntelligenceProfile.countDocuments({ ...match, $or: [{ status: 'LOCKED' }, { locked: true }] }),
        AiCompanyIntelligenceProfile.countDocuments({ ...match, status: 'OUTDATED' }),
        avgField(AiCompanyIntelligenceProfile, match, 'confidence'),
        groupBy(AiCompanyIntelligenceProfile, match, 'primaryIndustry', topN),
    ]);

    return baseEnvelope(filters, {
        total,
        approved,
        lowConfidence: lowConf,
        manualReview: review,
        locked,
        outdated,
        averageConfidence: avgConf.avg,
        byStatus,
        byEngine,
        byIndustry,
    }, {
        dimensions: { byStatus, byIndustry },
        drillDownHints: drillHints('lead_intelligence', user),
    });
}

export async function getMarketAnalytics(companyId, filters, user) {
    const settings = await getAnalyticsSettings(companyId);
    const topN = settings.topNLimit;
    const match = intelMatch(companyId, filters);

    const [
        similarTotal, highPotential, competitors, peers, customers, suppliers,
        approvedEnrich, rejected, byRel, byStatus, avgSim,
        marketTotal, byIntelType, byCoverage, whiteSpace, unknownSize,
    ] = await Promise.all([
        AiSimilarCompanyResult.countDocuments(match),
        AiSimilarCompanyResult.countDocuments({ ...match, status: 'HIGH_POTENTIAL' }),
        AiSimilarCompanyResult.countDocuments({ ...match, relationshipType: 'POSSIBLE_COMPETITOR' }),
        AiSimilarCompanyResult.countDocuments({ ...match, relationshipType: 'INDUSTRY_PEER' }),
        AiSimilarCompanyResult.countDocuments({ ...match, relationshipType: 'POSSIBLE_CUSTOMER' }),
        AiSimilarCompanyResult.countDocuments({
            ...match,
            relationshipType: { $in: ['POSSIBLE_SUPPLIER', 'POSSIBLE_DEALER', 'POSSIBLE_DISTRIBUTOR'] },
        }),
        AiSimilarCompanyResult.countDocuments({ ...match, status: 'APPROVED_FOR_ENRICHMENT' }),
        AiSimilarCompanyResult.countDocuments({ ...match, status: 'REJECTED' }),
        groupBy(AiSimilarCompanyResult, match, 'relationshipType', topN),
        groupBy(AiSimilarCompanyResult, match, 'status', topN),
        avgField(AiSimilarCompanyResult, match, 'similarityScore'),
        AiMarketIntelligence.countDocuments(match),
        groupBy(AiMarketIntelligence, match, 'intelType', topN),
        groupBy(AiMarketIntelligence, match, 'coverageStatus', topN),
        AiMarketIntelligence.countDocuments({ ...match, intelType: 'WHITE_SPACE' }),
        AiMarketIntelligence.countDocuments({ ...match, coverageStatus: 'UNKNOWN_MARKET_SIZE' }),
    ]);

    const discoveredUniverse = await ExtractedLead.countDocuments(leadMatch(companyId, filters));

    return baseEnvelope(filters, {
        similarCompanyCandidates: similarTotal,
        highPotential,
        possibleCompetitors: competitors,
        industryPeers: peers,
        possibleCustomers: customers,
        possibleSuppliersDealersDistributors: suppliers,
        approvedForEnrichment: approvedEnrich,
        rejected,
        averageSimilarityScore: avgSim.avg,
        byRelationshipType: byRel,
        byCandidateStatus: byStatus,
        marketIntelligenceRecords: marketTotal,
        byIntelType,
        byCoverageStatus: byCoverage,
        whiteSpaceOpportunities: whiteSpace,
        unknownMarketSizeCount: unknownSize,
        coverageAgainstKnownDiscoveredUniverse: {
            label: 'Coverage against known discovered universe',
            discoveredUniverse,
            note: 'This is NOT market share. Denominator is the known discovered universe only.',
            coverageRecords: byCoverage,
        },
    }, {
        dimensions: { byRel, byIntelType, byCoverage },
        drillDownHints: drillHints('market', user),
    });
}

export async function getCrmEnrichmentAnalytics(companyId, filters, user) {
    const settings = await getAnalyticsSettings(companyId);
    const topN = settings.topNLimit;
    const draftMatch = intelMatch(companyId, filters);
    const txM = txMatch(companyId, filters, 'appliedAt');

    const [
        draftsTotal, byDraftStatus, byMatchStatus, byActionType,
        leadsCreated, enriched, partial, failed, rolledBack,
        createDrafts, approvedDrafts, convertedDrafts,
    ] = await Promise.all([
        AiCrmEnrichmentDraft.countDocuments(draftMatch),
        groupBy(AiCrmEnrichmentDraft, draftMatch, 'status', topN),
        groupBy(AiCrmEnrichmentDraft, draftMatch, 'matchStatus', topN),
        groupBy(AiCrmEnrichmentDraft, draftMatch, 'draftActionType', topN),
        AiCrmEnrichmentTransaction.countDocuments({
            ...txM,
            actionType: CREATE_LEAD_ACTION,
            status: 'APPLIED',
        }),
        AiCrmEnrichmentTransaction.countDocuments({
            ...txM,
            actionType: { $ne: CREATE_LEAD_ACTION },
            status: { $in: APPLIED_TX },
        }),
        AiCrmEnrichmentTransaction.countDocuments({ ...txM, status: 'PARTIALLY_APPLIED' }),
        AiCrmEnrichmentTransaction.countDocuments({ ...txM, status: 'FAILED' }),
        AiCrmEnrichmentTransaction.countDocuments({ ...txM, status: { $in: ['ROLLED_BACK', 'ROLLBACK_CONFLICT', 'ROLLBACK_FAILED'] } }),
        AiCrmEnrichmentDraft.countDocuments({ ...draftMatch, draftActionType: CREATE_LEAD_ACTION }),
        AiCrmEnrichmentDraft.countDocuments({ ...draftMatch, status: 'APPROVED' }),
        AiCrmEnrichmentDraft.countDocuments({ ...draftMatch, status: 'CONVERTED_TO_LEAD' }),
    ]);

    return baseEnvelope(filters, {
        draftsTotal,
        createLeadDrafts: createDrafts,
        approvedDrafts,
        convertedDrafts,
        crmLeadsCreated: leadsCreated,
        crmRecordsEnriched: enriched,
        partiallyApplied: partial,
        failedApplications: failed,
        rollbacks: rolledBack,
        byDraftStatus,
        byMatchStatus,
        byActionType,
        important: 'Drafts are NOT counted as CRM leads created. Only APPLIED CREATE_LEAD_DRAFT transactions count.',
    }, {
        dimensions: { byDraftStatus, byMatchStatus },
        drillDownHints: drillHints('crm_conversion', user),
        kpiDefinitions: {
            crmLeadsCreated: KPI_DEFINITIONS.crmLeadsCreated,
            crmRecordsEnriched: KPI_DEFINITIONS.crmRecordsEnriched,
        },
    });
}

export async function getSalesWorkflowAnalytics(companyId, filters, user) {
    const settings = await getAnalyticsSettings(companyId);
    const topN = settings.topNLimit;
    const draftMatch = intelMatch(companyId, filters);
    const txM = txMatch(companyId, filters, 'appliedAt');

    const appliedMatch = { ...txM, status: { $in: APPLIED_TX } };

    const [
        draftsTotal, byDraftStatus,
        assignmentsApplied, followUpsScheduled, taskAgg,
        byAssignee, rollbacks, rejectedDrafts,
    ] = await Promise.all([
        AiSalesWorkflowDraft.countDocuments(draftMatch),
        groupBy(AiSalesWorkflowDraft, draftMatch, 'status', topN),
        AiSalesWorkflowTransaction.countDocuments({
            ...appliedMatch,
            'appliedValues.assignedTo': { $exists: true, $nin: [null, ''] },
        }),
        AiSalesWorkflowTransaction.countDocuments({
            ...appliedMatch,
            followUpApplied: { $exists: true, $ne: null },
        }),
        AiSalesWorkflowTransaction.aggregate([
            { $match: appliedMatch },
            { $project: { n: { $size: { $ifNull: ['$appliedTaskIds', []] } } } },
            { $group: { _id: null, tasks: { $sum: '$n' }, txs: { $sum: 1 } } },
        ]),
        AiSalesWorkflowTransaction.aggregate([
            { $match: { ...appliedMatch, 'appliedValues.assignedTo': { $exists: true, $nin: [null, ''] } } },
            { $group: { _id: '$appliedValues.assignedTo', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: topN },
            { $project: { _id: 0, assignedTo: '$_id', count: 1 } },
        ]),
        AiSalesWorkflowTransaction.countDocuments({
            ...txM,
            status: { $in: ['ROLLED_BACK', 'ROLLBACK_CONFLICT', 'ROLLBACK_FAILED'] },
        }),
        AiSalesWorkflowDraft.countDocuments({ ...draftMatch, status: 'REJECTED' }),
    ]);

    const tasksCreated = taskAgg[0]?.tasks || 0;

    return baseEnvelope(filters, {
        draftsTotal,
        assignmentsApplied,
        tasksCreated,
        followUpsScheduled,
        rejectedDrafts,
        rollbacks,
        byDraftStatus,
        assignmentsBySalesperson: byAssignee,
        note: 'Counts use Phase 14 APPLIED/PARTIALLY_APPLIED transactions only. Activity metrics are not performance outcomes.',
    }, {
        dimensions: { byDraftStatus, assignmentsBySalesperson: byAssignee },
        drillDownHints: drillHints('sales_workflow', user),
        kpiDefinitions: {
            assignmentsApplied: KPI_DEFINITIONS.assignmentsApplied,
            tasksCreated: KPI_DEFINITIONS.tasksCreated,
            followUpsScheduled: KPI_DEFINITIONS.followUpsScheduled,
        },
    });
}

const BATCH_SOURCES = [
    { phase: 'classification', module: 'industry', Model: AiClassificationBatchJob },
    { phase: 'product', module: 'product', Model: AiProductRecommendationBatchJob },
    { phase: 'contact', module: 'contact', Model: AiContactIntelligenceBatchJob },
    { phase: 'company_intelligence', module: 'company_intelligence', Model: AiCompanyIntelligenceBatchJob },
    { phase: 'lead_scoring', module: 'lead_scoring', Model: AiLeadScoreBatchJob },
    { phase: 'similar_company', module: 'market', Model: AiSimilarCompanyBatchJob },
    { phase: 'crm_enrichment', module: 'crm_enrichment', Model: AiCrmEnrichmentBatchJob },
    { phase: 'sales_workflow', module: 'sales_workflow', Model: AiSalesWorkflowBatchJob },
];

function computeDisplayStatus(job, staleBatchMinutes) {
    const raw = String(job.status || '');
    if (raw === 'COMPLETED' || raw === 'COMPLETED_WITH_ERRORS' || raw === 'FAILED' || raw === 'STOPPED' || raw === 'PAUSED' || raw === 'QUEUED') {
        return raw === 'COMPLETED' ? 'COMPLETED' : raw;
    }
    if (raw === 'RUNNING') {
        const hb = job.lastHeartbeat || job.updatedAt || job.startedAt || job.createdAt;
        if (hb) {
            const ageMin = (Date.now() - new Date(hb).getTime()) / 60000;
            if (ageMin > staleBatchMinutes) return 'STALE';
        }
        return 'RUNNING';
    }
    return raw || 'QUEUED';
}

export async function getBatchMonitor(companyId, filters, user) {
    const settings = await getAnalyticsSettings(companyId);
    const staleMins = settings.staleBatchMinutes;
    const topN = settings.topNLimit;
    const cid = oid(companyId);

    const lists = await Promise.all(BATCH_SOURCES.map(async (src) => {
        const match = { companyId: cid, isDeleted: { $ne: true } };
        if (filters.financialYear) match.financialYear = filters.financialYear;
        if (filters.dateFrom || filters.dateTo) {
            match.createdAt = {};
            if (filters.dateFrom) match.createdAt.$gte = new Date(filters.dateFrom);
            if (filters.dateTo) match.createdAt.$lte = new Date(filters.dateTo);
        }
        if (filters.batchStatus && filters.batchStatus !== 'STALE') match.status = filters.batchStatus;
        const rows = await src.Model.find(match).sort({ createdAt: -1 }).limit(topN).lean();
        return rows.map((j) => {
            const displayStatus = computeDisplayStatus(j, staleMins);
            return {
                id: String(j._id),
                phase: src.phase,
                module: src.module,
                batchType: j.jobType || j.mode || src.phase,
                status: j.status,
                displayStatus,
                total: j.total || 0,
                processed: j.processedCount || 0,
                succeeded: j.successCount || 0,
                failed: j.failedCount || 0,
                skipped: j.skippedCount || 0,
                lockedSkipped: j.lockedSkippedCount || 0,
                cursor: j.cursor || 0,
                startedAt: j.startedAt || null,
                completedAt: j.completedAt || null,
                lastHeartbeat: j.lastHeartbeat || j.updatedAt || null,
                createdBy: j.createdBy || null,
                errorSummary: j.lastError || (Array.isArray(j.errors) && j.errors[0]?.message) || '',
                idempotencyKey: j.idempotencyKey || '',
            };
        });
    }));

    let jobs = lists.flat();

    // Discovery jobs as monitor rows
    const dMatch = { companyId: cid, isDeleted: { $ne: true } };
    if (filters.financialYear) dMatch.financialYear = filters.financialYear;
    if (filters.dateFrom || filters.dateTo) {
        dMatch.createdAt = {};
        if (filters.dateFrom) dMatch.createdAt.$gte = new Date(filters.dateFrom);
        if (filters.dateTo) dMatch.createdAt.$lte = new Date(filters.dateTo);
    }
    const discoveryJobs = await DiscoveryJob.find(dMatch).sort({ createdAt: -1 }).limit(topN).lean();
    jobs = jobs.concat(discoveryJobs.map((j) => {
        const displayStatus = computeDisplayStatus({
            status: j.status === 'COMPLETED_WITH_WARNINGS' ? 'COMPLETED' : j.status,
            updatedAt: j.lastProcessedAt || j.updatedAt,
            startedAt: j.startedAt,
            createdAt: j.createdAt,
            lastHeartbeat: j.lastProcessedAt,
        }, staleMins);
        return {
            id: String(j._id),
            phase: 'discovery',
            module: 'discovery',
            batchType: 'discovery_job',
            status: j.status,
            displayStatus: j.status === 'COMPLETED' || j.status === 'COMPLETED_WITH_WARNINGS' ? 'COMPLETED' : displayStatus,
            total: j.targetCompanies || 0,
            processed: j.totalRawResults || 0,
            succeeded: j.totalUniqueResults || 0,
            failed: j.totalRejected || 0,
            skipped: j.totalDuplicates || 0,
            lockedSkipped: 0,
            cursor: 0,
            startedAt: j.startedAt,
            completedAt: j.completedAt,
            lastHeartbeat: j.lastProcessedAt || j.updatedAt,
            createdBy: j.createdBy,
            errorSummary: Array.isArray(j.errorSummary) ? j.errorSummary.slice(0, 3).join('; ') : '',
            idempotencyKey: '',
        };
    }));

    if (filters.batchStatus === 'STALE') {
        jobs = jobs.filter((j) => j.displayStatus === 'STALE');
    } else if (filters.batchStatus) {
        jobs = jobs.filter((j) => j.status === filters.batchStatus || j.displayStatus === filters.batchStatus);
    }

    jobs.sort((a, b) => new Date(b.startedAt || 0) - new Date(a.startedAt || 0));
    jobs = jobs.slice(0, topN);

    const summary = {
        total: jobs.length,
        running: jobs.filter((j) => j.displayStatus === 'RUNNING').length,
        stale: jobs.filter((j) => j.displayStatus === 'STALE').length,
        completed: jobs.filter((j) => j.displayStatus === 'COMPLETED').length,
        failed: jobs.filter((j) => j.displayStatus === 'FAILED' || j.status === 'FAILED').length,
        paused: jobs.filter((j) => j.displayStatus === 'PAUSED' || j.status === 'PAUSED').length,
        staleRule: `STALE only when status=RUNNING and lastHeartbeat/updatedAt older than ${staleMins} minutes; COMPLETED never marked stale`,
    };

    return baseEnvelope(filters, { summary, jobs }, {
        dimensions: { summary },
        drillDownHints: drillHints('batch_monitor', user),
    });
}

export async function getUserActivity(companyId, filters, user) {
    const settings = await getAnalyticsSettings(companyId);
    const topN = settings.topNLimit;
    const cid = oid(companyId);
    const dateMatch = {};
    if (filters.dateFrom || filters.dateTo) {
        dateMatch.createdAt = {};
        if (filters.dateFrom) dateMatch.createdAt.$gte = new Date(filters.dateFrom);
        if (filters.dateTo) dateMatch.createdAt.$lte = new Date(filters.dateTo);
    }

    const base = { companyId: cid, isDeleted: { $ne: true }, ...dateMatch };

    const [
        crmCreates, crmApplies, swAssigns, swTasks, reviewsApproved, reviewsRejected, batchesStarted,
    ] = await Promise.all([
        AiCrmEnrichmentTransaction.aggregate([
            { $match: { companyId: cid, actionType: CREATE_LEAD_ACTION, status: 'APPLIED', ...(dateMatch.createdAt ? { appliedAt: dateMatch.createdAt } : {}) } },
            { $group: { _id: '$appliedBy', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: topN },
        ]),
        AiCrmEnrichmentTransaction.aggregate([
            { $match: { companyId: cid, actionType: { $ne: CREATE_LEAD_ACTION }, status: { $in: APPLIED_TX }, ...(dateMatch.createdAt ? { appliedAt: dateMatch.createdAt } : {}) } },
            { $group: { _id: '$appliedBy', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: topN },
        ]),
        AiSalesWorkflowTransaction.aggregate([
            { $match: { companyId: cid, status: { $in: APPLIED_TX }, 'appliedValues.assignedTo': { $exists: true, $nin: [null, ''] }, ...(dateMatch.createdAt ? { appliedAt: dateMatch.createdAt } : {}) } },
            { $group: { _id: '$appliedBy', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: topN },
        ]),
        AiSalesWorkflowTransaction.aggregate([
            { $match: { companyId: cid, status: { $in: APPLIED_TX }, ...(dateMatch.createdAt ? { appliedAt: dateMatch.createdAt } : {}) } },
            { $project: { appliedBy: 1, n: { $size: { $ifNull: ['$appliedTaskIds', []] } } } },
            { $group: { _id: '$appliedBy', count: { $sum: '$n' } } },
            { $sort: { count: -1 } },
            { $limit: topN },
        ]),
        AiCrmEnrichmentDraft.aggregate([
            { $match: { ...base, status: { $in: ['APPROVED', 'CONVERTED_TO_LEAD', 'ENRICHED_EXISTING_RECORD'] } } },
            { $group: { _id: '$updatedBy', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: topN },
        ]),
        AiCrmEnrichmentDraft.aggregate([
            { $match: { ...base, status: 'REJECTED' } },
            { $group: { _id: '$updatedBy', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: topN },
        ]),
        AiSalesWorkflowBatchJob.aggregate([
            { $match: { companyId: cid, isDeleted: { $ne: true }, ...(dateMatch.createdAt ? { createdAt: dateMatch.createdAt } : {}) } },
            { $group: { _id: '$createdBy', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: topN },
        ]),
    ]);

    const mapRows = (rows) => rows.map((r) => ({ userId: r._id ? String(r._id) : null, count: r.count }));

    return baseEnvelope(filters, {
        crmLeadsCreatedByUser: mapRows(crmCreates),
        enrichmentsAppliedByUser: mapRows(crmApplies),
        assignmentsAppliedByUser: mapRows(swAssigns),
        tasksCreatedByUser: mapRows(swTasks),
        approvalsByUser: mapRows(reviewsApproved),
        rejectionsByUser: mapRows(reviewsRejected),
        batchesStartedByUser: mapRows(batchesStarted),
        privacyNote: 'Only user ids are returned; no auth secrets',
    }, {
        dimensions: {},
        drillDownHints: drillHints('user_activity', user),
    });
}