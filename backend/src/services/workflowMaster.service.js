import httpStatus from 'http-status';
import { ApiError } from '../utils/ApiError.js';
import { WorkflowMaster } from '../models/workflowMaster.model.js';
import { IndustryTemplate } from '../models/industryTemplate.model.js';
import { normalizeStages, slugWorkflowCode } from '../constants/workflowMaster.constants.js';

async function ensureUniqueWorkflowCode(baseCode, excludeId = null) {
    let code = baseCode;
    let n = 1;
    for (;;) {
        const filter = { workflowCode: code };
        if (excludeId) filter._id = { $ne: excludeId };
        const exists = await WorkflowMaster.findOne(filter).select('_id').lean();
        if (!exists) return code;
        n += 1;
        code = `${baseCode}_${n}`.slice(0, 56);
    }
}

async function linkWorkflowToIndustryTemplate(workflow, userId) {
    if (!workflow?.industryTemplateRef) return;
    const template = await IndustryTemplate.findById(workflow.industryTemplateRef);
    if (!template) return;

    template.templateSettings = template.templateSettings || {};
    template.templateSettings.workflowSettings = {
        ...(template.templateSettings.workflowSettings || {}),
        workflowMasterRef: workflow._id,
        workflowName: workflow.workflowName,
        workflowCode: workflow.workflowCode,
        stageCount: workflow.stages?.length || 0,
    };
    template.updatedBy = userId;
    await template.save();
}

async function unlinkWorkflowFromTemplate(templateId, workflowId, userId) {
    if (!templateId) return;
    const template = await IndustryTemplate.findById(templateId);
    if (!template) return;
    const ws = template.templateSettings?.workflowSettings || {};
    if (String(ws.workflowMasterRef) !== String(workflowId)) return;

    template.templateSettings = template.templateSettings || {};
    template.templateSettings.workflowSettings = {
        workflowMasterRef: null,
        workflowName: '',
        workflowCode: '',
        stageCount: 0,
    };
    template.updatedBy = userId;
    await template.save();
}

export async function listWorkflowMasters({ industryTemplateRef, isActive } = {}) {
    const filter = {};
    if (industryTemplateRef) filter.industryTemplateRef = industryTemplateRef;
    if (isActive !== undefined) filter.isActive = isActive === true || isActive === 'true';

    return WorkflowMaster.find(filter)
        .populate('industryTemplateRef', 'templateName templateCode isActive')
        .sort({ workflowName: 1 })
        .lean();
}

export async function getWorkflowMasterById(id) {
    const doc = await WorkflowMaster.findById(id)
        .populate('industryTemplateRef', 'templateName templateCode isActive')
        .lean();
    if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Workflow not found');
    return doc;
}

export async function getWorkflowMasterByTemplate(templateId) {
    const doc = await WorkflowMaster.findOne({
        industryTemplateRef: templateId,
        isActive: true,
    })
        .populate('industryTemplateRef', 'templateName templateCode')
        .sort({ updatedAt: -1 })
        .lean();
    return doc;
}

export async function createWorkflowMaster(payload, userId) {
    const template = await IndustryTemplate.findById(payload.industryTemplateRef);
    if (!template) throw new ApiError(httpStatus.BAD_REQUEST, 'Industry template not found');

    const baseCode = payload.workflowCode
        ? String(payload.workflowCode).trim().toUpperCase()
        : slugWorkflowCode(payload.workflowName);
    const workflowCode = await ensureUniqueWorkflowCode(baseCode);
    const stages = normalizeStages(payload.stages);

    const doc = await WorkflowMaster.create({
        workflowName: String(payload.workflowName).trim(),
        workflowCode,
        industryTemplateRef: payload.industryTemplateRef,
        description: payload.description || '',
        isActive: payload.isActive !== false,
        stages,
        createdBy: userId,
        updatedBy: userId,
    });

    await linkWorkflowToIndustryTemplate(doc, userId);
    return doc.populate('industryTemplateRef', 'templateName templateCode isActive');
}

export async function updateWorkflowMaster(id, payload, userId) {
    const doc = await WorkflowMaster.findById(id);
    if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Workflow not found');

    const prevTemplateId = doc.industryTemplateRef;

    if (payload.industryTemplateRef && String(payload.industryTemplateRef) !== String(doc.industryTemplateRef)) {
        const template = await IndustryTemplate.findById(payload.industryTemplateRef);
        if (!template) throw new ApiError(httpStatus.BAD_REQUEST, 'Industry template not found');
        doc.industryTemplateRef = payload.industryTemplateRef;
    }

    if (payload.workflowName !== undefined) doc.workflowName = String(payload.workflowName).trim();
    if (payload.description !== undefined) doc.description = payload.description || '';
    if (payload.isActive !== undefined) doc.isActive = !!payload.isActive;
    if (payload.workflowCode !== undefined && payload.workflowCode) {
        doc.workflowCode = await ensureUniqueWorkflowCode(
            String(payload.workflowCode).trim().toUpperCase(),
            doc._id,
        );
    }
    if (payload.stages !== undefined) {
        doc.stages = normalizeStages(payload.stages);
    }

    doc.updatedBy = userId;
    await doc.save();

    if (prevTemplateId && String(prevTemplateId) !== String(doc.industryTemplateRef)) {
        await unlinkWorkflowFromTemplate(prevTemplateId, doc._id, userId);
    }
    await linkWorkflowToIndustryTemplate(doc, userId);

    return doc.populate('industryTemplateRef', 'templateName templateCode isActive');
}

export async function reorderWorkflowStages(id, stages, userId) {
    const doc = await WorkflowMaster.findById(id);
    if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Workflow not found');

    doc.stages = normalizeStages(stages);
    doc.updatedBy = userId;
    await doc.save();
    await linkWorkflowToIndustryTemplate(doc, userId);
    return doc.populate('industryTemplateRef', 'templateName templateCode isActive');
}

export async function toggleWorkflowMasterActive(id, userId) {
    const doc = await WorkflowMaster.findById(id);
    if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Workflow not found');
    doc.isActive = !doc.isActive;
    doc.updatedBy = userId;
    await doc.save();
    if (doc.isActive) {
        await linkWorkflowToIndustryTemplate(doc, userId);
    } else {
        await unlinkWorkflowFromTemplate(doc.industryTemplateRef, doc._id, userId);
    }
    return doc.populate('industryTemplateRef', 'templateName templateCode isActive');
}

export async function deleteWorkflowMaster(id, userId) {
    const doc = await WorkflowMaster.findById(id);
    if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Workflow not found');
    await unlinkWorkflowFromTemplate(doc.industryTemplateRef, doc._id, userId);
    await WorkflowMaster.findByIdAndDelete(id);
    return { deleted: true, _id: id };
}

export {
    WORKFLOW_STAGE_TYPES,
    WORKFLOW_STAGE_TYPE_LABELS,
    WORKFLOW_STAGE_PRESETS,
    emptyStage,
} from '../constants/workflowMaster.constants.js';
