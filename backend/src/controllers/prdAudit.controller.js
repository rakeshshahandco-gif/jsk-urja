import mongoose from 'mongoose';
import PrdAudit from '../models/prdAudit.model.js';
import PrdProject from '../models/prdProject.model.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';

// Custom logic to get ALL audits connected to a specific Project (combining Designs, Exams, Issues, etc.)
export const getProjectAudits = asyncHandler(async (req, res) => {
    const { projectId } = req.params;

    // Fetch the project to establish existence
    const project = await PrdProject.findById(projectId);
    if (!project) throw new ApiError(404, 'Project not found');

    // Retrieve all entity IDs tied to this project from all relevant collections
    const [
        components, designs, prototypes, tests, issues, changes, approvals
    ] = await Promise.all([
        mongoose.model('PrdComponent').find({ projectId }).select('_id'),
        mongoose.model('PrdDesign').find({ projectId }).select('_id'),
        mongoose.model('PrdPrototype').find({ projectId }).select('_id'),
        mongoose.model('PrdTestReport').find({ projectId }).select('_id'),
        mongoose.model('PrdIssue').find({ projectId }).select('_id'),
        mongoose.model('PrdChangeLog').find({ projectId }).select('_id'),
        mongoose.model('PrdApproval').find({ projectId }).select('_id'),
    ]);

    const allEntityIds = [
        projectId, // The project itself
        ...components.map(c => c._id),
        ...designs.map(d => d._id),
        ...prototypes.map(p => p._id),
        ...tests.map(t => t._id),
        ...issues.map(i => i._id),
        ...changes.map(c => c._id),
        ...approvals.map(a => a._id),
    ];

    const audits = await PrdAudit.find({ entityId: { $in: allEntityIds } })
        .populate('changedBy', 'name')
        .sort({ date: -1 })
        .limit(100); // Prevent massive payloads

    res.status(200).json(new ApiResponse(200, audits, 'Project audits fetched successfully'));
});

export const getSystemAudits = asyncHandler(async (req, res) => {
    const audits = await PrdAudit.find({})
        .populate('changedBy', 'name')
        .sort({ date: -1 })
        .limit(200);

    res.status(200).json(new ApiResponse(200, audits, 'System audits fetched successfully'));
});
