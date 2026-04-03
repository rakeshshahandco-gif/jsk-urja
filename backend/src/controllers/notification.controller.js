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

    const unreadCount = await Notification.countDocuments({ recipient: req.user._id, isRead: false });
    const io = getIO();
    io.to(`user:${req.user._id}`).emit('notification:sync', { unreadCount });
    io.to(`user_${req.user._id}`).emit('notification:sync', { unreadCount });

    res.json(new ApiResponse(200, { notification, unreadCount }, 'Notification marked as read'));
});

// 标记所有通知为已读
export const markAllAsRead = asyncHandler(async (req, res) => {
    await Notification.updateMany(
        { recipient: req.user._id, isRead: false },
        { isRead: true }
    );

    const io = getIO();
    io.to(`user:${req.user._id}`).emit('notification:sync', { unreadCount: 0 });
    io.to(`user_${req.user._id}`).emit('notification:sync', { unreadCount: 0 });

    res.json(new ApiResponse(200, null, 'All notifications marked as read'));
});

import { getIO } from '../config/socket.js';

// Helper for other controllers to create notifications
export const createNotification = async ({ recipient, actor, task, type, title, message, metadata = {} }) => {
    try {
        // Don't notify if recipient or actor is missing
        if (!recipient || !actor) return null;
        
        // Don't notify the actor themselves
        if (recipient.toString() === actor.toString()) return null;

        const notification = await Notification.create({
            recipient,
            actor,
            task,
            type,
            title,
            message,
            metadata
        });

        // Populate actor info for the client-side toast UI
        const populatedNotification = await Notification.findById(notification._id)
            .populate('actor', 'name avatar username')
            .populate('task', 'title');

        // Emit real-time notification via socket
        const unreadCount = await Notification.countDocuments({
            recipient: recipient,
            isRead: false
        });

        const io = getIO();
        const roomNew = `user:${recipient}`;
        const roomOld = `user_${recipient}`;
        const payload = {
            ...populatedNotification.toObject(),
            unreadCount // Include current count for instant badge update
        };

        // 1. Generic event for all notifications
        io.to(roomNew).emit('notification:new', payload);
        io.to(roomOld).emit('notification:new', payload);

        // 2. Specific events as requested for instant UI logic/filtering
        // Note: 'task:assigned' and 'task:updated' are now emitted directly by task.controller.js
        // so we don't emit Notification objects under Task event names!
        if (type === 'MESSENGER') {
            io.to(roomNew).emit('chat:message', payload);
            io.to(roomOld).emit('chat:message', payload);
        } else if (type === 'REMINDER') {
            io.to(roomNew).emit('reminder:new', payload);
            io.to(roomOld).emit('reminder:new', payload);
        }

        return populatedNotification;
    } catch (error) {
        console.error('Error creating notification:', error);
        return null;
    }
};
