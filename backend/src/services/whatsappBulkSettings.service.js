import WhatsAppBulkSettings from '../models/whatsappBulkSettings.model.js';
import { WHATSAPP_BULK_DEFAULT_SETTINGS } from '../constants/whatsappBulk.constants.js';

export async function getSettings(companyId) {
    let doc = await WhatsAppBulkSettings.findOne({ companyId });
    if (!doc) {
        doc = await WhatsAppBulkSettings.create({ companyId, ...WHATSAPP_BULK_DEFAULT_SETTINGS });
    }
    return { ...WHATSAPP_BULK_DEFAULT_SETTINGS, ...doc.toObject() };
}

export async function saveSettings(companyId, payload, userId) {
    const doc = await WhatsAppBulkSettings.findOneAndUpdate(
        { companyId },
        { ...payload, updatedBy: userId },
        { upsert: true, new: true },
    );
    return { ...WHATSAPP_BULK_DEFAULT_SETTINGS, ...doc.toObject() };
}

export async function assertModuleEnabled(companyId) {
    const s = await getSettings(companyId);
    if (!s.enabled) {
        const err = new Error('WhatsApp Bulk Messaging module is disabled for this company');
        err.statusCode = 403;
        throw err;
    }
    return s;
}
