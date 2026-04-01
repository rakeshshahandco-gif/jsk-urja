import MsgThread from '../models/msgThread.model.js';
import MsgMessage from '../models/msgMessage.model.js';
import MsgUnread from '../models/msgUnread.model.js';
import { User } from '../models/user.model.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getIO } from '../config/socket.js';
import { createNotification } from './notification.controller.js';

// ─────────────────────────────────────────────────────────────
// Helper: emit real-time event to all participants of a thread
// ─────────────────────────────────────────────────────────────
const emitToParticipants = (participantIds, event, payload) => {
    try {
        const io = getIO();
        participantIds.forEach((uid) => {
            io.to(`user_${uid.toString()}`).emit(event, payload);
        });
    } catch (e) {
        console.error('Socket emit error:', e.message);
    }
};

// ─────────────────────────────────────────────────────────────
// Helper: update per-user unread counts (skip the sender)
// ─────────────────────────────────────────────────────────────
const incrementUnread = async (participantIds, threadId, senderId) => {
    const others = participantIds.filter((id) => id.toString() !== senderId.toString());
    await Promise.all(
        others.map((uid) =>
            MsgUnread.findOneAndUpdate(
                { user: uid, thread: threadId },
                { $inc: { count: 1 } },
                { upsert: true, new: true }
            )
        )
    );
};

// ─────────────────────────────────────────────────────────────
// Helper: get total unread count for a user
// ─────────────────────────────────────────────────────────────
const getUserUnreadTotal = async (userId) => {
    const result = await MsgUnread.aggregate([
        { $match: { user: userId, count: { $gt: 0 } } },
        { $group: { _id: null, total: { $sum: '$count' } } },
    ]);
    return result[0]?.total || 0;
};

// ─────────────────────────────────────────────────────────────
// @desc    Create a new thread (direct/group/broadcast)
// @route   POST /api/v1/messenger/threads
// ─────────────────────────────────────────────────────────────
export const createThread = asyncHandler(async (req, res) => {
    const { type, participantIds, name, firstMessage } = req.body;
    const myId = req.user._id;

    if (!type || !['direct', 'group', 'broadcast'].includes(type)) {
        throw new ApiError(400, 'Invalid thread type');
    }
    if (!firstMessage || !firstMessage.trim()) {
        throw new ApiError(400, 'First message is required');
    }

    // For broadcast: fetch all active users ONLY if none provided
    let resolvedParticipants = participantIds || [];
    if (type === 'broadcast' && resolvedParticipants.length === 0) {
        const allUsers = await User.find({ isActive: true, _id: { $ne: myId } }).select('_id');
        resolvedParticipants = allUsers.map((u) => u._id);
    }

    // Always include the creator
    const participantSet = [
        ...new Set([myId.toString(), ...resolvedParticipants.map((p) => p.toString())]),
    ].map((id) => id);

    if (participantSet.length < 2) {
        throw new ApiError(400, 'At least one recipient is required');
    }

    // For direct chat: reuse existing thread if one exists
    if (type === 'direct' && participantSet.length === 2) {
        const otherId = participantSet.find((p) => p.toString() !== myId.toString());
        const existing = await MsgThread.findOne({
            type: 'direct',
            participants: { $all: [myId, otherId], $size: 2 },
            isActive: true,
        });

        if (existing) {
            // Just send a new message in the existing thread
            const msg = await MsgMessage.create({
                threadId: existing._id,
                sender: myId,
                content: firstMessage.trim(),
            });

            await MsgThread.findByIdAndUpdate(existing._id, {
                lastMessage: { content: firstMessage.trim(), sender: myId, timestamp: msg.createdAt },
            });

            await incrementUnread(existing.participants, existing._id, myId);

            const populated = await MsgMessage.findById(msg._id).populate('sender', 'name');
            emitToParticipants(existing.participants, 'messenger:new_message', {
                threadId: existing._id,
                message: populated,
            });

            // Global Notification
            const senderName = req.user.name || 'User';
            const threadName = existing.name || 'New Message';
            const others = existing.participants.filter(p => p.toString() !== myId.toString());
            others.forEach(recipientId => {
                createNotification({
                    recipient: recipientId,
                    actor: myId,
                    type: 'MESSENGER',
                    title: `New Message from ${senderName}`,
                    message: firstMessage.trim(),
                    link: '/messenger',
                    metadata: { threadId: existing._id, threadName }
                }).catch(err => console.error('Notification error in createThread (existing):', err));
            });

            return res.json(new ApiResponse(200, { thread: existing, message: populated }, 'Message sent'));
        }
    }

    // Create new thread
    const thread = await MsgThread.create({
        type,
        name: name || '',
        participants: participantSet,
        createdBy: myId,
        lastMessage: { content: firstMessage.trim(), sender: myId, timestamp: new Date() },
    });

    // Create first message
    const msg = await MsgMessage.create({
        threadId: thread._id,
        sender: myId,
        content: firstMessage.trim(),
    });

    // Increment unread for everyone except sender
    await incrementUnread(participantSet, thread._id, myId);

    // Populate and emit
    const populatedThread = await MsgThread.findById(thread._id)
        .populate('participants', 'name designation department')
        .populate('createdBy', 'name');
    const populatedMsg = await MsgMessage.findById(msg._id).populate('sender', 'name');

    emitToParticipants(participantSet, 'messenger:thread_created', {
        thread: populatedThread,
        message: populatedMsg,
    });

    // Global Notification
    const senderName = req.user.name || 'User';
    const others = participantSet.filter(p => p.toString() !== myId.toString());
    others.forEach(recipientId => {
        createNotification({
            recipient: recipientId,
            actor: myId,
            type: 'MESSENGER',
            title: `New Message from ${senderName}`,
            message: firstMessage.trim(),
            link: '/messenger',
            metadata: { threadId: thread._id, threadName: thread.name || 'New Chat' }
        }).catch(err => console.error('Notification error in createThread:', err));
    });

    res.status(201).json(new ApiResponse(201, { thread: populatedThread, message: populatedMsg }, 'Thread created'));
});

