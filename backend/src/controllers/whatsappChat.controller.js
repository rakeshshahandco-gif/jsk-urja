import httpStatus from 'http-status';
import mongoose from 'mongoose';
import catchAsync from '../utils/catchAsync.js';
import WhatsAppMessage from '../models/whatsappMessage.model.js';
import Customer from '../models/customer.model.js';
import WhatsAppService from '../services/whatsapp.service.js';
import logger from '../utils/logger.js';

const userIdFrom = (req) => (req.user._id || req.user.id).toString();

// Active company (tenant) on the request — set by tenant middleware. We only
// scope CRM-customer LOOKUPS by this; chats and messages stay per-user since
// a single Baileys session is the same phone across companies.
const companyIdFrom = (req) =>
    req.companyId
    || req.headers['x-company-id']
    || req.user?.activeCompanyId
    || null;

// Last 10 digits of a phone number — the canonical comparison key. Handles
// "+91 99207...", "919920730373", "9920730373", and JID prefixes the same.
const last10 = (raw) => {
    const d = String(raw || '').replace(/\D/g, '');
    return d.length >= 10 ? d.slice(-10) : d;
};

/**
 * GET /whatsapp-chat/chats
 *
 * Returns the list of distinct chats (one row per JID) for the current user,
 * with the latest message preview, timestamp, and unread count.
 */
