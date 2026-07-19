/**
 * Product / repository context for regression (Phase 2.6+).
 * Detection is deterministic; never guesses a database for unknown products.
 */
import path from 'path';
import { PRODUCTS } from '../config.js';
import { loadEnvFile, repoRoot } from './env.js';

export const PRODUCT_KEYS = Object.freeze(['handloom', 'jsk']);

/**
 * @returns {{
 *   productKey: 'handloom'|'jsk'|'unknown',
 *   productName: string,
 *   expectedIdentity: string|null,
 *   expectedDatabase: string|null,
 *   expectedFrontendPort: number|null,
 *   expectedBackendPort: number|null,
 *   detectionSource: string,
 *   warning: string|null,
 * }}
 */
export function detectActiveProduct(repoRootPath = repoRoot()) {
    // 1) Explicit approved override only (do not use polluted shell APPLICATION_KEY)
    const override = String(process.env.REGRESSION_PRODUCT || '')
        .trim()
        .toLowerCase();
    if (override === 'handloom' || override.startsWith('handloom')) {
        return buildContext('handloom', 'env_override');
    }
    if (override === 'jsk' || override.startsWith('jsk')) {
        return buildContext('jsk', 'env_override');
    }

    // 2) Repository-folder detection
    const normalized = String(repoRootPath || '').replace(/\\/g, '/');
    const base = normalized.split('/').filter(Boolean).pop() || '';

    if (base === 'JSK-E-SARTHI-MASTER-jsk-deploy' || /JSK-E-SARTHI-MASTER-jsk-deploy$/i.test(normalized)) {
        return buildContext('jsk', 'repo_folder');
    }
    if (base === 'JSK-E-SARTHI-MASTER' || /\/JSK-E-SARTHI-MASTER$/i.test(normalized)) {
        return buildContext('handloom', 'repo_folder');
    }

    // 3) Local identity from this worktree's backend/.env (not process.env)
    const localEnv = {};
    loadEnvFile(path.join(repoRootPath, 'backend', '.env'), localEnv);
    loadEnvFile(path.join(repoRootPath, 'backend', '.env.local'), localEnv);
    const identity = String(localEnv.APPLICATION_KEY || localEnv.APPLICATION_IDENTITY || '')
        .trim()
        .toLowerCase();
    if (identity === 'handloom-local' || identity === 'handloom') {
        return buildContext('handloom', 'local_identity');
    }
    if (identity === 'jsk-local' || identity === 'jsk') {
        return buildContext('jsk', 'local_identity');
    }

    // 4) Unknown — never guess a database
    return {
        productKey: 'unknown',
        productName: 'Unknown',
        expectedIdentity: null,
        expectedDatabase: null,
        expectedFrontendPort: null,
        expectedBackendPort: null,
        detectionSource: 'unknown',
        warning: 'UNKNOWN_PRODUCT — product-specific checks skipped; not SAFE FOR DEPLOYMENT',
    };
}

function buildContext(key, detectionSource) {
    const p = PRODUCTS[key];
    return {
        productKey: key,
        productName: p.label,
        expectedIdentity: p.applicationKey,
        expectedDatabase: p.databaseName,
        expectedFrontendPort: p.frontendPort,
        expectedBackendPort: p.backendPort,
        detectionSource,
        warning: null,
    };
}

/** True when a check with applicableProducts may run for this product. */
export function isCheckApplicable(applicableProducts, productKey) {
    const list = Array.isArray(applicableProducts) ? applicableProducts : ['handloom', 'jsk'];
    if (productKey === 'unknown') return false;
    return list.includes(productKey);
}

export function skipReasonForCheck(check, productKey) {
    const products = (check.products || check.applicableProducts || []).join(', ') || '(none)';
    if (productKey === 'unknown') {
        return `SKIPPED — ${check.id || check.name || 'check'} requires known product; UNKNOWN_PRODUCT`;
    }
    return `SKIPPED — ${check.id || check.name || 'check'} is ${products}-only; active product is ${productKey}`;
}

/**
 * Product-specific DB validation. Returns null when check must not run (unknown / empty).
 * @returns {{ ok: boolean, code: 'WRONG_DATABASE'|null, detail: string, expected?: string, detected?: string }|null}
 */
export function evaluateProductDatabase(productKey, detectedDbName) {
    if (productKey === 'unknown' || !PRODUCTS[productKey]) {
        return null;
    }
    const expected = PRODUCTS[productKey].databaseName;
    const detected = String(detectedDbName || '').trim();
    if (!detected) {
        return null;
    }
    const ok = detected === expected || detected.includes(expected);
    return {
        ok,
        code: ok ? null : 'WRONG_DATABASE',
        detail: ok
            ? `expected ${expected}, got ${detected}`
            : `WRONG_DATABASE — expected ${expected} for ${productKey}, got ${detected}`,
        expected,
        detected,
    };
}
