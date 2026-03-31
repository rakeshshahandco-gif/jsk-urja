import PrdComponent from '../models/prdComponent.model.js';
import PrdAudit from '../models/prdAudit.model.js';
import { logPrdAudit } from '../utils/prdAuditLogger.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';

export const createPrdComponent = asyncHandler(async (req, res) => {
    req.body.enteredBy = req.user.id;
    const component = await PrdComponent.create(req.body);
    
    await logPrdAudit(component._id, 'PrdComponent', 'Create', req.user.id, null, req.body, req.ip);
    
    // Populate enteredBy for response
    await component.populate('enteredBy', 'name');
    res.status(201).json(new ApiResponse(201, component, 'Component research record created'));
});

export const getPrdComponents = asyncHandler(async (req, res) => {
    const { projectId } = req.query;
    let query = {};
    if (projectId) query.projectId = projectId;

    const components = await PrdComponent.find(query)
        .populate('enteredBy', 'name')
        .sort({ date: -1, createdAt: -1 });

    res.status(200).json(new ApiResponse(200, components, 'Components fetched successfully'));
});

export const getPrdComponent = asyncHandler(async (req, res) => {
    const component = await PrdComponent.findById(req.params.id)
        .populate('enteredBy', 'name');
        
    if (!component) {
        throw new ApiError(404, 'Component research record not found');
    }
    res.status(200).json(new ApiResponse(200, component, 'Component fetched successfully'));
});

export const updatePrdComponent = asyncHandler(async (req, res) => {
    const component = await PrdComponent.findById(req.params.id);
    if (!component) throw new ApiError(404, 'Component research record not found');

    const oldData = component.toObject();
    
    Object.assign(component, req.body);
    await component.save();

    await logPrdAudit(component._id, 'PrdComponent', 'Update', req.user.id, oldData, req.body, req.ip);

    await component.populate('enteredBy', 'name');
    res.status(200).json(new ApiResponse(200, component, 'Component updated successfully'));
});

export const deletePrdComponent = asyncHandler(async (req, res) => {
    const component = await PrdComponent.findById(req.params.id);
    if (!component) throw new ApiError(404, 'Component research record not found');

    await logPrdAudit(component._id, 'PrdComponent', 'Delete', req.user.id, component.toObject(), null, req.ip);
    
    await component.deleteOne();
    res.status(200).json(new ApiResponse(200, null, 'Component deleted successfully'));
});
