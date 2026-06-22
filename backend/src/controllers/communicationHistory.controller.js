import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import * as historyService from '../services/communicationHistory.service.js';

const companyId = (req) => {
    if (!req.companyId) throw new ApiError(400, 'Company context required');
    return req.companyId;
};

export const listHistory = asyncHandler(async (req, res) => {
    const data = await historyService.listHistory(companyId(req), req.query);
    res.send(new ApiResponse(200, data));
});

export const getHistoryEntry = asyncHandler(async (req, res) => {
    const doc = await historyService.getHistoryEntry(companyId(req), req.params.id);
    if (!doc) throw new ApiError(404, 'History entry not found');
    res.send(new ApiResponse(200, doc));
});
