/**
 * Approved local product contexts for Safe Change Guard (Phase 2.6).
 * Paths are matched by folder name suffix so both Windows absolute paths work.
 */

export const PRODUCT_CONTEXTS = Object.freeze({
    handloom: {
        key: 'handloom',
        label: 'Handloom',
        rootFolderNames: ['JSK-E-SARTHI-MASTER'],
        // Prefer exact match when present
        preferredRootHints: ['JSK-E-SARTHI-MASTER'],
        excludeRootHints: ['JSK-E-SARTHI-MASTER-jsk-deploy'],
        frontendPort: 4000,
        backendPort: 5000,
        databaseName: 'handloom_crm',
        applicationKey: 'handloom-local',
        industryType: 'HANDLOOM_TEXTILE',
        companyName: 'Handloom Group',
        companyId: '6a5b6a3cc94043acb0576009',
        backendBase: 'http://127.0.0.1:5000',
    },
    jsk: {
        key: 'jsk',
        label: 'JSK URJA',
        rootFolderNames: ['JSK-E-SARTHI-MASTER-jsk-deploy'],
        preferredRootHints: ['JSK-E-SARTHI-MASTER-jsk-deploy'],
        excludeRootHints: [],
        frontendPort: 4100,
        backendPort: 5100,
        databaseName: 'jsk-esarthi-ui-dev',
        applicationKey: 'jsk-local',
        industryType: 'ELECTRONICS_MANUFACTURING',
        companyName: 'JSK URJA',
        companyId: '6a54d8ccce4837fc80a9d11f',
        backendBase: 'http://127.0.0.1:5100',
    },
});

export const ALL_WATCH_PORTS = Object.freeze([4000, 5000, 4100, 5100]);

/**
 * Normalize explicit product identifiers to approved keys.
 * Priority consumers: REGRESSION_PRODUCT, APPLICATION_KEY.
 */
export function normalizeProductKey(raw = '') {
    const v = String(raw || '').trim().toLowerCase();
    if (!v) return null;
    if (v === 'handloom' || v === 'handloom-local' || v === 'handloom_crm' || v.startsWith('handloom')) {
        return 'handloom';
    }
    if (
        v === 'jsk'
        || v === 'jsk-local'
        || v === 'jsk-urja'
        || v === 'jsk-esarthi-ui-dev'
        || v.startsWith('jsk')
    ) {
        return 'jsk';
    }
    return null;
}

/**
 * Detect product context.
 * Priority: REGRESSION_PRODUCT → APPLICATION_KEY → local folder → unknown.
 */
export function detectContextFromRoot(repoRootPath = '') {
    const fromOverride = normalizeProductKey(process.env.REGRESSION_PRODUCT);
    if (fromOverride) return PRODUCT_CONTEXTS[fromOverride];

    const fromAppKey = normalizeProductKey(process.env.APPLICATION_KEY);
    if (fromAppKey) return PRODUCT_CONTEXTS[fromAppKey];

    const normalized = String(repoRootPath || '').replace(/\\/g, '/');
    const base = normalized.split('/').filter(Boolean).pop() || '';

    if (base === 'JSK-E-SARTHI-MASTER-jsk-deploy' || /JSK-E-SARTHI-MASTER-jsk-deploy$/i.test(normalized)) {
        return PRODUCT_CONTEXTS.jsk;
    }
    if (base === 'JSK-E-SARTHI-MASTER' || /\/JSK-E-SARTHI-MASTER$/i.test(normalized)) {
        return PRODUCT_CONTEXTS.handloom;
    }

    return null;
}

export const FINAL_DECISIONS = Object.freeze({
    SAFE_FOR_LOCAL_DEVELOPMENT: 'SAFE FOR LOCAL DEVELOPMENT',
    SAFE_FOR_REVIEW: 'SAFE FOR REVIEW',
    SAFE_FOR_STAGING: 'SAFE FOR STAGING',
    SAFE_FOR_DEPLOYMENT: 'SAFE FOR DEPLOYMENT',
    BLOCK_DEPLOYMENT: 'BLOCK DEPLOYMENT',
});
