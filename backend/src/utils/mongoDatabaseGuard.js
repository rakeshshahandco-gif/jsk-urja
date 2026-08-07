/**
 * Startup guard: staging/development must never attach to jskurja-prod.
 * Does not log Mongo URIs or credentials.
 */

export const PRODUCTION_DB_NAME = 'jskurja-prod';
export const STAGING_SAFETY_BLOCK =
    'STAGING SAFETY BLOCK: staging environment cannot connect to production database.';
export const DEV_SAFETY_BLOCK =
    'DEV SAFETY BLOCK: development environment cannot connect to production database.';

/** Emergency override only — never set on Render staging/production. */
export const PROD_DB_OVERRIDE_VALUE = 'YES_I_UNDERSTAND';

export function extractDatabaseNameFromUrl(rawUrl = '') {
    try {
        const normalized = String(rawUrl || '')
            .replace(/^mongodb\+srv:\/\//i, 'https://')
            .replace(/^mongodb:\/\//i, 'http://');
        const parsed = new URL(normalized);
        return (
            decodeURIComponent((parsed.pathname || '/').replace(/^\//, '').split('/')[0] || '') ||
            ''
        );
    } catch {
        return '';
    }
}

export function normalizeAppEnv({ appEnv, nodeEnv } = {}) {
    const fromApp = String(appEnv || process.env.APP_ENV || '').trim().toLowerCase();
    if (fromApp) return fromApp;
    return String(nodeEnv || process.env.NODE_ENV || '').trim().toLowerCase();
}

/**
 * @param {{ appEnv?: string, nodeEnv?: string, databaseName?: string, allowProdOverride?: string }} opts
 * @throws {Error} when staging/dev would connect to production DB
 */
export function assertSafeMongoDatabase(opts = {}) {
    const databaseName = String(opts.databaseName || '').trim().toLowerCase();
    const appEnv = normalizeAppEnv(opts);
    const nodeEnv = String(opts.nodeEnv || process.env.NODE_ENV || '').trim().toLowerCase();
    const override = String(
        opts.allowProdOverride ?? process.env.ALLOW_PROD_DB_OVERRIDE ?? ''
    ).trim();

    if (databaseName !== PRODUCTION_DB_NAME) {
        return { ok: true, appEnv, databaseName };
    }

    if (appEnv === 'staging') {
        const err = new Error(STAGING_SAFETY_BLOCK);
        err.code = 'STAGING_SAFETY_BLOCK';
        throw err;
    }

    const isDevLike =
        appEnv === 'development' ||
        nodeEnv === 'development' ||
        appEnv === 'test' ||
        nodeEnv === 'test';

    if (isDevLike && override !== PROD_DB_OVERRIDE_VALUE) {
        const err = new Error(DEV_SAFETY_BLOCK);
        err.code = 'DEV_SAFETY_BLOCK';
        throw err;
    }

    return { ok: true, appEnv, databaseName, productionAllowed: true };
}

export function assertSafeMongoUrl(mongoUrl, opts = {}) {
    const databaseName = extractDatabaseNameFromUrl(mongoUrl);
    return assertSafeMongoDatabase({ ...opts, databaseName });
}
