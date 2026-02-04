import pick from '../utils/pick.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import followupService from '../services/followup.service.js';

const catchAsync = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch((err) => next(err));
};

const createFollowup = catchAsync(async (req, res) => {
    const followup = await followupService.createFollowup(req.body);
    res.status(201).send(new ApiResponse(201, followup, 'Follow-up created successfully'));
});

const getFollowups = catchAsync(async (req, res) => {
    const filter = pick(req.query, ['customerId', 'priority']);
    const options = pick(req.query, ['sortBy', 'limit', 'page', 'upcoming']);
    const result = await followupService.queryFollowups(filter, options);
    res.send(new ApiResponse(200, result, 'Follow-ups fetched successfully'));
});

const getFollowup = catchAsync(async (req, res) => {
    const followup = await followupService.getFollowupById(req.params.followupId);
    if (!followup) {
        throw new ApiError(404, 'Follow-up not found');
    }
    res.send(new ApiResponse(200, followup));
});

const getFollowupsByCustomer = catchAsync(async (req, res) => {
    const followup = await followupService.getFollowupsByCustomer(req.params.customerId);
    if (!followup) {
        throw new ApiError(404, 'No follow-up found for this customer');
    }
    res.send(new ApiResponse(200, followup));
});

const getUpcomingFollowups = catchAsync(async (req, res) => {
    const followups = await followupService.getUpcomingFollowups();
    res.send(new ApiResponse(200, followups, 'Upcoming follow-ups fetched successfully'));
});

const updateFollowup = catchAsync(async (req, res) => {
    const followup = await followupService.updateFollowupById(req.params.followupId, req.body);
    res.send(new ApiResponse(200, followup, 'Follow-up updated successfully'));
});

const deleteFollowup = catchAsync(async (req, res) => {
    await followupService.deleteFollowupById(req.params.followupId);
    res.status(200).send(new ApiResponse(200, null, 'Follow-up deleted successfully'));
});

export default {
    createFollowup,
    getFollowups,
    getFollowup,
    getFollowupsByCustomer,
    getUpcomingFollowups,
    updateFollowup,
    deleteFollowup,
};
