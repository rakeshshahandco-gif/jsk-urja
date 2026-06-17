/**
 * Frontend mirror of backend module registry (keep in sync).
 */

export const MODULE_REGISTRY = [
    { code: 'crm', label: 'CRM', group: 'core', menuIds: ['crm'] },
    { code: 'tasks', label: 'Task Management', group: 'core', menuIds: ['tasks'] },
    { code: 'messenger', label: 'Messenger', group: 'core', menuIds: ['messenger'] },
    { code: 'whatsapp', label: 'WhatsApp', group: 'core', menuIds: ['whatsapp'] },
    { code: 'sales', label: 'Sales', group: 'core', menuIds: ['sales'] },
    { code: 'purchase', label: 'Purchase', group: 'core', menuIds: ['purchase'] },
    { code: 'inventory', label: 'Inventory', group: 'core', menuIds: ['inventory'] },
    { code: 'documents', label: 'Documents / Scan', group: 'core', menuIds: ['documents-menu'] },
    { code: 'production', label: 'Production (General)', group: 'core', menuIds: ['production'] },
    { code: 'service', label: 'Service / Complaints', group: 'core', menuIds: ['service'] },
    { code: 'accounts', label: 'Accounts / Vouchers', group: 'finance', menuIds: ['accounts', 'voucher-entry'] },
    { code: 'gst', label: 'GST', group: 'finance', menuIds: ['gst'] },
    { code: 'tds', label: 'TDS', group: 'finance', menuIds: ['tds'] },
    { code: 'reports', label: 'Reports / MIS', group: 'core', menuIds: ['reports', 'mis'] },
    { code: 'hr', label: 'HR / Payroll', group: 'core', menuIds: ['hr'] },
    { code: 'rd', label: 'R&D / PRD', group: 'electronics', menuIds: ['rd'] },
    { code: 'payroll', label: 'Payroll', group: 'finance', menuIds: ['payroll'] },
    { code: 'admin', label: 'Admin / Settings', group: 'admin', menuIds: ['admin', 'saas-admin', 'feature-configuration', 'company-module-allocation'] },
    { code: 'bom', label: 'BOM', group: 'electronics', menuIds: ['bom-master'] },
    { code: 'pcb', label: 'PCB Production', group: 'electronics', menuIds: ['pcb-production'] },
    { code: 'smd', label: 'SMD Production', group: 'electronics', menuIds: ['smd-production'] },
    { code: 'qc', label: 'QC / Testing', group: 'electronics', menuIds: ['qc-module'] },
    { code: 'fabric_purchase', label: 'Fabric Purchase', group: 'textile', menuIds: ['fabric-purchase'] },
    { code: 'than_meter_stock', label: 'Than / Meter Stock', group: 'textile', menuIds: ['than-meter-stock'] },
    { code: 'dyeing', label: 'Dyeing', group: 'textile', menuIds: ['textile-jw-issue', 'textile-jw-return', 'textile-jw-stock', 'textile-jw-reports'] },
    { code: 'embroidery', label: 'Embroidery', group: 'textile', menuIds: ['textile-embroidery'] },
    { code: 'printing', label: 'Printing', group: 'textile', menuIds: ['textile-printing'] },
    { code: 'stitching', label: 'Stitching', group: 'textile', menuIds: ['textile-stitching'] },
    { code: 'textile_job_work', label: 'Textile Job Work', group: 'textile', menuIds: ['textile-job-work', 'textile-job-work-rates', 'textile-job-work-reports', 'textile-process-output'] },
    { code: 'lot_tracking', label: 'Lot Tracking', group: 'textile', menuIds: ['textile-production', 'textile-production-order'] },
    { code: 'multi_uom', label: 'Multi-UOM', group: 'textile', menuIds: ['textile-conversion-master', 'textile-transformation-entry', 'textile-transformation-history'] },
];

export const MENU_MODULE_BY_ID = (() => {
    const map = {};
    for (const mod of MODULE_REGISTRY) {
        for (const id of mod.menuIds || []) {
            if (!map[id]) map[id] = mod.code;
        }
    }
    return map;
})();

/** Menu items always visible even when module guard is on. */
export const MODULE_MENU_ALWAYS_VISIBLE = new Set([
    'dashboard',
    'admin',
    'saas-admin',
    'feature-configuration',
    'company-module-allocation',
    'industry-templates',
    'company-profile',
    'companies-list',
]);

const ROUTE_PREFIX_TO_MODULE = [
    ['/customers', 'crm'], ['/crm/', 'crm'], ['/tasks', 'tasks'], ['/groups', 'messenger'],
    ['/sales-', 'sales'], ['/sales/', 'sales'], ['/purchase-', 'purchase'], ['/suppliers', 'purchase'],
    ['/items', 'inventory'], ['/stock', 'inventory'], ['/bom', 'bom'],
    ['/production/textile', 'textile_job_work'], ['/textile-', 'textile_job_work'],
    ['/gst', 'gst'], ['/tds', 'tds'], ['/vouchers', 'accounts'], ['/reports', 'reports'], ['/mis/', 'reports'],
    ['/admin/module-allocation', 'admin'], ['/company-profile', 'admin'],
    ['/whatsapp', 'whatsapp'], ['/complaints', 'service'], ['/prd-', 'rd'],
];

export function moduleForMenuId(menuId) {
    return MENU_MODULE_BY_ID[menuId] || null;
}

export function moduleForPath(pathname = '') {
    const p = String(pathname || '').split('?')[0].toLowerCase();
    if (p === '/' || p === '') return null;
    for (const [prefix, code] of ROUTE_PREFIX_TO_MODULE) {
        if (p === prefix || p.startsWith(prefix)) return code;
    }
    return null;
}

export function moduleForFormId(formId) {
    return MENU_MODULE_BY_ID[formId] || null;
}
