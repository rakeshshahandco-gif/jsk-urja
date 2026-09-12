/**
 * Frontend mirror of backend module registry (keep in sync).
 */

export const MODULE_REGISTRY = [
    { code: 'crm', label: 'CRM', group: 'core', menuIds: ['crm'], permissionModules: ['crm', 'customers'] },
    { code: 'tasks', label: 'Task Management', group: 'core', menuIds: ['tasks'], permissionModules: ['tasks'] },
    { code: 'messenger', label: 'Messenger', group: 'core', menuIds: ['messenger'], permissionModules: ['whatsapp', 'messenger'] },
    { code: 'whatsapp', label: 'WhatsApp', group: 'core', menuIds: ['whatsapp-root', 'whatsapp', 'whatsapp-chat'], permissionModules: ['whatsapp'] },
    { code: 'whatsapp_bulk', label: 'WhatsApp Bulk Messaging', group: 'core', menuIds: ['whatsapp-communication-group', 'communication-bulk-campaigns', 'communication-bulk-matter', 'communication-bulk-blacklist', 'communication-bulk-history', 'communication-bulk-number-health', 'communication-bulk-settings'], permissionModules: ['whatsapp_bulk'] },
    { code: 'whatsapp_ai', label: 'WhatsApp AI', group: 'core', menuIds: ['communication-whatsapp-ai-group', 'communication-whatsapp-ai-dashboard', 'communication-whatsapp-ai-inbox', 'communication-whatsapp-ai-active', 'communication-whatsapp-ai-waiting', 'communication-whatsapp-ai-lead-drafts', 'communication-whatsapp-ai-reply-drafts', 'communication-whatsapp-ai-knowledge', 'communication-whatsapp-ai-documents', 'communication-whatsapp-ai-rules', 'communication-whatsapp-ai-settings', 'communication-whatsapp-ai-audit'], permissionModules: ['whatsapp_ai'] },
    { code: 'email', label: 'Platform Email', group: 'core', menuIds: ['communication-bulk-group', 'communication-email-settings', 'communication-history'], permissionModules: ['email'] },
    { code: 'email_bulk', label: 'Email Bulk Messaging', group: 'core', menuIds: ['communication-email-bulk-campaigns', 'communication-email-bulk-templates', 'communication-email-bulk-blacklist', 'communication-email-bulk-history', 'communication-email-bulk-settings'], permissionModules: ['email_bulk'] },
    { code: 'sales', label: 'Sales', group: 'core', menuIds: ['sales'], permissionModules: ['sales'] },
    { code: 'purchase', label: 'Purchase', group: 'core', menuIds: ['purchase'], permissionModules: ['purchase'] },
    { code: 'inventory', label: 'Inventory', group: 'core', menuIds: ['inventory'], permissionModules: ['inventory'] },
    { code: 'documents', label: 'Documents / Scan', group: 'core', menuIds: ['documents-menu'], permissionModules: ['documents', 'scan_entry', 'import_utility'] },
    { code: 'data_extractor', label: 'Data Extractor', group: 'core', menuIds: ['data-extractor', 'data-extractor-keyword', 'data-extractor-manual', 'data-extractor-import', 'data-extractor-settings', 'data-extractor-discovery-agent'], permissionModules: ['data_extractor'] },
    { code: 'production', label: 'Production (General)', group: 'core', menuIds: ['production', 'prod-dashboard', 'model-conversion', 'comp-replacement', 'prod-rejection', 'prod-planning', 'workflow-production'], permissionModules: ['production'] },
    { code: 'service', label: 'Service / Complaints', group: 'core', menuIds: ['service'], permissionModules: ['service'] },
    { code: 'accounts', label: 'Accounts / Vouchers', group: 'finance', menuIds: ['accounts', 'voucher-entry', 'account-master-parent'], permissionModules: ['accounts', 'voucher_entry', 'account_master'] },
    { code: 'gst', label: 'GST', group: 'finance', menuIds: ['gst', 'gst-menu'], permissionModules: ['gst'] },
    { code: 'tds', label: 'TDS', group: 'finance', menuIds: ['tds'], permissionModules: ['tds'] },
    { code: 'tcs', label: 'TCS', group: 'finance', menuIds: ['tcs'], permissionModules: ['tds'] },
    { code: 'reports', label: 'Reports / MIS', group: 'core', menuIds: ['reports', 'mis', 'mis-reports'], permissionModules: ['reports', 'mis', 'accounts_reports'] },
    { code: 'fixed_assets', label: 'Fixed Assets', group: 'finance', menuIds: ['fixed-assets-parent'], permissionModules: ['accounts'] },
    { code: 'china_sourcing', label: 'China Sourcing / WeChat', group: 'core', menuIds: ['china-supplier', 'cs-dashboard', 'cs-products', 'cs-contacts', 'cs-groups', 'cs-prices', 'cs-samples', 'cs-reports'], permissionModules: ['wechat'] },
    { code: 'hr', label: 'HR / Payroll', group: 'core', menuIds: ['hr'], permissionModules: ['hr'] },
    { code: 'rd', label: 'R&D / PRD', group: 'electronics', menuIds: ['rd', 'prd', 'rd-samples'], permissionModules: ['prd', 'rd_samples'] },
    { code: 'payroll', label: 'Payroll', group: 'finance', menuIds: ['payroll'], permissionModules: ['hr'] },
    { code: 'admin', label: 'Admin / Settings', group: 'admin', menuIds: ['admin', 'super-admin', 'feature-configuration', 'company-module-allocation'], permissionModules: ['admin'] },
    { code: 'bom', label: 'BOM', group: 'electronics', menuIds: ['bom-master'], permissionModules: ['inventory', 'production'] },
    { code: 'pcb', label: 'PCB Production', group: 'electronics', menuIds: ['pcb-production'], permissionModules: ['production'] },
    { code: 'smd', label: 'SMD Production', group: 'electronics', menuIds: ['smd-production'], permissionModules: ['production'] },
    { code: 'qc', label: 'QC / Testing', group: 'electronics', menuIds: ['qc-module'], permissionModules: ['production'] },
    { code: 'fabric_purchase', label: 'Fabric Purchase', group: 'textile', menuIds: ['fabric-purchase'], permissionModules: ['purchase', 'inventory'] },
    { code: 'than_meter_stock', label: 'Than / Meter Stock', group: 'textile', menuIds: ['than-meter-stock'], permissionModules: ['inventory'] },
    { code: 'dyeing', label: 'Dyeing', group: 'textile', menuIds: ['textile-jw-issue', 'textile-jw-return', 'textile-jw-stock', 'textile-jw-reports'], permissionModules: ['production'] },
    { code: 'embroidery', label: 'Embroidery', group: 'textile', menuIds: ['textile-embroidery'], permissionModules: ['production'] },
    { code: 'printing', label: 'Printing', group: 'textile', menuIds: ['textile-printing'], permissionModules: ['production'] },
    { code: 'stitching', label: 'Stitching', group: 'textile', menuIds: ['textile-stitching'], permissionModules: ['production'] },
    { code: 'textile_job_work', label: 'Textile Job Work', group: 'textile', menuIds: ['textile-job-work', 'textile-job-work-rates', 'textile-job-work-reports', 'textile-process-output'], permissionModules: ['production'] },
    { code: 'lot_tracking', label: 'Lot Tracking', group: 'textile', menuIds: ['textile-production', 'textile-production-order', 'textile-production-workflow', 'textile-process-routes'], permissionModules: ['production'] },
    { code: 'multi_uom', label: 'Multi-UOM', group: 'textile', menuIds: ['textile-conversion-master', 'textile-transformation-entry', 'textile-transformation-history'], permissionModules: ['production', 'inventory'] },
];

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

