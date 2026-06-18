/**
 * Default enabled modules per industry template code.
 * TEXTILE is kept as alias for TEXTILE_HANDLOOM (existing Handloom DB uses TEXTILE).
 */

const TEXTILE_CORE_MODULES = [
    'fabric_purchase', 'than_meter_stock', 'dyeing', 'embroidery', 'printing',
    'stitching', 'textile_job_work', 'lot_tracking', 'multi_uom', 'production',
    'sales', 'purchase', 'inventory', 'accounts', 'fixed_assets', 'gst', 'tds', 'tcs',
    'reports', 'crm', 'tasks', 'messenger', 'whatsapp', 'documents',
    'china_sourcing', 'service', 'hr', 'admin',
];

export const INDUSTRY_MODULE_DEFAULTS = {
    ELECTRONICS_JSK: {
        enabledModules: [
            'crm', 'tasks', 'messenger', 'whatsapp', 'sales', 'purchase', 'inventory',
            'bom', 'pcb', 'smd', 'qc', 'production', 'accounts', 'fixed_assets', 'gst', 'tds', 'tcs',
            'reports', 'service', 'hr', 'rd', 'documents', 'payroll', 'china_sourcing', 'admin',
        ],
        enforceModuleGuard: false,
    },
    TEXTILE: {
        enabledModules: TEXTILE_CORE_MODULES,
        enforceModuleGuard: true,
    },
    TEXTILE_HANDLOOM: {
        enabledModules: TEXTILE_CORE_MODULES,
        enforceModuleGuard: true,
    },
    TRADING: {
        enabledModules: [
            'crm', 'tasks', 'sales', 'purchase', 'inventory', 'accounts', 'gst', 'tds', 'tcs',
            'reports', 'documents', 'china_sourcing', 'admin',
        ],
        enforceModuleGuard: true,
    },
    MANUFACTURING_GENERAL: {
        enabledModules: [
            'crm', 'tasks', 'sales', 'purchase', 'inventory', 'production',
            'accounts', 'gst', 'tds', 'reports', 'service', 'admin',
        ],
        enforceModuleGuard: true,
    },
    EXPORTER: {
        enabledModules: [
            'crm', 'sales', 'purchase', 'inventory', 'accounts', 'gst', 'reports',
            'china_sourcing', 'documents', 'admin',
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
