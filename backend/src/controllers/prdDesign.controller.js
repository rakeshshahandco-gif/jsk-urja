import PrdDesign from '../models/prdDesign.model.js';
import { logPrdAudit } from '../utils/prdAuditLogger.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';

export const createPrdDesign = asyncHandler(async (req, res) => {
    req.body.changedBy = req.user.id;
    
    if (req.files && req.files.length > 0) {
        req.body.attachments = req.files.map(file => ({
            filename: file.originalname,
            url: `/uploads/prd/${file.filename}`,
            mimetype: file.mimetype,
            size: file.size
        }));
    }

    const design = await PrdDesign.create(req.body);
    await logPrdAudit(design._id, 'PrdDesign', 'Create', req.user.id, null, req.body, req.ip);
    
    await design.populate([{ path: 'changedBy', select: 'name' }, { path: 'checkedBy', select: 'name' }]);
    res.status(201).json(new ApiResponse(201, design, 'Design logged successfully'));
});

export const getPrdDesigns = asyncHandler(async (req, res) => {
    const { projectId } = req.query;
    let query = {};
    if (projectId) query.projectId = projectId;

    const designs = await PrdDesign.find(query)
        .populate('changedBy checkedBy approvedBy', 'name')
        .sort({ date: -1, createdAt: -1 });

    res.status(200).json(new ApiResponse(200, designs, 'Designs fetched successfully'));
});

export const updatePrdDesign = asyncHandler(async (req, res) => {
    const design = await PrdDesign.findById(req.params.id);
    if (!design) throw new ApiError(404, 'Design not found');

    const oldData = design.toObject();

    if (req.files && req.files.length > 0) {
        const newAttachments = req.files.map(file => ({
            filename: file.originalname,
            url: `/uploads/prd/${file.filename}`,
            mimetype: file.mimetype,
            size: file.size
        }));
        req.body.attachments = [...(design.attachments || []), ...newAttachments];
    }

    Object.assign(design, req.body);
    await design.save();

    await logPrdAudit(design._id, 'PrdDesign', 'Update', req.user.id, oldData, req.body, req.ip);

    await design.populate('changedBy checkedBy approvedBy', 'name');
    res.status(200).json(new ApiResponse(200, design, 'Design updated successfully'));
});

export const deletePrdDesign = asyncHandler(async (req, res) => {
    const design = await PrdDesign.findById(req.params.id);
    if (!design) throw new ApiError(404, 'Design not found');

    await logPrdAudit(design._id, 'PrdDesign', 'Delete', req.user.id, design.toObject(), null, req.ip);
    
    await design.deleteOne();
    res.status(200).json(new ApiResponse(200, null, 'Design deleted successfully'));
});
