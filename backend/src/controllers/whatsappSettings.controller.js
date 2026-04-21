import httpStatus from 'http-status';
import catchAsync from '../utils/catchAsync.js';
import WhatsAppSettings from '../models/whatsappSettings.model.js';
import WhatsAppService from '../services/whatsapp.service.js';
import logger from '../utils/logger.js';

// ─── Settings CRUD ────────────────────────────────────────────────────────────

const getSettings = catchAsync(async (req, res) => {
    let settings = await WhatsAppSettings.findOne();
    if (!settings) settings = await WhatsAppSettings.create({});
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

// ─── Connection Status (per-user) ─────────────────────────────────────────────

const getSessionStatus = catchAsync(async (req, res) => {
    const userId = req.user._id || req.user.id;
    const status = WhatsAppService.getStatus(userId);
    res.json(status);
});

// ─── Connect — Non-blocking (per-user) ───────────────────────────────────────

const connectWhatsApp = catchAsync(async (req, res) => {
    const userId = req.user._id || req.user.id;
    // Respond immediately; QR arrives via Socket.io to user:{userId}
    res.json({ success: true, message: 'Connecting... Watch for QR code in the panel below.' });

    WhatsAppService.connect(userId).catch(err => {
        logger.error(`[WhatsApp] Background connect error for user ${userId}: ${err.message}`);
    });
});

// ─── Disconnect (per-user) ────────────────────────────────────────────────────

const disconnectWhatsApp = catchAsync(async (req, res) => {
    const userId = req.user._id || req.user.id;
    await WhatsAppService.disconnect(userId);
    res.json({ success: true, message: 'WhatsApp session cleared. Scan QR again to reconnect.' });
});

// ─── Get Groups (per-user) ────────────────────────────────────────────────────

const getGroups = catchAsync(async (req, res) => {
    const userId = req.user._id || req.user.id;
    try {
        const groups = await WhatsAppService.getGroups(userId);
        res.json({ success: true, groups });
    } catch (e) {
        res.status(httpStatus.BAD_REQUEST).json({ success: false, message: e.message });
    }
});

// ─── Send Text Message (per-user) ─────────────────────────────────────────────

const sendMessage = catchAsync(async (req, res) => {
    const userId = req.user._id || req.user.id;
    try {
        const result = await WhatsAppService.sendMessage(userId, req.body);
        res.json(result);
    } catch (e) {
        logger.error(`[WhatsApp] Send message error for user ${userId}: ${e.message}`);
        res.status(httpStatus.BAD_REQUEST).json({ success: false, message: e.message });
    }
});

// ─── Send Document (per-user) ────────────────────────────────────────────────

const sendDocument = catchAsync(async (req, res) => {
    const userId = req.user._id || req.user.id;
    try {
        const result = await WhatsAppService.sendDocument(userId, req.body);
        res.json(result);
    } catch (e) {
        logger.error(`[WhatsApp] Send document error for user ${userId}: ${e.message}`);
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
