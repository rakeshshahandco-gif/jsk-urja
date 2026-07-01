import httpStatus from 'http-status';
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import catchAsync from '../utils/catchAsync.js';
import WhatsAppMessage from '../models/whatsappMessage.model.js';
import Customer from '../models/customer.model.js';
import WhatsAppService from '../services/whatsapp.service.js';
import logger from '../utils/logger.js';

const userIdFrom = (req) => (req.user._id || req.user.id).toString();

/** Baileys session owner for chat read/write (may differ from logged-in user). */
const whatsAppDataUserId = (req) => WhatsAppService.resolveChatUserId(userIdFrom(req));

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

const PHONE_JID_DOMAINS = new Set(['s.whatsapp.net', 'c.us']);
const phoneFromJid = (jid) => {
    const raw = String(jid || '');
    if (!raw.includes('@')) return '';
    const [left, domain] = raw.split('@');
    if (!PHONE_JID_DOMAINS.has(domain)) return '';
    const digits = String(left || '').replace(/\D/g, '');
    if (digits.length === 10) return digits;
    if (digits.length === 12 && digits.startsWith('91')) return digits;
    return '';
};

const normalizeMobile = (raw) => {
    const d = String(raw || '').replace(/\D/g, '');
    if (!d) return '';
    if (d.length === 10) return d;
    if (d.length === 12 && d.startsWith('91')) return d;
    return '';
};

const AUTH_DIR_CANDIDATES = [
    path.join(process.cwd(), '.whatsapp-auth'),
    path.join(process.cwd(), 'backend', '.whatsapp-auth'),
];

const resolveAuthDir = (userId) => {
    for (const root of AUTH_DIR_CANDIDATES) {
        const dir = path.join(root, String(userId));
        if (fs.existsSync(path.join(dir, 'creds.json'))) return dir;
    }
    return null;
};

/** Build lid→phone map once per listChats (avoids scanning auth dirs per row). */
const buildLidReverseCache = (userId) => {
    const cache = new Map();
    const authDir = resolveAuthDir(userId);
    if (!authDir) return cache;
    let files = [];
    try {
        files = fs.readdirSync(authDir);
    } catch {
        return cache;
    }
    for (const f of files) {
        const reverseMatch = f.match(/^lid-mapping-(\d+)_reverse\.json$/i);
        if (reverseMatch) {
            try {
                const phone = normalizeMobile(
                    JSON.parse(fs.readFileSync(path.join(authDir, f), 'utf8')),
                );
                if (phone) cache.set(reverseMatch[1], phone);
            } catch { /* ignore */ }
            // eslint-disable-next-line no-continue
            continue;
        }
        const forwardMatch = f.match(/^lid-mapping-(\d+)\.json$/i);
        if (!forwardMatch) continue;
        try {
            const mappedLid = String(
                JSON.parse(fs.readFileSync(path.join(authDir, f), 'utf8')) || '',
            ).replace(/\D/g, '');
            if (mappedLid) cache.set(mappedLid, normalizeMobile(forwardMatch[1]));
        } catch { /* ignore */ }
    }
    return cache;
};

const lookupLidInCache = (cache, lid) => {
    const digits = String(lid || '').replace(/\D/g, '');
    if (!digits || !cache?.size) return '';
    if (cache.has(digits)) return cache.get(digits);
    for (const [mappedLid, phone] of cache.entries()) {
        if (
            mappedLid === digits
            || mappedLid.endsWith(digits)
            || digits.endsWith(mappedLid)
        ) {
            return phone;
        }
    }
    return '';
};

const readLidReverseMobile = (userId, lid) => {
    try {
        const digits = String(lid || '').replace(/\D/g, '');
        if (!digits) return '';
        const directCandidates = [
            // when backend runs from repo/backend
            path.join(process.cwd(), '.whatsapp-auth', String(userId), `lid-mapping-${digits}_reverse.json`),
            // when backend runs from repo root
            path.join(process.cwd(), 'backend', '.whatsapp-auth', String(userId), `lid-mapping-${digits}_reverse.json`),
        ];
        const directPath = directCandidates.find((x) => fs.existsSync(x));
        if (directPath) {
            const raw = fs.readFileSync(directPath, 'utf8');
            // file content is a JSON string like: "919323135895"
            const parsed = JSON.parse(raw);
            return normalizeMobile(parsed);
        }

        // Fallback: sometimes the active auth folder is not req.user.id (legacy session).
        // Scan all auth dirs for reverse mapping by lid.
        const authRoots = [
            path.join(process.cwd(), '.whatsapp-auth'),
            path.join(process.cwd(), 'backend', '.whatsapp-auth'),
        ].filter((p) => fs.existsSync(p));

        for (const root of authRoots) {
            const dirs = fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory());
            for (const d of dirs) {
                const rp = path.join(root, d.name, `lid-mapping-${digits}_reverse.json`);
                if (fs.existsSync(rp)) {
                    const raw = fs.readFileSync(rp, 'utf8');
                    const parsed = JSON.parse(raw);
                    const nm = normalizeMobile(parsed);
                    if (nm) return nm;
                }

                // Forward-map fallback:
                // file: lid-mapping-<phone>.json => "<lid>"
                // If file content matches current lid, derive phone from filename.
                const dirPath = path.join(root, d.name);
                const files = fs.readdirSync(dirPath).filter((f) => /^lid-mapping-\d+\.json$/i.test(f));
                for (const f of files) {
                    const fp = path.join(dirPath, f);
                    let mappedLid = '';
                    try {
                        mappedLid = String(JSON.parse(fs.readFileSync(fp, 'utf8')) || '').replace(/\D/g, '');
                    } catch {
                        mappedLid = '';
                    }
                    if (!mappedLid) continue;
                    // Some JIDs/LIDs carry suffix fragments (device/addressing artifacts).
                    // Accept direct, prefix, or suffix match so we still resolve true phone mapping.
                    const lidMatched =
                        mappedLid === digits
                        || mappedLid.endsWith(digits)
                        || digits.endsWith(mappedLid)
                        || mappedLid.includes(digits)
                        || digits.includes(mappedLid);
                    if (!lidMatched) continue;
                    const phoneFromFile = String(f.match(/^lid-mapping-(\d+)\.json$/i)?.[1] || '');
                    const nm = normalizeMobile(phoneFromFile);
                    if (nm) return nm;
                }
            }
        }
        return '';
    } catch {
        return '';
    }
};

