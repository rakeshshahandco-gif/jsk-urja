import { AiMarketIntelligence } from '../../../models/aiMarketIntelligence.model.js';
import { ExtractedLead } from '../../../models/extractedLead.model.js';
import { AiIndustryClassification } from '../../../models/aiIndustryClassification.model.js';
import { AiLeadRelevance } from '../../../models/aiLeadRelevance.model.js';
import { AiProductRecommendation } from '../../../models/aiProductRecommendation.model.js';
import { AiContactIntelligence } from '../../../models/aiContactIntelligence.model.js';
import { AiCompanyIntelligenceProfile } from '../../../models/aiCompanyIntelligenceProfile.model.js';
import { AiLeadScore } from '../../../models/aiLeadScore.model.js';
import { ApiError } from '../../../utils/ApiError.js';
import {
    buildClusters,
    buildMarketCoverage,
    buildWhiteSpaceGaps,
    buildExpansionSuggestions,
} from './marketIntelligence.service.js';
import { getSimilaritySettings } from './settings.service.js';
import { ENGINE_VERSION } from './constants.js';

function rejectTenantOverrides(payload = {}) {
    if (payload.companyId != null || payload.tenantId != null) {
        throw new ApiError(400, 'companyId/tenantId overrides are rejected');
    }
}

function historyEntry(action, userId, previous, next, reason = '') {
    return {
        at: new Date(),
        action,
        userId: userId || null,
        previousStatus: previous?.status || '',
        resultingStatus: next?.status || previous?.status || '',
        previous: previous ? { status: previous.status, title: previous.title } : null,
        next: next ? { status: next.status, title: next.title } : null,
        reason: String(reason || '').slice(0, 2000),
    };
}

async function loadCompanyUniverse(companyId, limit = 300) {
    const leads = await ExtractedLead.find({ companyId }).limit(limit).lean();
    const out = [];
    for (const lead of leads) {
        const extractedLeadId = lead._id;
        const [classification, relevance, recommendation, contact, profile, score] = await Promise.all([
            AiIndustryClassification.findOne({ companyId, extractedLeadId, isDeleted: { $ne: true } }).sort({ updatedAt: -1 }).lean(),
            AiLeadRelevance.findOne({ companyId, extractedLeadId, isDeleted: { $ne: true } }).sort({ updatedAt: -1 }).lean(),
            AiProductRecommendation.findOne({ companyId, extractedLeadId, isDeleted: { $ne: true } }).sort({ updatedAt: -1 }).lean(),
            AiContactIntelligence.findOne({ companyId, extractedLeadId, isDeleted: { $ne: true } }).sort({ updatedAt: -1 }).lean(),
            AiCompanyIntelligenceProfile.findOne({ companyId, extractedLeadId, isDeleted: { $ne: true } }).sort({ updatedAt: -1 }).lean(),
            AiLeadScore.findOne({ companyId, extractedLeadId, isDeleted: { $ne: true } }).sort({ updatedAt: -1 }).lean(),
        ]);
        out.push({
            record: lead,
            classification,
            relevance,
            recommendation,
            contact,
            profile,
            score,
            companyName: lead.companyName,
            existingCrmStatus: lead.crmStatus || 'UNKNOWN',
            manuallyApproved: !!lead.manuallyApproved || score?.manuallyApproved || profile?.manuallyApproved,
        });
    }
    return out;
}

async function upsertIntel(companyId, userId, item, settingsVersion = '') {
    const existing = await AiMarketIntelligence.findOne({
        companyId,
        intelType: item.intelType,
        recordKey: item.recordKey,
        isDeleted: { $ne: true },
    });
    if (existing?.locked) {
        return { skipped: true, reason: 'locked', doc: existing.toObject() };
    }
    const payload = {
        companyId,
        intelType: item.intelType,
        recordKey: item.recordKey,
        status: item.status || 'GENERATED',
        title: item.title || '',
        summary: item.summary || '',
        coverageStatus: item.coverageStatus || 'INSUFFICIENT_DATA',
        metrics: item.metrics || {},
        filters: item.filters || {},
        recommendations: item.recommendations || [],
        evidence: item.evidence || [],
        priority: item.priority || 'MEDIUM',
        confidence: item.confidence || 0,
        engineUsed: item.engineUsed || 'rule_based',
        modelVersion: item.modelVersion || ENGINE_VERSION,
        settingsVersion,
        generatedAt: new Date(),
        rawPayload: item,
        updatedBy: userId || null,
        noAutoPaidProvider: true,
        locked: existing?.locked || false,
    };
    if (!existing) {
        const created = await AiMarketIntelligence.create({
            ...payload,
            createdBy: userId || null,
            history: [historyEntry('generated', userId, null, payload, 'initial market intelligence')],
        });
        return { skipped: false, doc: created.toObject() };
    }
    const previous = existing.toObject();
    Object.assign(existing, payload);
    existing.history = [...(existing.history || []), historyEntry('regenerated', userId, previous, payload, 'refresh')].slice(-50);
    await existing.save();
    return { skipped: false, doc: existing.toObject() };
}

