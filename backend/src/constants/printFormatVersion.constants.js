/**
 * Print Format Version Manager — company-wise format version registry.
 * NOT wired to live PDF/print output in Phase 5.
 * Identity: companyId + documentType + formatVersion
 */

export const PRINT_FORMAT_VERSION_STATUSES = Object.freeze([
    'DRAFT',
    'APPROVED',
    'DEFAULT',
    'LOCKED',
    'ARCHIVED',
]);

export const PRINT_FORMAT_VERSION_STATUS_LABELS = Object.freeze({
    DRAFT: 'Draft',
    APPROVED: 'Approved',
    DEFAULT: 'Default',
    LOCKED: 'Locked',
    ARCHIVED: 'Archived',
});

/** Editable statuses only — LOCKED/DEFAULT must be copied to a new draft to change. */
export const PRINT_FORMAT_VERSION_EDITABLE_STATUSES = Object.freeze(['DRAFT']);

/** JSK URJA: Sales Order + Sales Invoice only */
export const PRINT_FORMAT_VERSION_DOCUMENT_TYPES = Object.freeze([
    'SALES_ORDER',
    'SALES_INVOICE',
]);

export const PRINT_FORMAT_VERSION_DOCUMENT_TYPE_LABELS = Object.freeze({
    SALES_ORDER: 'Sales Order',
    SALES_INVOICE: 'Sales Invoice',
});

export const PRINT_FORMAT_VERSION_PAPER_SIZES = Object.freeze(['A4', 'Letter', 'Legal', 'Custom']);
export const PRINT_FORMAT_VERSION_ORIENTATIONS = Object.freeze(['portrait', 'landscape']);

/** Explicit: this registry does not drive live print/PDF in Phase 5. */
export const PRINT_FORMAT_VERSION_LIVE_WIRED = false;

export function defaultLayoutSnapshot(documentType) {
    return {
        engineVersion: 1,
        documentType,
        paperSize: 'A4',
        orientation: 'portrait',
        margins: { top: 10, right: 10, bottom: 10, left: 10, unit: 'mm' },
        sections: {
            header: { visible: true, order: 1 },
            companyDetails: { visible: true, order: 2 },
            customerDetails: { visible: true, order: 3 },
            documentDetails: { visible: true, order: 4 },
            itemTable: { visible: true, order: 5 },
            totalsBox: { visible: true, order: 6 },
            remarks: { visible: true, order: 7 },
            bankDetails: { visible: true, order: 8 },
            signature: { visible: true, order: 9 },
        },
        notes: 'Phase 5 metadata snapshot only — not applied to live PDF templates.',
    };
}

export function isEditableStatus(status) {
    return PRINT_FORMAT_VERSION_EDITABLE_STATUSES.includes(String(status || '').toUpperCase());
}

export function nextFormatVersionLabel(existingVersions = []) {
    const nums = existingVersions
        .map((v) => {
            const m = String(v || '').match(/V(\d+)/i);
            return m ? Number(m[1]) : 0;
        })
        .filter((n) => Number.isFinite(n));
    const next = (nums.length ? Math.max(...nums) : 0) + 1;
    return `V${next}`;
}