/**
 * GET /whatsapp-chat/chats
 *
 * Returns the list of distinct chats (one row per JID) for the current user,
 * with the latest message preview, timestamp, and unread count.
 */
const listChats = catchAsync(async (req, res) => {
    const userId = whatsAppDataUserId(req);
    const companyId = companyIdFrom(req);
    const userOid = new mongoose.Types.ObjectId(userId);
    const t0 = Date.now();

    const aggregateChats = async () => {
        try {
            // $top avoids sorting the entire message collection before grouping by jid.
            return await WhatsAppMessage.aggregate([
                { $match: { userId: userOid } },
                {
                    $group: {
                        _id: '$jid',
                        latest: { $top: { sortBy: { timestamp: -1 }, output: '$$ROOT' } },
                        chatName: {
                            $max: { $cond: [{ $eq: [{ $ifNull: ['$chatName', ''] }, ''] }, null, '$chatName'] },
                        },
                        mobile: {
                            $max: { $cond: [{ $eq: [{ $ifNull: ['$mobile', ''] }, ''] }, null, '$mobile'] },
                        },
                        isContact: { $max: { $cond: ['$isContact', 1, 0] } },
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
                {
                    $project: {
                        jid: '$_id',
                        isGroup: '$latest.isGroup',
                        chatName: { $ifNull: ['$chatName', '$latest.chatName'] },
                        mobile: { $ifNull: ['$mobile', '$latest.mobile'] },
                        isContact: { $gt: ['$isContact', 0] },
                        lastText: '$latest.text',
                        lastDirection: '$latest.direction',
                        lastMediaType: '$latest.mediaType',
                        lastTimestamp: '$latest.timestamp',
                        unread: 1,
                    },
                },
                { $sort: { lastTimestamp: -1 } },
                { $limit: 500 },
            ]).allowDiskUse(true);
        } catch (e) {
            logger.warn(`[WhatsApp-Chat] listChats $top aggregate failed, using lookup fallback: ${e.message}`);
            return WhatsAppMessage.aggregate([
                { $match: { userId: userOid } },
                {
                    $group: {
                        _id: '$jid',
                        lastTimestamp: { $max: '$timestamp' },
                        chatName: {
                            $max: { $cond: [{ $eq: [{ $ifNull: ['$chatName', ''] }, ''] }, null, '$chatName'] },
                        },
                        mobile: {
                            $max: { $cond: [{ $eq: [{ $ifNull: ['$mobile', ''] }, ''] }, null, '$mobile'] },
                        },
                        isContact: { $max: { $cond: ['$isContact', 1, 0] } },
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
                {
                    $lookup: {
                        from: WhatsAppMessage.collection.name,
                        let: { jid: '$_id', ts: '$lastTimestamp' },
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $and: [
                                            { $eq: ['$userId', userOid] },
                                            { $eq: ['$jid', '$$jid'] },
                                            { $eq: ['$timestamp', '$$ts'] },
                                        ],
                                    },
                                },
                            },
                            { $limit: 1 },
                        ],
                        as: 'latestArr',
                    },
                },
                {
                    $project: {
                        jid: '$_id',
                        isGroup: { $arrayElemAt: ['$latestArr.isGroup', 0] },
                        chatName: {
                            $ifNull: ['$chatName', { $arrayElemAt: ['$latestArr.chatName', 0] }],
                        },
                        mobile: {
                            $ifNull: ['$mobile', { $arrayElemAt: ['$latestArr.mobile', 0] }],
                        },
                        isContact: { $gt: ['$isContact', 0] },
                        lastText: { $arrayElemAt: ['$latestArr.text', 0] },
                        lastDirection: { $arrayElemAt: ['$latestArr.direction', 0] },
                        lastMediaType: { $arrayElemAt: ['$latestArr.mediaType', 0] },
                        lastTimestamp: 1,
                        unread: 1,
                    },
                },
            ]).allowDiskUse(true);
        }
    };

    const rows = await aggregateChats();

    const lidCache = buildLidReverseCache(userId);

    // Resolve phone per JID:
    // 1) mobile column / phone JID  2) cached LID reverse map (one auth-dir read)
    const resolvedPhoneByJid = new Map();
    const mobileFixBulk = [];
    for (const r of rows) {
        if (r.isGroup) {
            resolvedPhoneByJid.set(r.jid, '');
            // eslint-disable-next-line no-continue
            continue;
        }
        const basePhone = normalizeMobile(r.mobile || phoneFromJid(r.jid));
        if (basePhone) {
            resolvedPhoneByJid.set(r.jid, basePhone);
            // eslint-disable-next-line no-continue
            continue;
        }
        const lidFromJid = String(r.jid || '').split('@')[0] || '';
        const mappedPhone = lookupLidInCache(lidCache, lidFromJid)
            || lookupLidInCache(lidCache, r.mobile);
        resolvedPhoneByJid.set(r.jid, mappedPhone);
        if (mappedPhone) {
            mobileFixBulk.push({
                updateMany: {
                    filter: { userId: userOid, jid: r.jid, isGroup: false },
                    update: { $set: { mobile: mappedPhone } },
                },
            });
        }
    }

    if (mobileFixBulk.length) {
        WhatsAppMessage.bulkWrite(mobileFixBulk, { ordered: false }).catch((e) => {
            logger.warn(`[WhatsApp-Chat] mobile fix bulk failed for user=${userId}: ${e.message}`);
        });
    }

    // ── Map chats to last-10-digit keys for CRM customer lookup ────────────
    const phoneKeySet = new Set();
    for (const r of rows) {
        if (r.isGroup) continue;
        const key = last10(resolvedPhoneByJid.get(r.jid) || '');
        if (key && key.length >= 7) phoneKeySet.add(key);
    }

    // ── Tenant-scoped Customer match (cheap, single query) ─────────────────
    // We pre-filter by suffix regex on any of the 6 mobile fields, then
    // hand-match in JS using last10().
    const phoneByCustomer = new Map();    // phoneKey -> { id, name }
    if (companyId && phoneKeySet.size) {
        try {
            const keys = [...phoneKeySet].slice(0, 120);
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
                { customerName: 1, tradeName: 1, contactPersons: 1 },
            ).limit(500).lean();
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
        const phone = r.isGroup ? '' : (resolvedPhoneByJid.get(r.jid) || '');
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
            chatName: (r.isContact && r.chatName) ? r.chatName : (r.chatName || ''),
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

    // Group names refresh in background — do not block listChats (can take 30s+).
    const groupsMissingNames = chats.filter((c) => c.isGroup && !c.chatName);
    if (groupsMissingNames.length > 0) {
        WhatsAppService.refreshGroupChatNames(userId).catch((e) => {
            logger.warn(`[WhatsApp-Chat] group name refresh skipped: ${e.message}`);
        });
    }

    // Re-read group names already in DB (small follow-up query only).
    const stillMissing = chats.filter((c) => c.isGroup && !c.chatName).map((c) => c.jid);
    if (stillMissing.length > 0 && stillMissing.length <= 200) {
        const namedRows = await WhatsAppMessage.aggregate([
            {
                $match: {
                    userId: userOid,
                    jid: { $in: stillMissing },
                    chatName: { $nin: [null, ''] },
                },
            },
            { $group: { _id: '$jid', chatName: { $max: '$chatName' } } },
        ]);
        const byJid = Object.fromEntries(namedRows.map((r) => [r._id, r.chatName]));
        for (const c of chats) {
            if (c.isGroup && !c.chatName && byJid[c.jid]) {
                c.chatName = byJid[c.jid];
            }
        }
    }

    logger.info(
        `[WhatsApp-Chat] listChats requestUser=${userIdFrom(req)} dataUser=${userId}`
        + ` company=${companyId || 'none'} returned=${chats.length}`
        + ` customerMatches=${phoneByCustomer.size} ms=${Date.now() - t0}`
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
    const userId = whatsAppDataUserId(req);
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
    const messages = rows.reverse().map(({ rawMessage, ...rest }) => ({
        ...rest,
        mediaDownloadable: !!(rawMessage && rawMessage.message),
    }));
    res.json({ messages });
});

/**
 * POST /whatsapp-chat/chats/:jid/read
 *
 * Marks all inbound messages of the chat as read.
 */
const markRead = catchAsync(async (req, res) => {
    const userId = whatsAppDataUserId(req);
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
    const userId = whatsAppDataUserId(req);
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
    const userId = whatsAppDataUserId(req);
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
    const userId = whatsAppDataUserId(req);
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
    const userId = whatsAppDataUserId(req);
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
            message: err.message || 'Could not download media from WhatsApp. '
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
