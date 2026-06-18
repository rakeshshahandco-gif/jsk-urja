import httpStatus from 'http-status';
import { asyncHandler } from '../utils/asyncHandler.js';
import * as companyWorkflowAssignmentService from '../services/companyWorkflowAssignment.service.js';

const resolveUserId = (user) => user?._id || user?.id || null;

export const getCompanyWorkflowAssignment = asyncHandler(async (req, res) => {
    const data = await companyWorkflowAssignmentService.resolveCompanyWorkflowAssignment(req.params.companyId);
    res.json({ success: true, data });
});

export const assignCompanyWorkflow = asyncHandler(async (req, res) => {
    const data = await companyWorkflowAssignmentService.assignCompanyWorkflow(
        req.params.companyId,
        req.body,
        resolveUserId(req.user),
    );
    res.json({ success: true, data, message: 'Workflow assignment saved' });
});

export const listCompanyWorkflowOptions = asyncHandler(async (req, res) => {
    const data = await companyWorkflowAssignmentService.listWorkflowsForCompanyTemplate(
        req.params.companyId,
        req.query.industryTemplateRef || null,
    );
    res.json({ success: true, data });
});
