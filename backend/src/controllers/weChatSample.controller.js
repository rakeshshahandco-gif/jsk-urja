import httpStatus from 'http-status';
import { WeChatSample } from '../models/weChatSample.model.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import pick from '../utils/pick.js';

export const createSample = asyncHandler(async (req, res) => {
    const sample = await WeChatSample.create({
        ...req.body,
        createdBy: req.user._id
    });
    res.status(httpStatus.CREATED).send(new ApiResponse(httpStatus.CREATED, sample, 'Sample record created successfully'));
});

export const getSamples = asyncHandler(async (req, res) => {
    const filter = pick(req.query, ['productId', 'contactId', 'groupId', 'testingStatus']);
    const options = pick(req.query, ['search']);
    
    let query = { ...filter };
    if (options.search) {
        const escapedSearch = options.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const searchRegex = { $regex: escapedSearch, $options: 'i' };
        query.$or = [
            { courierName: searchRegex },
            { trackingNumber: searchRegex },
            { testRemarks: searchRegex }
        ];
    }

    const samples = await WeChatSample.find(query)
        .populate('productId', 'productName productCode chineseProductName')
        .populate('contactId', 'weChatDisplayName companyName weChatId')
        .populate('groupId', 'groupName')
        .sort('-orderedDate');
        
    res.send(new ApiResponse(httpStatus.OK, samples));
});

export const getSample = asyncHandler(async (req, res) => {
    const sample = await WeChatSample.findById(req.params.sampleId)
        .populate('productId')
        .populate('contactId')
        .populate('groupId');
        
    if (!sample) throw new ApiError(httpStatus.NOT_FOUND, 'Sample not found');
    res.send(new ApiResponse(httpStatus.OK, sample));
});

export const updateSample = asyncHandler(async (req, res) => {
    const sample = await WeChatSample.findByIdAndUpdate(req.params.sampleId, req.body, { new: true });
    if (!sample) throw new ApiError(httpStatus.NOT_FOUND, 'Sample not found');
    res.send(new ApiResponse(httpStatus.OK, sample, 'Sample updated'));
});

export const deleteSample = asyncHandler(async (req, res) => {
    await WeChatSample.findByIdAndDelete(req.params.sampleId);
    res.send(new ApiResponse(httpStatus.OK, null, 'Sample deleted'));
});
