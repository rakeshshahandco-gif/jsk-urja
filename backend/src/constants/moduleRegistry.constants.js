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
    { code: 'messenger', label: 'Messenger', group: MODULE_GROUPS.CORE, menuIds: ['messenger'], apiPrefixes: ['/groups', '/task-chat'], permissionModules: ['whatsapp'] },
    { code: 'whatsapp', label: 'WhatsApp', group: MODULE_GROUPS.CORE, menuIds: ['whatsapp'], apiPrefixes: ['/whatsapp'], permissionModules: ['whatsapp'] },
    { code: 'sales', label: 'Sales', group: MODULE_GROUPS.CORE, menuIds: ['sales'], apiPrefixes: ['/sales-orders', '/sales-invoices', '/invoice-series', '/eway-bills', '/e-invoices', '/transporters'], permissionModules: ['sales'] },
    { code: 'purchase', label: 'Purchase', group: MODULE_GROUPS.CORE, menuIds: ['purchase'], apiPrefixes: ['/suppliers', '/purchase-orders', '/purchase-rfq', '/grn', '/purchase-invoices'], permissionModules: ['purchase'] },
    { code: 'inventory', label: 'Inventory', group: MODULE_GROUPS.CORE, menuIds: ['inventory'], apiPrefixes: ['/items', '/item-types', '/item-groups', '/stock', '/bom'], permissionModules: ['inventory'] },
    { code: 'documents', label: 'Documents / Scan', group: MODULE_GROUPS.CORE, menuIds: ['documents-menu'], apiPrefixes: ['/scan-entry', '/smart-import', '/import-center'], permissionModules: ['documents', 'scan_entry', 'import_utility'] },
    { code: 'production', label: 'Production (General)', group: MODULE_GROUPS.CORE, menuIds: ['production'], apiPrefixes: ['/work-orders', '/production-sheets', '/production-output'], permissionModules: ['production'] },
    { code: 'service', label: 'Service / Complaints', group: MODULE_GROUPS.CORE, menuIds: ['service'], apiPrefixes: ['/complaints', '/replacement-dispatches', '/repair-job-cards'], permissionModules: ['service'] },
    { code: 'accounts', label: 'Accounts / Vouchers', group: MODULE_GROUPS.FINANCE, menuIds: ['accounts', 'voucher-entry'], apiPrefixes: ['/vouchers', '/ledgers', '/cash-bank-accounts', '/petty-cash', '/account-masters'], permissionModules: ['accounts', 'voucher_entry', 'account_master'] },
    { code: 'gst', label: 'GST', group: MODULE_GROUPS.FINANCE, menuIds: ['gst'], apiPrefixes: ['/gst-reports', '/e-invoices', '/eway-bills'], permissionModules: ['gst'] },
    { code: 'tds', label: 'TDS', group: MODULE_GROUPS.FINANCE, menuIds: ['tds'], apiPrefixes: ['/tds'], permissionModules: ['tds'] },
    { code: 'reports', label: 'Reports / MIS', group: MODULE_GROUPS.CORE, menuIds: ['reports', 'mis'], apiPrefixes: ['/reports', '/mis', '/account-reports', '/accounting-reports', '/gp-analysis', '/director-mis'], permissionModules: ['reports', 'mis', 'accounts_reports'] },
    { code: 'hr', label: 'HR / Payroll', group: MODULE_GROUPS.CORE, menuIds: ['hr'], apiPrefixes: ['/hr', '/payroll'], permissionModules: ['hr'] },
    { code: 'rd', label: 'R&D / PRD', group: MODULE_GROUPS.ELECTRONICS, menuIds: ['rd'], apiPrefixes: ['/prd-'], permissionModules: ['prd', 'rd_samples'] },
    { code: 'payroll', label: 'Payroll', group: MODULE_GROUPS.FINANCE, menuIds: ['payroll'], apiPrefixes: ['/payroll'], permissionModules: ['hr'] },
    { code: 'admin', label: 'Admin / Settings', group: MODULE_GROUPS.ADMIN, menuIds: ['admin', 'saas-admin', 'feature-configuration'], apiPrefixes: ['/company-profile', '/permissions', '/industry-templates', '/module-allocation', '/platform-feature-settings', '/feature-configuration'], permissionModules: ['admin'] },
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
    { code: 'lot_tracking', label: 'Lot Tracking', group: MODULE_GROUPS.TEXTILE, menuIds: ['textile-production', 'textile-production-order'], apiPrefixes: ['/textile-production-lot', '/textile-production-order'], permissionModules: ['production'] },
    { code: 'multi_uom', label: 'Multi-UOM', group: MODULE_GROUPS.TEXTILE, menuIds: ['textile-conversion-master', 'textile-transformation-entry', 'textile-transformation-history'], apiPrefixes: ['/textile-conversion', '/textile-transformation'], permissionModules: ['production', 'inventory'] },
];

export const ALL_MODULE_CODES = MODULE_REGISTRY.map((m) => m.code);

export const MODULE_BY_CODE = Object.fromEntries(MODULE_REGISTRY.map((m) => [m.code, m]));

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
