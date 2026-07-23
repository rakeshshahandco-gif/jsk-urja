import { validateSendContentPayload } from './whatsappBulkAttachment.service.js';
import { getSettings } from './whatsappBulkSettings.service.js';
import {
    isBulkSimulateMode,
    resolveBulkSenderUserId,
    bulkSendDelay,
} from './whatsappBulkSafeMode.util.js';

export {
    isBulkSimulateMode,
    resolveBulkSenderUserId,
    bulkSendDelay,
};

/** Lazy-load Chat WhatsApp service — avoids Baileys open handles on Bulk test import. */
async function getWhatsAppService() {
    const mod = await import('./whatsapp.service.js');
    return mod.default;
}

export async function assertCrmWhatsAppConnected(userId) {
    const WhatsAppService = await getWhatsAppService();
    const status = WhatsAppService.getStatus(userId);
    if (status.status === 'CONNECTED' || status.connected === true) {
        return status;
    }
    throw new Error(
        'CRM WhatsApp is not connected. Go to WhatsApp in the sidebar → Connect WhatsApp → scan QR, then retry bulk send.',
    );
}

/**
 * Send one bulk message via the CRM WhatsApp (Baileys) session — no separate Puppeteer login.
 * When simulateSend / WHATSAPP_BULK_SIMULATE=true, never loads Baileys.
 */
export async function dispatchBulkWhatsAppSend(mobile, resolved, { userId, campaign } = {}) {
    const companyId = campaign?.companyId;
    const settings = companyId ? await getSettings(companyId) : {};
    if (isBulkSimulateMode(settings)) {
        return {
            simulated: true,
            messageKey: { id: 'sim-' + Date.now(), remoteJid: String(mobile) + '@s.whatsapp.net', fromMe: true },
            jid: String(mobile) + '@s.whatsapp.net',
        };
    }

    const senderUserId = resolveBulkSenderUserId(campaign, userId);
    await assertCrmWhatsAppConnected(senderUserId);
    const WhatsAppService = await getWhatsAppService();

    const { messageBody, sendContentType, imageAttachment, absolutePath } = resolved;
    validateSendContentPayload({
        sendContentType,
        messageBody,
        imageAttachment,
        absolutePath: sendContentType === 'text_only' ? '' : absolutePath,
    });

    if (sendContentType === 'text_only') {
        const result = await WhatsAppService.sendMessage(senderUserId, { phone: mobile, message: messageBody });
        return { messageKey: result.key, jid: result.jid };
    }

    const caption = sendContentType === 'image_with_caption' ? (messageBody || '') : '';
    const result = await WhatsAppService.sendImageMessage(senderUserId, {
        phone: mobile,
        filePath: absolutePath,
        caption,
        mimeType: imageAttachment?.mimeType,
    });
    return { messageKey: result.key, jid: result.jid };
}
