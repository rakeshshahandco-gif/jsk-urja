/**
 * Phase 2.5 — CRM Regression Protection Framework (config).
 * Read-only validation. Does not mutate production or business logic.
 */

export const RISK = Object.freeze({
    LOW: 'LOW',
    MEDIUM: 'MEDIUM',
    HIGH: 'HIGH',
    BLOCK_DEPLOYMENT: 'BLOCK DEPLOYMENT',
});

/** Failures that must block deployment recommendations. */
export const BLOCK_DEPLOYMENT_CODES = Object.freeze([
    'SALES_REGRESSION',
    'COMPANY_LEAK',
    'WRONG_DATABASE',
    'WRONG_IDENTITY',
    'WRONG_PRINT',
    'WRONG_GST',
    'WRONG_TOTALS',
    'AUTH_FAILURE',
    'CROSS_COMPANY_ACCESS',
    'MODULE_BYPASS',
    'SECURITY_BYPASS',
    'DB_CORRUPTION',
]);

export const PRODUCTS = Object.freeze({
    handloom: {
        key: 'handloom',
        label: 'Handloom',
        frontendPort: 4000,
        backendPort: 5000,
        backendBase: 'http://127.0.0.1:5000',
        databaseName: 'handloom_crm',
        applicationKey: 'handloom-local',
        industryType: 'HANDLOOM_TEXTILE',
        companyId: '6a5b6a3cc94043acb0576009',
        companyName: 'Handloom Group',
        defaultUserEnv: 'REGRESSION_HANDLOOM_USER',
        defaultPassEnv: 'REGRESSION_HANDLOOM_PASS',
        defaultUsername: 'handloom.local.admin@localhost.test',
        mongoHint: 'mongodb://127.0.0.1:27017/handloom_crm',
    },
    jsk: {
        key: 'jsk',
        label: 'JSK URJA',
        frontendPort: 4100,
        backendPort: 5100,
        backendBase: 'http://127.0.0.1:5100',
        databaseName: 'jsk-esarthi-ui-dev',
        applicationKey: 'jsk-local',
        industryType: 'ELECTRONICS_MANUFACTURING',
        companyId: '6a54d8ccce4837fc80a9d11f',
        companyName: 'JSK URJA',
        defaultUserEnv: 'REGRESSION_JSK_USER',
        defaultPassEnv: 'REGRESSION_JSK_PASS',
        defaultUsername: 'jsk.local.admin@localhost.test',
        mongoHint: 'mongodb://127.0.0.1:27017/jsk-esarthi-ui-dev',
    },
});

export const PILOT_MODULES = Object.freeze(['tasks', 'crm', 'sales']);

export const CACHE_KEY_PATTERNS = Object.freeze([
    'companyModules:{companyId}',
    'moduleState:{companyId}:{moduleKey}',
    'sidebar:{companyId}',
    'dashboard:{companyId}',
    'settings:{companyId}',
]);

export const CATEGORIES = Object.freeze([
    'environment',
    'authentication',
    'company-isolation',
    'module-state',
    'sales',
    'print',
    'company-config',
    'cache',
    'security',
    'database-safety',
    'build',
]);

/** Existing unit tests invoked by build/sales/print suites (read-only). */
export const UNIT_TEST_BUNDLES = Object.freeze({
    module: [
        'test/moduleGuard.test.js',
        'test/moduleStateDecision.test.js',
        'test/phase5ModuleGuardMatrix.test.js',
    ],
    salesGst: [
        'test/phase3GstRegression.test.js',
        'test/phase3StockRegression.test.js',
        'test/phase3AccountingRegression.test.js',
    ],
    print: [
        'test/handloomPrintSeparation.test.js',
        'test/formPrintLock.test.js',
        'test/goldenReferenceRegression.test.js',
    ],
    company: [
        'test/companyUserAccess.test.js',
        'test/companyBranding.test.js',
        'test/platformAccess.test.js',
    ],
});
