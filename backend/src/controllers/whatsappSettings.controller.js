import httpStatus from 'http-status';
import catchAsync from '../utils/catchAsync.js';
import WhatsAppSettings from '../models/whatsappSettings.model.js';
import WhatsAppAutomationService from '../services/whatsapp.automation.js';
import path from 'path';
import fs from 'fs';

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

const getSessionStatus = catchAsync(async (req, res) => {
    const sessionDir = path.join(process.cwd(), '.whatsapp-session');
    const profileExists = fs.existsSync(path.join(sessionDir, 'Default', 'Cookies')) ||
        fs.existsSync(path.join(sessionDir, 'Default', 'Local Storage'));
    res.json({ connected: profileExists, sessionDir });
});

const connectWhatsApp = catchAsync(async (req, res) => {
    try {
        const result = await WhatsAppAutomationService.connectAndWaitForLogin();
        res.json({ success: true, message: result });
    } catch (e) {
        res.status(httpStatus.BAD_REQUEST).json({ success: false, message: e.message });
    }
});

const disconnectWhatsApp = catchAsync(async (req, res) => {
    try {
        await WhatsAppAutomationService.disconnect();
        // Clear session files
        const sessionDir = path.join(process.cwd(), '.whatsapp-session');
        if (fs.existsSync(sessionDir)) {
            fs.rmSync(sessionDir, { recursive: true, force: true });
        }
        res.json({ success: true, message: 'WhatsApp session cleared. You will need to scan QR again on next use.' });
    } catch (e) {
        res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ success: false, message: e.message });
    }
});

export {
    getSettings,
    updateSettings,
    getSessionStatus,
    connectWhatsApp,
    disconnectWhatsApp
};

