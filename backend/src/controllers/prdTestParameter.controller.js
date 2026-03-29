import PrdTestParameter from '../models/prdTestParameter.model.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { logPrdAudit } from '../middlewares/prdAuth.middleware.js';

export const createParameter = asyncHandler(async (req, res) => {
    const { parameterName, productCategory } = req.body;
    
    if (!parameterName || !productCategory) {
        throw new ApiError(400, 'Parameter Name and Product Category are required');
    }

    const param = await PrdTestParameter.create(req.body);
    await logPrdAudit(req, param._id, 'PrdTestParameter', 'Create', [], `Test parameter ${parameterName} created`);

    res.status(201).json(new ApiResponse(201, param, 'Test parameter created successfully'));
});

export const getParameters = asyncHandler(async (req, res) => {
    const { productCategory, isActive } = req.query;
    const query = {};

    if (productCategory) query.productCategory = productCategory;
    if (isActive !== undefined) query.isActive = isActive === 'true';

    const parameters = await PrdTestParameter.find(query).sort({ sequenceNo: 1, parameterName: 1 });
    
    res.json(new ApiResponse(200, parameters, 'Test parameters fetched'));
});

export const updateParameter = asyncHandler(async (req, res) => {
    const param = await PrdTestParameter.findById(req.params.id);
    if (!param) throw new ApiError(404, 'Parameter not found');

    const updates = req.body;
    let changes = [];

    Object.keys(updates).forEach(key => {
        if (updates[key] !== undefined && key !== 'dynamicPoints' && String(param[key]) !== String(updates[key])) {
            changes.push({ field: key, oldValue: String(param[key]), newValue: String(updates[key]) });
            param[key] = updates[key];
        }
    });

    if (updates.dynamicPoints) {
        param.dynamicPoints = updates.dynamicPoints;
        changes.push({ field: 'dynamicPoints', oldValue: 'Updated', newValue: 'Updated' });
    }

    await param.save();

    if (changes.length > 0) {
        await logPrdAudit(req, param._id, 'PrdTestParameter', 'Update', changes, 'Parameter config updated');
    }

    res.json(new ApiResponse(200, param, 'Test parameter updated successfully'));
});

export const deleteParameter = asyncHandler(async (req, res) => {
    const param = await PrdTestParameter.findById(req.params.id);
    if (!param) throw new ApiError(404, 'Parameter not found');

    await param.deleteOne();
    await logPrdAudit(req, param._id, 'PrdTestParameter', 'Delete', [], `Parameter ${param.parameterName} deleted`);

    res.json(new ApiResponse(200, null, 'Test parameter deleted'));
});
