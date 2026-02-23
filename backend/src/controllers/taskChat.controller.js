import httpStatus from 'http-status';
import pick from '../utils/pick.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import TaskChatMessage from '../models/taskChatMessage.model.js';
import { Task } from '../models/task.model.js';
import { GroupMember } from '../models/groupMember.model.js';

const getChatRooms = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const userRole = req.user.role;

    let query = {};

    if (userRole !== 'admin') {
        const userGroups = await GroupMember.find({ user: userId }).select('group');
        const groupIds = userGroups.map((g) => g.group);

        query = {
            $or: [
                { createdBy: userId },
                { assigneeIds: userId },
                { assignToAll: true },
                { assignedGroupId: { $in: groupIds } }
            ]
        };
    }

    const tasks = await Task.find(query)
        .select('title status priority dueDate createdAt')
        .sort({ updatedAt: -1 })
        .limit(50)
        .lean();

    // Enhancement: Fetch latest message for each task
    const chatRooms = await Promise.all(tasks.map(async (task) => {
        const lastMessage = await TaskChatMessage.findOne({ taskId: task._id })
            .sort({ createdAt: -1 })
            .populate('senderId', 'name')
            .lean();

        return {
            ...task,
            lastMessage: lastMessage || null
        };
    }));

    res.send(new ApiResponse(httpStatus.OK, chatRooms, 'Chat rooms fetched successfully'));
});

const getMessages = asyncHandler(async (req, res) => {
    const { taskId } = req.params;
    const messages = await TaskChatMessage.find({ taskId })
        .populate('senderId', 'name username')
        .sort({ createdAt: 1 })
        .lean();

    res.send(new ApiResponse(httpStatus.OK, messages, 'Messages fetched successfully'));
});

const sendMessage = asyncHandler(async (req, res) => {
    const { taskId } = req.params;
    const { content, type = 'text', meta = {} } = req.body;

    const task = await Task.findById(taskId);
    if (!task) {
        throw new ApiError(httpStatus.NOT_FOUND, 'Task not found');
    }

    const message = await TaskChatMessage.create({
        taskId,
        senderId: req.user.id,
        content,
        type,
        meta
    });

    const populatedMessage = await message.populate('senderId', 'name username');

    res.status(httpStatus.CREATED).send(new ApiResponse(httpStatus.CREATED, populatedMessage, 'Message sent successfully'));
});

export default {
    getChatRooms,
    getMessages,
    sendMessage
};
