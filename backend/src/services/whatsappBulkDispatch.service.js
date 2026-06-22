import WhatsAppService from './whatsapp.service.js';
import { validateSendContentPayload } from './whatsappBulkAttachment.service.js';

/** Delay between bulk sends (Safe Mode pacing). */
export function bulkSendDelay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Bulk sends use the same Baileys session as CRM WhatsApp (per logged-in user). */
export function resolveBulkSenderUserId(campaign, actingUserId) {
    const id = actingUserId || campaign?.updatedBy || campaign?.createdBy;
    if (!id) {
        throw new Error(
            'No WhatsApp sender user for this campaign. Open the campaign again while logged in, then retry.',
        );
    }
    return String(id);
}

export function assertCrmWhatsAppConnected(userId) {
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
 */
export async function dispatchBulkWhatsAppSend(mobile, resolved, { userId, campaign } = {}) {
    const senderUserId = resolveBulkSenderUserId(campaign, userId);
    assertCrmWhatsAppConnected(senderUserId);

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
