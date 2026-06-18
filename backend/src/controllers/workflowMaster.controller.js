import httpStatus from 'http-status';
import { asyncHandler } from '../utils/asyncHandler.js';
import * as workflowMasterService from '../services/workflowMaster.service.js';

const resolveUserId = (user) => user?._id || user?.id || null;

export const listWorkflowMasters = asyncHandler(async (req, res) => {
    const data = await workflowMasterService.listWorkflowMasters(req.query);
    res.json({ success: true, data });
});

export const getWorkflowMaster = asyncHandler(async (req, res) => {
    const data = await workflowMasterService.getWorkflowMasterById(req.params.id);
    res.json({ success: true, data });
});

export const getWorkflowMasterByTemplate = asyncHandler(async (req, res) => {
    const data = await workflowMasterService.getWorkflowMasterByTemplate(req.params.templateId);
    res.json({ success: true, data });
});

export const createWorkflowMaster = asyncHandler(async (req, res) => {
    const data = await workflowMasterService.createWorkflowMaster(req.body, resolveUserId(req.user));
    res.status(httpStatus.CREATED).json({ success: true, data, message: 'Workflow created' });
});

export const updateWorkflowMaster = asyncHandler(async (req, res) => {
    const data = await workflowMasterService.updateWorkflowMaster(
        req.params.id,
        req.body,
        resolveUserId(req.user),
    );
    res.json({ success: true, data, message: 'Workflow updated' });
});

export const reorderWorkflowStages = asyncHandler(async (req, res) => {
    const data = await workflowMasterService.reorderWorkflowStages(
        req.params.id,
        req.body.stages,
        resolveUserId(req.user),
    );
    res.json({ success: true, data, message: 'Stages reordered' });
});

export const toggleWorkflowMasterActive = asyncHandler(async (req, res) => {
    const data = await workflowMasterService.toggleWorkflowMasterActive(
        req.params.id,
        resolveUserId(req.user),
    );
    res.json({
        success: true,
        data,
        message: `Workflow ${data.isActive ? 'activated' : 'deactivated'}`,
    });
});

export const deleteWorkflowMaster = asyncHandler(async (req, res) => {
    const data = await workflowMasterService.deleteWorkflowMaster(
        req.params.id,
        resolveUserId(req.user),
    );
    res.json({ success: true, data, message: 'Workflow deleted' });
});

export const getWorkflowRegistry = asyncHandler(async (req, res) => {
    res.json({
        success: true,
        data: {
            stageTypes: workflowMasterService.WORKFLOW_STAGE_TYPES,
            stageTypeLabels: workflowMasterService.WORKFLOW_STAGE_TYPE_LABELS,
            presets: workflowMasterService.WORKFLOW_STAGE_PRESETS,
        },
    });
});
