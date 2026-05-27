/**
 * WhatsApp Service — Per-User Baileys Session Manager
 *
 * Each user gets their own Baileys connection and auth directory:
 *   .whatsapp-auth/{userId}/creds.json
 *
 * Socket events are emitted to user:{userId} rooms (not a shared room).
 */

import makeWASocket, {
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    jidNormalizedUser,
    downloadMediaMessage,
} from '@whiskeysockets/baileys';
import qrcode from 'qrcode';
import path from 'path';
import fs from 'fs';
import logger from '../utils/logger.js';
import { getIO } from '../config/socket.js';
import WhatsAppMessage from '../models/whatsappMessage.model.js';

// Baileys needs a Pino-compatible logger
const baileysLogger = {
    level: 'silent',
    trace: () => {}, debug: () => {}, info: () => {},
    warn:  (m) => logger.warn(`[Baileys] ${typeof m === 'object' ? JSON.stringify(m) : m}`),
    error: (m) => logger.error(`[Baileys] ${typeof m === 'object' ? JSON.stringify(m) : m}`),
    fatal: (m) => logger.error(`[Baileys FATAL] ${typeof m === 'object' ? JSON.stringify(m) : m}`),
    child: () => baileysLogger,
};

// Base directory for all per-user auth state
const AUTH_BASE_DIR = path.join(process.cwd(), '.whatsapp-auth');

// ─────────────────────────────────────────────────────────────────────────────
// WhatsAppSession — one per logged-in user
// ─────────────────────────────────────────────────────────────────────────────
class WhatsAppSession {
    constructor(userId) {
        this.userId = userId.toString();
        this.sock = null;
        this.isConnected = false;
        this.phoneNumber = null;
        this._connecting = false;
        this.authDir = path.join(AUTH_BASE_DIR, this.userId);
    }

    // Emit an event only to this user's socket room
    _emit(event, data) {
        try {
            const io = getIO();
            io.to(`user:${this.userId}`).emit(event, data);
        } catch (e) {
            logger.warn(`[WhatsApp] Could not emit ${event} for user ${this.userId}: ${e.message}`);
        }
    }

    // ── Connect / Start ───────────────────────────────────────────────────────
    async connect() {
        if (this._connecting) {
            logger.info(`[WhatsApp] User ${this.userId}: Already connecting, skipping.`);
            return;
        }
        this._connecting = true;

        if (!fs.existsSync(this.authDir)) {
            fs.mkdirSync(this.authDir, { recursive: true });
        }

        try {
            const { state, saveCreds } = await useMultiFileAuthState(this.authDir);
            this.saveCreds = saveCreds;

            const { version } = await fetchLatestBaileysVersion();
            logger.info(`[WhatsApp] User ${this.userId}: Using Baileys v${version.join('.')}`);

            const sock = makeWASocket({
                version,
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, baileysLogger),
                },
                printQRInTerminal: false,
                browser: ['JSK Urja CRM', 'Chrome', '120.0.0.0'],
                logger: baileysLogger,
                generateHighQualityLinkPreview: false,
                connectTimeoutMs: 60000,
                defaultQueryTimeoutMs: 60000,
                keepAliveIntervalMs: 25000,
                markOnlineOnConnect: false,
                syncFullHistory: false,
            });

            this.sock = sock;

