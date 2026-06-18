/**
 * Phase 2 — Customer Master fields controlled by Industry Template.
 * Keys are stable template identifiers; featureKey maps to existing feature configuration.
 */

export const CUSTOMER_MASTER_TEMPLATE_FIELDS = [
    { key: 'creditPeriod', featureKey: 'customer.creditPeriod', label: 'Credit Period', formField: 'creditPeriod', hasDefault: true, defaultValue: 0 },
    { key: 'gracePeriod', featureKey: 'customer.gracePeriod', label: 'Grace Period', formField: 'gracePeriodDays', hasDefault: true, defaultValue: 0 },
    { key: 'creditLimit', featureKey: 'customer.creditLimit', label: 'Credit Limit', formField: 'creditLimit', hasDefault: true, defaultValue: 0 },
    { key: 'gstNumber', featureKey: 'customer.gstNumber', label: 'GST No', formField: 'gstNumber' },
    { key: 'panNumber', featureKey: 'customer.panNumber', label: 'PAN No', formField: 'panNumber' },
    { key: 'tanNumber', featureKey: 'customer.tanNumber', label: 'TAN No', formField: 'tanNumber' },
    { key: 'msmeNumber', featureKey: 'customer.msmeNumber', label: 'MSME No', formField: 'msmeRegNo' },
    { key: 'iecNumber', featureKey: 'customer.iecNumber', label: 'IEC No', formField: 'iecNumber' },
    { key: 'exportPort', featureKey: 'customer.exportDetails', label: 'Port', formField: 'exportPort', group: 'export' },
    { key: 'exportCurrency', featureKey: 'customer.exportDetails', label: 'Currency', formField: 'exportCurrency', group: 'export' },
    { key: 'exportBuyerCode', featureKey: 'customer.exportDetails', label: 'Buyer Code', formField: 'exportBuyerCode', group: 'export' },
    { key: 'exportLcTerms', featureKey: 'customer.exportDetails', label: 'LC Terms', formField: 'exportLcTerms', group: 'export' },
    { key: 'bankName', featureKey: 'customer.bankDetails', label: 'Bank Name', formField: 'bankName', group: 'banking' },
    { key: 'bankBranch', featureKey: 'customer.bankDetails', label: 'Branch', formField: 'bankBranch', group: 'banking' },
    { key: 'bankAccountNumber', featureKey: 'customer.bankDetails', label: 'Account No', formField: 'bankAccountNumber', group: 'banking' },
    { key: 'bankIfsc', featureKey: 'customer.bankDetails', label: 'IFSC', formField: 'bankIfsc', group: 'banking' },
    { key: 'bankUpi', featureKey: 'customer.bankDetails', label: 'UPI ID', formField: 'bankUpi', group: 'banking' },
    { key: 'doc_gst_certificate', featureKey: 'customer.documentsKyc', label: 'GST Certificate Attachment', documentType: 'gst_certificate', group: 'document' },
    { key: 'doc_pan_card', featureKey: 'customer.documentsKyc', label: 'PAN Card Attachment', documentType: 'pan_card', group: 'document' },
    { key: 'doc_msme_certificate', featureKey: 'customer.documentsKyc', label: 'MSME Certificate Attachment', documentType: 'msme_certificate', group: 'document' },
    { key: 'doc_tan_certificate', featureKey: 'customer.documentsKyc', label: 'TAN Certificate Attachment', documentType: 'tan_certificate', group: 'document' },
    { key: 'doc_agreement', featureKey: 'customer.documentsKyc', label: 'Agreement', documentType: 'agreement', group: 'document' },
    { key: 'doc_registration_form', featureKey: 'customer.documentsKyc', label: 'Customer Registration Form', documentType: 'registration_form', group: 'document' },
    { key: 'doc_cancelled_cheque', featureKey: 'customer.documentsKyc', label: 'Cancelled Cheque', documentType: 'cancelled_cheque', group: 'document' },
    { key: 'doc_other', featureKey: 'customer.documentsKyc', label: 'Other Documents', documentType: 'other', group: 'document' },
];

export const CUSTOMER_TEMPLATE_FIELD_KEYS = CUSTOMER_MASTER_TEMPLATE_FIELDS.map((f) => f.key);

export const ELECTRONICS_LEGACY_TEMPLATE_CODE = 'ELECTRONICS_JSK';

export function getCustomerMasterFieldDef(key) {
    return CUSTOMER_MASTER_TEMPLATE_FIELDS.find((f) => f.key === key) || null;
}

export function normalizeFieldRule(raw = {}) {
    return {
        visible: raw.visible !== false,
        required: !!raw.required,
        readOnly: !!raw.readOnly,
        defaultValue: raw.defaultValue !== undefined && raw.defaultValue !== null ? raw.defaultValue : undefined,
    };
}

export function mergeFieldRules(base = {}, override = {}) {
    const merged = { ...base, ...override };
    return normalizeFieldRule(merged);
}
