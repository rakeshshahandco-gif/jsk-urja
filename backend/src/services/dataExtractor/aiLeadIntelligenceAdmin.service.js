import { AiIndustryMaster } from '../../models/aiIndustryMaster.model.js';
import { AiCustomerTypeMaster } from '../../models/aiCustomerTypeMaster.model.js';
import { AiOpportunityMap } from '../../models/aiOpportunityMap.model.js';
import { ExtractorSettings } from '../../models/extractorSettings.model.js';
import { ApiError } from '../../utils/ApiError.js';
import { defaultAiSettings, loadLeadIntelligenceMasters, classifyLeadRecord } from './aiLeadIntelligence.service.js';
import { listProductMasters, saveProductMasters } from './productRecommendation/productMaster.service.js';

function cleanList(list = []) {
    return [...new Set((list || []).map((x) => String(x || '').trim()).filter(Boolean))];
}

function pushAudit(doc, action, userId, note = '') {
    doc.auditLog = [...(doc.auditLog || []), {
        at: new Date(),
        action,
        userId: userId || null,
        note: String(note || '').trim(),
        snapshot: doc.toObject ? doc.toObject() : { ...doc },
    }].slice(-50);
}

async function upsertOne(Model, companyId, row, userId, mapper) {
    const payload = mapper(row);
    if (!payload) return null;
    let doc = await Model.findOne({ companyId, ...payload.uniqueFilter });
    if (!doc) {
        doc = new Model({
            companyId,
            ...payload.values,
            createdBy: userId || null,
            updatedBy: userId || null,
        });
        pushAudit(doc, 'created', userId, payload.values.notes || '');
    } else {
        Object.assign(doc, payload.values, {
            version: Number(doc.version || 1) + 1,
            updatedBy: userId || null,
        });
        pushAudit(doc, 'updated', userId, payload.values.notes || '');
    }
    await doc.save();
    return doc.toObject();
}

export async function getAiLeadIntelligenceOverview(companyId) {
    const [settings, masters] = await Promise.all([
        ExtractorSettings.findOne({ companyId }).lean(),
        loadLeadIntelligenceMasters(companyId),
    ]);
    const products = await listProductMasters(companyId);
    return {
        settings: defaultAiSettings(settings),
        industries: masters.industries,
        customerTypes: masters.customerTypes,
        opportunityMaps: masters.opportunityMaps,
        products: products.results || [],
    };
}

export async function updateAiLeadIntelligenceSettings(companyId, payload = {}, userId = null) {
    const current = await ExtractorSettings.findOne({ companyId });
    const prev = defaultAiSettings(current || {});
    const next = {
        ...prev,
        ...(payload.enabled != null ? { enabled: payload.enabled === true } : {}),
        ...(payload.classificationMode ? { classificationMode: String(payload.classificationMode) } : {}),
        ...(payload.minimumConfidence != null ? { minimumConfidence: Number(payload.minimumConfidence) } : {}),
        ...(payload.autoApplyOnSearch != null ? { autoApplyOnSearch: payload.autoApplyOnSearch === true } : {}),
        ...(payload.requireManualReviewBelowConfidence != null ? { requireManualReviewBelowConfidence: Number(payload.requireManualReviewBelowConfidence) } : {}),
        targetMarket: {
            ...prev.targetMarket,
            ...(payload.targetMarket && typeof payload.targetMarket === 'object' ? {
                ...(payload.targetMarket.relevantMinScore != null ? { relevantMinScore: Number(payload.targetMarket.relevantMinScore) } : {}),
                ...(payload.targetMarket.possiblyRelevantMinScore != null ? { possiblyRelevantMinScore: Number(payload.targetMarket.possiblyRelevantMinScore) } : {}),
                ...(payload.targetMarket.targetParentIndustries ? { targetParentIndustries: cleanList(payload.targetMarket.targetParentIndustries) } : {}),
                ...(payload.targetMarket.targetSubIndustries ? { targetSubIndustries: cleanList(payload.targetMarket.targetSubIndustries) } : {}),
                ...(payload.targetMarket.targetProducts ? { targetProducts: cleanList(payload.targetMarket.targetProducts) } : {}),
                ...(payload.targetMarket.targetLocations ? { targetLocations: cleanList(payload.targetMarket.targetLocations) } : {}),
                ...(payload.targetMarket.exclusionKeywords ? { exclusionKeywords: cleanList(payload.targetMarket.exclusionKeywords) } : {}),
                ...(payload.targetMarket.negativeKeywords ? { negativeKeywords: cleanList(payload.targetMarket.negativeKeywords) } : {}),
            } : {}),
        },
        productRecommendation: {
            ...prev.productRecommendation,
            ...(payload.productRecommendation && typeof payload.productRecommendation === 'object' ? {
                ...(payload.productRecommendation.mode ? { mode: String(payload.productRecommendation.mode) } : {}),
                ...(payload.productRecommendation.minimumOpportunityScore != null ? { minimumOpportunityScore: Number(payload.productRecommendation.minimumOpportunityScore) } : {}),
                ...(payload.productRecommendation.primaryMinScore != null ? { primaryMinScore: Number(payload.productRecommendation.primaryMinScore) } : {}),
            } : {}),
        },
    };
    const settings = await ExtractorSettings.findOneAndUpdate(
        { companyId },
        { $set: { aiLeadIntelligence: next, updatedBy: userId || null } },
        { new: true, upsert: true },
    ).lean();
    return defaultAiSettings(settings);
}