const listChats = catchAsync(async (req, res) => {
    const userId = userIdFrom(req);
    const companyId = companyIdFrom(req);

    const rows = await WhatsAppMessage.aggregate([
        { $match: { userId: new mongoose.Types.ObjectId(userId) } },
        { $sort: { timestamp: -1 } },
        {
            $group: {
                _id: '$jid',
                jid: { $first: '$jid' },
                isGroup: { $first: '$isGroup' },
                // The chatName / mobile are the same for every doc of a given
                // JID, but messages.upsert leaves them blank while
                // messaging-history.set / chats.upsert / contacts.upsert fill
                // them in. We pick the maximum non-empty value across the
                // group — which equals "the one we have" if any doc has it.
                chatName: {
                    $max: { $cond: [{ $eq: [{ $ifNull: ['$chatName', ''] }, ''] }, null, '$chatName'] },
                },
                mobile: {
                    $max: { $cond: [{ $eq: [{ $ifNull: ['$mobile', ''] }, ''] }, null, '$mobile'] },
                },
                isContact: { $max: { $cond: ['$isContact', 1, 0] } },
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
        { $limit: 500 },
    ]);

    // ── Map chats to last-10-digit keys for CRM customer lookup ────────────
    const phoneKeySet = new Set();
    for (const r of rows) {
        if (r.isGroup) continue;
        const key = last10(r.mobile || (r.jid || '').split('@')[0]);
        if (key && key.length >= 7) phoneKeySet.add(key);
    }

    // ── Tenant-scoped Customer match (cheap, single query) ─────────────────
    // We pre-filter by suffix regex on any of the 6 mobile fields, then
    // hand-match in JS using last10().
    const phoneByCustomer = new Map();    // phoneKey -> { id, name }
    if (companyId && phoneKeySet.size) {
        try {
            const keys = [...phoneKeySet];
            // Build an $or over the 6 contact-person mobile fields with a
            // suffix match — fast since Customers tend to be small per tenant
            // and Mongo can use a generic field index.
            const orClauses = [];
            for (const k of keys) {
                const re = new RegExp(`${k}$`);
                orClauses.push(
                    { 'contactPersons.mobile': re },
                    { 'contactPersons.mobile2': re },
                    { 'contactPersons.mobile3': re },
                    { 'contactPersons.mobile4': re },
                    { 'contactPersons.mobile5': re },
                    { 'contactPersons.whatsApp': re },
                );
            }
            const matched = await Customer.find(
                { companyId: new mongoose.Types.ObjectId(companyId), $or: orClauses },
                { customerName: 1, tradeName: 1, contactPersons: 1 }
            ).lean();
            for (const c of matched) {
                const display = c.customerName || c.tradeName || '';
                for (const cp of (c.contactPersons || [])) {
                    for (const m of [cp.mobile, cp.mobile2, cp.mobile3, cp.mobile4, cp.mobile5, cp.whatsApp]) {
                        const k = last10(m);
                        if (k && phoneKeySet.has(k) && !phoneByCustomer.has(k)) {
                            phoneByCustomer.set(k, { id: String(c._id), name: display });
                        }
                    }
                }
            }
        } catch (e) {
            logger.warn(`[WhatsApp-Chat] CRM customer match failed: ${e.message}`);
        }
    }

    // ── Build response rows ─────────────────────────────────────────────────
    const chats = rows.map((r) => {
        const phone = r.isGroup ? '' : (r.mobile || (r.jid || '').split('@')[0] || '');
        const key = last10(phone);
        const customer = !r.isGroup && key ? phoneByCustomer.get(key) : null;
        const isPlaceholder = r.lastMediaType === 'placeholder';

        // Badge precedence: Customer > Group > Contact > Unknown
        let badge;
        if (r.isGroup) badge = 'group';
        else if (customer) badge = 'customer';
        else if (r.isContact) badge = 'contact';
        else badge = 'unknown';

        return {
            jid: r.jid,
            isGroup: !!r.isGroup,
            phone,
            chatName: r.chatName || '',
            isContact: !!r.isContact,
            badge,
            crmCustomerId: customer?.id || null,
            crmCustomerName: customer?.name || '',
            lastText: isPlaceholder ? '' : (r.lastText || ''),
            lastDirection: isPlaceholder ? null : r.lastDirection,
            lastMediaType: r.lastMediaType,
            lastTimestamp: r.lastTimestamp,
            unread: r.unread || 0,
        };
    });

    logger.info(
        `[WhatsApp-Chat] listChats user=${userId} company=${companyId || 'none'}`
        + ` returned=${chats.length} customerMatches=${phoneByCustomer.size}`
    );
    res.json({ chats });
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
    // Hide placeholder/sync-stub rows from the message panel.
    const filter = { userId, jid, mediaType: { $ne: 'placeholder' } };
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
    let sendResult;
    try {
        sendResult = await WhatsAppService.sendRawToJid(userId, jid, { text });
    } catch (err) {
        logger.error(`[WhatsApp-Chat] Send failed user=${userId} jid=${jid}: ${err.message}`);
        return res.status(httpStatus.BAD_REQUEST).json({ message: err.message });
    }

    // Persist outbound right now using the real Baileys messageId so the chat
    // row jumps to the top immediately even if the messages.upsert echo is
    // delayed. The unique (userId, messageId) index dedupes the echo when it
    // arrives.
    try {
        const sent = sendResult?.sent;
        const messageId = sent?.key?.id || null;
        const isGroup = jid.endsWith('@g.us');
        const userObjectId = new mongoose.Types.ObjectId(userId);
        const doc = await WhatsAppMessage.findOneAndUpdate(
            { userId: userObjectId, messageId: messageId || `out:${jid}:${Date.now()}` },
            {
                $setOnInsert: {
                    userId: userObjectId,
                    jid,
                    isGroup,
                    direction: 'out',
                    fromMe: true,
                    messageId: messageId || `out:${jid}:${Date.now()}`,
                    text,
                    mediaType: 'text',
                    timestamp: new Date(),
                    read: true,
                },
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        logger.info(`[WhatsApp-Chat] msg OUT persisted user=${userId} jid=${jid} text="${text.slice(0, 60)}"`);
        return res.json({ success: true, message: doc });
    } catch (err) {
        // Send succeeded, persistence failed — still return success so the UI
        // shows the message (it'll re-appear via socket echo too).
        logger.warn(`[WhatsApp-Chat] OUT persist failed user=${userId}: ${err.message}`);
        return res.json({ success: true });
    }
});

/**
 * POST /whatsapp-chat/chats/new
 * body: { phone: '919xxxxxxxx' }
 *
 * Creates a placeholder chat row for a phone number that has no prior
 * message history yet. Lets a sales user start a brand-new conversation
 * from inside the CRM. The row appears in the chat list immediately;
 * a real message will then flow through messages.upsert as normal.
 */
const startChat = catchAsync(async (req, res) => {
    const userId = userIdFrom(req);
    const rawPhone = String(req.body?.phone || '').replace(/\D/g, '');
    if (!rawPhone) {
        return res.status(httpStatus.BAD_REQUEST).json({ message: 'Phone number is required' });
    }
    // Normalize to country-code + number (assume +91 if 10-digit Indian number)
    const digits = rawPhone.startsWith('91') || rawPhone.length > 10
        ? rawPhone
        : (rawPhone.length === 10 ? `91${rawPhone}` : rawPhone);
    const jid = `${digits}@s.whatsapp.net`;

    const userObjectId = new mongoose.Types.ObjectId(userId);
    const mobileDigits = digits.replace(/\D/g, '');
    const doc = await WhatsAppMessage.findOneAndUpdate(
        { userId: userObjectId, messageId: `placeholder:${jid}` },
        {
            $setOnInsert: {
                userId: userObjectId,
                jid,
                isGroup: false,
                direction: 'in',
                fromMe: false,
                messageId: `placeholder:${jid}`,
                text: '',
                chatName: '',
                mobile: mobileDigits,
                mediaType: 'placeholder',
                timestamp: new Date(),
                read: true,
            },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    logger.info(`[WhatsApp-Chat] startChat user=${userId} phone=${digits} jid=${jid}`);
    res.json({
        success: true,
        chat: { jid, phone: digits, isGroup: false, chatName: '' },
        created: doc?.mediaType === 'placeholder',
    });
});

/**
 * POST /whatsapp-chat/sync
 *
 * Pulls all groups the user participates in via Baileys and stores them as
 * placeholder chat entries so the left chat list shows them immediately.
 * For 1:1 chats, Baileys only exposes them when a real message arrives, or
 * via the messaging-history.set event on connect — both already handled by
 * whatsapp.service.js. This endpoint is therefore additive: it never deletes
 * existing data and never overwrites real messages.
 */
const syncChats = catchAsync(async (req, res) => {
    const userId = userIdFrom(req);
    try {
        const result = await WhatsAppService.syncChats(userId);
        res.json({ success: true, ...result });
    } catch (err) {
        logger.error(`[WhatsApp Chat] Sync failed for user ${userId}: ${err.message}`);
        return res.status(httpStatus.BAD_REQUEST).json({ message: err.message });
    }
});

/**
 * GET /whatsapp-chat/messages/:id/media
 *
 * Streams the media bytes for an image / video / audio / document / sticker
 * message via Baileys' downloadMediaMessage(). The message MUST have
 * `rawMessage` populated by messages.upsert (only true for media saved AFTER
 * the download-feature deployment) — for older "[unsupported]" rows we
 * return 404 with a clear message.
 */
const downloadMedia = catchAsync(async (req, res) => {
    const userId = userIdFrom(req);
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(httpStatus.BAD_REQUEST).json({ message: 'Invalid message id' });
    }
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const msg = await WhatsAppMessage.findOne({ _id: id, userId: userObjectId }).lean();
    if (!msg) {
        return res.status(httpStatus.NOT_FOUND).json({ message: 'Message not found' });
    }
    if (!msg.rawMessage) {
        return res.status(httpStatus.NOT_FOUND).json({
            message: 'Media payload is not available for this message. '
                + 'Only media received after the download feature was enabled can be downloaded.',
        });
    }
    let buffer;
    try {
        buffer = await WhatsAppService.downloadMediaForMessage(userId, msg.rawMessage);
    } catch (err) {
        logger.warn(`[WhatsApp-Chat] downloadMedia failed user=${userId} msg=${id}: ${err.message}`);
        return res.status(httpStatus.BAD_GATEWAY).json({
            message: 'Could not download media from WhatsApp. '
                + 'The file may have expired on WhatsApp servers or the session is not connected.',
        });
    }
    const filename = msg.mediaFilename || `whatsapp-${msg.mediaType || 'file'}-${id}`;
    const mime = msg.mediaMime || 'application/octet-stream';
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Length', buffer.length);
    // Inline so images preview in a new tab; the frontend uses a forced
    // download via blob + <a download=...> so this is more of a hint.
    res.setHeader(
        'Content-Disposition',
        `inline; filename="${filename.replace(/"/g, '')}"`
    );
    return res.end(buffer);
});

export default {
    listChats,
    listMessages,
    markRead,
    sendChatMessage,
    syncChats,
    startChat,
    downloadMedia,
};
