/**
 * Canonical module codes for multi-industry / multi-company allocation.
 * Used by moduleGuard.service.js and mirrored on the frontend.
 */

export const MODULE_GROUPS = {
    CORE: 'core',
    TEXTILE: 'textile',
    ELECTRONICS: 'electronics',
    FINANCE: 'finance',
    ADMIN: 'admin',
};

/** @type {Array<{ code: string, label: string, group: string, menuIds?: string[], apiPrefixes?: string[], permissionModules?: string[] }>} */
export const MODULE_REGISTRY = [
    { code: 'crm', label: 'CRM', group: MODULE_GROUPS.CORE, menuIds: ['crm'], apiPrefixes: ['/customers', '/leads', '/followups', '/conversations', '/reminders', '/product-catalog'], permissionModules: ['crm', 'customers'] },
    { code: 'tasks', label: 'Task Management', group: MODULE_GROUPS.CORE, menuIds: ['tasks'], apiPrefixes: ['/tasks', '/task-groups', '/task-categories'], permissionModules: ['tasks'] },
    { code: 'messenger', label: 'Messenger', group: MODULE_GROUPS.CORE, menuIds: ['messenger'], apiPrefixes: ['/groups', '/task-chat'], permissionModules: ['whatsapp', 'messenger'] },
    { code: 'whatsapp', label: 'WhatsApp', group: MODULE_GROUPS.CORE, menuIds: ['whatsapp', 'whatsapp-chat'], apiPrefixes: ['/whatsapp'], permissionModules: ['whatsapp'] },
    { code: 'whatsapp_bulk', label: 'WhatsApp Bulk Messaging', group: MODULE_GROUPS.CORE, menuIds: ['communication-bulk-group', 'communication-bulk-campaigns', 'communication-bulk-matter', 'communication-bulk-blacklist', 'communication-bulk-history', 'communication-bulk-settings'], apiPrefixes: ['/whatsapp-bulk'], permissionModules: ['whatsapp_bulk'] },
    { code: 'email', label: 'Platform Email', group: MODULE_GROUPS.CORE, menuIds: ['communication-email-settings', 'communication-history'], apiPrefixes: ['/email-settings', '/communication-history'], permissionModules: ['email'] },
    { code: 'email_bulk', label: 'Email Bulk Messaging', group: MODULE_GROUPS.CORE, menuIds: ['communication-email-bulk-group', 'communication-email-bulk-campaigns', 'communication-email-bulk-templates', 'communication-email-bulk-blacklist', 'communication-email-bulk-settings'], apiPrefixes: ['/email-bulk'], permissionModules: ['email_bulk'] },
    { code: 'sales', label: 'Sales', group: MODULE_GROUPS.CORE, menuIds: ['sales'], apiPrefixes: ['/sales-orders', '/sales-invoices', '/invoice-series', '/eway-bills', '/e-invoices', '/transporters'], permissionModules: ['sales'] },
    { code: 'purchase', label: 'Purchase', group: MODULE_GROUPS.CORE, menuIds: ['purchase'], apiPrefixes: ['/suppliers', '/purchase-orders', '/purchase-rfq', '/grn', '/purchase-invoices'], permissionModules: ['purchase'] },
    { code: 'inventory', label: 'Inventory', group: MODULE_GROUPS.CORE, menuIds: ['inventory'], apiPrefixes: ['/items', '/item-types', '/item-groups', '/stock', '/bom'], permissionModules: ['inventory'] },
    { code: 'documents', label: 'Documents / Scan', group: MODULE_GROUPS.CORE, menuIds: ['documents-menu'], apiPrefixes: ['/scan-entry', '/smart-import', '/import-center'], permissionModules: ['documents', 'scan_entry', 'import_utility'] },
    { code: 'data_extractor', label: 'Data Extractor / Market Finder', group: MODULE_GROUPS.CORE, menuIds: ['data-extractor'], apiPrefixes: ['/data-extractor'], permissionModules: ['data_extractor'] },
    { code: 'production', label: 'Production (General)', group: MODULE_GROUPS.CORE, menuIds: ['production', 'prod-dashboard', 'model-conversion', 'comp-replacement', 'prod-rejection', 'prod-planning', 'workflow-production'], apiPrefixes: ['/work-orders', '/production-sheets', '/production-output'], permissionModules: ['production'] },
    { code: 'service', label: 'Service / Complaints', group: MODULE_GROUPS.CORE, menuIds: ['service'], apiPrefixes: ['/complaints', '/replacement-dispatches', '/repair-job-cards'], permissionModules: ['service'] },
    { code: 'accounts', label: 'Accounts / Vouchers', group: MODULE_GROUPS.FINANCE, menuIds: ['accounts', 'voucher-entry', 'account-master-parent', 'group-master', 'ledger-master', 'financial-year-master', 'voucher-type-master', 'cost-centers', 'budgets', 'receipt-entry', 'payment-entry', 'contra-entry', 'expense-entry', 'journal-entry', 'credit-notes', 'debit-notes', 'bill-wise-adjustment', 'bank-reconciliation', 'pdc-register', 'narration-templates', 'vouchers', 'ledger-report', 'sales-register', 'purchase-register', 'expense-register', 'day-book', 'cash-book', 'bank-book', 'outstanding', 'petty-cash-group', 'petty-cash-entry', 'petty-cash-import', 'petty-cash-reports', 'petty-cash-settings'], apiPrefixes: ['/vouchers', '/ledgers', '/cash-bank-accounts', '/petty-cash', '/account-masters'], permissionModules: ['accounts', 'voucher_entry', 'account_master'] },
    { code: 'gst', label: 'GST', group: MODULE_GROUPS.FINANCE, menuIds: ['gst', 'gst-menu', 'gstr1-export', 'gstr3b-compliance', 'gstr9-annual', 'gst-reconciliation', 'itc-register', 'gst-payable', 'hsn-summary', 'gst-ledger'], apiPrefixes: ['/gst-reports', '/e-invoices', '/eway-bills'], permissionModules: ['gst'] },
    { code: 'tds', label: 'TDS', group: MODULE_GROUPS.FINANCE, menuIds: ['tds', 'tds-dashboard', 'tds-master', 'tds-ledger-mapping', 'tds-deduction-register', 'tds-payable-register', 'tds-challan', 'tds-returns', 'tds-reports', 'form-26as'], apiPrefixes: ['/tds'], permissionModules: ['tds'] },
    { code: 'tcs', label: 'TCS', group: MODULE_GROUPS.FINANCE, menuIds: ['tcs', 'tcs-dashboard', 'tcs-master', 'tcs-deductions', 'tcs-challans', 'tcs-reports'], apiPrefixes: ['/tcs'], permissionModules: ['tds'] },
    { code: 'reports', label: 'Reports / MIS', group: MODULE_GROUPS.CORE, menuIds: ['reports', 'mis', 'mis-reports', 'mis-dashboard', 'director-mis', 'sales-analysis', 'report-product-gp', 'report-gp-analysis', 'report-sample-conversion', 'report-replacements', 'report-purchase-comparison', 'crm-reports'], apiPrefixes: ['/reports', '/mis', '/account-reports', '/accounting-reports', '/gp-analysis', '/director-mis'], permissionModules: ['reports', 'mis', 'accounts_reports'] },
    { code: 'fixed_assets', label: 'Fixed Assets', group: MODULE_GROUPS.FINANCE, menuIds: ['fixed-assets-parent', 'fixed-assets-list', 'asset-categories', 'asset-locations', 'depreciation', 'depreciation-schedule'], apiPrefixes: ['/fixed-assets', '/depreciation'], permissionModules: ['accounts'] },
    { code: 'china_sourcing', label: 'China Sourcing / WeChat', group: MODULE_GROUPS.CORE, menuIds: ['china-supplier', 'cs-dashboard', 'cs-products', 'cs-contacts', 'cs-groups', 'cs-prices', 'cs-samples', 'cs-reports'], apiPrefixes: ['/china-supplier', '/wechat'], permissionModules: ['wechat'] },
    { code: 'hr', label: 'HR / Payroll', group: MODULE_GROUPS.CORE, menuIds: ['hr'], apiPrefixes: ['/hr', '/payroll'], permissionModules: ['hr'] },
    { code: 'rd', label: 'R&D / PRD', group: MODULE_GROUPS.ELECTRONICS, menuIds: ['rd', 'prd', 'prd-dashboard', 'prd-projects', 'prd-parameters', 'rd-samples', 'rd-projects-samples', 'rd-sample-list', 'rd-comparison'], apiPrefixes: ['/prd-', '/rd-samples'], permissionModules: ['prd', 'rd_samples'] },
    { code: 'payroll', label: 'Payroll', group: MODULE_GROUPS.FINANCE, menuIds: ['payroll'], apiPrefixes: ['/payroll'], permissionModules: ['hr'] },
    { code: 'admin', label: 'Admin / Settings', group: MODULE_GROUPS.ADMIN, menuIds: ['admin', 'saas-admin', 'feature-configuration', 'company-module-allocation', 'industry-template-master'], apiPrefixes: ['/company-profile', '/permissions', '/industry-templates', '/module-allocation', '/platform-feature-settings', '/feature-configuration'], permissionModules: ['admin'] },
    // Electronics granular
    { code: 'bom', label: 'BOM', group: MODULE_GROUPS.ELECTRONICS, menuIds: ['bom-master'], apiPrefixes: ['/bom'], permissionModules: ['inventory', 'production'] },
    { code: 'pcb', label: 'PCB Production', group: MODULE_GROUPS.ELECTRONICS, menuIds: ['pcb-production'], apiPrefixes: ['/pcb'], permissionModules: ['production'] },
    { code: 'smd', label: 'SMD Production', group: MODULE_GROUPS.ELECTRONICS, menuIds: ['smd-production'], apiPrefixes: ['/smd'], permissionModules: ['production'] },
    { code: 'qc', label: 'QC / Testing', group: MODULE_GROUPS.ELECTRONICS, menuIds: ['qc-module'], apiPrefixes: ['/qc', '/retest'], permissionModules: ['production'] },
    // Textile granular
    { code: 'fabric_purchase', label: 'Fabric Purchase', group: MODULE_GROUPS.TEXTILE, menuIds: ['fabric-purchase'], apiPrefixes: ['/textile-fabric'], permissionModules: ['purchase', 'inventory'] },
    { code: 'than_meter_stock', label: 'Than / Meter Stock', group: MODULE_GROUPS.TEXTILE, menuIds: ['than-meter-stock'], apiPrefixes: ['/textile-stock'], permissionModules: ['inventory'] },
    { code: 'dyeing', label: 'Dyeing', group: MODULE_GROUPS.TEXTILE, menuIds: ['textile-jw-issue', 'textile-jw-return', 'textile-jw-stock', 'textile-jw-reports'], apiPrefixes: ['/textile-dyeing', '/textile-job-work-challan'], permissionModules: ['production'] },
    { code: 'embroidery', label: 'Embroidery', group: MODULE_GROUPS.TEXTILE, menuIds: ['textile-embroidery'], apiPrefixes: ['/textile-embroidery'], permissionModules: ['production'] },
    { code: 'printing', label: 'Printing', group: MODULE_GROUPS.TEXTILE, menuIds: ['textile-printing'], apiPrefixes: ['/textile-printing'], permissionModules: ['production'] },
    { code: 'stitching', label: 'Stitching', group: MODULE_GROUPS.TEXTILE, menuIds: ['textile-stitching'], apiPrefixes: ['/textile-stitching'], permissionModules: ['production'] },
    { code: 'textile_job_work', label: 'Textile Job Work', group: MODULE_GROUPS.TEXTILE, menuIds: ['textile-job-work', 'textile-job-work-rates', 'textile-job-work-reports', 'textile-process-output'], apiPrefixes: ['/textile-job-work', '/textile-process-output', '/textile-process-transfer'], permissionModules: ['production'] },
    { code: 'lot_tracking', label: 'Lot Tracking', group: MODULE_GROUPS.TEXTILE, menuIds: ['textile-production', 'textile-production-order', 'textile-production-workflow', 'textile-process-routes'], apiPrefixes: ['/textile-production-lot', '/textile-production-order'], permissionModules: ['production'] },
    { code: 'multi_uom', label: 'Multi-UOM', group: MODULE_GROUPS.TEXTILE, menuIds: ['textile-conversion-master', 'textile-transformation-entry', 'textile-transformation-history'], apiPrefixes: ['/textile-conversion', '/textile-transformation'], permissionModules: ['production', 'inventory'] },
];

