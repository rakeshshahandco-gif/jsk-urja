import mongoose from 'mongoose';
import { ExtractedLead } from '../../../models/extractedLead.model.js';
import { AiLeadScore } from '../../../models/aiLeadScore.model.js';
import { AiProductRecommendation } from '../../../models/aiProductRecommendation.model.js';
import { AiContactIntelligence } from '../../../models/aiContactIntelligence.model.js';
import { AiCompanyIntelligenceProfile } from '../../../models/aiCompanyIntelligenceProfile.model.js';
import { AiSimilarCompanyResult } from '../../../models/aiSimilarCompanyResult.model.js';
import { AiMarketIntelligence } from '../../../models/aiMarketIntelligence.model.js';
import { AiCrmEnrichmentDraft } from '../../../models/aiCrmEnrichmentDraft.model.js';
import { AiSalesWorkflowDraft } from '../../../models/aiSalesWorkflowDraft.model.js';
import { AiSalesWorkflowBatchJob } from '../../../models/aiSalesWorkflowBatchJob.model.js';
import { AiMarketingCampaignDraft } from '../../../models/aiMarketingCampaignDraft.model.js';
import { AiMarketingCampaignBatchJob } from '../../../models/aiMarketingCampaignBatchJob.model.js';
import { AiLeadScoreBatchJob } from '../../../models/aiLeadScoreBatchJob.model.js';
import { AiIndustryClassification } from '../../../models/aiIndustryClassification.model.js';
import { AiLeadRelevance } from '../../../models/aiLeadRelevance.model.js';
import { Lead } from '../../../models/lead.model.js';
import { Task } from '../../../models/task.model.js';
import { getExecutiveSummary } from '../analytics/aggregate.service.js';
import { READ_ONLY_TOOLS, WRITE_TOOL_NAMES } from './constants.js';
import { evidenceItem, stripInjectedInstructions, clampLimit } from './normalize.util.js';
import {
    canSeeContactDetails, canSeeCrmDetails, canSeeSalesWorkflow, canSeeMarketing,
    canSeeAnalytics, canSeeLeadScores, canSeeProducts, canSeeSimilar, canSeeMarket,
    canSeeCompanyResearch, isAggregateOnly, hasAssistant,
} from './permissions.util.js';
import { PERMS } from './constants.js';
import { ApiError } from '../../../utils/ApiError.js';
import { detectPromptInjectionInSource } from './safety.service.js';

function oid(id) {
    if (!id) return null;
    if (!mongoose.Types.ObjectId.isValid(String(id))) return null;
    return new mongoose.Types.ObjectId(String(id));
}

function notDeleted(extra = {}) {
    return { isDeleted: { $ne: true }, ...extra };
}

function redactCompanyName(name, aggregateOnly) {
    if (aggregateOnly) return '[restricted]';
    return name || '';
}