export const MENU_MODULE_BY_ID = (() => {
    const map = {};
    for (const mod of MODULE_REGISTRY) {
        for (const id of mod.menuIds || []) {
            if (!map[id]) map[id] = mod.code;
        }
    }
    return map;
})();

/** Menu items always visible even when module guard is on (non-platform). */
export const MODULE_MENU_ALWAYS_VISIBLE = new Set([
    'dashboard',
    'admin',
    'company-profile',
]);

const ROUTE_PREFIX_TO_MODULE = [
    ['/customers', 'crm'], ['/crm/', 'crm'], ['/tasks', 'tasks'], ['/groups', 'messenger'],
    ['/sales-', 'sales'], ['/sales/', 'sales'], ['/purchase-', 'purchase'], ['/suppliers', 'purchase'],
    ['/items', 'inventory'], ['/stock', 'inventory'], ['/bom', 'bom'],
    ['/production/textile', 'textile_job_work'], ['/textile-', 'textile_job_work'],
    ['/gst', 'gst'], ['/tds', 'tds'], ['/tcs', 'tcs'],
    ['/vouchers', 'accounts'], ['/reports', 'reports'], ['/mis/', 'reports'],
    ['/admin/module-allocation', 'admin'], ['/company-profile', 'admin'],
    ['/whatsapp/home', 'whatsapp'], ['/whatsapp', 'whatsapp'], ['/communication/whatsapp-bulk', 'whatsapp_bulk'],
    ['/communication/whatsapp-ai', 'whatsapp_ai'],
    ['/communication/email-settings', 'email'], ['/communication/history', 'email'],
    ['/communication/email-bulk', 'email_bulk'],
    ['/admin/home', 'admin'],
    ['/data-extractor', 'data_extractor'],
    ['/china-supplier', 'china_sourcing'], ['/wechat', 'china_sourcing'],
    ['/complaints', 'service'], ['/prd-', 'rd'], ['/rd-samples', 'rd'],
    ['/fixed-assets', 'fixed_assets'], ['/depreciation', 'fixed_assets'],
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
