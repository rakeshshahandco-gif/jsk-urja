import { WhatsAppAISettings } from '../models/index.js';
import {
    WHATSAPP_AI_DEFAULT_SETTINGS,
    assertNoForbiddenSettingsKeys,
    normalizeWhatsAppAiMode,
    assertWhatsAppAiModeAllowed,
} from '../constants/whatsappAi.constants.js';
import { assertNoBinaryPayload } from '../models/sharedFields.js';
import { appendActionLog } from './audit.service.js';

const ALLOWED_KEYS = Object.keys(WHATSAPP_AI_DEFAULT_SETTINGS);

function shapeSettings(doc) {
    const base = { ...WHATSAPP_AI_DEFAULT_SETTINGS, ...doc };
    base.mode = normalizeWhatsAppAiMode(base.mode);
    return base;
}

export async function getSettings(companyId) {
    let doc = await WhatsAppAISettings.findOne({ companyId, isDeleted: false }).lean();
    if (!doc) {
        return { companyId, ...WHATSAPP_AI_DEFAULT_SETTINGS };
    }
    return shapeSettings(doc);
}

export async function updateSettings(companyId, payload, userId) {
    assertNoForbiddenSettingsKeys(payload);
    assertNoBinaryPayload(payload);

    if (Object.prototype.hasOwnProperty.call(payload, 'mode')) {
        assertWhatsAppAiModeAllowed(payload.mode);
    }

    const update = {};
    for (const key of ALLOWED_KEYS) {
        if (Object.prototype.hasOwnProperty.call(payload, key)) {
            update[key] = key === 'mode' ? normalizeWhatsAppAiMode(payload[key]) : payload[key];
        }
    }
    update.updatedBy = userId;

    const before = await getSettings(companyId);
    // Persist a safe mode if the stored record still has an unsupported Phase 1A mode.
    if (!Object.prototype.hasOwnProperty.call(update, 'mode') && before.mode === 'disabled') {
        const raw = await WhatsAppAISettings.findOne({ companyId, isDeleted: false }).lean();
        if (raw && normalizeWhatsAppAiMode(raw.mode) === 'disabled' && raw.mode !== 'disabled') {
            update.mode = 'disabled';
        }
    }

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
        afterState: shapeSettings(doc),
        success: true,
    });

    return shapeSettings(doc);
}