// ─────────────────────────────────────────────────────────────
// Helper: ensure a company-wide thread exists
// ─────────────────────────────────────────────────────────────
const ensureCompanyThread = async (myId) => {
    const COMPANY_THREAD_NAME = "JSK URJA TEAM";
    let thread = await MsgThread.findOne({ name: COMPANY_THREAD_NAME, isCompanyWide: true });

    const allUsers = await User.find({ isActive: true }).select('_id');
    const allUserIds = allUsers.map(u => u._id.toString());

    if (!thread) {
        thread = await MsgThread.create({
            type: 'group',
            name: COMPANY_THREAD_NAME,
            participants: allUserIds,
            isCompanyWide: true,
            isPermanent: true,
            createdBy: myId,
            lastMessage: { content: "Welcome to JSK URJA Official Team Chat!", sender: myId, timestamp: new Date() }
        });
        
        // Create initial message
        await MsgMessage.create({
            threadId: thread._id,
            sender: myId,
            content: "Welcome to JSK URJA Official Team Chat!"
        });
    } else {
        // Update participants if new users joined
        const currentParticipants = thread.participants.map(p => p.toString());
        const missingUsers = allUserIds.filter(id => !currentParticipants.includes(id));
        
        if (missingUsers.length > 0) {
            await MsgThread.findByIdAndUpdate(thread._id, {
                $addToSet: { participants: { $each: missingUsers } }
            });
        }
    }
    return thread;
};

// ─────────────────────────────────────────────────────────────
// @desc    Get all threads for the current user
// @route   GET /api/v1/messenger/threads
// ─────────────────────────────────────────────────────────────
export const getMyThreads = asyncHandler(async (req, res) => {
    const myId = req.user._id;

    // Ensure company-wide thread exists and user is in it
    await ensureCompanyThread(myId);

    const threads = await MsgThread.find({ participants: myId, isActive: true })
        .populate('participants', 'name designation')
        .populate('lastMessage.sender', 'name')
        .sort({ 'lastMessage.timestamp': -1 });

    // Attach unread counts
    const unreadDocs = await MsgUnread.find({ user: myId });
    const unreadMap = {};
    unreadDocs.forEach((u) => { unreadMap[u.thread.toString()] = u.count; });

    const threadsWithUnread = threads.map((t) => ({
        ...t.toObject(),
        unreadCount: unreadMap[t._id.toString()] || 0,
    }));

    res.json(new ApiResponse(200, threadsWithUnread, 'Threads fetched'));
});

