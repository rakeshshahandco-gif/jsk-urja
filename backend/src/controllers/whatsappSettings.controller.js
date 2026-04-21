import httpStatus from 'http-status';
import catchAsync from '../utils/catchAsync.js';
import WhatsAppSettings from '../models/whatsappSettings.model.js';
import WhatsAppService from '../services/whatsapp.service.js';
import logger from '../utils/logger.js';
import path from 'path';

// ─── Settings CRUD ────────────────────────────────────────────────────────────

const getSettings = catchAsync(async (req, res) => {
    let settings = await WhatsAppSettings.findOne();
    if (!settings) {
        settings = await WhatsAppSettings.create({});
    }
    res.send(settings);
});

const updateSettings = catchAsync(async (req, res) => {
    let settings = await WhatsAppSettings.findOne();
    if (!settings) {
        settings = new WhatsAppSettings(req.body);
    } else {
        Object.assign(settings, req.body);
    }
    await settings.save();
    res.send(settings);
});

// ─── Connection Status ────────────────────────────────────────────────────────

const getSessionStatus = catchAsync(async (req, res) => {
    const status = WhatsAppService.getStatus();
    res.json(status);
});

// ─── Connect — Non-blocking ───────────────────────────────────────────────────
// Immediately returns 200; QR code is pushed to frontend via Socket.io
const connectWhatsApp = catchAsync(async (req, res) => {
    // Respond immediately so the HTTP request doesn't timeout
    res.json({ success: true, message: 'Connecting... Watch for QR code in the panel below.' });

    // Start connection in background
    WhatsAppService.connect().catch(err => {
        logger.error(`[WhatsApp Controller] Background connect error: ${err.message}`);
    });
});

// ─── Disconnect ───────────────────────────────────────────────────────────────

const disconnectWhatsApp = catchAsync(async (req, res) => {
    await WhatsAppService.disconnect();
    res.json({ success: true, message: 'WhatsApp session cleared. Scan QR again to reconnect.' });
});

// ─── Get Groups / Chats ───────────────────────────────────────────────────────

const getGroups = catchAsync(async (req, res) => {
    try {
        const groups = await WhatsAppService.getGroups();
        res.json({ success: true, groups });
    } catch (e) {
        res.status(httpStatus.BAD_REQUEST).json({ success: false, message: e.message });
    }
});

// ─── Send Text Message ────────────────────────────────────────────────────────

const sendMessage = catchAsync(async (req, res) => {
    try {
        const result = await WhatsAppService.sendMessage(req.body);
        res.json(result);
    } catch (e) {
        logger.error(`[WhatsApp] Send message error: ${e.message}`);
        res.status(httpStatus.BAD_REQUEST).json({ success: false, message: e.message });
    }
});

// ─── Send Document ────────────────────────────────────────────────────────────

const sendDocument = catchAsync(async (req, res) => {
    try {
        const result = await WhatsAppService.sendDocument(req.body);
        res.json(result);
    } catch (e) {
        logger.error(`[WhatsApp] Send document error: ${e.message}`);
        res.status(httpStatus.BAD_REQUEST).json({ success: false, message: e.message });
    }
});

export {
    getSettings,
    updateSettings,
    getSessionStatus,
    connectWhatsApp,
    disconnectWhatsApp,
    getGroups,
    sendMessage,
    sendDocument,
};