export async function listMarketIntel(companyId, query = {}) {
    const q = { companyId, isDeleted: { $ne: true } };
    if (query.intelType) q.intelType = query.intelType;
    if (query.status) q.status = query.status;
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 50));
    const skip = Math.max(0, Number(query.skip) || 0);
    const [results, total] = await Promise.all([
        AiMarketIntelligence.find(q).sort({ updatedAt: -1 }).skip(skip).limit(limit).lean(),
        AiMarketIntelligence.countDocuments(q),
    ]);
    return { results, total, limit, skip };
}

export async function getMarketIntel(companyId, id) {
    const doc = await AiMarketIntelligence.findOne({ _id: id, companyId, isDeleted: { $ne: true } }).lean();
    if (!doc) throw new ApiError(404, 'Market intelligence not found');
    return doc;
}

/**
 * Run company-scoped cluster / coverage / white-space / expansion analysis.
 * Never invents market totals. Never auto-runs paid providers.
 */
export async function runMarketIntelligence(companyId, userId, payload = {}) {
    rejectTenantOverrides(payload);
    if (payload.executePaidProvider === true && payload.confirmPaidProvider !== true) {
        throw new ApiError(400, 'Paid provider requires explicit confirmation');
    }
    const settings = await getSimilaritySettings(companyId);
    const universe = Array.isArray(payload.companies) && payload.companies.length
        ? payload.companies
        : await loadCompanyUniverse(companyId);

    const saved = [];
    const groupBy = payload.groupBy || 'industry_city';

    if (settings.clusterAnalysisEnabled !== false && payload.skipClusters !== true) {
        const clusters = buildClusters(universe, { groupBy });
        for (const c of clusters) {
            const out = await upsertIntel(companyId, userId, c, settings.version);
            saved.push(out.doc);
        }
    }

    let coverageDoc = null;
    {
        const existingCrmCount = universe.filter((c) => ['CUSTOMER', 'LEAD', 'SUPPLIER'].includes(c.existingCrmStatus)).length;
        const approvedLeadCount = universe.filter((c) => c.manuallyApproved || c.score?.manuallyApproved).length;
        const customersCount = universe.filter((c) => c.existingCrmStatus === 'CUSTOMER').length;
        const prospectsCount = universe.filter((c) => c.relevance?.status === 'RELEVANT').length;
        const coverage = buildMarketCoverage({
            discovered: universe,
            existingCrmCount,
            approvedLeadCount,
            customersCount,
            prospectsCount,
            configuredTargetCount: payload.configuredTargetCount != null ? payload.configuredTargetCount : null,
        });
        const out = await upsertIntel(companyId, userId, coverage, settings.version);
        coverageDoc = out.doc;
        saved.push(out.doc);
    }

    let whiteSpaces = [];
    if (settings.whiteSpaceEnabled !== false && payload.skipWhiteSpace !== true) {
        whiteSpaces = buildWhiteSpaceGaps({
            companies: universe,
            targetIndustries: payload.targetIndustries || [],
            targetCities: payload.targetCities || [],
            targetCustomerTypes: payload.targetCustomerTypes || [],
            targetProducts: payload.targetProducts || [],
        });
        for (const g of whiteSpaces) {
            const out = await upsertIntel(companyId, userId, g, settings.version);
            saved.push(out.doc);
        }
    }

    if (settings.expansionSuggestionsEnabled !== false && payload.skipExpansion !== true) {
        const clusters = buildClusters(universe, { groupBy });
        const suggestions = buildExpansionSuggestions({
            whiteSpaces,
            clusters,
            successfulKeywords: payload.successfulKeywords || [],
            targetMarket: payload.targetMarket || {},
        });
        for (const s of suggestions) {
            // Ensure no autoExecute
            for (const r of s.recommendations || []) {
                r.autoExecute = false;
                r.manualApprovalRequired = true;
            }
            const out = await upsertIntel(companyId, userId, s, settings.version);
            saved.push(out.doc);
        }
    }

    return {
        companyScoped: true,
        universeSize: universe.length,
        savedCount: saved.length,
        coverageStatus: coverageDoc?.coverageStatus || 'INSUFFICIENT_DATA',
        results: saved,
        paidProviderExecuted: false,
        noAutoPaidProvider: true,
        note: 'Coverage is against known discovered universe only — not total market share',
    };
}
