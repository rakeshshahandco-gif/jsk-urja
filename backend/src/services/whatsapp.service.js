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
} from '@whiskeysockets/baileys';
import qrcode from 'qrcode';
import path from 'path';
import fs from 'fs';
import logger from '../utils/logger.js';
import { getIO } from '../config/socket.js';

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
