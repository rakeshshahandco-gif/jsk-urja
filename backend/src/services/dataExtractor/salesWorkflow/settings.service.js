import { ExtractorSettings } from '../../../models/extractorSettings.model.js';
import { DEFAULT_SETTINGS, SETTINGS_VERSION, ENGINE_VERSION } from './constants.js';

function clone(o) { return JSON.parse(JSON.stringify(o)); }

export function normalizeSalesWorkflowSettings(raw = {}) {
    const base = clone(DEFAULT_SETTINGS);
    const incoming = raw && typeof raw === 'object' ? raw : {};
    return {
        ...base,
        ...incoming,
        version: String(incoming.version || SETTINGS_VERSION),
        dimensions: Array.isArray(incoming.dimensions) && incoming.dimensions.length
            ? incoming.dimensions.map((d) => ({
                id: String(d.id || '').trim(),
                label: String(d.label || d.id || '').trim(),
                maxScore: Math.max(0, Number(d.maxScore) || 0),
                active: d.active !== false,
            })).filter((d) => d.id)
            : base.dimensions,
        priorityFollowupDays: { ...base.priorityFollowupDays, ...(incoming.priorityFollowupDays || {}) },
        workingDayRules: { ...base.workingDayRules, ...(incoming.workingDayRules || {}) },
        duplicateTaskWindowDays: Math.max(0, Number(incoming.duplicateTaskWindowDays ?? base.duplicateTaskWindowDays) || 0),
        allowBatchApply: incoming.allowBatchApply === true,
        requireReviewForReassignment: incoming.requireReviewForReassignment !== false,
    };
}

export async function getSalesWorkflowSettings(companyId) {
    const doc = await ExtractorSettings.findOne({ companyId }).lean();
    return normalizeSalesWorkflowSettings(doc?.aiLeadIntelligence?.salesWorkflow || {});
}

export async function saveSalesWorkflowSettings(companyId, userId, payload = {}) {
    const normalized = normalizeSalesWorkflowSettings(payload);
    const existing = await ExtractorSettings.findOne({ companyId });
    if (!existing) {
        await ExtractorSettings.create({
            companyId,
            aiLeadIntelligence: { salesWorkflow: normalized },
            updatedBy: userId || null,
        });
        return normalized;
    }
    const ali = { ...(existing.aiLeadIntelligence?.toObject?.() || existing.aiLeadIntelligence || {}) };
    ali.salesWorkflow = normalized;
    existing.aiLeadIntelligence = ali;
    existing.updatedBy = userId || null;
    await existing.save();
    return normalized;
}

export function settingsFingerprint(settings) {
    return `${settings.version || SETTINGS_VERSION}:${ENGINE_VERSION}:${settings.assignmentMode}:${(settings.dimensions || [])
        .filter((d) => d.active !== false)
        .map((d) => `${d.id}:${d.maxScore}`)
        .join('|')}`;
}
