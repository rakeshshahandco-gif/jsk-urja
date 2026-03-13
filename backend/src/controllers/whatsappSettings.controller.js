import httpStatus from 'http-status';
import catchAsync from '../utils/catchAsync.js';
import WhatsAppSettings from '../models/whatsappSettings.model.js';

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

export {
    getSettings,
    updateSettings
};
