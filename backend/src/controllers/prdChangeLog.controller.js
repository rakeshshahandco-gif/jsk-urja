import PrdChangeLog from '../models/prdChangeLog.model.js';
import { logPrdAudit } from '../utils/prdAuditLogger.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';

export const createChangeLog = asyncHandler(async (req, res) => {
    req.body.requestedBy = req.user.id; // Initially requested by the active session user

    if (req.files && req.files.length > 0) {
        req.body.attachments = req.files.map(file => ({
            filename: file.originalname,
            url: `/uploads/prd/${file.filename}`,
            mimetype: file.mimetype,
            size: file.size
        }));
    }

    const change = await PrdChangeLog.create(req.body);
    
    await logPrdAudit(change._id, 'PrdChangeLog', 'Create', req.user.id, null, req.body, req.ip);
    
    await change.populate('requestedBy changedBy approvedBy testRef', 'name revisionNo testDate');
    res.status(201).json(new ApiResponse(201, change, 'Engineering change log created successfully'));
});

export const getChangeLogs = asyncHandler(async (req, res) => {
    const { projectId } = req.query;
    let query = {};
    if (projectId) query.projectId = projectId;

    const changes = await PrdChangeLog.find(query)
        .populate('requestedBy changedBy approvedBy', 'name')
        .populate('testRef', 'testDate testStatus testType')
        .sort({ changeDate: -1, createdAt: -1 });

    res.status(200).json(new ApiResponse(200, changes, 'Change logs fetched successfully'));
});

export const getChangeLog = asyncHandler(async (req, res) => {
    const change = await PrdChangeLog.findById(req.params.id)
        .populate('requestedBy changedBy approvedBy', 'name')
        .populate('testRef');
        
    if (!change) throw new ApiError(404, 'Change log record not found');
    res.status(200).json(new ApiResponse(200, change, 'Change log fetched successfully'));
});

export const updateChangeLog = asyncHandler(async (req, res) => {
    const change = await PrdChangeLog.findById(req.params.id);
    if (!change) throw new ApiError(404, 'Change log record not found');

    const oldData = change.toObject();

    if (req.files && req.files.length > 0) {
        const newAttachments = req.files.map(file => ({
            filename: file.originalname,
            url: `/uploads/prd/${file.filename}`,
            mimetype: file.mimetype,
            size: file.size
        }));
        req.body.attachments = [...(change.attachments || []), ...newAttachments];
    }

    Object.assign(change, req.body);
    await change.save();

    await logPrdAudit(change._id, 'PrdChangeLog', 'Update', req.user.id, oldData, req.body, req.ip);

    await change.populate('requestedBy changedBy approvedBy testRef', 'name testStatus');
    res.status(200).json(new ApiResponse(200, change, 'Change log updated successfully'));
});

export const deleteChangeLog = asyncHandler(async (req, res) => {
    const change = await PrdChangeLog.findById(req.params.id);
    if (!change) throw new ApiError(404, 'Change log record not found');

    await logPrdAudit(change._id, 'PrdChangeLog', 'Delete', req.user.id, change.toObject(), null, req.ip);
    
    await change.deleteOne();
    res.status(200).json(new ApiResponse(200, null, 'Change log deleted successfully'));
});
