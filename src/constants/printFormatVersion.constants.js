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

/** JSK URJA: Sales Order + Sales Invoice only */
export const PRINT_FORMAT_VERSION_DOCUMENT_TYPES = Object.freeze([
    'SALES_ORDER',
    'SALES_INVOICE',
]);

export const PRINT_FORMAT_VERSION_DOCUMENT_TYPE_LABELS = Object.freeze({
    SALES_ORDER: 'Sales Order',
    SALES_INVOICE: 'Sales Invoice',
});

export const STATUS_BADGE_COLORS = Object.freeze({
    DRAFT: { bg: '#f1f5f9', color: '#475569' },
    APPROVED: { bg: '#dbeafe', color: '#1e40af' },
    DEFAULT: { bg: '#ccfbf1', color: '#0f766e' },
    LOCKED: { bg: '#dcfce7', color: '#166534' },
    ARCHIVED: { bg: '#e5e7eb', color: '#4b5563' },
});