            // ── QR / Connection events ──────────────────────────────────────
            sock.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect, qr } = update;

                if (qr) {
                    logger.info(`[WhatsApp] User ${this.userId}: QR generated.`);
                    try {
                        const qrDataUrl = await qrcode.toDataURL(qr, {
                            errorCorrectionLevel: 'H', width: 300, margin: 2,
                            color: { dark: '#128c7e', light: '#ffffff' },
                        });
                        this._emit('whatsapp:qr', { qr: qrDataUrl });
                        this._emit('whatsapp:status', {
                            connected: false, loggedIn: false,
                            status: 'WAITING_SCAN', message: 'Scan the QR code with your WhatsApp',
                        });
                    } catch (e) {
                        logger.error(`[WhatsApp] User ${this.userId}: QR error: ${e.message}`);
                    }
                }

                if (connection === 'open') {
                    this.isConnected = true;
                    this._connecting = false;
                    this.phoneNumber = jidNormalizedUser(sock.user?.id || '').replace('@s.whatsapp.net', '');
                    logger.info(`[WhatsApp] User ${this.userId}: ✅ Connected as +${this.phoneNumber}`);
                    const readyData = {
                        connected: true, loggedIn: true,
                        phone: this.phoneNumber, status: 'CONNECTED',
                        message: `Connected as +${this.phoneNumber}`,
                    };
                    this._emit('whatsapp:ready', readyData);
                    this._emit('whatsapp:status', readyData);
                }

                if (connection === 'close') {
                    this.isConnected = false;
                    this._connecting = false;
                    const statusCode = lastDisconnect?.error?.output?.statusCode;
                    const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
                    logger.warn(`[WhatsApp] User ${this.userId}: Closed. Code: ${statusCode}. Reconnect: ${shouldReconnect}`);

                    if (shouldReconnect) {
                        this._emit('whatsapp:status', {
                            connected: false, loggedIn: false,
                            status: 'RECONNECTING', message: 'Connection lost, reconnecting...',
                        });
                        setTimeout(() => {
                            this.connect().catch(e =>
                                logger.error(`[WhatsApp] User ${this.userId}: Reconnect error: ${e.message}`)
                            );
                        }, 3000);
                    } else {
                        logger.info(`[WhatsApp] User ${this.userId}: Logged out. Clearing session.`);
                        this._clearAuth();
                        this._emit('whatsapp:status', {
                            connected: false, loggedIn: false,
                            status: 'LOGGED_OUT', message: 'Logged out from WhatsApp',
                        });
                    }
                }
            });

            sock.ev.on('creds.update', saveCreds);

            // ── Inbound message log (additive — feeds /whatsapp/chat UI) ──
            // Persists each text message (inbound + outbound) to WhatsAppMessage
            // and pushes a live socket event so the chat panel updates in
            // real time. Failures here MUST NOT break the existing Baileys
            // session, so everything is wrapped in try/catch.
            logger.info(`[WhatsApp-Chat] User ${this.userId}: messages.upsert listener REGISTERED`);
            sock.ev.on('messages.upsert', async ({ messages, type }) => {
                if (!Array.isArray(messages) || messages.length === 0) return;
                for (const m of messages) {
                    try {
                        if (!m || !m.key) continue;
                        const remoteJid = m.key.remoteJid;
                        if (!remoteJid || remoteJid === 'status@broadcast') continue;
                        const fromMe = !!m.key.fromMe;
                        const direction = fromMe ? 'out' : 'in';
                        const messageId = m.key.id || null;
                        const tsRaw = typeof m.messageTimestamp === 'number'
                            ? m.messageTimestamp
                            : (m.messageTimestamp?.toNumber?.() ?? Math.floor(Date.now() / 1000));
                        const timestamp = new Date(tsRaw * 1000);
                        const isGroup = remoteJid.endsWith('@g.us');
                        const participant = isGroup ? (m.key.participant || null) : null;

                        let text = '';
                        let mediaType = 'text';
                        let mediaFilename = '';
                        let mediaMime = '';
                        const c = m.message || {};
                        if (c.conversation) { text = c.conversation; mediaType = 'text'; }
                        else if (c.extendedTextMessage?.text) { text = c.extendedTextMessage.text; mediaType = 'text'; }
                        else if (c.imageMessage) {
                            text = c.imageMessage.caption || '[image]';
                            mediaType = 'image';
                            mediaMime = c.imageMessage.mimetype || 'image/jpeg';
                            mediaFilename = `image-${messageId || tsRaw}.${(mediaMime.split('/')[1] || 'jpg').split(';')[0]}`;
                        }
                        else if (c.videoMessage) {
                            text = c.videoMessage.caption || '[video]';
                            mediaType = 'video';
                            mediaMime = c.videoMessage.mimetype || 'video/mp4';
                            mediaFilename = `video-${messageId || tsRaw}.${(mediaMime.split('/')[1] || 'mp4').split(';')[0]}`;
                        }
                        else if (c.documentMessage) {
                            text = c.documentMessage.fileName || '[document]';
                            mediaType = 'document';
                            mediaMime = c.documentMessage.mimetype || 'application/octet-stream';
                            mediaFilename = c.documentMessage.fileName || `document-${messageId || tsRaw}`;
                        }
                        else if (c.audioMessage) {
                            text = '[audio]';
                            mediaType = 'audio';
                            mediaMime = c.audioMessage.mimetype || 'audio/ogg';
                            mediaFilename = `audio-${messageId || tsRaw}.${(mediaMime.split('/')[1] || 'ogg').split(';')[0]}`;
                        }
                        else if (c.stickerMessage) {
                            text = '[sticker]';
                            mediaType = 'sticker';
                            mediaMime = c.stickerMessage.mimetype || 'image/webp';
                            mediaFilename = `sticker-${messageId || tsRaw}.webp`;
                        }
                        else { text = ''; mediaType = 'unsupported'; }
                        // Only media-bearing messages need the raw envelope for later download.
                        const isMedia = ['image', 'video', 'audio', 'document', 'sticker'].includes(mediaType);

                        let doc = null;
                        try {
                            const mobile = isGroup ? '' : (remoteJid.split('@')[0] || '').replace(/\D/g, '');
                            doc = await WhatsAppMessage.findOneAndUpdate(
                                { userId: this.userId, messageId: messageId || `${remoteJid}:${tsRaw}:${direction}` },
                                {
                                    $setOnInsert: {
                                        userId: this.userId,
                                        jid: remoteJid,
                                        isGroup,
                                        participant,
                                        direction,
                                        fromMe,
                                        messageId: messageId || null,
                                        text,
                                        mediaType,
                                        timestamp,
                                        read: fromMe, // outbound is always "read"
                                        ...(mobile ? { mobile } : {}),
                                        ...(isMedia ? {
                                            mediaFilename,
                                            mediaMime,
                                            rawMessage: m,
                                        } : {}),
                                    },
                                },
                                { upsert: true, new: true, setDefaultsOnInsert: true }
                            );
                        } catch (dbErr) {
                            // Duplicate key on retry is fine; anything else: log + continue.
                            if (dbErr.code !== 11000) {
                                logger.warn(`[WhatsApp] User ${this.userId}: Could not persist message: ${dbErr.message}`);
                            }
                        }

                        if (doc) {
                            // Loud, structured log so we can prove via terminal that
                            // each real message touches the DB.
                            logger.info(
                                `[WhatsApp-Chat] User ${this.userId}: msg ${direction.toUpperCase()} `
                                + `jid=${remoteJid} type=${mediaType} text="${(text || '').slice(0, 60)}"`
                            );
                            this._emit('whatsapp:message', {
                                _id: doc._id, userId: this.userId,
                                jid: remoteJid, isGroup, participant,
                                direction, fromMe, messageId,
                                text, mediaType, timestamp,
                                ...(isMedia ? { mediaFilename, mediaMime, hasMedia: true } : {}),
                            });
                        }
                    } catch (e) {
                        logger.warn(`[WhatsApp-Chat] User ${this.userId}: upsert handler error: ${e.message}`);
                    }
                }
            });

            // ── History sync (additive — populates chat list with past chats) ──
            // Baileys fires this on initial connection with recent chats/messages
            // that the phone has synced over. Errors here MUST NOT break the
            // session, so everything is wrapped in try/catch.
            // ── Chat directory upsert ─────────────────────────────────────
            // Baileys emits chats.upsert / chats.update during the initial
            // history sync AND whenever a chat metadata changes. We persist
            // each as a "placeholder" doc so the left list shows every chat
            // the connected WhatsApp account knows about — same coverage as
            // WhatsApp Desktop. Real messages still flow via messages.upsert.
            const upsertChatStubs = async (incoming, opLabel) => {
                if (!Array.isArray(incoming) || !incoming.length) return;
                const ops = [];
                for (const c of incoming) {
                    if (!c?.id || c.id === 'status@broadcast') continue;
                    const isGroup = c.id.endsWith('@g.us');
                    const mobile = isGroup ? '' : (c.id.split('@')[0] || '').replace(/\D/g, '');
                    const name = c.name || c.subject || c.notify || '';
                    const ts = c.conversationTimestamp
                        ? new Date(Number(c.conversationTimestamp) * 1000)
                        : null;
                    // Insert a placeholder if missing, AND always update name/mobile
                    // (so renames / saved-contact updates are picked up).
                    ops.push({
                        updateOne: {
                            filter: { userId: this.userId, messageId: `placeholder:${c.id}` },
                            update: {
                                $setOnInsert: {
                                    userId: this.userId,
                                    jid: c.id,
                                    isGroup,
                                    direction: 'in',
                                    fromMe: false,
                                    messageId: `placeholder:${c.id}`,
                                    text: '',
                                    mediaType: 'placeholder',
                                    timestamp: ts || new Date(0),
                                    read: true,
                                },
                                $set: {
                                    ...(name ? { chatName: name } : {}),
                                    ...(mobile ? { mobile } : {}),
                                },
                            },
                            upsert: true,
                        }
                    });
                }
                if (ops.length) {
                    try {
                        await WhatsAppMessage.bulkWrite(ops, { ordered: false });
                        logger.info(`[WhatsApp-Chat] User ${this.userId}: ${opLabel} — upserted ${ops.length} chat stub${ops.length > 1 ? 's' : ''}`);
                    } catch (e) {
                        if (e.code !== 11000) {
                            logger.warn(`[WhatsApp-Chat] User ${this.userId}: ${opLabel} bulk error: ${e.message}`);
                        }
                    }
                }
            };

            logger.info(`[WhatsApp-Chat] User ${this.userId}: chats.upsert/update listeners REGISTERED`);
            sock.ev.on('chats.upsert', (chats) => upsertChatStubs(chats, 'chats.upsert'));
            sock.ev.on('chats.update', (chats) => upsertChatStubs(chats, 'chats.update'));

            // ── Contact directory upsert ──────────────────────────────────
            // contacts.upsert / contacts.update tell us a JID is a saved
            // address-book contact with a name. We mark isContact=true and
            // copy the name into chatName so the chat row shows "John Doe"
            // instead of "+919xxxxxxxxx".
            const upsertContactStubs = async (incoming, opLabel) => {
                if (!Array.isArray(incoming) || !incoming.length) return;
                const ops = [];
                for (const c of incoming) {
                    if (!c?.id || c.id === 'status@broadcast') continue;
                    const isGroup = c.id.endsWith('@g.us');
                    if (isGroup) continue;  // groups handled by chats.* events
                    const mobile = (c.id.split('@')[0] || '').replace(/\D/g, '');
                    const name = c.name || c.notify || c.verifiedName || '';
                    ops.push({
                        updateOne: {
                            filter: { userId: this.userId, messageId: `placeholder:${c.id}` },
                            update: {
                                $setOnInsert: {
                                    userId: this.userId,
                                    jid: c.id,
                                    isGroup: false,
                                    direction: 'in',
                                    fromMe: false,
                                    messageId: `placeholder:${c.id}`,
                                    text: '',
                                    mediaType: 'placeholder',
                                    timestamp: new Date(0),
                                    read: true,
                                },
                                $set: {
                                    ...(name ? { chatName: name, isContact: true } : { isContact: true }),
                                    ...(mobile ? { mobile } : {}),
                                },
                            },
                            upsert: true,
                        }
                    });
                }
                if (ops.length) {
                    try {
                        await WhatsAppMessage.bulkWrite(ops, { ordered: false });
                        logger.info(`[WhatsApp-Chat] User ${this.userId}: ${opLabel} — upserted ${ops.length} contact stub${ops.length > 1 ? 's' : ''}`);
                    } catch (e) {
                        if (e.code !== 11000) {
                            logger.warn(`[WhatsApp-Chat] User ${this.userId}: ${opLabel} bulk error: ${e.message}`);
                        }
                    }
                }
            };

            logger.info(`[WhatsApp-Chat] User ${this.userId}: contacts.upsert/update listeners REGISTERED`);
            sock.ev.on('contacts.upsert', (contacts) => upsertContactStubs(contacts, 'contacts.upsert'));
            sock.ev.on('contacts.update', (contacts) => upsertContactStubs(contacts, 'contacts.update'));

            logger.info(`[WhatsApp-Chat] User ${this.userId}: messaging-history.set listener REGISTERED`);
            sock.ev.on('messaging-history.set', async ({ chats, messages, isLatest }) => {
                try {
                    const chatCount = Array.isArray(chats) ? chats.length : 0;
                    const msgCount = Array.isArray(messages) ? messages.length : 0;
                    logger.info(`[WhatsApp-Chat] User ${this.userId}: HISTORY SYNC — chats=${chatCount} msgs=${msgCount} isLatest=${!!isLatest}`);

                    // 1) Save each chat as a placeholder so the list shows it
                    //    even when no message body is available locally yet.
                    if (Array.isArray(chats) && chats.length) {
                        const chatOps = [];
                        for (const c of chats) {
                            if (!c?.id || c.id === 'status@broadcast') continue;
                            const isGroup = c.id.endsWith('@g.us');
                            chatOps.push({
                                updateOne: {
                                    filter: { userId: this.userId, messageId: `placeholder:${c.id}` },
                                    update: {
                                        $setOnInsert: {
                                            userId: this.userId,
                                            jid: c.id,
                                            isGroup,
                                            direction: 'in',
                                            fromMe: false,
                                            messageId: `placeholder:${c.id}`,
                                            text: '',
                                            chatName: c.name || c.subject || '',
                                            mediaType: 'placeholder',
                                            timestamp: c.conversationTimestamp
                                                ? new Date(Number(c.conversationTimestamp) * 1000)
                                                : new Date(0),
                                            read: true,
                                        },
                                    },
                                    upsert: true,
                                }
                            });
                        }
                        if (chatOps.length) {
                            await WhatsAppMessage.bulkWrite(chatOps, { ordered: false }).catch(err => {
                                if (err.code !== 11000) {
                                    logger.warn(`[WhatsApp] User ${this.userId}: chat-stub bulk error: ${err.message}`);
                                }
                            });
                        }
                    }

                    // 2) Save each historical message (same shape as messages.upsert)
                    if (Array.isArray(messages) && messages.length) {
                        const msgOps = [];
                        for (const m of messages) {
                            if (!m?.key) continue;
                            const remoteJid = m.key.remoteJid;
                            if (!remoteJid || remoteJid === 'status@broadcast') continue;
                            const fromMe = !!m.key.fromMe;
                            const direction = fromMe ? 'out' : 'in';
                            const messageId = m.key.id || null;
                            const tsRaw = typeof m.messageTimestamp === 'number'
                                ? m.messageTimestamp
                                : (m.messageTimestamp?.toNumber?.() ?? Math.floor(Date.now() / 1000));
                            const timestamp = new Date(tsRaw * 1000);
                            const isGroup = remoteJid.endsWith('@g.us');
                            const participant = isGroup ? (m.key.participant || null) : null;

                            let text = '';
                            let mediaType = 'text';
                            const c = m.message || {};
                            if (c.conversation) { text = c.conversation; mediaType = 'text'; }
                            else if (c.extendedTextMessage?.text) { text = c.extendedTextMessage.text; mediaType = 'text'; }
                            else if (c.imageMessage)    { text = c.imageMessage.caption || '[image]';       mediaType = 'image'; }
                            else if (c.videoMessage)    { text = c.videoMessage.caption || '[video]';       mediaType = 'video'; }
                            else if (c.documentMessage) { text = c.documentMessage.fileName || '[document]'; mediaType = 'document'; }
                            else if (c.audioMessage)    { text = '[audio]';   mediaType = 'audio'; }
                            else if (c.stickerMessage)  { text = '[sticker]'; mediaType = 'sticker'; }
                            else { text = ''; mediaType = 'unsupported'; }

                            msgOps.push({
                                updateOne: {
                                    filter: { userId: this.userId, messageId: messageId || `${remoteJid}:${tsRaw}:${direction}` },
                                    update: {
                                        $setOnInsert: {
                                            userId: this.userId, jid: remoteJid, isGroup, participant,
                                            direction, fromMe, messageId,
                                            text, mediaType, timestamp,
                                            read: fromMe,
                                        },
                                    },
                                    upsert: true,
                                }
                            });
                        }
                        if (msgOps.length) {
                            await WhatsAppMessage.bulkWrite(msgOps, { ordered: false }).catch(err => {
                                if (err.code !== 11000) {
                                    logger.warn(`[WhatsApp] User ${this.userId}: history bulk error: ${err.message}`);
                                }
                            });
                        }
                    }

                    // 3) Tell the UI to refresh its chat list.
                    this._emit('whatsapp:history-sync', {
                        chats: Array.isArray(chats) ? chats.length : 0,
                        messages: Array.isArray(messages) ? messages.length : 0,
                        isLatest: !!isLatest,
                    });
                } catch (e) {
                    logger.warn(`[WhatsApp] User ${this.userId}: history-set handler error: ${e.message}`);
                }
            });

        } catch (error) {
            this._connecting = false;
            logger.error(`[WhatsApp] User ${this.userId}: Connect error: ${error.message}`);
            this._emit('whatsapp:status', {
                connected: false, loggedIn: false,
                status: 'ERROR', message: `Connection error: ${error.message}`,
            });
            throw error;
        }
    }

    // ── Status ────────────────────────────────────────────────────────────────
    getStatus() {
        if (!this.sock || !this.isConnected) {
            const hasSession = fs.existsSync(path.join(this.authDir, 'creds.json'));
            return {
                connected: false, loggedIn: false, hasSession,
                status: this._connecting ? 'CONNECTING' : 'DISCONNECTED',
                message: this._connecting ? 'Connecting...' : hasSession ? 'Session found, reconnecting...' : 'Not connected',
            };
        }
        return {
            connected: true, loggedIn: true,
            phone: this.phoneNumber, status: 'CONNECTED',
            message: `Connected as +${this.phoneNumber}`,
        };
    }

    // ── Disconnect ────────────────────────────────────────────────────────────
    async disconnect() {
        if (this.sock) {
            try { await this.sock.logout(); this.sock.end(); } catch (_) {}
            this.sock = null;
        }
        this.isConnected = false;
        this._connecting = false;
        this.phoneNumber = null;
        this._clearAuth();
        logger.info(`[WhatsApp] User ${this.userId}: Disconnected.`);
    }

    _clearAuth() {
        try {
            if (fs.existsSync(this.authDir)) {
                fs.rmSync(this.authDir, { recursive: true, force: true });
            }
        } catch (e) {
            logger.warn(`[WhatsApp] User ${this.userId}: Could not clear auth: ${e.message}`);
        }
    }

    _assertConnected() {
        if (!this.sock || !this.isConnected) {
            throw new Error('WhatsApp is not connected. Please go to WhatsApp settings and scan the QR code first.');
        }
    }

    _toJid(phone) {
        const digits = String(phone).replace(/\D/g, '');
        const fullNumber = digits.startsWith('91') ? digits : (digits.length === 10 ? `91${digits}` : digits);
        return `${fullNumber}@s.whatsapp.net`;
    }

    // ── Send Text ─────────────────────────────────────────────────────────────
    async sendMessage({ phone, message }) {
        this._assertConnected();
        const jid = this._toJid(phone);
        logger.info(`[WhatsApp] User ${this.userId}: Sending text to ${jid}`);
        await this.sock.sendMessage(jid, { text: message });
        return { success: true };
    }

    // ── Send to a raw JID (used by /whatsapp/chat panel) ──────────────────────
    // Accepts either a 1:1 JID (xxx@s.whatsapp.net) or a group JID (xxx@g.us)
    // and lets Baileys route accordingly. Does NOT touch sendMessage/sendDocument
    // logic above.
    async sendRawToJid(jid, payload) {
        this._assertConnected();
        if (!jid || !jid.includes('@')) throw new Error('Invalid JID');
        logger.info(`[WhatsApp-Chat] User ${this.userId}: Sending raw to ${jid}`);
        const sent = await this.sock.sendMessage(jid, payload);
        return { success: true, sent };
    }

    // ── Download media bytes from a previously persisted Baileys message ──
    // `rawMessage` is the full envelope captured by messages.upsert (the
    // `m` object), required by Baileys' downloadMediaMessage. Returns a
    // Buffer of the actual file bytes (image/video/audio/document/sticker).
    // Note: WhatsApp servers expire some media URLs over time — for very
    // old messages this may throw with a 410/404. We let the caller decide
    // how to surface that to the user.
    async downloadMediaForMessage(rawMessage) {
        this._assertConnected();
        if (!rawMessage || !rawMessage.message) {
            throw new Error('Message has no media payload to download');
        }
        const buffer = await downloadMediaMessage(
            rawMessage,
            'buffer',
            {},
            {
                logger: baileysLogger,
                reuploadRequest: this.sock.updateMediaMessage,
            }
        );
        return buffer;
    }

    // ── On-demand: enumerate participating groups and seed them as chats ──
    // Used by POST /whatsapp-chat/sync to populate the chat list immediately
    // without waiting for new messages. 1:1 chats can only be populated when
    // Baileys fires messaging-history.set (on connect) or when a real message
    // arrives via messages.upsert.
    async syncChats() {
        this._assertConnected();
        logger.info(`[WhatsApp-Chat] User ${this.userId}: syncChats() — pulling groups from Baileys`);
        let groupCount = 0;
        try {
            const groups = await this.sock.groupFetchAllParticipating();
            const entries = Object.entries(groups || {});
            if (entries.length) {
                const ops = entries.map(([jid, meta]) => ({
                    updateOne: {
                        filter: { userId: this.userId, messageId: `placeholder:${jid}` },
                        update: {
                            $setOnInsert: {
                                userId: this.userId,
                                jid,
                                isGroup: true,
                                direction: 'in',
                                fromMe: false,
                                messageId: `placeholder:${jid}`,
                                text: '',
                                chatName: meta?.subject || '',
                                mediaType: 'placeholder',
                                timestamp: meta?.creation
                                    ? new Date(Number(meta.creation) * 1000)
                                    : new Date(0),
                                read: true,
                            },
                        },
                        upsert: true,
                    }
                }));
                await WhatsAppMessage.bulkWrite(ops, { ordered: false }).catch(err => {
                    if (err.code !== 11000) {
                        logger.warn(`[WhatsApp] User ${this.userId}: sync bulk error: ${err.message}`);
                    }
                });
                groupCount = ops.length;
            }
            logger.info(`[WhatsApp-Chat] User ${this.userId}: syncChats() — saved ${groupCount} group placeholders`);
        } catch (e) {
            logger.warn(`[WhatsApp-Chat] User ${this.userId}: syncChats groupFetch error: ${e.message}`);
        }
        return { groupCount };
    }

    // ── Send Document to Number ───────────────────────────────────────────────
    async sendDocument({ phone, filePath, caption = '', fileName }) {
        this._assertConnected();
        const jid = this._toJid(phone);
        if (!fs.existsSync(filePath)) throw new Error(`File not found: ${filePath}`);
        const fileBuffer = fs.readFileSync(filePath);
        const resolvedName = fileName || path.basename(filePath);
        const mimetype = filePath.endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream';
        logger.info(`[WhatsApp] User ${this.userId}: Sending doc "${resolvedName}" to ${jid}`);
        await this.sock.sendMessage(jid, { document: fileBuffer, fileName: resolvedName, mimetype, caption });
        return { success: true };
    }

    // ── Send Document to Group ────────────────────────────────────────────────
    async sendDocumentToGroup({ groupId, filePath, caption = '', fileName }) {
        this._assertConnected();
        if (!fs.existsSync(filePath)) throw new Error(`File not found: ${filePath}`);
        const fileBuffer = fs.readFileSync(filePath);
        const resolvedName = fileName || path.basename(filePath);
        const mimetype = filePath.endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream';
        logger.info(`[WhatsApp] User ${this.userId}: Sending doc "${resolvedName}" to group ${groupId}`);
        await this.sock.sendMessage(groupId, { document: fileBuffer, fileName: resolvedName, mimetype, caption });
        return { success: true };
    }

    // ── Fetch Groups ──────────────────────────────────────────────────────────
    async getGroups() {
        this._assertConnected();
        try {
            const groupMap = await this.sock.groupFetchAllParticipating();
            const groups = Object.values(groupMap).map(g => ({
                id: g.id, name: g.subject, participants: g.participants?.length || 0,
            })).sort((a, b) => a.name.localeCompare(b.name));
            logger.info(`[WhatsApp] User ${this.userId}: Found ${groups.length} groups.`);
            return groups;
        } catch (e) {
            throw new Error(`Failed to fetch groups: ${e.message}`);
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// WhatsAppServiceManager — manages all per-user sessions
// ─────────────────────────────────────────────────────────────────────────────
class WhatsAppServiceManager {
    constructor() {
        this.sessions = new Map(); // userId (string) -> WhatsAppSession
    }

    _getOrCreate(userId) {
        const id = userId.toString();
        if (!this.sessions.has(id)) {
            this.sessions.set(id, new WhatsAppSession(id));
        }
        return this.sessions.get(id);
    }

    async connect(userId) {
        return this._getOrCreate(userId).connect();
    }

    getStatus(userId) {
        const id = userId.toString();
        if (!this.sessions.has(id)) {
            // Check if a saved auth dir exists for this user
            const hasSession = fs.existsSync(path.join(AUTH_BASE_DIR, id, 'creds.json'));
            return {
                connected: false, loggedIn: false, hasSession,
                status: 'DISCONNECTED',
                message: hasSession ? 'Session found, reconnecting...' : 'Not connected',
            };
        }
        return this.sessions.get(id).getStatus();
    }

    async disconnect(userId) {
        const id = userId.toString();
        const session = this.sessions.get(id);
        if (session) {
            await session.disconnect();
            this.sessions.delete(id);
        }
    }

    async sendMessage(userId, params) {
        return this._getOrCreate(userId).sendMessage(params);
    }

    async sendRawToJid(userId, jid, payload) {
        return this._getOrCreate(userId).sendRawToJid(jid, payload);
    }

    async downloadMediaForMessage(userId, rawMessage) {
        return this._getOrCreate(userId).downloadMediaForMessage(rawMessage);
    }

    async syncChats(userId) {
        return this._getOrCreate(userId).syncChats();
    }

    async sendDocument(userId, params) {
        return this._getOrCreate(userId).sendDocument(params);
    }

    async sendDocumentToGroup(userId, params) {
        return this._getOrCreate(userId).sendDocumentToGroup(params);
    }

    async getGroups(userId) {
        return this._getOrCreate(userId).getGroups();
    }

    // ── Auto-reconnect on server start ────────────────────────────────────────
    async initializeSavedSessions() {
        if (!fs.existsSync(AUTH_BASE_DIR)) return;
        const entries = fs.readdirSync(AUTH_BASE_DIR, { withFileTypes: true });
        for (const entry of entries) {
            if (!entry.isDirectory()) continue;
            const userId = entry.name;
            const credsPath = path.join(AUTH_BASE_DIR, userId, 'creds.json');
            if (fs.existsSync(credsPath)) {
                logger.info(`[WhatsApp] Auto-reconnecting saved session for user: ${userId}`);
                this.connect(userId).catch(e =>
                    logger.error(`[WhatsApp] Auto-reconnect failed for user ${userId}: ${e.message}`)
                );
            }
        }
    }
}

export default new WhatsAppServiceManager();
