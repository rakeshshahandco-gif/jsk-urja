import EmailSettings from '../models/emailSettings.model.js';
import { EMAIL_PROVIDER_PRESETS } from '../constants/emailProvider.constants.js';
import { encryptCredential, decryptCredential, maskCredential } from '../utils/credentialCrypto.util.js';
import EmailService from './email.service.js';
import { ApiError } from '../utils/ApiError.js';

function sanitizeForClient(doc) {
    const obj = doc?.toObject ? doc.toObject() : { ...doc };
    if (obj.authPassEncrypted) {
        obj.authPassMasked = maskCredential(decryptCredential(obj.authPassEncrypted));
    } else {
        obj.authPassMasked = '';
    }
    delete obj.authPassEncrypted;
    return obj;
}

export async function getSettings(companyId) {
    let doc = await EmailSettings.findOne({ companyId });
    if (!doc) {
        doc = await EmailSettings.create({ companyId, provider: 'gmail', ...EMAIL_PROVIDER_PRESETS.gmail });
    }
    return sanitizeForClient(doc);
}

export async function saveSettings(companyId, payload, userId) {
    const update = { ...payload, updatedBy: userId };
    if (payload.authPass) {
        update.authPassEncrypted = encryptCredential(payload.authPass);
        delete update.authPass;
    }
    if (payload.provider && EMAIL_PROVIDER_PRESETS[payload.provider] && payload.provider !== 'custom_smtp') {
        Object.assign(update, EMAIL_PROVIDER_PRESETS[payload.provider]);
    }
    const doc = await EmailSettings.findOneAndUpdate(
        { companyId },
        update,
        { upsert: true, new: true },
    );
    return sanitizeForClient(doc);
}

export async function getDecryptedSettings(companyId) {
    const doc = await EmailSettings.findOne({ companyId }).lean();
    if (!doc) return null;
    return {
        ...doc,
        authPass: decryptCredential(doc.authPassEncrypted),
    };
}

export async function testSmtpConnection(companyId, override = {}) {
    const existing = await EmailSettings.findOne({ companyId }).lean();
    const merged = {
        ...(existing || {}),
        ...override,
        authPass: override.authPass || (existing ? decryptCredential(existing.authPassEncrypted) : ''),
    };
    if (!merged.fromEmail && !merged.authUser) {
        throw new ApiError(400, 'From email / auth user is required');
    }
    if (!merged.authPass) {
        throw new ApiError(400, 'SMTP password is required for test');
    }
    const transportSettings = EmailService.normalizeSettings(merged);
    await EmailService.verifyTransport(transportSettings);
    if (existing) {
        await EmailSettings.updateOne(
            { companyId },
            { isVerified: true, lastTestedAt: new Date() },
        );
    }
    return { success: true, message: 'SMTP connection verified' };
}
