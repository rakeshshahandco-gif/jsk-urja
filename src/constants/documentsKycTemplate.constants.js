import { CUSTOMER_DOCUMENT_TYPES } from '@/config/customerKyc.config';
import { SUPPLIER_DOCUMENT_TYPES } from '@/config/supplierKyc.config';

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

export const DOCUMENT_RULE_COLUMNS = [
    { key: 'visible', label: 'Show', type: 'boolean' },
    { key: 'required', label: 'Required', type: 'boolean' },
    { key: 'allowScan', label: 'Allow Scan', type: 'boolean' },
    { key: 'allowUpload', label: 'Allow Upload', type: 'boolean' },
    { key: 'allowDownload', label: 'Allow Download', type: 'boolean' },
    { key: 'allowOcr', label: 'Allow OCR (Future)', type: 'boolean' },
    { key: 'trackExpiry', label: 'Track Expiry', type: 'boolean' },
    { key: 'reminderDays', label: 'Reminder Days', type: 'number' },
    { key: 'defaultVisibility', label: 'Default Visibility', type: 'select' },
];

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

export function mergeDocumentRules(base = {}, draft = {}, definitions = []) {
    const out = { ...base };
    for (const def of definitions) {
        const key = def.documentType || def.id;
        out[key] = {
            ...emptyDocumentRule(def),
            ...(base[key] || {}),
            ...(draft[key] || {}),
        };
    }
    return out;
}

/**
 * @param {object} settings - effective document template settings from API
 * @param {'customer'|'supplier'} partyType
 * @param {Function} isEnabledLegacy - feature config isEnabled(key)
 * @param {object} [fieldCtrl] - optional field control for legacy doc_* fallback
 */
export function buildDocumentControl(settings, partyType, isEnabledLegacy, fieldCtrl) {
    const docs = partyType === 'customer'
        ? (settings?.customerDocuments || {})
        : (settings?.supplierDocuments || {});
    const useLegacy = settings?.useLegacy !== false;
    const featureKey = partyType === 'customer' ? 'customer.documentsKyc' : 'supplier.complianceDocuments';
    const typeIds = partyType === 'customer'
        ? CUSTOMER_DOCUMENT_TYPES.map((d) => d.id)
        : SUPPLIER_DOCUMENT_TYPES.map((d) => d.id);

    const resolveVisible = (documentType, rule) => {
        if (useLegacy) {
            if (partyType === 'customer') {
                const fieldKey = CUSTOMER_DOC_FIELD_KEYS[documentType];
                if (fieldKey && fieldCtrl) return fieldCtrl.isVisible(fieldKey);
                return isEnabledLegacy?.(featureKey) ?? true;
            }
            if (fieldCtrl?.isVisible?.('documentsKyc')) return true;
            return isEnabledLegacy?.(featureKey) ?? true;
        }
        if (rule?.visible === null || rule?.visible === undefined) {
            return isEnabledLegacy?.(featureKey) ?? true;
        }
        return rule.visible !== false;
    };

    const getRule = (documentType) => docs[documentType] || {};

    return {
        useLegacy,
        partyType,
        isVisible(documentType) {
            return resolveVisible(documentType, getRule(documentType));
        },
        isRequired(documentType) {
            if (useLegacy) return false;
            return !!getRule(documentType)?.required;
        },
        allowScan(documentType) {
            if (useLegacy) return true;
            return getRule(documentType)?.allowScan !== false;
        },
        allowUpload(documentType) {
            if (useLegacy) return true;
            return getRule(documentType)?.allowUpload !== false;
        },
        allowDownload(documentType) {
            if (useLegacy) return true;
            return getRule(documentType)?.allowDownload !== false;
        },
        allowOcr(documentType) {
            return !!getRule(documentType)?.allowOcr;
        },
        trackExpiry(documentType) {
            if (useLegacy) {
                return ['msme_certificate', 'iec_certificate', 'agreement', 'insurance_copy', 'authorization_letter', 'other'].includes(documentType);
            }
            return !!getRule(documentType)?.trackExpiry;
        },
        getReminderDays(documentType) {
            const rule = getRule(documentType);
            return rule?.reminderDays ?? 30;
        },
        anyVisible() {
            return typeIds.some((id) => resolveVisible(id, getRule(id)));
        },
        missingRequired(uploadedDocs = []) {
            if (useLegacy) return [];
            const present = new Set(
                (uploadedDocs || []).filter((d) => !d.isDeleted).map((d) => d.documentType),
            );
            return typeIds.filter((id) => getRule(id)?.required && !present.has(id));
        },
        getVisibleTypes(allTypes) {
            return (allTypes || []).filter(({ id }) => resolveVisible(id, getRule(id)));
        },
    };
}
