import { PRODUCTS, RISK } from '../config.js';
import { createHarness } from '../lib/harness.js';
import { health } from '../lib/http.js';
import { extractDbName, loadLocalBackendMongoUrl, loadProductMongoUrl } from '../lib/env.js';
import { detectActiveProduct, evaluateProductDatabase } from '../lib/productContext.js';

export async function runEnvironmentSuite({ live, productContext } = {}) {
    const h = createHarness({ category: 'environment', live });
    const ctx = productContext || detectActiveProduct();

    h.pass(
        'active product detected',
        `${ctx.productKey} via ${ctx.detectionSource}${ctx.warning ? ` (${ctx.warning})` : ''}`,
    );

    if (ctx.productKey === 'unknown') {
        h.skip(
            'product-specific database expectation',
            'SKIPPED — UNKNOWN_PRODUCT; no guessed database',
        );
        if (!live) {
            h.skip('live health probes', 'offline mode');
        }
        return h.results;
    }

    const product = PRODUCTS[ctx.productKey];
    const mongoUrl = loadLocalBackendMongoUrl() || loadProductMongoUrl(ctx.productKey);
    const dbFromEnv = extractDbName(mongoUrl);
    const dbEval = evaluateProductDatabase(ctx.productKey, dbFromEnv);

    if (!dbEval) {
        h.skip(
            `${product.label} env DB name`,
            'SKIPPED — local Mongo URL unset (offline static); not treated as WRONG_DATABASE',
        );
    } else {
        h.expect(dbEval.ok, `${product.label} env DB name`, dbEval.detected, {
            detail: dbEval.detail,
            risk: RISK.BLOCK_DEPLOYMENT,
            code: 'WRONG_DATABASE',
        });
    }

    // Do not validate sibling product's .env from this worktree
    const otherKey = ctx.productKey === 'handloom' ? 'jsk' : 'handloom';
    h.skip(
        `${PRODUCTS[otherKey].label} env DB name`,
        `SKIPPED — ${PRODUCTS[otherKey].key}-only check; active product is ${ctx.productKey}`,
    );

    if (!live) {
        h.skip(`${product.label} live health`, 'offline mode');
        return h.results;
    }

    const r = await health(product.backendBase);
    if (!r.ok) {
        h.fail(`${product.label} backend reachable`, r.error || `status=${r.status}`, {
            risk: RISK.HIGH,
            code: 'AUTH_FAILURE',
        });
        return h.results;
    }
    const d = r.data || {};
    h.expect(
        d.applicationKey === product.applicationKey,
        `${product.label} applicationKey`,
        d.applicationKey,
        {
            detail: `expected ${product.applicationKey}, got ${d.applicationKey}`,
            risk: RISK.BLOCK_DEPLOYMENT,
            code: 'WRONG_IDENTITY',
        },
    );
    h.expect(
        Number(d.port) === product.backendPort,
        `${product.label} backend port`,
        String(d.port),
        {
            detail: `expected ${product.backendPort}, got ${d.port}`,
            risk: RISK.BLOCK_DEPLOYMENT,
            code: 'WRONG_IDENTITY',
        },
    );
    h.expect(
        d.databaseName === product.databaseName,
        `${product.label} live databaseName`,
        d.databaseName,
        {
            detail: `expected ${product.databaseName}, got ${d.databaseName}`,
            risk: RISK.BLOCK_DEPLOYMENT,
            code: 'WRONG_DATABASE',
        },
    );
    h.pass(
        `${product.label} localhost mapping`,
        `FE :${product.frontendPort} → BE :${product.backendPort} / ${product.databaseName}`,
    );

    return h.results;
}
