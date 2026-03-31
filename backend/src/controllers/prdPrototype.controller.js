import PrdPrototype from '../models/prdPrototype.model.js';
import { logPrdAudit } from '../utils/prdAuditLogger.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';

export const createPrdPrototype = asyncHandler(async (req, res) => {
    req.body.assembledBy = req.user.id;
    
    const prototype = await PrdPrototype.create(req.body);
    await logPrdAudit(prototype._id, 'PrdPrototype', 'Create', req.user.id, null, req.body, req.ip);
    
    await prototype.populate('assembledBy', 'name');
    res.status(201).json(new ApiResponse(201, prototype, 'Prototype build logged successfully'));
});

export const getPrdPrototypes = asyncHandler(async (req, res) => {
    const { projectId } = req.query;
    let query = {};
    if (projectId) query.projectId = projectId;

    const prototypes = await PrdPrototype.find(query)
        .populate('assembledBy', 'name')
        .sort({ buildDate: -1, createdAt: -1 });

    res.status(200).json(new ApiResponse(200, prototypes, 'Prototypes fetched successfully'));
});

export const updatePrdPrototype = asyncHandler(async (req, res) => {
    const prototype = await PrdPrototype.findById(req.params.id);
    if (!prototype) throw new ApiError(404, 'Prototype not found');

    const oldData = prototype.toObject();

    Object.assign(prototype, req.body);
    await prototype.save();

    await logPrdAudit(prototype._id, 'PrdPrototype', 'Update', req.user.id, oldData, req.body, req.ip);

    await prototype.populate('assembledBy', 'name');
    res.status(200).json(new ApiResponse(200, prototype, 'Prototype updated successfully'));
});

export const deletePrdPrototype = asyncHandler(async (req, res) => {
    const prototype = await PrdPrototype.findById(req.params.id);
    if (!prototype) throw new ApiError(404, 'Prototype not found');

    await logPrdAudit(prototype._id, 'PrdPrototype', 'Delete', req.user.id, prototype.toObject(), null, req.ip);
    
    await prototype.deleteOne();
    res.status(200).json(new ApiResponse(200, null, 'Prototype deleted successfully'));
});
