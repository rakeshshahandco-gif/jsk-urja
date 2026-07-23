/**
 * Pure Bulk Safe Mode helpers — no Baileys / WhatsAppService import.
 * Keeps unit tests free of open Baileys handles.
 */

export function isBulkSimulateMode(settings = {}) {
    if (String(process.env.WHATSAPP_BULK_SIMULATE || '').toLowerCase() === 'true') return true;
    return settings.simulateSend === true;
}

export function randomBulkDelayMs(minMs, maxMs) {
    const min = Math.min(Number(minMs) || 0, Number(maxMs) || 0);
    const max = Math.max(Number(minMs) || 0, Number(maxMs) || 0);
    return min + Math.floor(Math.random() * (max - min + 1));
}

/** Bulk sends use the same CRM WhatsApp user session as chat (id resolution only). */
export function resolveBulkSenderUserId(campaign, actingUserId) {
    const id = actingUserId || campaign?.updatedBy || campaign?.createdBy;
    if (!id) {
        throw new Error(
            'No WhatsApp sender user for this campaign. Open the campaign again while logged in, then retry.',
        );
    }
    return String(id);
}

let delayImpl = (ms) => new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));

/** Test-only: inject fake timers / no-op delay. Runtime default is real setTimeout. */
export function setBulkSendDelayImpl(fn) {
    delayImpl = typeof fn === 'function' ? fn : ((ms) => new Promise((r) => setTimeout(r, Math.max(0, Number(ms) || 0))));
}

export function resetBulkSendDelayImpl() {
    delayImpl = (ms) => new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

export function bulkSendDelay(ms) {
    return delayImpl(ms);
}
