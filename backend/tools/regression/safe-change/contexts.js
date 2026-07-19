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
 * Detect product context from repository root path.
 */
export function detectContextFromRoot(repoRootPath = '') {
    const normalized = String(repoRootPath || '').replace(/\\/g, '/');
    const base = normalized.split('/').filter(Boolean).pop() || '';

    if (base === 'JSK-E-SARTHI-MASTER-jsk-deploy' || /JSK-E-SARTHI-MASTER-jsk-deploy$/i.test(normalized)) {
        return PRODUCT_CONTEXTS.jsk;
    }
    if (base === 'JSK-E-SARTHI-MASTER' || /\/JSK-E-SARTHI-MASTER$/i.test(normalized)) {
        return PRODUCT_CONTEXTS.handloom;
    }

    // Fallback: APPLICATION_KEY env
    const key = String(process.env.APPLICATION_KEY || '').toLowerCase();
    if (key.includes('jsk')) return PRODUCT_CONTEXTS.jsk;
    if (key.includes('handloom')) return PRODUCT_CONTEXTS.handloom;

    return null;
}

export const FINAL_DECISIONS = Object.freeze({
    SAFE_FOR_LOCAL_DEVELOPMENT: 'SAFE FOR LOCAL DEVELOPMENT',
    SAFE_FOR_REVIEW: 'SAFE FOR REVIEW',
    SAFE_FOR_STAGING: 'SAFE FOR STAGING',
    SAFE_FOR_DEPLOYMENT: 'SAFE FOR DEPLOYMENT',
    BLOCK_DEPLOYMENT: 'BLOCK DEPLOYMENT',
});
