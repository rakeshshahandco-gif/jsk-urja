/**
 * Phase 1 — Industry Template Master seed definitions.
 * Stored in DB on startup; not applied to any module yet.
 */

export const DEFAULT_INDUSTRY_TEMPLATES = [
    {
        templateName: 'Electronics Manufacturing',
        templateCode: 'ELECTRONICS_JSK',
        description: 'Default template for electronics manufacturing (JSK URJA).',
        isActive: true,
        isDefaultTemplate: true,
    },
    {
        templateName: 'Textile',
        templateCode: 'TEXTILE',
        description: 'Template for textile and handloom businesses.',
        isActive: true,
        isDefaultTemplate: false,
    },
    {
        templateName: 'Exporter',
        templateCode: 'EXPORTER',
        description: 'Template for export-oriented trading companies.',
        isActive: true,
        isDefaultTemplate: false,
    },
    {
        templateName: 'Trading',
        templateCode: 'TRADING',
        description: 'Template for general trading businesses.',
        isActive: true,
        isDefaultTemplate: false,
    },
    {
        templateName: 'Service',
        templateCode: 'SERVICE',
        description: 'Template for service-based businesses.',
        isActive: true,
        isDefaultTemplate: false,
    },
    {
        templateName: 'General Manufacturing',
        templateCode: 'MANUFACTURING_GENERAL',
        description: 'Template for general manufacturing businesses.',
        isActive: true,
        isDefaultTemplate: false,
    },
];

/** Empty settings scaffold — moduleSettings populated from industryModuleDefaults on seed. */
export const EMPTY_TEMPLATE_SETTINGS = {
    moduleSettings: {
        enabledModules: [],
        disabledModules: [],
        enforceModuleGuard: false,
        defaultWorkflowRef: null,
        defaultSidebar: {},
        defaultReports: [],
        defaultPermissions: {},
        defaultProductionProcess: {},
    },
    fieldSettings: {},
    workflowSettings: {},
    sopSettings: {},
    productionProcessSettings: {},
    documentSettings: {},
    reportSettings: {},
    dashboardSettings: {},
};