export const ALL_MODULE_CODES = MODULE_REGISTRY.map((m) => m.code);

export const MODULE_BY_CODE = Object.fromEntries(MODULE_REGISTRY.map((m) => [m.code, m]));

/** Permission module ids used in user rights (not module-guard-only codes like china_sourcing). */
export function collectPermissionModuleIds() {
    const ids = new Set();
    for (const mod of MODULE_REGISTRY) {
        const pms = mod.permissionModules || [];
        for (const pm of pms) {
            ids.add(pm);
        }
        if (!pms.length && mod.code) {
            ids.add(mod.code);
        }
    }
    return ids;
}

/** Module-guard codes that must not appear as separate rows in User Management permissions. */
export function moduleGuardOnlyPermissionCodes() {
    const guardOnly = new Set();
    for (const mod of MODULE_REGISTRY) {
        const pms = mod.permissionModules || [];
        if (mod.code && pms.length && !pms.includes(mod.code)) {
            guardOnly.add(mod.code);
        }
    }
    return guardOnly;
}

export function filterPermissionRegistryModules(modules = []) {
    const guardOnly = moduleGuardOnlyPermissionCodes();
    return (modules || []).filter((m) => m?.id && !guardOnly.has(m.id));
}

/** Menu item id → module code (first match wins). */
export const MENU_ID_TO_MODULE = (() => {
    const map = {};
    for (const mod of MODULE_REGISTRY) {
        for (const id of mod.menuIds || []) {
            if (!map[id]) map[id] = mod.code;
        }
    }
    return map;
})();

