import { WhatsAppAISettings } from '../models/index.js';
import {
    WHATSAPP_AI_DEFAULT_SETTINGS,
    assertNoForbiddenSettingsKeys,
} from '../constants/whatsappAi.constants.js';
import { assertNoBinaryPayload } from '../models/sharedFields.js';
import { appendActionLog } from './audit.service.js';

const ALLOWED_KEYS = Object.keys(WHATSAPP_AI_DEFAULT_SETTINGS);

export async function getSettings(companyId) {
    let doc = await WhatsAppAISettings.findOne({ companyId, isDeleted: false }).lean();
    if (!doc) {
        return { companyId, ...WHATSAPP_AI_DEFAULT_SETTINGS };
    }
    return { ...WHATSAPP_AI_DEFAULT_SETTINGS, ...doc };
}

export async function updateSettings(companyId, payload, userId) {
    assertNoForbiddenSettingsKeys(payload);
    assertNoBinaryPayload(payload);

    const update = {};
    for (const key of ALLOWED_KEYS) {
        if (Object.prototype.hasOwnProperty.call(payload, key)) {
            update[key] = payload[key];
        }
    }
    update.updatedBy = userId;

    const before = await getSettings(companyId);
    const doc = await WhatsAppAISettings.findOneAndUpdate(
        { companyId, isDeleted: false },
        {
            $set: update,
            $setOnInsert: {
                companyId,
                createdBy: userId,
                isDeleted: false,
                ...Object.fromEntries(
                    ALLOWED_KEYS.filter((k) => !(k in update)).map((k) => [k, WHATSAPP_AI_DEFAULT_SETTINGS[k]]),
                ),
            },
        },
        { upsert: true, new: true, lean: true },
    );

    await appendActionLog({
        companyId,
        actionType: 'settings_updated',
        actorType: 'user',
        actorUserId: userId,
        actionSummary: 'WhatsApp AI settings updated',
        beforeState: before,
        afterState: doc,
        success: true,
    });

    return { ...WHATSAPP_AI_DEFAULT_SETTINGS, ...doc };
}