import httpStatus from 'http-status';
import { WeChatFollowUp } from '../models/weChatFollowUp.model.js';
import { Task } from '../models/task.model.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const createFollowUp = asyncHandler(async (req, res) => {
    let taskId = null;

    // If reminderRequired is true, create a Task in standard CRM Task collection
    if (req.body.reminderRequired && req.body.nextFollowUpDate) {
        const task = await Task.create({
            title: `Follow-up: ${req.body.followUpType} - ${req.body.notes.substring(0, 50)}...`,
            description: `WeChat Follow-up\nType: ${req.body.followUpType}\nNotes: ${req.body.notes}`,
            dueDate: req.body.nextFollowUpDate,
            priority: 'MEDIUM',
            status: 'OPEN',
            assignmentMode: 'SINGLE',
            assigneeIds: [req.body.assignedTo || req.user._id],
            createdBy: req.user._id
        });
        taskId = task._id;
    }

    const followUp = await WeChatFollowUp.create({
        ...req.body,
        taskId,
        createdBy: req.user._id
    });

    res.status(httpStatus.CREATED).send(new ApiResponse(httpStatus.CREATED, followUp, 'Follow-up created successfully'));
});

export const getFollowUps = asyncHandler(async (req, res) => {
    const { referenceType, referenceId } = req.query;
    
    let query = {};
    if (referenceType) query.referenceType = referenceType;
    if (referenceId) query.referenceId = referenceId;

    const followUps = await WeChatFollowUp.find(query)
        .populate('assignedTo', 'name')
        .populate('createdBy', 'name')
        .sort('-followUpDate');
        
    res.send(new ApiResponse(httpStatus.OK, followUps));
});

export const updateFollowUp = asyncHandler(async (req, res) => {
    const followUp = await WeChatFollowUp.findByIdAndUpdate(req.params.followUpId, req.body, { new: true });
    if (!followUp) throw new ApiError(httpStatus.NOT_FOUND, 'Follow-up not found');
    res.send(new ApiResponse(httpStatus.OK, followUp, 'Follow-up updated'));
});

export const deleteFollowUp = asyncHandler(async (req, res) => {
    await WeChatFollowUp.findByIdAndDelete(req.params.followUpId);
    res.send(new ApiResponse(httpStatus.OK, null, 'Follow-up deleted'));
});
