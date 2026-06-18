import httpStatus from 'http-status';
import { asyncHandler } from '../utils/asyncHandler.js';
import * as workflowProductionLotService from '../services/workflowProductionLot.service.js';

const resolveUserId = (user) => user?._id || user?.id || null;

export const listWorkflowProductionLots = asyncHandler(async (req, res) => {
    const data = await workflowProductionLotService.listWorkflowProductionLots({
        companyId: req.query.companyId,
        lotStatus: req.query.lotStatus,
        search: req.query.search,
        limit: req.query.limit,
    });
    res.json({ success: true, data });
});

export const getWorkflowProductionLot = asyncHandler(async (req, res) => {
    const data = await workflowProductionLotService.getWorkflowProductionLotById(req.params.id);
    res.json({ success: true, data });
});

export const getWorkflowPreview = asyncHandler(async (req, res) => {
    const data = await workflowProductionLotService.getWorkflowPreviewForCompany(req.params.companyId);
    res.json({ success: true, data });
});

export const createWorkflowProductionLot = asyncHandler(async (req, res) => {
    const data = await workflowProductionLotService.createWorkflowProductionLot(req.body, resolveUserId(req.user));
    res.status(httpStatus.CREATED).json({ success: true, data, message: 'Production lot created' });
});

export const startWorkflowProductionStage = asyncHandler(async (req, res) => {
    const data = await workflowProductionLotService.startWorkflowProductionStage(
        req.params.id,
        req.params.stageIndex,
        req.body,
        resolveUserId(req.user),
    );
    res.json({ success: true, data, message: 'Stage started' });
});

export const completeWorkflowProductionStage = asyncHandler(async (req, res) => {
    const data = await workflowProductionLotService.completeWorkflowProductionStage(
        req.params.id,
        req.params.stageIndex,
        req.body,
        resolveUserId(req.user),
    );
    res.json({ success: true, data, message: 'Stage completed' });
});

export const skipWorkflowProductionStage = asyncHandler(async (req, res) => {
    const data = await workflowProductionLotService.skipWorkflowProductionStage(
        req.params.id,
        req.params.stageIndex,
        req.body,
        resolveUserId(req.user),
    );
    res.json({ success: true, data, message: 'Stage skipped' });
});

export const uploadStageAttachment = asyncHandler(async (req, res) => {
    if (!req.file) {
        return res.status(httpStatus.BAD_REQUEST).json({ success: false, message: 'No file uploaded' });
    }
    const attachmentUrl = `/uploads/workflow-production-lots/${req.file.filename}`;
    res.json({
        success: true,
        data: {
            attachmentUrl,
            attachmentName: req.file.originalname || req.file.filename,
        },
    });
});
