/**
 * Reference client/group deployment matrix (documentation mirror).
 * Does NOT trigger deploys or read env vars - admin UI reference only.
 */
export const CLIENT_DEPLOYMENT_GROUPS = [
    {
        clientKey: 'jsk-urja',
        clientName: 'JSK URJA',
        industryTemplates: ['ELECTRONICS_JSK'],
        renderFrontendService: 'jsk-urja-backend',
        renderBackendService: 'jsk-urja-backend',
        frontendUrl: 'https://jsk-urja-backend.onrender.com',
        backendUrl: 'https://jsk-urja-backend.onrender.com',
        databaseName: 'jskurja-prod',
        deployBranch: 'development',
        buildCommand: 'cd backend && npm install',
        autoDeployRecommended: false,
        status: 'live',
        notes: 'Combined API + SPA. Uses committed dist/ from git.',
    },
    {
        clientKey: 'handloom',
        clientName: 'Handloom Group',
        industryTemplates: ['TEXTILE', 'TEXTILE_HANDLOOM'],
        renderFrontendService: 'handloom-crm-frontend',
        renderBackendService: 'handloom-crm-backend',
        frontendUrl: 'https://handloom-crm-frontend.onrender.com',
        backendUrl: 'https://handloom-crm-backend.onrender.com',
        databaseName: 'handloom_crm',
        deployBranch: 'development',
        buildCommandFrontend: 'npm install --include=dev && npm run build',
        buildCommandBackend: 'cd backend && npm install',
        autoDeployRecommended: false,
        status: 'live',
        notes: 'Separate FE + BE services. Auto-deploy OFF on shared branch.',
    },
    {
        clientKey: 'kevin',
        clientName: 'Kevin',
        industryTemplates: ['TRADING', 'EXPORTER', 'MANUFACTURING_GENERAL'],
        renderFrontendService: '',
        renderBackendService: '',
        frontendUrl: '',
        backendUrl: '',
        databaseName: '',
        deployBranch: '',
        autoDeployRecommended: false,
        status: 'planned',
        notes: 'Future client - not deployed yet.',
    },
    {
        clientKey: 'professional-crm',
        clientName: 'Professional CRM',
        industryTemplates: ['SERVICE', 'TRADING'],
        renderFrontendService: '',
        renderBackendService: '',
        frontendUrl: '',
        backendUrl: '',
        databaseName: '',
        status: 'planned',
        notes: 'Future setup - separate Render + DB when onboarded.',
    },
    {
        clientKey: 'healthcare',
        clientName: 'Healthcare / Hospital CRM',
        industryTemplates: ['SERVICE'],
        renderFrontendService: '',
        renderBackendService: '',
        frontendUrl: '',
        backendUrl: '',
        databaseName: '',
        status: 'planned',
        notes: 'Future setup - separate Render + DB when onboarded.',
    },
];

export const DEPLOY_DECISION_RULES = [
    {
        changeType: 'Client-only UI / workflow / logo',
        action: 'Deploy target client Render service(s) only',
        deployRequired: true,
    },
    {
        changeType: 'Module enable/disable for one company',
        action: 'Company Module Allocation (no deploy)',
        deployRequired: false,
    },
    {
        changeType: 'Industry template / sidebar menus',
        action: 'Company industry template setting (no deploy)',
        deployRequired: false,
    },
    {
        changeType: 'Shared core (GST, stock, invoice, PDF, permissions)',
        action: 'Staging test then deploy one client at a time',
        deployRequired: true,
        sharedRisk: true,
    },
];

export const PRE_DEPLOY_CHECKLIST = [
    'Declare scope: client name + files changed',
    'Select correct Render service only (not all clients)',
    'Confirm build command from deployment matrix',
    'Clear build cache if frontend bundle changed',
    'MongoDB URI unchanged unless intentional',
    'Run /api/v1/health after deploy',
    'Smoke test: login, company/FY selector, one transaction in affected module',
    'Update last live commit + deploy date in Deployment Manager',
];

export const SHARED_RISK_HINTS = [
    'backend/src/services/* (GST, stock, voucher, invoice)',
    'backend/src/models/* (shared schemas)',
    'pdf.service.js, permissions, series, global search',
    'moduleRegistry.constants.js, moduleGuard.service.js',
];

export const CLIENT_ONBOARDING_STEPS = {
    kevin: [
        'Create dedicated MongoDB database (never share with JSK or Handloom)',
        'Create Render frontend + backend services (manual deploy only)',
        'Set auto-deploy OFF on new services',
        'Create company with TRADING / EXPORTER / MANUFACTURING_GENERAL template',
        'Configure Company Module Allocation with moduleGuardEnabled: true',
        'Record URLs, DB, and services in Deployment Manager tracking',
    ],
    'professional-crm': [
        'Create dedicated MongoDB database',
        'Create separate Render FE + BE services',
        'Choose SERVICE or TRADING industry template',
        'Enable module guard after module allocation',
        'Record deployment metadata in Deployment Manager',
    ],
    healthcare: [
        'Create dedicated MongoDB database',
        'Create separate Render FE + BE services',
        'Use SERVICE industry template as starting point',
        'Configure modules for hospital workflow only',
        'Record deployment metadata in Deployment Manager',
    ],
};

export function getClientGroupByKey(clientKey) {
    const key = String(clientKey || '').trim().toLowerCase();
    return CLIENT_DEPLOYMENT_GROUPS.find((g) => g.clientKey === key) || null;
}
