import httpStatus from 'http-status';
import { ApiError } from '../utils/ApiError.js';
import { Company } from '../models/company.model.js';
import { WorkflowMaster } from '../models/workflowMaster.model.js';
import { IndustryTemplate } from '../models/industryTemplate.model.js';
import { resolveCompanyIndustryTemplate } from './industryTemplate.service.js';

export function buildWorkflowVersion(workflow) {
    if (!workflow) return '';
    if (workflow.updatedAt) return new Date(workflow.updatedAt).toISOString();
    return String(workflow._id || '');
}

export function buildWorkflowSnapshot(workflow) {
    if (!workflow) return null;
    return {
        workflowName: workflow.workflowName || '',
        workflowCode: workflow.workflowCode || '',
        description: workflow.description || '',
        industryTemplateRef: workflow.industryTemplateRef?._id || workflow.industryTemplateRef || null,
        stages: (workflow.stages || []).map((s) => ({
            stageName: s.stageName,
            sequenceNo: s.sequenceNo,
            stageType: s.stageType,
            allowStart: s.allowStart !== false,
            allowComplete: s.allowComplete !== false,
            allowSkip: !!s.allowSkip,
            remarksRequired: !!s.remarksRequired,
            attachmentRequired: !!s.attachmentRequired,
        })),
        capturedAt: new Date(),
    };
}

async function loadSuggestedWorkflow(templateId) {
    if (!templateId) return null;
    const fromTemplate = await WorkflowMaster.findOne({
        industryTemplateRef: templateId,
        isActive: true,
    })
        .sort({ updatedAt: -1 })
        .lean();
    if (fromTemplate) return fromTemplate;
    const template = await IndustryTemplate.findById(templateId).lean();
    const ref = template?.templateSettings?.workflowSettings?.workflowMasterRef;
    if (!ref) return null;
    return WorkflowMaster.findById(ref).lean();
}

function buildWarnings(company, workflow) {
    const warnings = [];
    if (!company.assignedWorkflowRef) return warnings;
    if (!workflow) {
        warnings.push('workflow_deleted');
        return warnings;
    }
    if (!workflow.isActive) warnings.push('workflow_inactive');
    const currentVersion = buildWorkflowVersion(workflow);
    if (company.workflowVersion && currentVersion !== company.workflowVersion) {
        warnings.push('workflow_version_outdated');
    }
    const companyTpl = String(company.industryTemplateRef || '');
    const wfTpl = String(workflow.industryTemplateRef || '');
    if (companyTpl && wfTpl && companyTpl !== wfTpl) {
        warnings.push('template_mismatch');
    }
    return warnings;
}

function previewFrom(company, workflow) {
    if (workflow?.stages?.length) {
        return workflow.stages.slice().sort((a, b) => (a.sequenceNo || 0) - (b.sequenceNo || 0));
    }
    const snap = company.workflowSnapshot;
    if (snap?.stages?.length) {
        return snap.stages.slice().sort((a, b) => (a.sequenceNo || 0) - (b.sequenceNo || 0));
    }
    return [];
}

export async function resolveCompanyWorkflowAssignment(companyId) {
    const company = await Company.findById(companyId).lean();
    if (!company) throw new ApiError(httpStatus.NOT_FOUND, 'Company not found');

    const template = company.industryTemplateRef
        ? await IndustryTemplate.findById(company.industryTemplateRef).lean()
        : await resolveCompanyIndustryTemplate(companyId);

    const suggestedWorkflow = await loadSuggestedWorkflow(template?._id || company.industryTemplateRef);

    let assignedWorkflow = null;
    if (company.assignedWorkflowRef) {
        assignedWorkflow = await WorkflowMaster.findById(company.assignedWorkflowRef).lean();
    }

    const warnings = buildWarnings(company, assignedWorkflow);
    const previewStages = previewFrom(company, assignedWorkflow);
    const displayWorkflow = assignedWorkflow || (company.workflowSnapshot?.workflowName ? company.workflowSnapshot : null);

    return {
        companyId: company._id,
        companyName: company.companyName,
        industryTemplate: template
            ? {
                _id: template._id,
                templateName: template.templateName,
                templateCode: template.templateCode,
            }
            : null,
        suggestedWorkflow: suggestedWorkflow
            ? {
                _id: suggestedWorkflow._id,
                workflowName: suggestedWorkflow.workflowName,
                workflowCode: suggestedWorkflow.workflowCode,
                description: suggestedWorkflow.description,
                isActive: suggestedWorkflow.isActive,
                stageCount: suggestedWorkflow.stages?.length || 0,
            }
            : null,
        assignment: {
            assignedWorkflowRef: company.assignedWorkflowRef,
            workflowVersion: company.workflowVersion || '',
            activeWorkflow: !!company.activeWorkflow,
            workflowAssignedAt: company.workflowAssignedAt,
        },
        workflow: displayWorkflow
            ? {
                workflowName: assignedWorkflow?.workflowName || company.workflowSnapshot?.workflowName,
                workflowCode: assignedWorkflow?.workflowCode || company.workflowSnapshot?.workflowCode,
                description: assignedWorkflow?.description || company.workflowSnapshot?.description || '',
                isLive: !!assignedWorkflow,
                isActive: assignedWorkflow?.isActive,
            }
            : null,
        previewStages,
        warnings,
        canOverride: true,
    };
}

export async function assignCompanyWorkflow(companyId, payload, userId) {
    const company = await Company.findById(companyId);
    if (!company) throw new ApiError(httpStatus.NOT_FOUND, 'Company not found');

    const { assignedWorkflowRef, activeWorkflow, useSuggestedDefault } = payload || {};

    let workflowId = assignedWorkflowRef;
    if (useSuggestedDefault) {
        const suggested = await loadSuggestedWorkflow(company.industryTemplateRef);
        if (!suggested?._id) {
            throw new ApiError(httpStatus.BAD_REQUEST, 'No suggested workflow for this industry template');
        }
        workflowId = suggested._id;
    }

    if (workflowId === null || workflowId === '' || workflowId === undefined) {
        company.assignedWorkflowRef = null;
        company.workflowVersion = '';
        company.activeWorkflow = false;
        company.workflowAssignedAt = null;
        company.updatedBy = userId;
        await company.save();
        return resolveCompanyWorkflowAssignment(companyId);
    }

    if (!workflowId) {
        company.activeWorkflow = activeWorkflow === true;
        company.updatedBy = userId;
        await company.save();
        return resolveCompanyWorkflowAssignment(companyId);
    }

    const workflow = await WorkflowMaster.findById(workflowId);
    if (!workflow) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Workflow not found');
    }

    const snapshot = buildWorkflowSnapshot(workflow.toObject ? workflow.toObject() : workflow);
    company.assignedWorkflowRef = workflow._id;
    company.workflowVersion = buildWorkflowVersion(workflow);
    company.activeWorkflow = activeWorkflow !== false;
    company.workflowAssignedAt = new Date();
    company.workflowSnapshot = snapshot;
    company.updatedBy = userId;
    await company.save();

    return resolveCompanyWorkflowAssignment(companyId);
}

export async function listWorkflowsForCompanyTemplate(companyId, templateIdOverride = null) {
    const company = await Company.findById(companyId).lean();
    if (!company) throw new ApiError(httpStatus.NOT_FOUND, 'Company not found');
    const templateId = templateIdOverride || company.industryTemplateRef;
    if (!templateId) return [];
    return WorkflowMaster.find({ industryTemplateRef: templateId })
        .sort({ workflowName: 1 })
        .select('workflowName workflowCode description isActive stages industryTemplateRef updatedAt')
        .lean();
}
