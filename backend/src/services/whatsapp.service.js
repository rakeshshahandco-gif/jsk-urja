/**
 * WhatsApp Service — Baileys-based headless implementation
 * Replaces Puppeteer-based whatsapp.automation.js for login + sending.
 *
 * QR codes are emitted via Socket.io → 'whatsapp:qr'
 * Connection status is emitted via Socket.io → 'whatsapp:status'
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

// Baileys needs a Pino-compatible logger. Our logger is Winston, so we provide
// a passthrough wrapper. Set to 'silent' so Baileys doesn't flood logs.
const baileysLogger = {
    level: 'silent',
    trace: () => {}, debug: () => {}, info: () => {},
    warn:  (m) => logger.warn(`[Baileys] ${typeof m === 'object' ? JSON.stringify(m) : m}`),
    error: (m) => logger.error(`[Baileys] ${typeof m === 'object' ? JSON.stringify(m) : m}`),
    fatal: (m) => logger.error(`[Baileys FATAL] ${typeof m === 'object' ? JSON.stringify(m) : m}`),
    child: () => baileysLogger,
};

// Auth state directory — persists session across server restarts
const AUTH_DIR = path.join(process.cwd(), '.whatsapp-auth');

class WhatsAppService {
    constructor() {
        this.sock = null;
        this.authState = null;
        this.saveCreds = null;
        this.isConnected = false;
        this.phoneNumber = null;
        this._connecting = false;
    }

    // ─── Internal: emit to all clients in the whatsapp room ─────────────────
    _emit(event, data) {
        try {
            const io = getIO();
            io.to('whatsapp_room').emit(event, data);
        } catch (e) {
            // Socket not yet initialized — ignore
            logger.warn(`[WhatsApp] Could not emit ${event}: ${e.message}`);
        }
    }

    // ─── Connect / Start ─────────────────────────────────────────────────────
    async connect() {
        if (this._connecting) {
            logger.info('[WhatsApp] Already connecting, skipping duplicate call.');
            return;
        }

        this._connecting = true;

        // Ensure auth directory exists
        if (!fs.existsSync(AUTH_DIR)) {
            fs.mkdirSync(AUTH_DIR, { recursive: true });
        }

        try {
            const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
            this.authState = state;
            this.saveCreds = saveCreds;

            const { version } = await fetchLatestBaileysVersion();
            logger.info(`[WhatsApp] Using Baileys v${version.join('.')}`);

            const sock = makeWASocket({
                version,
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, baileysLogger),
                },
                printQRInTerminal: false, // We handle QR ourselves
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

            // ── QR Code Event ──────────────────────────────────────────────
            sock.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect, qr } = update;

                if (qr) {
                    logger.info('[WhatsApp] QR code generated, emitting to frontend...');
                    try {
                        // Convert raw QR string to a base64 PNG data URL
                        const qrDataUrl = await qrcode.toDataURL(qr, {
                            errorCorrectionLevel: 'H',
                            width: 300,
                            margin: 2,
                            color: { dark: '#128c7e', light: '#ffffff' },
                        });
                        this._emit('whatsapp:qr', { qr: qrDataUrl });
                        this._emit('whatsapp:status', {
                            connected: false,
                            loggedIn: false,
                            status: 'WAITING_SCAN',
                            message: 'Scan the QR code with your WhatsApp',
                        });
                    } catch (e) {
                        logger.error(`[WhatsApp] QR generation error: ${e.message}`);
                    }
                }

                if (connection === 'open') {
                    this.isConnected = true;
                    this._connecting = false;
                    this.phoneNumber = jidNormalizedUser(sock.user?.id || '').replace('@s.whatsapp.net', '');
                    logger.info(`[WhatsApp] ✅ Connected as: ${this.phoneNumber}`);
                    this._emit('whatsapp:ready', {
                        connected: true,
                        loggedIn: true,
                        phone: this.phoneNumber,
                        status: 'CONNECTED',
                        message: `Connected as +${this.phoneNumber}`,
                    });
                    this._emit('whatsapp:status', {
                        connected: true,
                        loggedIn: true,
                        phone: this.phoneNumber,
                        status: 'CONNECTED',
                        message: `Connected as +${this.phoneNumber}`,
                    });
                }

                if (connection === 'close') {
                    this.isConnected = false;
                    this._connecting = false;

                    const statusCode = lastDisconnect?.error?.output?.statusCode;
                    const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

                    logger.warn(`[WhatsApp] Connection closed. Code: ${statusCode}. Reconnect: ${shouldReconnect}`);

                    if (shouldReconnect) {
                        logger.info('[WhatsApp] Reconnecting in 3 seconds...');
                        this._emit('whatsapp:status', {
                            connected: false,
                            loggedIn: false,
                            status: 'RECONNECTING',
                            message: 'Connection lost, reconnecting...',
                        });
                        setTimeout(() => {
                            this.connect().catch(e => logger.error(`[WhatsApp] Reconnect error: ${e.message}`));
                        }, 3000);
                    } else {
                        // Logged out — clear session
                        logger.info('[WhatsApp] Logged out. Clearing session.');
                        this._clearAuth();
                        this._emit('whatsapp:status', {
                            connected: false,
                            loggedIn: false,
                            status: 'LOGGED_OUT',
                            message: 'Logged out from WhatsApp',
                        });
                    }
                }
            });

            // ── Save Credentials when updated ─────────────────────────────
            sock.ev.on('creds.update', this.saveCreds);

        } catch (error) {
            this._connecting = false;
            logger.error(`[WhatsApp] Connect error: ${error.message}`);
            this._emit('whatsapp:status', {
                connected: false,
                loggedIn: false,
                status: 'ERROR',
                message: `Connection error: ${error.message}`,
            });
            throw error;
        }
    }

    // ─── Get current status ───────────────────────────────────────────────────
    getStatus() {
        if (!this.sock || !this.isConnected) {
            // Check if auth files exist (session saved from before)
            const hasSession = fs.existsSync(path.join(AUTH_DIR, 'creds.json'));
            return {
                connected: false,
                loggedIn: false,
                hasSession,
                status: this._connecting ? 'CONNECTING' : 'DISCONNECTED',
                message: this._connecting ? 'Connecting...' : hasSession ? 'Session found, reconnecting...' : 'Not connected',
            };
        }
        return {
            connected: true,
            loggedIn: true,
            phone: this.phoneNumber,
            status: 'CONNECTED',
            message: `Connected as +${this.phoneNumber}`,
        };
    }

    // ─── Disconnect ───────────────────────────────────────────────────────────
    async disconnect() {
        if (this.sock) {
            try {
                await this.sock.logout();
                this.sock.end();
            } catch (_) { /* ignore */ }
            this.sock = null;
        }
        this.isConnected = false;
        this._connecting = false;
        this.phoneNumber = null;
        this._clearAuth();
        logger.info('[WhatsApp] Disconnected and session cleared.');
    }

    _clearAuth() {
        try {
            if (fs.existsSync(AUTH_DIR)) {
                fs.rmSync(AUTH_DIR, { recursive: true, force: true });
            }
        } catch (e) {
            logger.warn(`[WhatsApp] Could not clear auth dir: ${e.message}`);
        }
    }

    // ─── Ensure socket is ready before sending ────────────────────────────────
    _assertConnected() {
        if (!this.sock || !this.isConnected) {
            throw new Error('WhatsApp is not connected. Please go to Settings → WhatsApp and scan the QR code first.');
        }
    }

    // ─── Normalize Indian phone number to JID ─────────────────────────────────
    _toJid(phone) {
        const digits = String(phone).replace(/\D/g, '');
        const fullNumber = digits.startsWith('91') ? digits : (digits.length === 10 ? `91${digits}` : digits);
        return `${fullNumber}@s.whatsapp.net`;
    }

    // ─── Send Text Message ────────────────────────────────────────────────────
    async sendMessage({ phone, message }) {
        this._assertConnected();
        const jid = this._toJid(phone);
        logger.info(`[WhatsApp] Sending text to ${jid}`);
        await this.sock.sendMessage(jid, { text: message });
        return { success: true };
    }

    // ─── Send Document (PDF, etc.) ────────────────────────────────────────────
    async sendDocument({ phone, filePath, caption = '', fileName }) {
        this._assertConnected();
        const jid = this._toJid(phone);

        if (!fs.existsSync(filePath)) {
            throw new Error(`File not found: ${filePath}`);
        }

        const fileBuffer = fs.readFileSync(filePath);
        const resolvedName = fileName || path.basename(filePath);
        const mimetype = filePath.endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream';

        logger.info(`[WhatsApp] Sending document "${resolvedName}" to ${jid}`);

        await this.sock.sendMessage(jid, {
            document: fileBuffer,
            fileName: resolvedName,
            mimetype,
            caption,
        });

        return { success: true };
    }

    // ─── Get WhatsApp Groups from Baileys ─────────────────────────────────────
    async getGroups() {
        this._assertConnected();
        try {
            logger.info('[WhatsApp] Fetching groups via groupFetchAllParticipating...');
            const groupMap = await this.sock.groupFetchAllParticipating();
            // groupMap is { [jid]: GroupMetadata }
            const groups = Object.values(groupMap).map(g => ({
                id: g.id,           // e.g. "1234567890-12345678@g.us"
                name: g.subject,    // Group display name
                participants: g.participants?.length || 0,
            })).sort((a, b) => a.name.localeCompare(b.name));
            logger.info(`[WhatsApp] Found ${groups.length} groups.`);
            return groups;
        } catch (e) {
            logger.error(`[WhatsApp] getGroups error: ${e.message}`);
            throw new Error(`Failed to fetch groups: ${e.message}`);
        }
    }

    // ─── Send Document to Group by JID ────────────────────────────────────────
    async sendDocumentToGroup({ groupId, filePath, caption = '', fileName }) {
        this._assertConnected();

        if (!fs.existsSync(filePath)) {
            throw new Error(`File not found: ${filePath}`);
        }

        const fileBuffer = fs.readFileSync(filePath);
        const resolvedName = fileName || path.basename(filePath);
        const mimetype = filePath.endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream';

        logger.info(`[WhatsApp] Sending document "${resolvedName}" to group ${groupId}`);

        await this.sock.sendMessage(groupId, {
            document: fileBuffer,
            fileName: resolvedName,
            mimetype,
            caption,
        });

        return { success: true };
    }
}

export default new WhatsAppService();