// ─────────────────────────────────────────────────────────────
// @desc    Get a single thread
// @route   GET /api/v1/messenger/threads/:id
// ─────────────────────────────────────────────────────────────
export const getThread = asyncHandler(async (req, res) => {
    const myId = req.user._id;
    const thread = await MsgThread.findOne({ _id: req.params.id, participants: myId, isActive: true })
        .populate('participants', 'name designation department')
        .populate('createdBy', 'name');

    if (!thread) throw new ApiError(404, 'Thread not found');
    res.json(new ApiResponse(200, thread, 'Thread fetched'));
});

// ─────────────────────────────────────────────────────────────
// @desc    Get paginated messages for a thread
// @route   GET /api/v1/messenger/threads/:id/messages
// ─────────────────────────────────────────────────────────────
export const getMessages = asyncHandler(async (req, res) => {
    const myId = req.user._id;
    const { page = 1, limit = 50 } = req.query;

    // Verify participant
    const thread = await MsgThread.findOne({ _id: req.params.id, participants: myId });
    if (!thread) throw new ApiError(403, 'Not a participant of this thread');

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const messages = await MsgMessage.find({ threadId: req.params.id, isDeleted: false })
        .populate('sender', 'name')
        .populate({ path: 'replyTo', populate: { path: 'sender', select: 'name' } })
        .sort({ createdAt: 1 })
        .skip(skip)
        .limit(parseInt(limit));

    const total = await MsgMessage.countDocuments({ threadId: req.params.id, isDeleted: false });

    res.json(new ApiResponse(200, { messages, total, page: parseInt(page), limit: parseInt(limit) }, 'Messages fetched'));
});

// ─────────────────────────────────────────────────────────────
// @desc    Send a message to a thread
// @route   POST /api/v1/messenger/threads/:id/messages
// ─────────────────────────────────────────────────────────────
export const sendMessage = asyncHandler(async (req, res) => {
    const myId = req.user._id;
    const { content, replyTo } = req.body;

    if (!content || !content.trim()) throw new ApiError(400, 'Message cannot be empty');

    const thread = await MsgThread.findOne({ _id: req.params.id, participants: myId, isActive: true });
    if (!thread) throw new ApiError(403, 'Not a participant of this thread');

    const msg = await MsgMessage.create({
        threadId: thread._id,
        sender: myId,
        content: content.trim(),
        replyTo: replyTo || null,
    });

    // Update thread's lastMessage
    await MsgThread.findByIdAndUpdate(thread._id, {
        lastMessage: { content: content.trim(), sender: myId, timestamp: msg.createdAt },
    });

    // Increment unread for other participants
    await incrementUnread(thread.participants, thread._id, myId);

    // Populate and emit
    const populated = await MsgMessage.findById(msg._id)
        .populate('sender', 'name')
        .populate({ path: 'replyTo', populate: { path: 'sender', select: 'name' } });

    // Emit real-time to all participants
    emitToParticipants(thread.participants, 'messenger:new_message', {
        threadId: thread._id.toString(),
        message: populated,
    });

    // Global Notification for Messenger
    const senderName = req.user.name || 'User';
    const threadName = thread.name || 'New Message';
    const othersForNotify = thread.participants.filter(p => p.toString() !== myId.toString());
    othersForNotify.forEach(recipientId => {
        createNotification({
            recipient: recipientId,
            actor: myId,
            type: 'MESSENGER',
            title: `New Message from ${senderName}`,
            message: content.trim(),
            link: '/messenger',
            metadata: { threadId: thread._id.toString(), threadName }
        }).catch(err => console.error('Notification error in sendMessage:', err));
    });

    // Emit updated unread total to each participant who is NOT the sender
    // Emit updated unread total to each participant who is NOT the sender
    // Optimized: Do this asynchronously without blocking the main response
    const others = thread.participants.filter((p) => p.toString() !== myId.toString());
    
    // We can use Promise.all for better performance, or even move this completely out of the main flow
    Promise.all(others.map(async (otherId) => {
        try {
            const total = await getUserUnreadTotal(otherId);
            getIO().to(`user_${otherId.toString()}`).emit('messenger:unread_update', { total });
        } catch (e) {
            console.error('Failed to emit unread update for', otherId, e.message);
        }
    })).catch(err => console.error('Unread update broadcast failed:', err));

    res.status(201).json(new ApiResponse(201, populated, 'Message sent'));
});

