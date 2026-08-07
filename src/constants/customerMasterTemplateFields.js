/** Phase 2 — mirrors backend customerMasterTemplateFields.constants.js */
export const CUSTOMER_MASTER_TEMPLATE_FIELDS = [
    { key: 'creditPeriod', featureKey: 'customer.creditPeriod', label: 'Credit Period', formField: 'creditPeriod' },
    { key: 'gracePeriod', featureKey: 'customer.gracePeriod', label: 'Grace Period', formField: 'gracePeriodDays' },
    { key: 'creditLimit', featureKey: 'customer.creditLimit', label: 'Credit Limit', formField: 'creditLimit' },
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

export const FIELD_BY_KEY = Object.fromEntries(CUSTOMER_MASTER_TEMPLATE_FIELDS.map((f) => [f.key, f]));

export function computeCustomerDueDays(creditPeriod, gracePeriodDays, gracePeriodVisible) {
    const credit = Math.max(0, Number(creditPeriod) || 0);
    const grace = Math.max(0, Number(gracePeriodDays) || 0);
    if (gracePeriodVisible && grace > 0) return credit + grace;
    return credit;
}

export function buildCustomerFieldControl(settings, isEnabledLegacy) {
    const useLegacy = !settings || settings.useLegacy;
    const fields = settings?.fields || {};

    const legacyVisible = (fieldKey) => {
        const def = FIELD_BY_KEY[fieldKey];
        return def ? isEnabledLegacy(def.featureKey) : true;
    };

    const isVisible = (fieldKey) => {
        if (useLegacy) return legacyVisible(fieldKey);
        const rule = fields[fieldKey];
        if (!rule) return legacyVisible(fieldKey);
        if (rule.visible === null || rule.visible === undefined) return legacyVisible(fieldKey);
        return rule.visible !== false;
    };

    const isRequired = (fieldKey) => {
        if (!isVisible(fieldKey)) return false;
        if (useLegacy) return false;
        return !!fields[fieldKey]?.required;
    };

    /**
     * GSTIN required only when template marks gstNumber required AND registration
     * type is not Consumer / Unregistered (blank GSTIN → Consumer path).
     */
    const isGstNumberRequired = (registrationType) => {
        if (!isRequired('gstNumber')) return false;
        const t = String(registrationType || '').trim();
        if (!t || t === 'Consumer' || t === 'Unregistered') return false;
        return true;
    };

    const isReadOnly = (fieldKey) => {
        if (useLegacy) return false;
        return !!fields[fieldKey]?.readOnly;
    };

    const getDefaultValue = (fieldKey) => fields[fieldKey]?.defaultValue;

    const anyVisibleInGroup = (group) => CUSTOMER_MASTER_TEMPLATE_FIELDS
        .filter((f) => f.group === group)
        .some((f) => isVisible(f.key));

    const anyVisibleKeys = (keys) => keys.some((k) => isVisible(k));

    return {
        useLegacy,
        isVisible,
        isRequired,
        isGstNumberRequired,
        isReadOnly,
        getDefaultValue,
        anyVisibleInGroup,
        anyVisibleKeys,
        templateCode: settings?.templateCode,
        templateName: settings?.templateName,
    };
}
