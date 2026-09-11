export const SI_CREATION_SOURCES = Object.freeze({
    WEB_NEW_INVOICE: 'WEB_NEW_INVOICE',
    WEB_SO_CONVERSION: 'WEB_SO_CONVERSION',
    MOBILE_NEW_INVOICE: 'MOBILE_NEW_INVOICE',
    SCAN_ENTRY_POST: 'SCAN_ENTRY_POST',
    API_SO_CONVERSION: 'API_SO_CONVERSION',
    IMPORT: 'IMPORT',
});

export function newIdempotencyKey() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return `si-${crypto.randomUUID()}`;
    }
    return `si-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function newRequestId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return `si-req-${crypto.randomUUID()}`;
    }
    return `si-req-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function resolveWebCreationSource({ soId, isMobile = false } = {}) {
    if (soId) return SI_CREATION_SOURCES.WEB_SO_CONVERSION;
    if (isMobile) return SI_CREATION_SOURCES.MOBILE_NEW_INVOICE;
    return SI_CREATION_SOURCES.WEB_NEW_INVOICE;
}

export function formatInvoiceCreatedToast(invoiceNumber, createdByName) {
    const number = invoiceNumber || '—';
    const who = createdByName || 'you';
    return `Tax Invoice ${number} created successfully.\nCreated by: ${who}`;
}

export function formatCreationAudit(inv = {}) {
    const createdBy = inv.createdByName || inv.createdBy?.name || '';
    const createdAt = inv.createdAt || null;
    return {
        createdBy,
        createdAt,
        source: inv.creationSource || '',
        soNumber: inv.soNumber || inv.sourceDocumentNumber || '',
        requestId: inv.requestId || '',
        idempotencyKey: inv.idempotencyKey || '',
        creationRoute: inv.creationRoute || '',
    };
}
