/**
 * Phase 3A — mirrors backend supplierMasterTemplateFields.constants.js
 */

export const SUPPLIER_MASTER_TEMPLATE_FIELDS = [
    { key: 'supplierName', featureKey: null, label: 'Supplier Name', formField: 'supplierName' },
    { key: 'supplierType', featureKey: 'supplier.supplierType', label: 'Supplier Type', formField: 'supplierType' },
    { key: 'gstNumber', featureKey: null, label: 'GST No', formField: 'gstNumber' },
    { key: 'panNumber', featureKey: 'supplier.panNumber', label: 'PAN No', formField: 'panNumber' },
    { key: 'tanNumber', featureKey: null, label: 'TAN No', formField: 'tanNumber' },
    { key: 'msmeNumber', featureKey: 'supplier.msmeNumber', label: 'MSME / UDYAM No', formField: 'msmeRegNo' },
    { key: 'contactPerson', featureKey: 'supplier.contactPerson', label: 'Contact Person', formField: 'contactPerson' },
    { key: 'mobile', featureKey: null, label: 'Mobile', formField: 'phone' },
    { key: 'email', featureKey: null, label: 'Email', formField: 'email' },
    { key: 'address', featureKey: null, label: 'Address', formField: 'address' },
    { key: 'state', featureKey: null, label: 'State', formField: 'state' },
    { key: 'country', featureKey: null, label: 'Country', formField: 'country' },
    { key: 'bankName', featureKey: 'supplier.bankDetails', label: 'Bank Name', formField: 'bankName', group: 'banking' },
    { key: 'branch', featureKey: 'supplier.bankDetails', label: 'Branch', formField: 'bankBranch', group: 'banking' },
    { key: 'accountNumber', featureKey: 'supplier.bankDetails', label: 'Account Number', formField: 'bankAccountNo', group: 'banking' },
    { key: 'ifscCode', featureKey: 'supplier.bankDetails', label: 'IFSC Code', formField: 'bankIfsc', group: 'banking' },
    { key: 'upiId', featureKey: 'supplier.bankDetails', label: 'UPI ID', formField: 'bankUpi', group: 'banking' },
    { key: 'creditDays', featureKey: 'supplier.creditDays', label: 'Credit Days', formField: 'creditDays', hasDefault: true, defaultValue: 0 },
    { key: 'gracePeriod', featureKey: 'supplier.gracePeriod', label: 'Grace Period', formField: 'gracePeriodDays', hasDefault: true, defaultValue: 0 },
    { key: 'paymentTerms', featureKey: 'supplier.creditDays', label: 'Payment Terms', formField: 'paymentTerms' },
    { key: 'tdsApplicable', featureKey: 'supplier.tdsApplicable', label: 'TDS Applicable', formField: 'tdsApplicable' },
    { key: 'tdsSection', featureKey: 'supplier.tdsApplicable', label: 'Default TDS Section', formField: 'tdsSection' },
    { key: 'tdsRate', featureKey: 'supplier.tdsApplicable', label: 'Default TDS Rate', formField: 'tdsRate' },
    { key: 'rcmApplicable', featureKey: null, label: 'RCM Applicable', formField: 'rcmApplicable' },
    { key: 'vendorCategory', featureKey: 'supplier.vendorCategory', label: 'Vendor Category', formField: 'vendorCategory' },
    { key: 'riskCategory', featureKey: null, label: 'Risk Category', formField: 'riskCategory' },
    { key: 'documentsKyc', featureKey: 'supplier.complianceDocuments', label: 'Documents / KYC', formField: 'documentsKyc', group: 'document' },
];

export const FIELD_KEYS_UNUSED = SUPPLIER_MASTER_TEMPLATE_FIELDS.map((f) => f.key);

export const FIELD_BY_KEY = Object.fromEntries(SUPPLIER_MASTER_TEMPLATE_FIELDS.map((f) => [f.key, f]));

export function buildSupplierFieldControl(settings, isEnabledLegacy) {
    const useLegacy = !settings || settings.useLegacy;
    const fields = settings?.fields || {};
    const legacyVisible = (fieldKey) => {
        const def = FIELD_BY_KEY[fieldKey];
        if (!def) return true;
        if (!def.featureKey) return true;
        return isEnabledLegacy(def.featureKey);
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
    const isReadOnly = (fieldKey) => {
        if (useLegacy) return false;
        return !!fields[fieldKey]?.readOnly;
    };
    const getDefaultValue = (fieldKey) => fields[fieldKey]?.defaultValue;
    const anyVisibleInGroup = (group) => SUPPLIER_MASTER_TEMPLATE_FIELDS.filter((f) => f.group === group).some((f) => isVisible(f.key));
    return { useLegacy, isVisible, isRequired, isReadOnly, getDefaultValue, anyVisibleInGroup, templateCode: settings?.templateCode, templateName: settings?.templateName };
}
