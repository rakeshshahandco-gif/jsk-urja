import PrdIssue from '../models/prdIssue.model.js';
import { logPrdAudit } from '../utils/prdAuditLogger.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';

export const createIssue = asyncHandler(async (req, res) => {
    req.body.foundBy = req.user.id;

    if (req.files && req.files.length > 0) {
        req.body.attachments = req.files.map(file => ({
            filename: file.originalname,
            url: `/uploads/prd/${file.filename}`,
            mimetype: file.mimetype,
            size: file.size
        }));
    }

    const issue = await PrdIssue.create(req.body);
    
    await logPrdAudit(issue._id, 'PrdIssue', 'Create', req.user.id, null, req.body, req.ip);
    
    await issue.populate('foundBy assignedTo', 'name');
    res.status(201).json(new ApiResponse(201, issue, 'Issue logged successfully'));
});

export const getIssues = asyncHandler(async (req, res) => {
    const { projectId } = req.query;
    let query = {};
    if (projectId) query.projectId = projectId;

    const issues = await PrdIssue.find(query)
        .populate('foundBy assignedTo', 'name')
        .sort({ date: -1, createdAt: -1 });

    res.status(200).json(new ApiResponse(200, issues, 'Issues fetched successfully'));
});

export const getIssue = asyncHandler(async (req, res) => {
    const issue = await PrdIssue.findById(req.params.id)
        .populate('foundBy assignedTo', 'name');
    if (!issue) throw new ApiError(404, 'Issue not found');
    res.status(200).json(new ApiResponse(200, issue, 'Issue fetched successfully'));
});

export const updateIssue = asyncHandler(async (req, res) => {
    const issue = await PrdIssue.findById(req.params.id);
    if (!issue) throw new ApiError(404, 'Issue not found');

    const oldData = issue.toObject();

    if (req.files && req.files.length > 0) {
        const newAttachments = req.files.map(file => ({
            filename: file.originalname,
            url: `/uploads/prd/${file.filename}`,
            mimetype: file.mimetype,
            size: file.size
        }));
        req.body.attachments = [...(issue.attachments || []), ...newAttachments];
    }

    Object.assign(issue, req.body);
    await issue.save();

    await logPrdAudit(issue._id, 'PrdIssue', 'Update', req.user.id, oldData, req.body, req.ip);

    await issue.populate('foundBy assignedTo', 'name');
    res.status(200).json(new ApiResponse(200, issue, 'Issue updated successfully'));
});

export const deleteIssue = asyncHandler(async (req, res) => {
    const issue = await PrdIssue.findById(req.params.id);
    if (!issue) throw new ApiError(404, 'Issue not found');

    await logPrdAudit(issue._id, 'PrdIssue', 'Delete', req.user.id, issue.toObject(), null, req.ip);
    
    await issue.deleteOne();
    res.status(200).json(new ApiResponse(200, null, 'Issue deleted successfully'));
});
