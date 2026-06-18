/**
 * Phase 3A — Supplier Master fields controlled by Industry Template.
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

export const SUPPLIER_TEMPLATE_FIELD_KEYS = SUPPLIER_MASTER_TEMPLATE_FIELDS.map((f) => f.key);

export function getSupplierMasterFieldDef(key) {
    return SUPPLIER_MASTER_TEMPLATE_FIELDS.find((f) => f.key === key) || null;
}

export { normalizeFieldRule, mergeFieldRules } from './customerMasterTemplateFields.constants.js';