function leadBaseQuery(companyId, filters = {}) {
    const q = { companyId, status: { $nin: ['rejected'] } };
    if (filters.state) q.stateProvince = new RegExp(`^${String(filters.state).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
    if (filters.city) q.city = new RegExp(String(filters.city), 'i');
    if (filters.industry) q.industry = new RegExp(String(filters.industry), 'i');
    if (filters.companyName) q.companyName = new RegExp(String(filters.companyName).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    if (filters.noEmail) q.$or = [{ email: '' }, { email: null }, { email: { $exists: false } }];
    if (filters.financialYear) q.financialYear = filters.financialYear;
    return q;
}

async function resolveLeadRef(companyId, entities = {}, filters = {}) {
    if (entities.extractedLeadId) {
        const id = oid(entities.extractedLeadId);
        if (!id) throw new ApiError(400, 'Invalid extractedLeadId');
        const lead = await ExtractedLead.findOne({ _id: id, companyId }).lean();
        if (!lead) throw new ApiError(404, 'Record not found');
        if (String(lead.companyId) !== String(companyId)) throw new ApiError(404, 'Record not found');
        return lead;
    }
    if (entities.companyName || filters.companyName) {
        const name = entities.companyName || filters.companyName;
        return ExtractedLead.findOne({
            companyId,
            companyName: new RegExp(String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'),
            status: { $nin: ['rejected'] },
        }).sort({ updatedAt: -1 }).lean();
    }
    return null;
}

function toolResult(ok, data, evidence = [], limitations = [], meta = {}) {
    return {
        ok,
        data,
        evidence,
        limitations,
        meta: {
            readOnly: true,
            mutated: false,
            ...meta,
        },
    };
}

export async function searchCompanies(ctx) {
    const { companyId, user, filters, settings } = ctx;
    const aggregateOnly = isAggregateOnly(user);
    const limit = clampLimit(ctx.limit, settings.defaultResultLimit, settings.maximumResultLimit);
    const q = leadBaseQuery(companyId, filters);
    const rows = await ExtractedLead.find(q).sort({ leadScore: -1, updatedAt: -1 }).limit(limit).lean();
    const items = rows.map((r) => ({
        id: String(r._id),
        companyName: redactCompanyName(r.companyName, aggregateOnly),
        city: aggregateOnly ? null : r.city,
        state: aggregateOnly ? null : r.stateProvince,
        industry: aggregateOnly ? null : r.industry,
        status: r.status,
        leadScore: r.leadScore,
        freshness: 'CURRENT',
    }));
    return toolResult(true, { items, total: items.length, aggregateOnly }, [
        evidenceItem({ sourceModule: 'extracted_leads', sourceType: 'query', label: 'ExtractedLead search' }),
    ], aggregateOnly ? ['Aggregate-only: company names/locations restricted'] : []);
}

export async function searchLeadScores(ctx) {
    const { companyId, user, filters, settings } = ctx;
    if (!canSeeLeadScores(user)) {
        return toolResult(false, null, [], ['Missing lead scoring permission']);
    }
    const aggregateOnly = isAggregateOnly(user);
    const limit = clampLimit(ctx.limit, settings.defaultResultLimit, settings.maximumResultLimit);
    const q = { companyId, ...notDeleted() };
    if (filters.priority) {
        q.priority = filters.priority === 'HIGH' ? { $in: ['HIGH', 'CRITICAL'] } : filters.priority;
    }
    if (filters.minScore != null) q.finalScore = { $gte: Number(filters.minScore) };
    if (filters.outdated) q.status = 'OUTDATED';
    if (filters.manualReview) q.status = 'MANUAL_REVIEW_REQUIRED';
    if (filters.state || filters.city || filters.industry) {
        const leads = await ExtractedLead.find(leadBaseQuery(companyId, filters)).select('_id').limit(500).lean();
        q.extractedLeadId = { $in: leads.map((l) => l._id) };
    }
    const rows = await AiLeadScore.find(q).sort({ finalScore: -1 }).limit(limit).lean();
    const items = rows.map((r) => ({
        id: String(r._id),
        extractedLeadId: r.extractedLeadId ? String(r.extractedLeadId) : null,
        companyName: redactCompanyName(r.companyName, aggregateOnly),
        finalScore: r.finalScore,
        priority: r.priority,
        grade: r.grade,
        status: r.status,
        locked: !!r.locked,
        outdated: r.status === 'OUTDATED',
    }));
    return toolResult(true, { items, total: items.length, aggregateOnly }, [
        evidenceItem({ sourceModule: 'lead_scoring', sourceType: 'query', label: 'AiLeadScore search' }),
    ]);
}

export async function getLeadScoreExplanation(ctx) {
    const { companyId, user, entities, filters } = ctx;
    if (!canSeeLeadScores(user)) return toolResult(false, null, [], ['Missing lead scoring permission']);
    let score = null;
    if (entities.leadScoreId) {
        const id = oid(entities.leadScoreId);
        score = id ? await AiLeadScore.findOne({ _id: id, companyId, ...notDeleted() }).lean() : null;
    } else {
        const lead = await resolveLeadRef(companyId, entities, filters);
        if (lead) {
            score = await AiLeadScore.findOne({ companyId, extractedLeadId: lead._id, ...notDeleted() })
                .sort({ updatedAt: -1 }).lean();
        }
    }
    if (!score) {
        return toolResult(true, null, [], ['Data not available: no stored Phase 11 Lead Score found']);
    }
    if (String(score.companyId) !== String(companyId)) throw new ApiError(404, 'Record not found');
    const data = {
        id: String(score._id),
        companyName: isAggregateOnly(user) ? '[restricted]' : score.companyName,
        totalScore: score.finalScore,
        rawScore: score.rawScore,
        weightedScore: score.weightedScore,
        priority: score.priority,
        grade: score.grade,
        positiveDimensions: score.positiveSignals || [],
        negativeDimensions: score.negativeSignals || [],
        penalties: score.penalties || [],
        boosts: score.boosts || [],
        dimensionScores: score.dimensionScores || [],
        aiAdjustment: score.aiAdjustment || null,
        manualOverride: score.manualOverride || null,
        lockStatus: score.locked ? 'LOCKED' : 'UNLOCKED',
        outdatedStatus: score.status === 'OUTDATED' ? 'OUTDATED' : 'CURRENT',
        status: score.status,
        version: score.modelVersion || score.settingsVersion || '',
        recommendation: score.recommendation || '',
        note: 'Read from stored Phase 11 result only — score was not recomputed.',
    };
    return toolResult(true, data, [
        evidenceItem({
            sourceModule: 'lead_scoring',
            sourceRecordId: score._id,
            approvalStatus: score.status,
            confidence: score.confidence,
            freshness: score.status === 'OUTDATED' ? 'OUTDATED' : 'CURRENT',
            label: 'AiLeadScore',
        }),
    ], score.status === 'OUTDATED' ? ['Source Lead Score is outdated'] : []);
}

export async function getProductRecommendations(ctx) {
    const { companyId, user, entities, filters, settings } = ctx;
    if (!canSeeProducts(user)) return toolResult(false, null, [], ['Missing product recommendation permission']);
    const lead = await resolveLeadRef(companyId, entities, filters);
    const q = { companyId, ...notDeleted() };
    if (lead) q.extractedLeadId = lead._id;
    else if (filters.product) q.$or = [
        { 'products.productName': new RegExp(filters.product, 'i') },
        { recommendedProducts: new RegExp(filters.product, 'i') },
    ];
    const row = await AiProductRecommendation.findOne(q).sort({ updatedAt: -1 }).lean();
    if (!row) return toolResult(true, null, [], ['Data not available: no stored Phase 8 recommendations']);
    const products = [
        row.primaryRecommendation,
        ...(row.secondaryRecommendations || []),
        ...(row.alternativeProducts || []),
        ...(row.crossSellOpportunities || []),
        ...(row.upsellOpportunities || []),
        ...(row.bundleRecommendations || []),
        ...(row.products || []),
    ].filter(Boolean).slice(0, settings.maximumEvidenceItems || 30);
    const sanitizedProducts = products.map((p) => {
        const evidence = (p.evidence || []).map((e) => {
            const s = stripInjectedInstructions(e);
            return detectPromptInjectionInSource(String(e))
                ? '[untrusted source text — instructions ignored]'
                : s;
        });
        return {
            product: p.productName || p.name || '',
            fitScore: p.opportunityScore ?? p.fitScore ?? null,
            confidence: p.confidence,
            role: p.role || '',
            reason: stripInjectedInstructions(p.reason || ''),
            evidence,
            industryMatch: p.matchingKeywords || [],
            approvalStatus: row.status,
            productActiveStatus: 'UNKNOWN_STORED',
            brochureUrl: p.brochureUrl || null,
        };
    });
    return toolResult(true, {
        id: String(row._id),
        companyName: isAggregateOnly(user) ? '[restricted]' : row.companyName,
        status: row.status,
        products: sanitizedProducts,
        note: 'Read from stored Phase 8 recommendations — no new commercial terms generated.',
    }, [
        evidenceItem({
            sourceModule: 'product_recommendation',
            sourceRecordId: row._id,
            approvalStatus: row.status,
            freshness: 'CURRENT',
            label: 'AiProductRecommendation',
        }),
    ]);
}

export async function getContactAvailability(ctx) {
    const { companyId, user, entities, filters } = ctx;
    const lead = await resolveLeadRef(companyId, entities, filters);
    const q = { companyId, ...notDeleted() };
    if (lead) q.extractedLeadId = lead._id;
    const row = await AiContactIntelligence.findOne(q).sort({ updatedAt: -1 }).lean();
    if (!row) {
        return toolResult(true, {
            contactAvailable: false,
            decisionMakerAvailable: false,
            verifiedEmailCount: 0,
            verifiedPhoneCount: 0,
            roleDistribution: {},
        }, [], ['Data not available: no Contact Intelligence record']);
    }
    const contacts = row.contacts || [];
    const verifiedEmailCount = contacts.filter((c) => c.email && /VERIFIED|APPROVED/i.test(c.verificationStatus || '')).length
        || contacts.filter((c) => !!c.email).length;
    const verifiedPhoneCount = contacts.filter((c) => !!c.phone).length;
    const decisionMakerAvailable = contacts.some((c) => c.isDecisionMakerCandidate || (c.decisionMakerScore || 0) >= 60)
        || (row.decisionMakerScore || 0) >= 60;
    const roleDistribution = {};
    for (const c of contacts) {
        const role = c.contactRoleCategory || 'Unknown';
        roleDistribution[role] = (roleDistribution[role] || 0) + 1;
    }
    return toolResult(true, {
        contactAvailable: contacts.length > 0,
        decisionMakerAvailable,
        verifiedEmailCount,
        verifiedPhoneCount,
        roleDistribution,
        companyName: isAggregateOnly(user) ? '[restricted]' : row.companyName,
    }, [
        evidenceItem({ sourceModule: 'contact_intelligence', sourceRecordId: row._id, label: 'Contact availability' }),
    ]);
}

export async function getApprovedContactDetails(ctx) {
    const { companyId, user, entities, filters, settings } = ctx;
    if (!canSeeContactDetails(user) || isAggregateOnly(user)) {
        const avail = await getContactAvailability(ctx);
        return toolResult(true, {
            restricted: true,
            availability: avail.data,
        }, avail.evidence, ['Permission restricts contact detail — availability only']);
    }
    const lead = await resolveLeadRef(companyId, entities, filters);
    const q = { companyId, ...notDeleted() };
    if (lead) q.extractedLeadId = lead._id;
    const row = await AiContactIntelligence.findOne(q).sort({ updatedAt: -1 }).lean();
    if (!row) return toolResult(true, null, [], ['Data not available']);
    const contacts = (row.contacts || [])
        .filter((c) => c.isManuallyApproved || c.isPrimaryContact || c.verificationStatus)
        .slice(0, settings.maximumContactRows || 25)
        .map((c) => ({
            contactName: c.contactName,
            role: c.contactRoleCategory || c.designation,
            email: c.email || null,
            phone: c.phone || null,
            verificationStatus: c.verificationStatus,
            decisionMaker: !!c.isDecisionMakerCandidate,
            sourceUrl: null, // hide source URL by default in assistant
        }));
    return toolResult(true, { companyName: row.companyName, contacts }, [
        evidenceItem({ sourceModule: 'contact_intelligence', sourceRecordId: row._id, label: 'Approved contacts' }),
    ]);
}

export async function getCompanyProfile(ctx) {
    const { companyId, user, entities, filters } = ctx;
    if (!canSeeCompanyResearch(user)) return toolResult(false, null, [], ['Missing company research permission']);
    const lead = await resolveLeadRef(companyId, entities, filters);
    const q = { companyId, ...notDeleted() };
    if (lead) q.extractedLeadId = lead._id;
    else if (entities.companyName) q.companyName = new RegExp(entities.companyName, 'i');
    const row = await AiCompanyIntelligenceProfile.findOne(q).sort({ updatedAt: -1 }).lean();
    if (!row) return toolResult(true, null, [], ['Data not available: no company intelligence profile']);
    return toolResult(true, {
        id: String(row._id),
        companyName: isAggregateOnly(user) ? '[restricted]' : row.companyName,
        customerType: row.customerType,
        status: row.status,
        industry: row.parentIndustry || row.industry || '',
        summary: stripInjectedInstructions(row.executiveSummary || row.summary || row.businessDescription || ''),
    }, [
        evidenceItem({ sourceModule: 'company_intelligence', sourceRecordId: row._id, label: 'Company profile' }),
    ]);
}

export async function getCompanySummary(ctx) {
    const profile = await getCompanyProfile(ctx);
    const score = await getLeadScoreExplanation(ctx);
    const products = await getProductRecommendations(ctx);
    const contacts = await getContactAvailability(ctx);
    const crm = await getCrmEnrichmentStatus(ctx);
    const sw = await getSalesWorkflowStatus(ctx);
    const limitations = [
        ...(profile.limitations || []),
        ...(score.limitations || []),
        ...(products.limitations || []),
        ...(contacts.limitations || []),
        'Advisory next action only — Assistant does not create Tasks or follow-ups.',
    ];
    const data = {
        identity: profile.data || null,
        leadScore: score.data ? {
            totalScore: score.data.totalScore,
            priority: score.data.priority,
            grade: score.data.grade,
            outdatedStatus: score.data.outdatedStatus,
        } : null,
        products: products.data?.products?.slice(0, 5) || [],
        contactAvailability: contacts.data,
        crmStatus: crm.data,
        salesWorkflowStatus: sw.data,
        advisoryNextAction: 'Review evidence and open the relevant controlled screen if action is required.',
    };
    return toolResult(true, data, [
        ...(profile.evidence || []),
        ...(score.evidence || []),
        ...(products.evidence || []),
        ...(contacts.evidence || []),
    ], limitations);
}

export async function getIndustryClassification(ctx) {
    const { companyId, entities, filters } = ctx;
    const lead = await resolveLeadRef(companyId, entities, filters);
    if (!lead) return toolResult(true, null, [], ['Data not available']);
    const row = await AiIndustryClassification.findOne({ companyId, extractedLeadId: lead._id, ...notDeleted() })
        .sort({ updatedAt: -1 }).lean();
    if (!row) return toolResult(true, null, [], ['Data not available']);
    return toolResult(true, {
        industry: row.parentIndustry || row.industry || '',
        subIndustry: row.subIndustry || '',
        customerType: row.customerType || '',
        status: row.status,
        confidence: row.confidence,
    }, [evidenceItem({ sourceModule: 'lead_intelligence', sourceRecordId: row._id, label: 'Industry classification' })]);
}

export async function getCustomerTypeClassification(ctx) {
    return getIndustryClassification(ctx);
}

export async function getLeadRelevanceExplanation(ctx) {
    const { companyId, entities, filters } = ctx;
    const lead = await resolveLeadRef(companyId, entities, filters);
    if (!lead) return toolResult(true, null, [], ['Data not available']);
    const row = await AiLeadRelevance.findOne({ companyId, extractedLeadId: lead._id, ...notDeleted() })
        .sort({ updatedAt: -1 }).lean();
    if (!row) return toolResult(true, null, [], ['Data not available']);
    return toolResult(true, {
        relevance: row.relevanceLabel || row.status || '',
        score: row.relevanceScore ?? row.score ?? null,
        reasons: row.reasons || row.positiveSignals || [],
        status: row.status,
    }, [evidenceItem({ sourceModule: 'lead_relevance', sourceRecordId: row._id, label: 'Lead relevance' })]);
}

export async function getSimilarCompanies(ctx) {
    const { companyId, user, entities, filters, settings } = ctx;
    if (!canSeeSimilar(user)) return toolResult(false, null, [], ['Missing similar-company permission']);
    const lead = await resolveLeadRef(companyId, entities, filters);
    const q = { companyId, ...notDeleted() };
    if (lead) q.sourceExtractedLeadId = lead._id;
    const rows = await AiSimilarCompanyResult.find(q).sort({ similarityScore: -1 })
        .limit(clampLimit(ctx.limit, settings.defaultResultLimit, settings.maximumResultLimit)).lean();
    // Some schemas use different source field names — also try seed/extractedLeadId
    let list = rows;
    if (!list.length && lead) {
        list = await AiSimilarCompanyResult.find({
            companyId,
            $or: [
                { extractedLeadId: lead._id },
                { seedExtractedLeadId: lead._id },
                { sourceLeadId: lead._id },
            ],
            ...notDeleted(),
        }).sort({ similarityScore: -1 }).limit(20).lean();
    }
    const aggregateOnly = isAggregateOnly(user);
    return toolResult(true, {
        items: list.map((r) => ({
            id: String(r._id),
            companyName: redactCompanyName(r.companyName || r.candidateCompanyName, aggregateOnly),
            similarityScore: r.similarityScore,
            status: r.status,
        })),
    }, [evidenceItem({ sourceModule: 'similar_company', sourceType: 'query', label: 'Phase 12 similar companies' })]);
}

export async function getMarketIntelligence(ctx) {
    const { companyId, user, settings } = ctx;
    if (!canSeeMarket(user)) return toolResult(false, null, [], ['Missing market intelligence permission']);
    const rows = await AiMarketIntelligence.find({ companyId, ...notDeleted() })
        .sort({ updatedAt: -1 })
        .limit(clampLimit(ctx.limit, settings.defaultResultLimit, settings.maximumResultLimit))
        .lean();
    return toolResult(true, {
        items: rows.map((r) => ({
            id: String(r._id),
            title: r.title || r.segment || r.industry || 'Market insight',
            status: r.status,
            // Never call this market share
            coverageNote: 'Market coverage reflects the known discovered universe, not market share.',
            metrics: r.metrics || r.summary || null,
        })),
        disclaimer: 'Market coverage is not market share.',
    }, [evidenceItem({ sourceModule: 'market_intelligence', sourceType: 'query', label: 'Phase 12 market intelligence' })],
    ['Market coverage must not be interpreted as market share']);
}

export async function getDuplicateStatus(ctx) {
    const { companyId, entities, filters } = ctx;
    const lead = await resolveLeadRef(companyId, entities, filters);
    if (!lead) return toolResult(true, null, [], ['Data not available']);
    return toolResult(true, {
        extractedLeadId: String(lead._id),
        status: lead.status,
        isDuplicate: lead.status === 'duplicate' || !!lead.duplicateOf,
        duplicateOf: lead.duplicateOf ? String(lead.duplicateOf) : null,
    }, [evidenceItem({ sourceModule: 'extracted_leads', sourceRecordId: lead._id, label: 'Duplicate status' })]);
}

export async function getCrmEnrichmentStatus(ctx) {
    const { companyId, user, entities, filters, settings } = ctx;
    if (!canSeeCrmDetails(user) && !hasAssistant(user, PERMS.crm_conversion)) {
        return toolResult(false, null, [], ['Missing CRM enrichment permission']);
    }
    const q = { companyId, ...notDeleted() };
    if (filters.approvalStatus) q.status = filters.approvalStatus;
    const lead = await resolveLeadRef(companyId, entities, filters);
    if (lead) q.extractedLeadId = lead._id;
    const rows = await AiCrmEnrichmentDraft.find(q).sort({ updatedAt: -1 })
        .limit(clampLimit(ctx.limit, settings.defaultResultLimit, settings.maximumResultLimit)).lean();
    return toolResult(true, {
        items: rows.map((r) => ({
            id: String(r._id),
            status: r.status,
            eligibilityStatus: r.eligibilityStatus,
            applied: ['CONVERTED_TO_LEAD', 'ENRICHED_EXISTING_RECORD', 'PARTIALLY_APPLIED'].includes(r.status),
            draftNotApplied: !['CONVERTED_TO_LEAD', 'ENRICHED_EXISTING_RECORD', 'PARTIALLY_APPLIED'].includes(r.status),
            convertedCrmLeadId: r.convertedCrmLeadId ? String(r.convertedCrmLeadId) : null,
            companyName: isAggregateOnly(user) ? '[restricted]' : (r.companyName || ''),
            note: ['CONVERTED_TO_LEAD', 'ENRICHED_EXISTING_RECORD', 'PARTIALLY_APPLIED'].includes(r.status)
                ? 'Draft actions were applied to CRM.'
                : 'This is a draft — not described as applied.',
        })),
    }, [evidenceItem({ sourceModule: 'crm_enrichment', sourceType: 'query', label: 'Phase 13 CRM enrichment status (read-only)' })]);
}

export async function getSalesWorkflowStatus(ctx) {
    const { companyId, user, filters, settings } = ctx;
    if (!canSeeSalesWorkflow(user)) {
        return toolResult(false, null, [], ['Missing Sales Workflow permission']);
    }
    const q = { companyId, ...notDeleted() };
    if (filters.workflowStatus === 'PENDING') {
        q.status = { $in: ['DRAFT', 'READY_FOR_APPROVAL', 'APPROVED', 'PENDING_REVIEW', 'IN_REVIEW'] };
    }
    const rows = await AiSalesWorkflowDraft.find(q).sort({ updatedAt: -1 })
        .limit(clampLimit(ctx.limit, settings.defaultResultLimit, settings.maximumResultLimit)).lean();
    return toolResult(true, {
        items: rows.map((r) => ({
            id: String(r._id),
            status: r.status,
            eligibilityStatus: r.eligibilityStatus,
            applied: ['ASSIGNMENT_APPLIED', 'TASKS_CREATED', 'PARTIALLY_APPLIED', 'REASSIGNED'].includes(r.status),
            draftNotApplied: !['ASSIGNMENT_APPLIED', 'TASKS_CREATED', 'PARTIALLY_APPLIED', 'REASSIGNED'].includes(r.status),
            note: ['ASSIGNMENT_APPLIED', 'TASKS_CREATED', 'PARTIALLY_APPLIED', 'REASSIGNED'].includes(r.status)
                ? 'Workflow actions were applied.'
                : 'Sales Workflow Draft — not treated as applied.',
        })),
        readOnly: true,
        writesInvoked: false,
    }, [evidenceItem({ sourceModule: 'sales_workflow', sourceType: 'query', label: 'Phase 14 draft status (read-only, no writes)' })]);
}

export async function getTaskFollowupStatus(ctx) {
    const { companyId, user, filters, settings } = ctx;
    if (!canSeeSalesWorkflow(user) && !canSeeCrmDetails(user)) {
        return toolResult(false, null, [], ['Missing task/follow-up view permission']);
    }
    const limit = clampLimit(ctx.limit, settings.defaultResultLimit, settings.maximumResultLimit);
    const leadQ = { companyId };
    if (filters.dateRange?.overdue) {
        leadQ.nextFollowUpDate = { $lt: new Date(filters.dateRange.to || Date.now()) };
    } else if (filters.dateRange?.from || filters.dateRange?.to) {
        leadQ.nextFollowUpDate = {};
        if (filters.dateRange.from) leadQ.nextFollowUpDate.$gte = new Date(filters.dateRange.from);
        if (filters.dateRange.to) leadQ.nextFollowUpDate.$lt = new Date(filters.dateRange.to);
    } else {
        leadQ.nextFollowUpDate = { $ne: null };
    }
    const leads = await Lead.find(leadQ).select('_id companyName nextFollowUpDate assignedTo status')
        .sort({ nextFollowUpDate: 1 }).limit(limit).lean();
    const tasks = await Task.find({ companyId, status: { $nin: ['completed', 'cancelled', 'Canceled'] } })
        .sort({ dueDate: 1 }).limit(limit).lean().catch(() => []);
    return toolResult(true, {
        followUps: leads.map((l) => ({
            leadId: String(l._id),
            companyName: isAggregateOnly(user) ? '[restricted]' : (l.companyName || ''),
            nextFollowUpDate: l.nextFollowUpDate,
            assignedTo: l.assignedTo ? String(l.assignedTo) : null,
        })),
        openTasks: (tasks || []).map((t) => ({
            taskId: String(t._id),
            title: t.title || t.subject || '',
            dueDate: t.dueDate || t.due_date || null,
            status: t.status,
        })),
        historyNote: 'Communication history may be HISTORY_UNAVAILABLE when not recorded.',
    }, [
        evidenceItem({ sourceModule: 'crm_leads', sourceType: 'query', label: 'CRM follow-up dates (read-only)' }),
        evidenceItem({ sourceModule: 'tasks', sourceType: 'query', label: 'CRM tasks (read-only)' }),
    ], ['HISTORY_UNAVAILABLE unless CommunicationHistory evidence exists']);
}

export async function getAnalyticsSummary(ctx) {
    const { companyId, user } = ctx;
    if (!canSeeAnalytics(user)) return toolResult(false, null, [], ['Missing analytics permission']);
    try {
        const summary = await getExecutiveSummary(companyId, { dateRange: ctx.filters?.dateRange?.label || 'last_30_days' }, user);
        // Label approximate KPIs
        const labeled = JSON.parse(JSON.stringify(summary || {}));
        const walk = (o) => {
            if (!o || typeof o !== 'object') return;
            if (o.approximate === true || o.estimation === true || /unique|coverage/i.test(String(o.label || o.metric || ''))) {
                o.valueLabel = 'approximate';
                o.approximate = true;
            }
            if (typeof o.marketCoverage !== 'undefined') {
                o.marketCoverageNote = 'Known discovered universe — not market share';
            }
            for (const v of Object.values(o)) walk(v);
        };
        walk(labeled);
        return toolResult(true, {
            summary: labeled,
            approximateKpiNote: 'Some KPI values are approximate and must be labelled as such.',
            marketCoverageNote: 'Market coverage is not market share.',
        }, [evidenceItem({ sourceModule: 'analytics', sourceType: 'aggregate', label: 'Phase 15 analytics (read-only)' })]);
    } catch (err) {
        return toolResult(true, null, [], [`Analytics unavailable: ${String(err.message || err).slice(0, 120)}`]);
    }
}

export async function getCampaignDraftStatus(ctx) {
    const { companyId, user, filters, settings } = ctx;
    if (!canSeeMarketing(user)) return toolResult(false, null, [], ['Missing marketing permission']);
    const q = { companyId, ...notDeleted() };
    if (filters.campaignStatus) q.handoffStatus = filters.campaignStatus;
    if (/ready for handoff/i.test(JSON.stringify(filters))) q.handoffStatus = { $in: ['READY', 'READY_FOR_HANDOFF', 'PACKAGE_READY'] };
    const rows = await AiMarketingCampaignDraft.find(q).sort({ updatedAt: -1 })
        .limit(clampLimit(ctx.limit, settings.defaultResultLimit, settings.maximumResultLimit)).lean();
    return toolResult(true, {
        items: rows.map((r) => ({
            id: String(r._id),
            name: isAggregateOnly(user) ? '[restricted]' : (r.name || ''),
            status: r.status,
            handoffStatus: r.handoffStatus,
            executable: r.handoffPackage?.executable === true ? false : false, // never claim executable send
            sent: false,
            note: 'Campaign Draft handoff is not sent. Handoff packages are non-executable.',
        })),
    }, [evidenceItem({ sourceModule: 'marketing_intelligence', sourceType: 'query', label: 'Phase 16 campaign drafts (read-only)' })],
    ['Handoff is not described as sent', 'No email/WhatsApp execution from Assistant']);
}

export async function getBatchStatus(ctx) {
    const { companyId, user, settings } = ctx;
    if (!hasAssistant(user, PERMS.batch_monitor) && !canSeeAnalytics(user)) {
        return toolResult(false, null, [], ['Missing batch monitor permission']);
    }
    const limit = clampLimit(ctx.limit, settings.defaultResultLimit, settings.maximumResultLimit);
    const [sw, mi, ls] = await Promise.all([
        AiSalesWorkflowBatchJob.find({ companyId, ...notDeleted() }).sort({ updatedAt: -1 }).limit(limit).lean().catch(() => []),
        AiMarketingCampaignBatchJob.find({ companyId, ...notDeleted() }).sort({ updatedAt: -1 }).limit(limit).lean().catch(() => []),
        AiLeadScoreBatchJob.find({ companyId, ...notDeleted() }).sort({ updatedAt: -1 }).limit(limit).lean().catch(() => []),
    ]);
    const mapRows = (rows, module) => (rows || []).map((r) => ({
        id: String(r._id),
        module,
        status: r.status,
        stale: ['FAILED', 'ERROR', 'STALE'].includes(String(r.status || '').toUpperCase()),
        updatedAt: r.updatedAt,
    }));
    return toolResult(true, {
        items: [...mapRows(sw, 'sales_workflow'), ...mapRows(mi, 'marketing'), ...mapRows(ls, 'lead_scoring')],
    }, [evidenceItem({ sourceModule: 'batches', sourceType: 'query', label: 'Batch status (read-only)' })]);
}

export async function getOutdatedRecords(ctx) {
    const { companyId, user, settings } = ctx;
    if (!hasAssistant(user, PERMS.data_quality) && !canSeeLeadScores(user)) {
        return toolResult(false, null, [], ['Missing data quality permission']);
    }
    const limit = clampLimit(ctx.limit, settings.defaultResultLimit, settings.maximumResultLimit);
    const scores = await AiLeadScore.find({ companyId, status: 'OUTDATED', ...notDeleted() })
        .sort({ updatedAt: -1 }).limit(limit).lean();
    return toolResult(true, {
        items: scores.map((r) => ({
            id: String(r._id),
            type: 'lead_score',
            companyName: isAggregateOnly(user) ? '[restricted]' : r.companyName,
            status: r.status,
            freshness: 'OUTDATED',
        })),
    }, [evidenceItem({ sourceModule: 'lead_scoring', sourceType: 'query', label: 'Outdated scores' })],
    ['Outdated evidence requires manual review']);
}

export async function getManualReviewQueue(ctx) {
    const { companyId, user, settings } = ctx;
    if (!hasAssistant(user, PERMS.data_quality) && !canSeeLeadScores(user)) {
        return toolResult(false, null, [], ['Missing data quality permission']);
    }
    const limit = clampLimit(ctx.limit, settings.defaultResultLimit, settings.maximumResultLimit);
    const scores = await AiLeadScore.find({
        companyId,
        status: { $in: ['MANUAL_REVIEW_REQUIRED', 'LOW_CONFIDENCE'] },
        ...notDeleted(),
    }).sort({ updatedAt: -1 }).limit(limit).lean();
    return toolResult(true, {
        items: scores.map((r) => ({
            id: String(r._id),
            type: 'lead_score',
            companyName: isAggregateOnly(user) ? '[restricted]' : r.companyName,
            status: r.status,
        })),
    }, [evidenceItem({ sourceModule: 'lead_scoring', sourceType: 'query', label: 'Manual review queue' })]);
}

export async function getSourceProvenance(ctx) {
    const bundle = ctx.evidenceBundle || [];
    return toolResult(true, { items: bundle.slice(0, ctx.settings?.maximumEvidenceItems || 30) }, bundle);
}

export async function exportPermittedResults(ctx) {
    const { user, settings } = ctx;
    if (!hasAssistant(user, PERMS.export) || settings.allowExport === false) {
        return toolResult(false, null, [], ['Export not permitted']);
    }
    if (isAggregateOnly(user)) {
        return toolResult(false, null, [], ['Aggregate-only users cannot export identifiable rows']);
    }
    // Export is a serialization of already-retrieved read results only
    const payload = {
        exportedAt: new Date().toISOString(),
        results: ctx.priorResults || [],
        note: 'Read-only export of permitted Assistant results',
    };
    return toolResult(true, payload, [
        evidenceItem({ sourceModule: 'sales_assistant', sourceType: 'export', label: 'Permitted export' }),
    ]);
}

const IMPLEMENTATIONS = {
    searchCompanies,
    getCompanySummary,
    getCompanyProfile,
    searchLeadScores,
    getLeadScoreExplanation,
    getLeadRelevanceExplanation,
    getIndustryClassification,
    getCustomerTypeClassification,
    getProductRecommendations,
    getContactAvailability,
    getApprovedContactDetails,
    getSimilarCompanies,
    getMarketIntelligence,
    getDuplicateStatus,
    getCrmEnrichmentStatus,
    getSalesWorkflowStatus,
    getTaskFollowupStatus,
    getAnalyticsSummary,
    getBatchStatus,
    getCampaignDraftStatus,
    getOutdatedRecords,
    getManualReviewQueue,
    getSourceProvenance,
    exportPermittedResults,
};

export function listRegisteredTools() {
    return READ_ONLY_TOOLS.map((name) => ({
        name,
        readOnly: true,
        write: false,
        registered: !!IMPLEMENTATIONS[name],
    }));
}

export function assertToolAllowed(name) {
    if (WRITE_TOOL_NAMES.includes(name)) {
        throw new ApiError(400, `Write tool rejected: ${name}`);
    }
    if (!READ_ONLY_TOOLS.includes(name) || !IMPLEMENTATIONS[name]) {
        throw new ApiError(400, `Unknown tool rejected: ${name}`);
    }
}

export async function executeTool(name, ctx) {
    assertToolAllowed(name);
    const fn = IMPLEMENTATIONS[name];
    const result = await fn(ctx);
    if (result?.meta) {
        result.meta.mutated = false;
        result.meta.readOnly = true;
    }
    return result;
}

export async function executeTools(names, ctx) {
    const executed = [];
    const results = {};
    const evidence = [];
    const limitations = [];
    for (const name of names) {
        assertToolAllowed(name);
        const r = await executeTool(name, ctx);
        results[name] = r;
        executed.push(name);
        evidence.push(...(r.evidence || []));
        limitations.push(...(r.limitations || []));
        ctx.priorResults = ctx.priorResults || [];
        ctx.priorResults.push({ tool: name, data: r.data });
        ctx.evidenceBundle = evidence;
    }
    return { executed, results, evidence, limitations };
}
