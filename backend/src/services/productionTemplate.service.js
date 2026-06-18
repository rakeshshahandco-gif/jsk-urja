import { PRODUCTION_STAGES } from '../models/workOrder.model.js';
import { Company } from '../models/company.model.js';
import {
    BEHAVIOR_MODES,
    DEFAULT_JSK_INDUSTRY_CONFIG,
    INDUSTRY_TEMPLATES,
    JSK_ELECTRONICS_STANDARD_STAGES,
} from '../constants/industryTemplates.defaults.js';
import { TEXTILE_INDUSTRY_CODES } from '../constants/textileProductionLot.constants.js';
import { resolveCompanyWorkflowAssignment } from './companyWorkflowAssignment.service.js';
import { isJskUrjaCompany } from './companyIndustryBootstrap.service.js';

/** Fallback textile WO stages when no workflow is assigned (Handloom / TEXTILE template). */
export const TEXTILE_DEFAULT_WO_STAGES = [
    { seq: 1, stageName: 'Grey Fabric Inward', isQcGate: false, isTestGate: false },
    { seq: 2, stageName: 'Dyeing', isQcGate: false, isTestGate: false },
    { seq: 3, stageName: 'Printing', isQcGate: false, isTestGate: false },
    { seq: 4, stageName: 'Embroidery', isQcGate: false, isTestGate: false },
    { seq: 5, stageName: 'Stitching', isQcGate: false, isTestGate: false },
    { seq: 6, stageName: 'Washing', isQcGate: false, isTestGate: false },
    { seq: 7, stageName: 'Pressing', isQcGate: false, isTestGate: false },
    { seq: 8, stageName: 'Finishing', isQcGate: false, isTestGate: false },
    { seq: 9, stageName: 'Packing', isQcGate: false, isTestGate: false },
    { seq: 10, stageName: 'Finished Stock', isQcGate: false, isTestGate: false },
];

function mapWorkflowStageToWoStage(s, idx) {
    const stageType = s.stageType || 'general';
    return {
        seq: s.sequenceNo || idx + 1,
        stageName: s.stageName,
        isQcGate: ['quality_control', 'inspection'].includes(stageType),
        isTestGate: stageType === 'testing',
    };
}

async function isTextileCompanyId(companyId) {
    if (!companyId) return false;
    const company = await Company.findById(companyId)
        .populate('industryTemplateRef', 'templateCode templateName')
        .lean();
    if (!company) return false;
    if (isJskUrjaCompany(company)) return false;
    const code = String(company.industryTemplateRef?.templateCode || '').toUpperCase();
    const name = `${company.companyName || ''} ${company.industryTemplateRef?.templateName || ''}`.toLowerCase();
    return TEXTILE_INDUSTRY_CODES.includes(code) || name.includes('textile') || name.includes('handloom');
}

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

/**
 * Resolve work-order production stages from active company template + assigned workflow.
 * JSK / electronics → legacy PRODUCTION_STAGES (unchanged). Textile → workflow stages.
 */
export async function resolveWorkOrderStagesForCompany(companyId, industryConfig = {}) {
    const isTextile = await isTextileCompanyId(companyId);
    if (!isTextile) {
        return {
            stages: resolveProductionStages(industryConfig),
            productionModule: 'electronics',
        };
    }

    try {
        const assignment = await resolveCompanyWorkflowAssignment(companyId);
        const preview = assignment.previewStages || [];
        if (preview.length > 0) {
            return {
                stages: preview.map(mapWorkflowStageToWoStage),
                productionModule: 'textile',
                workflowName: assignment.workflow?.workflowName
                    || assignment.suggestedWorkflow?.workflowName
                    || null,
            };
        }
    } catch {
        // fall through to textile defaults
    }

    return {
        stages: TEXTILE_DEFAULT_WO_STAGES,
        productionModule: 'textile',
    };
}