// ─────────────────────────────────────────────────────────────
// @desc    Mark all messages in a thread as read for current user
// @route   PATCH /api/v1/messenger/threads/:id/read
// ─────────────────────────────────────────────────────────────
export const markThreadRead = asyncHandler(async (req, res) => {
    const myId = req.user._id;

    // Reset unread counter
    await MsgUnread.findOneAndUpdate(
        { user: myId, thread: req.params.id },
        { count: 0 },
        { upsert: true }
    );

    // Mark messages as read
    await MsgMessage.updateMany(
        { threadId: req.params.id, 'readBy.user': { $ne: myId } },
        { $push: { readBy: { user: myId, readAt: new Date() } } }
    );

    // Emit seen event to thread
    const thread = await MsgThread.findById(req.params.id);
    if (thread) {
        emitToParticipants(thread.participants, 'messenger:message_seen', {
            threadId: req.params.id,
            userId: myId,
        });
    }

    // Send updated total unread to the user
    const total = await getUserUnreadTotal(myId);
    try {
        getIO().to(`user_${myId.toString()}`).emit('messenger:unread_update', { total });
    } catch (e) { /* ignore */ }

    res.json(new ApiResponse(200, { total }, 'Thread marked as read'));
});

// ─────────────────────────────────────────────────────────────
// @desc    Soft-delete a message
// @route   DELETE /api/v1/messenger/messages/:msgId
// ─────────────────────────────────────────────────────────────
export const deleteMessage = asyncHandler(async (req, res) => {
    const myId = req.user._id;
    const isAdmin = ['superadmin', 'admin'].includes(req.user.roleName);

    const msg = await MsgMessage.findById(req.params.msgId);
    if (!msg) throw new ApiError(404, 'Message not found');

    // Only sender or admin can delete
    if (msg.sender.toString() !== myId.toString() && !isAdmin) {
        throw new ApiError(403, 'Not authorized to delete this message');
    }

    msg.isDeleted = true;
    msg.deletedBy = myId;
    msg.deletedAt = new Date();
    await msg.save();

    // Emit deletion event to thread participants
    const thread = await MsgThread.findById(msg.threadId);
    if (thread) {
        emitToParticipants(thread.participants, 'messenger:message_deleted', {
            threadId: msg.threadId.toString(),
            messageId: msg._id.toString(),
        });
    }

    res.json(new ApiResponse(200, null, 'Message deleted'));
});

// ─────────────────────────────────────────────────────────────
// @desc    Search messages in a thread
// @route   GET /api/v1/messenger/search
// ─────────────────────────────────────────────────────────────
export const searchMessages = asyncHandler(async (req, res) => {
    const myId = req.user._id;
    const { q, threadId, from, to } = req.query;

    if (!q) throw new ApiError(400, 'Search query is required');

    // Verify user is participant if threadId specified
    if (threadId) {
        const thread = await MsgThread.findOne({ _id: threadId, participants: myId });
        if (!thread) throw new ApiError(403, 'Not a participant of this thread');
    }

    // Get all thread IDs this user is part of
    const userThreadIds = (await MsgThread.find({ participants: myId })).map((t) => t._id);

    const filter = {
        threadId: threadId ? threadId : { $in: userThreadIds },
        isDeleted: false,
        content: { $regex: q, $options: 'i' },
    };
    if (from || to) {
        filter.createdAt = {};
        if (from) filter.createdAt.$gte = new Date(from);
        if (to) filter.createdAt.$lte = new Date(to);
    }

    const results = await MsgMessage.find(filter)
        .populate('sender', 'name')
        .populate('threadId', 'name type')
        .sort({ createdAt: -1 })
        .limit(100);

    res.json(new ApiResponse(200, results, 'Search results'));
});

// ─────────────────────────────────────────────────────────────
// @desc    Get total unread count across all threads for current user
// @route   GET /api/v1/messenger/unread
// ─────────────────────────────────────────────────────────────
export const getUnreadSummary = asyncHandler(async (req, res) => {
    const myId = req.user._id;
    const total = await getUserUnreadTotal(myId);
    res.json(new ApiResponse(200, { total }, 'Unread summary'));
});
