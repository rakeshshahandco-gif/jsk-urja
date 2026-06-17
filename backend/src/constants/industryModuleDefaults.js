/**
 * Default enabled modules per industry template code.
 * TEXTILE is kept as alias for TEXTILE_HANDLOOM (existing Handloom DB uses TEXTILE).
 */

export const INDUSTRY_MODULE_DEFAULTS = {
    ELECTRONICS_JSK: {
        enabledModules: [
            'crm', 'tasks', 'messenger', 'whatsapp', 'sales', 'purchase', 'inventory',
            'bom', 'pcb', 'smd', 'qc', 'production', 'accounts', 'gst', 'tds',
            'reports', 'service', 'hr', 'rd', 'documents', 'payroll', 'admin',
        ],
        enforceModuleGuard: false,
    },
    TEXTILE: {
        enabledModules: [
            'fabric_purchase', 'than_meter_stock', 'dyeing', 'embroidery', 'printing',
            'stitching', 'textile_job_work', 'lot_tracking', 'multi_uom',
            'sales', 'purchase', 'inventory', 'accounts', 'gst', 'reports',
            'crm', 'tasks', 'admin',
        ],
        enforceModuleGuard: true,
    },
    TEXTILE_HANDLOOM: {
        enabledModules: [
            'fabric_purchase', 'than_meter_stock', 'dyeing', 'embroidery', 'printing',
            'stitching', 'textile_job_work', 'lot_tracking', 'multi_uom',
            'sales', 'purchase', 'inventory', 'accounts', 'gst', 'reports',
            'crm', 'tasks', 'admin',
        ],
        enforceModuleGuard: true,
    },
    TRADING: {
        enabledModules: [
            'crm', 'tasks', 'sales', 'purchase', 'inventory', 'accounts', 'gst', 'reports', 'admin',
        ],
        enforceModuleGuard: true,
    },
    MANUFACTURING_GENERAL: {
        enabledModules: [
            'crm', 'tasks', 'sales', 'purchase', 'inventory', 'production',
            'accounts', 'gst', 'reports', 'admin',
        ],
        enforceModuleGuard: true,
    },
    EXPORTER: {
        enabledModules: [
            'crm', 'sales', 'purchase', 'inventory', 'accounts', 'gst', 'reports', 'admin',
        ],
        enforceModuleGuard: true,
    },
    SERVICE: {
        enabledModules: [
            'crm', 'tasks', 'service', 'accounts', 'gst', 'reports', 'admin',
        ],
        enforceModuleGuard: true,
    },
};

export function getIndustryModuleDefaults(templateCode) {
    const code = String(templateCode || '').trim().toUpperCase();
    return INDUSTRY_MODULE_DEFAULTS[code] || null;
}

export function normalizeIndustryTemplateCode(templateCode) {
    const code = String(templateCode || '').trim().toUpperCase();
    if (code === 'TEXTILE') return 'TEXTILE_HANDLOOM';
    return code;
}
