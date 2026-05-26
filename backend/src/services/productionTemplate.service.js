import { PRODUCTION_STAGES } from '../models/workOrder.model.js';
import {
    BEHAVIOR_MODES,
    DEFAULT_JSK_INDUSTRY_CONFIG,
    INDUSTRY_TEMPLATES,
    JSK_ELECTRONICS_STANDARD_STAGES,
} from '../constants/industryTemplates.defaults.js';

/**
 * Resolve production stages for a work order.
 * legacy-compatible → always existing PRODUCTION_STAGES (no behavior change for JSK).
 * template-driven → template stages, fallback to PRODUCTION_STAGES on any error.
 */
export function resolveProductionStages(industryConfig = {}) {
    const mode = industryConfig?.behaviorMode || BEHAVIOR_MODES.LEGACY;

    if (mode === BEHAVIOR_MODES.LEGACY) {
        return PRODUCTION_STAGES;
    }

    try {
        const templateName = industryConfig?.industryTemplate;
        const processName = industryConfig?.productionProcessTemplate;
        const industry = INDUSTRY_TEMPLATES[templateName];
        const process = industry?.productionProcesses?.[processName];
        const stages = process?.stages;
        if (Array.isArray(stages) && stages.length > 0) {
            return stages.map((s) => ({
                seq: s.seq,
                stageName: s.stageName,
                isQcGate: !!s.isQcGate,
                isTestGate: !!s.isTestGate,
            }));
        }
    } catch {
        // fall through to legacy stages
    }

    return PRODUCTION_STAGES;
}

export function mergeIndustryConfig(stored) {
    return {
        ...DEFAULT_JSK_INDUSTRY_CONFIG,
        ...(stored && typeof stored === 'object' ? stored : {}),
    };
}

export function listIndustryTemplates() {
    return Object.values(INDUSTRY_TEMPLATES).map((t) => ({
        id: t.id,
        label: t.label,
        productionProcesses: Object.values(t.productionProcesses || {}).map((p) => ({
            id: p.id,
            label: p.label,
            stageCount: (p.stages || []).length,
            description: p.description || '',
        })),
    }));
}

export function getTemplateStagesPreview(industryTemplate, productionProcessTemplate) {
    const industry = INDUSTRY_TEMPLATES[industryTemplate];
    const process = industry?.productionProcesses?.[productionProcessTemplate];
    return process?.stages || JSK_ELECTRONICS_STANDARD_STAGES;
}
