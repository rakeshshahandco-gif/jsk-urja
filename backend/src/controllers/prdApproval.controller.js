import PrdApproval from '../models/prdApproval.model.js';
import { logPrdAudit } from '../utils/prdAuditLogger.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';

export const createApproval = asyncHandler(async (req, res) => {
    const approval = await PrdApproval.create(req.body);
    
    await logPrdAudit(approval._id, 'PrdApproval', 'Create', req.user.id, null, req.body, req.ip);
    
    res.status(201).json(new ApiResponse(201, approval, 'Approval workflow created successfully'));
});

export const getApprovals = asyncHandler(async (req, res) => {
    const { projectId } = req.query;
    let query = {};
    if (projectId) query.projectId = projectId;

    const approvals = await PrdApproval.find(query).sort({ date: -1, createdAt: -1 });
    res.status(200).json(new ApiResponse(200, approvals, 'Approvals fetched successfully'));
});

export const updateApproval = asyncHandler(async (req, res) => {
    const approval = await PrdApproval.findById(req.params.id);
    if (!approval) throw new ApiError(404, 'Approval record not found');

    const oldData = approval.toObject();

    // Extracting specific workflow approvals
    const { qaStatus, qaRemarks, rdStatus, rdRemarks, managementStatus, managementRemarks, locked } = req.body;
    
    let shouldLock = false;

    // Apply QA Approval logic
    if (qaStatus && oldData.qaApproval?.status !== qaStatus) {
        approval.qaApproval = {
            status: qaStatus,
            by: req.user.id,
            date: new Date(),
            remarks: qaRemarks || ''
        };
    }

    // Apply R&D Approval logic
    if (rdStatus && oldData.rdApproval?.status !== rdStatus) {
        approval.rdApproval = {
            status: rdStatus,
            by: req.user.id,
            date: new Date(),
            remarks: rdRemarks || ''
        };
    }

    // Apply Management Approval logic
    if (managementStatus && oldData.managementApproval?.status !== managementStatus) {
        approval.managementApproval = {
            status: managementStatus,
            by: req.user.id,
            date: new Date(),
            remarks: managementRemarks || ''
        };
    }

    // Auto-resolve final status
    if (approval.qaApproval?.status === 'Approved' && 
        approval.rdApproval?.status === 'Approved' && 
        approval.managementApproval?.status === 'Approved') {
        approval.finalStatus = 'Released into Production';
        shouldLock = true;
    } else if (
        approval.qaApproval?.status === 'Rejected' || 
        approval.rdApproval?.status === 'Rejected' || 
        approval.managementApproval?.status === 'Rejected'
    ) {
        approval.finalStatus = 'Rejected/Hold';
    } else {
        approval.finalStatus = 'Pending Signatures';
    }

    if (locked !== undefined) approval.locked = locked;
    if (shouldLock) approval.locked = true;

    await approval.save();

    await logPrdAudit(approval._id, 'PrdApproval', 'Update', req.user.id, oldData, approval.toObject(), req.ip);

    // Populate after saving
    await approval.populate([
        { path: 'qaApproval.by', select: 'name' },
        { path: 'rdApproval.by', select: 'name' },
        { path: 'managementApproval.by', select: 'name' }
    ]);

    res.status(200).json(new ApiResponse(200, approval, 'Approval status updated successfully'));
});