export async function saveAiIndustryMasters(companyId, rows = [], userId = null) {
    const results = [];
    for (const row of rows || []) {
        // eslint-disable-next-line no-await-in-loop
        const saved = await upsertOne(AiIndustryMaster, companyId, row, userId, (item) => {
            const parentIndustry = String(item.parentIndustry || '').trim();
            const subIndustry = String(item.subIndustry || '').trim();
            if (!parentIndustry || !subIndustry) return null;
            return {
                uniqueFilter: { parentIndustry, subIndustry },
                values: {
                    parentIndustry,
                    subIndustry,
                    keywords: cleanList(item.keywords),
                    negativeKeywords: cleanList(item.negativeKeywords),
                    productKeywords: cleanList(item.productKeywords),
                    websiteKeywords: cleanList(item.websiteKeywords),
                    exclusionTerms: cleanList(item.exclusionTerms),
                    isActive: item.isActive !== false,
                    notes: String(item.notes || '').trim(),
                },
            };
        });
        if (saved) results.push(saved);
    }
    return results;
}

export async function saveAiCustomerTypes(companyId, rows = [], userId = null) {
    const results = [];
    for (const row of rows || []) {
        // eslint-disable-next-line no-await-in-loop
        const saved = await upsertOne(AiCustomerTypeMaster, companyId, row, userId, (item) => {
            const name = String(item.name || '').trim();
            if (!name) return null;
            return {
                uniqueFilter: { name },
                values: {
                    name,
                    keywords: cleanList(item.keywords),
                    negativeKeywords: cleanList(item.negativeKeywords),
                    isActive: item.isActive !== false,
                    notes: String(item.notes || '').trim(),
                },
            };
        });
        if (saved) results.push(saved);
    }
    return results;
}

export async function saveAiOpportunityMaps(companyId, rows = [], userId = null) {
    const results = [];
    for (const row of rows || []) {
        // eslint-disable-next-line no-await-in-loop
        const saved = await upsertOne(AiOpportunityMap, companyId, row, userId, (item) => {
            const parentIndustry = String(item.parentIndustry || '').trim();
            const subIndustry = String(item.subIndustry || '').trim();
            const customerType = String(item.customerType || '').trim();
            if (!parentIndustry) return null;
            return {
                uniqueFilter: { parentIndustry, subIndustry, customerType },
                values: {
                    parentIndustry,
                    subIndustry,
                    customerType,
                    isActive: item.isActive !== false,
                    notes: String(item.notes || '').trim(),
                    opportunityItems: (item.opportunityItems || []).map((x) => ({
                        productName: String(x.productName || '').trim(),
                        priority: String(x.priority || 'medium').trim(),
                        salesStrategy: String(x.salesStrategy || '').trim(),
                        positiveSignals: cleanList(x.positiveSignals),
                        negativeSignals: cleanList(x.negativeSignals),
                        recommendedFollowUp: String(x.recommendedFollowUp || '').trim(),
                        recommendedSalesperson: String(x.recommendedSalesperson || '').trim(),
                    })).filter((x) => x.productName),
                },
            };
        });
        if (saved) results.push(saved);
    }
    return results;
}

export async function classifySampleLeadIntelligence(companyId, record, settingsOverride = null) {
    const [settingsDoc, masters] = await Promise.all([
        ExtractorSettings.findOne({ companyId }).lean(),
        loadLeadIntelligenceMasters(companyId),
    ]);
    if (!masters.industries.length) throw new ApiError(400, 'Create at least one industry master first');
    const settings = settingsOverride ? { ...(settingsDoc || {}), aiLeadIntelligence: { ...defaultAiSettings(settingsDoc || {}), ...settingsOverride } } : (settingsDoc || {});
    return classifyLeadRecord(record, settings, masters);
}
