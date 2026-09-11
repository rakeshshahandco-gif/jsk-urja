/** Controlled Sales Invoice creation sources. Never persist UNKNOWN on a successful create. */
export const SI_CREATION_SOURCES = Object.freeze({
    WEB_NEW_INVOICE: 'WEB_NEW_INVOICE',
    WEB_SO_CONVERSION: 'WEB_SO_CONVERSION',
    MOBILE_NEW_INVOICE: 'MOBILE_NEW_INVOICE',
    SCAN_ENTRY_POST: 'SCAN_ENTRY_POST',
    API_SO_CONVERSION: 'API_SO_CONVERSION',
    IMPORT: 'IMPORT',
});

export const SI_CREATION_SOURCE_VALUES = Object.freeze(Object.values(SI_CREATION_SOURCES));

export const SI_DUPLICATE_ATTEMPT_AUDIT = 'DUPLICATE_INVOICE_ATTEMPT_BLOCKED';

export const SO_FULLY_INVOICED_MESSAGE = 'This Sales Order quantity has already been fully invoiced.';
export const SO_QTY_EXCEEDS_REMAINING_MESSAGE =
    'Invoice quantity exceeds remaining uninvoiced quantity on this Sales Order.';
