import httpStatus from 'http-status';
import catchAsync from '../utils/catchAsync.js';
import WhatsAppMessage from '../models/whatsappMessage.model.js';
import WhatsAppService from '../services/whatsapp.service.js';
import logger from '../utils/logger.js';

const userIdFrom = (req) => (req.user._id || req.user.id).toString();

/**
 * GET /whatsapp-chat/chats
 *
 * Returns the list of distinct chats (one row per JID) for the current user,
 * with the latest message preview, timestamp, and unread count.
 */
const listChats = catchAsync(async (req, res) => {
    const userId = userIdFrom(req);

    const rows = await WhatsAppMessage.aggregate([
        { $match: { userId: new (await import('mongoose')).default.Types.ObjectId(userId) } },
        { $sort: { timestamp: -1 } },
        {
            $group: {
                _id: '$jid',
                jid: { $first: '$jid' },
                isGroup: { $first: '$isGroup' },
                lastText: { $first: '$text' },
                lastDirection: { $first: '$direction' },
                lastMediaType: { $first: '$mediaType' },
                lastTimestamp: { $first: '$timestamp' },
                unread: {
                    $sum: {
                        $cond: [
                            { $and: [{ $eq: ['$direction', 'in'] }, { $eq: ['$read', false] }] },
                            1,
                            0,
                        ],
                    },
                },
            },
        },
        { $sort: { lastTimestamp: -1 } },
        { $limit: 200 },
    ]);

    res.json({
        chats: rows.map((r) => ({
            jid: r.jid,
            isGroup: !!r.isGroup,
            phone: r.isGroup ? '' : (r.jid || '').split('@')[0],
            lastText: r.lastText || '',
            lastDirection: r.lastDirection,
            lastMediaType: r.lastMediaType,
            lastTimestamp: r.lastTimestamp,
            unread: r.unread || 0,
        })),
    });
});

/**
 * GET /whatsapp-chat/chats/:jid/messages?limit=50&before=<iso>
 *
 * Returns the last N messages for the given JID. If `before` is provided,
 * returns messages older than that timestamp (for paging upward).
 */
const listMessages = catchAsync(async (req, res) => {
    const userId = userIdFrom(req);
    const { jid } = req.params;
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const filter = { userId, jid };
    if (req.query.before) {
        filter.timestamp = { $lt: new Date(req.query.before) };
    }
    const rows = await WhatsAppMessage.find(filter)
        .sort({ timestamp: -1 })
        .limit(limit)
        .lean();
    res.json({ messages: rows.reverse() });
});

/**
 * POST /whatsapp-chat/chats/:jid/read
 *
 * Marks all inbound messages of the chat as read.
 */
const markRead = catchAsync(async (req, res) => {
    const userId = userIdFrom(req);
    const { jid } = req.params;
    const result = await WhatsAppMessage.updateMany(
        { userId, jid, direction: 'in', read: false },
        { $set: { read: true } }
    );
    res.json({ updated: result.modifiedCount || 0 });
});

/**
 * POST /whatsapp-chat/chats/:jid/send
 * body: { text }
 *
 * Sends a message to the chat through the user's Baileys session, then logs
 * an 'out' message locally so the UI picks it up immediately.
 */
const sendChatMessage = catchAsync(async (req, res) => {
    const userId = userIdFrom(req);
    const { jid } = req.params;
    const text = String(req.body?.text || '').trim();
    if (!text) {
        return res.status(httpStatus.BAD_REQUEST).json({ message: 'Message text is required' });
    }
    if (!jid || !jid.includes('@')) {
        return res.status(httpStatus.BAD_REQUEST).json({ message: 'Invalid chat JID' });
    }

    // The existing send path uses phone numbers for 1:1; for groups it uses sock.sendMessage
    // directly. Use a small bridge through the session manager to handle either.
    try {
        await WhatsAppService.sendRawToJid(userId, jid, { text });
    } catch (err) {
        logger.error(`[WhatsApp Chat] Send failed for user ${userId} jid ${jid}: ${err.message}`);
        return res.status(httpStatus.BAD_REQUEST).json({ message: err.message });
    }

    res.json({ success: true });
});

export default {
    listChats,
    listMessages,
    markRead,
    sendChatMessage,
};
