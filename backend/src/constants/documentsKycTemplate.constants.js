import { CUSTOMER_DOCUMENT_TYPES, CUSTOMER_DOCUMENT_TYPE_LABELS } from './customerKyc.constants.js';

/** @typedef {'customer'|'supplier'} PartyType */

export const SUPPLIER_DOCUMENT_TYPES = [
    'gst_certificate',
    'pan_card',
    'tan_certificate',
    'msme_certificate',
    'cancelled_cheque',
    'registration_form',
    'agreement',
    'authorization_letter',
    'insurance_copy',
    'other',
];

export const SUPPLIER_DOCUMENT_TYPE_LABELS = {
    gst_certificate: 'GST Certificate',
    pan_card: 'PAN Card',
    tan_certificate: 'TAN Certificate',
    msme_certificate: 'MSME Certificate',
    cancelled_cheque: 'Cancelled Cheque',
    registration_form: 'Vendor Registration Form',
    agreement: 'Agreement',
    authorization_letter: 'Authorization Letter',
    insurance_copy: 'Insurance Copy',
    other: 'Other Documents',
};

const EXPIRY_TYPES = new Set([
    'msme_certificate',
    'iec_certificate',
    'agreement',
    'authorization_letter',
    'insurance_copy',
    'other',
]);

export const CUSTOMER_DOCUMENT_DEFINITIONS = CUSTOMER_DOCUMENT_TYPES.map((documentType) => ({
    documentType,
    partyType: 'customer',
    label: CUSTOMER_DOCUMENT_TYPE_LABELS[documentType] || documentType,
    supportsExpiry: EXPIRY_TYPES.has(documentType),
    defaultReminderDays: 30,
    ocrReady: ['gst_certificate', 'pan_card', 'tan_certificate', 'msme_certificate', 'iec_certificate', 'cancelled_cheque'].includes(documentType),
}));

export const SUPPLIER_DOCUMENT_DEFINITIONS = SUPPLIER_DOCUMENT_TYPES.map((documentType) => ({
    documentType,
    partyType: 'supplier',
    label: SUPPLIER_DOCUMENT_TYPE_LABELS[documentType] || documentType,
    supportsExpiry: EXPIRY_TYPES.has(documentType),
    defaultReminderDays: 30,
    ocrReady: ['gst_certificate', 'pan_card', 'tan_certificate', 'msme_certificate', 'cancelled_cheque'].includes(documentType),
}));

/** Maps customer document type → customerMaster doc_* field key (legacy fallback). */
export const CUSTOMER_DOC_FIELD_KEYS = {
    gst_certificate: 'doc_gst_certificate',
    pan_card: 'doc_pan_card',
    tan_certificate: 'doc_tan_certificate',
    msme_certificate: 'doc_msme_certificate',
    registration_form: 'doc_registration_form',
    cancelled_cheque: 'doc_cancelled_cheque',
    agreement: 'doc_agreement',
    other: 'doc_other',
};

export function emptyDocumentRule(def = {}) {
    return {
        visible: true,
        required: false,
        allowScan: true,
        allowUpload: true,
        allowDownload: true,
        allowOcr: false,
        trackExpiry: !!def.supportsExpiry,
        reminderDays: def.defaultReminderDays ?? 30,
        defaultVisibility: 'visible',
    };
}

export function mergeDocumentRule(templateRule = {}, overrideRule = {}, def = {}) {
    const base = emptyDocumentRule(def);
    return {
        ...base,
        ...(templateRule && typeof templateRule === 'object' ? templateRule : {}),
        ...(overrideRule && typeof overrideRule === 'object' ? overrideRule : {}),
    };
}

export function buildDocumentRulesMap(definitions, templateRules = {}, overrideRules = {}, useLegacy = false) {
    const out = {};
    for (const def of definitions) {
        const templateField = templateRules[def.documentType];
        const overrideField = overrideRules?.[def.documentType];
        if (useLegacy) {
            out[def.documentType] = {
                ...emptyDocumentRule(def),
                visible: null,
                required: false,
                label: def.label,
                supportsExpiry: def.supportsExpiry,
                ocrReady: def.ocrReady,
                partyType: def.partyType,
            };
        } else {
            const hasRule = templateField !== undefined || overrideField !== undefined;
            if (!hasRule) {
                out[def.documentType] = {
                    ...emptyDocumentRule(def),
                    visible: null,
                    required: false,
                    label: def.label,
                    supportsExpiry: def.supportsExpiry,
                    ocrReady: def.ocrReady,
                    partyType: def.partyType,
                };
            } else {
                out[def.documentType] = {
                    ...mergeDocumentRule(templateField || {}, overrideField || {}, def),
                    label: def.label,
                    supportsExpiry: def.supportsExpiry,
                    ocrReady: def.ocrReady,
                    partyType: def.partyType,
                };
            }
        }
    }
    return out;
}