/** API path prefix → module code (longest prefix match at runtime). */
export const API_PREFIX_TO_MODULE = (() => {
    const pairs = [];
    for (const mod of MODULE_REGISTRY) {
        for (const prefix of mod.apiPrefixes || []) {
            pairs.push([prefix, mod.code]);
        }
    }
    pairs.sort((a, b) => b[0].length - a[0].length);
    return pairs;
})();

export function moduleForApiPath(pathname = '') {
    const p = String(pathname || '').split('?')[0];
    for (const [prefix, code] of API_PREFIX_TO_MODULE) {
        if (p === prefix || p.startsWith(`${prefix}/`)) return code;
    }
    return null;
}

export function moduleForMenuId(menuId) {
    return MENU_ID_TO_MODULE[menuId] || null;
}

/** Routes that never require module guard (auth, health, module config). */
export const MODULE_GUARD_EXEMPT_API_PREFIXES = [
    '/health',
    '/auth',
    '/companies/active',
    '/module-allocation',
    '/industry-templates',
    '/platform-feature-settings',
    '/feature-configuration',
    '/permissions',
    '/saas',
    '/users/me',
];

export function isModuleGuardExemptApiPath(pathname = '') {
    const p = String(pathname || '').split('?')[0];
    return MODULE_GUARD_EXEMPT_API_PREFIXES.some((prefix) => p === prefix || p.startsWith(`${prefix}/`));
}
