import { Notification } from '../models/notification.model.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';

// 获取当前用户的通知
export const getMyNotifications = asyncHandler(async (req, res) => {
    const notifications = await Notification.find({ recipient: req.user._id })
        .populate('actor', 'name avatar')
        .populate('task', 'title')
        .sort({ createdAt: -1 })
        .limit(50);

    const unreadCount = await Notification.countDocuments({
        recipient: req.user._id,
        isRead: false
    });

    res.json(new ApiResponse(200, { notifications, unreadCount }, 'Notifications fetched successfully'));
});

// 标记通知为已读
export const markAsRead = asyncHandler(async (req, res) => {
    const { notificationId } = req.params;

    const notification = await Notification.findOneAndUpdate(
        { _id: notificationId, recipient: req.user._id },
        { isRead: true },
        { new: true }
    );

    if (!notification) {
        throw new ApiError(404, 'Notification not found');
    }

    res.json(new ApiResponse(200, notification, 'Notification marked as read'));
});

// 标记所有通知为已读
export const markAllAsRead = asyncHandler(async (req, res) => {
    await Notification.updateMany(
        { recipient: req.user._id, isRead: false },
        { isRead: true }
    );

    res.json(new ApiResponse(200, null, 'All notifications marked as read'));
});

// Helper for other controllers to create notifications
export const createNotification = async ({ recipient, actor, task, type, title, message, metadata = {} }) => {
    try {
        // Don't notify the actor themselves
        if (recipient.toString() === actor.toString()) return null;

        return await Notification.create({
            recipient,
            actor,
            task,
            type,
            title,
            message,
            metadata
        });
    } catch (error) {
        console.error('Error creating notification:', error);
        return null;
    }
};
