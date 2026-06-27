import fs from 'fs';

const rows = [
    ['module.crm', 'CRM', 'crm', 'module', true],
    ['module.tasks', 'Task Management', 'tasks', 'module', true],
    ['module.sales', 'Sales', 'sales', 'module', true, 'sales.enableSalesInvoice'],
    ['module.purchase', 'Purchase', 'purchase', 'module', true],
    ['module.inventory', 'Inventory', 'inventory', 'module', true, 'inventory.inventoryRequired'],
    ['module.accounts', 'Accounts', 'accounts', 'module', true, 'accounting.accountingRequired'],
    ['module.gst', 'GST', 'gst', 'module', true, 'gst.gstApplicable'],
    ['module.tds', 'TDS', 'tds', 'module', true, 'tdsTcs.tdsRequired'],
    ['module.production', 'Production', 'production', 'module', true, 'manufacturing.productionRequired'],
    ['module.hr', 'HR', 'hr', 'module', true],
    ['module.ocrScanEntry', 'OCR / Scan Entry', 'documents', 'module', false, 'accounting.enableAiSmartImport'],
    ['compliance.gst', 'GST', 'gst', 'compliance', true, 'gst.gstApplicable'],
    ['compliance.tds', 'TDS', 'tds', 'compliance', true, 'tdsTcs.tdsRequired'],
    ['compliance.tcs', 'TCS', 'tcs', 'compliance', true, 'tdsTcs.tcsRequired'],
    ['compliance.eInvoice', 'E-Invoice', 'gst', 'compliance', true, 'gst.eInvoiceRequired'],
    ['compliance.eWayBill', 'E-Way Bill', 'gst', 'compliance', true, 'gst.eWayBillRequired'],
    ['compliance.msme', 'MSME Compliance', 'accounts', 'compliance', true],
    ['customer.customerType', 'Customer Type', 'customer', 'customer', false, 'customer.enableCustomerType'],
    ['customer.creditPeriod', 'Credit Period', 'customer', 'customer', false, 'customer.enableCreditPeriod'],
    ['customer.gracePeriod', 'Grace Period', 'customer', 'customer', false, 'customer.enableGracePeriod'],
    ['customer.creditLimit', 'Credit Limit', 'customer', 'customer', false, 'customer.enableCreditLimit'],
    ['customer.collectionPerson', 'Collection Person', 'customer', 'customer', false, 'customer.enableCollectionPerson'],
    ['customer.salesPerson', 'Sales Person', 'customer', 'customer', true],
    ['customer.tcsApplicable', 'TCS Applicable', 'customer', 'customer', false, 'customer.enableTcsApplicable'],
    ['customer.tcsRate', 'TCS Rate', 'customer', 'customer', false, 'customer.enableTcsApplicable'],
    ['customer.gstNumber', 'GST Number', 'customer', 'customer', true],
    ['customer.msmeNumber', 'MSME Number', 'customer', 'customer', true],
    ['customer.paymentTerms', 'Payment Terms', 'customer', 'customer', false, 'customer.enablePaymentTerms'],
    ['customer.riskCategory', 'Risk Category', 'customer', 'customer', false, 'customer.enableRiskCategory'],
    ['customer.industrySpecificFields', 'Industry Specific Fields', 'customer', 'customer', false],
    ['supplier.contactPerson', 'Contact Person', 'supplier', 'supplier', true],
    ['supplier.panNumber', 'PAN Number', 'supplier', 'supplier', true],
    ['supplier.bankDetails', 'Bank Details', 'supplier', 'supplier', true],
    ['supplier.tdsApplicable', 'TDS Applicable', 'supplier', 'supplier', true],
    ['supplier.msmeNumber', 'MSME Number', 'supplier', 'supplier', true],
    ['industry.smartLighting.consultant', 'Consultant', 'customer', 'industry', false, null, 'Smart Lighting'],
    ['industry.exporter.iecNumber', 'IEC Number', 'customer', 'industry', false, null, 'Exporter'],
];

const FEATURE_CONFIGURATION_REGISTRY = rows.map(([featureKey, featureName, module, category, defaultEnabled, legacyPath, industry]) => ({
    featureKey,
    featureName,
    module,
    category,
    industry: industry || null,
    defaultEnabled: !!defaultEnabled,
    required: false,
    ...(legacyPath ? { legacyPath } : {}),
}));

const FEATURE_CONFIG_CATEGORIES = [
    { id: 'module', label: 'Module Configuration' },
    { id: 'compliance', label: 'Compliance Configuration' },
    { id: 'customer', label: 'Customer Master' },
    { id: 'supplier', label: 'Supplier Master' },
    { id: 'industry', label: 'Industry Fields' },
];

const out = `export const FEATURE_CONFIG_CATEGORIES = ${JSON.stringify(FEATURE_CONFIG_CATEGORIES, null, 4)};

export const FEATURE_CONFIGURATION_REGISTRY = ${JSON.stringify(FEATURE_CONFIGURATION_REGISTRY, null, 4)};

export const REGISTRY_BY_KEY = Object.fromEntries(
    FEATURE_CONFIGURATION_REGISTRY.map((r) => [r.featureKey, r]),
);

export const DEFAULT_FEATURE_ENGINE = {
    overrides: {},
    customDefinitions: [],
    industryFieldValues: {},
};
`;

fs.writeFileSync(new URL('../src/constants/featureConfiguration.registry.js', import.meta.url), out, 'utf8');
console.log('OK', FEATURE_CONFIGURATION_REGISTRY.length, 'features');
