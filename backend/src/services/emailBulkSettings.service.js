import EmailBulkSettings from '../models/emailBulkSettings.model.js';
import { EMAIL_BULK_DEFAULT_SETTINGS } from '../constants/emailBulk.constants.js';

export async function getSettings(companyId) {
    let doc = await EmailBulkSettings.findOne({ companyId });
    if (!doc) {
        doc = await EmailBulkSettings.create({ companyId, ...EMAIL_BULK_DEFAULT_SETTINGS });
    }
    return { ...EMAIL_BULK_DEFAULT_SETTINGS, ...doc.toObject() };
}

export async function saveSettings(companyId, payload, userId) {
    const doc = await EmailBulkSettings.findOneAndUpdate(
        { companyId },
        { ...payload, updatedBy: userId },
        { upsert: true, new: true },
    );
    return { ...EMAIL_BULK_DEFAULT_SETTINGS, ...doc.toObject() };
}

export async function assertModuleEnabled(companyId) {
    const s = await getSettings(companyId);
    if (!s.enabled) {
        const err = new Error('Email Bulk Messaging module is disabled for this company');
        err.statusCode = 403;
        throw err;
    }
    return s;
}
