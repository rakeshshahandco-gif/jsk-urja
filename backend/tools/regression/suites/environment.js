import { PRODUCTS, RISK } from '../config.js';
import { createHarness } from '../lib/harness.js';
import { health } from '../lib/http.js';
import { extractDbName, loadProductMongoUrl } from '../lib/env.js';

export async function runEnvironmentSuite({ live }) {
    const h = createHarness({ category: 'environment', live });

    for (const product of Object.values(PRODUCTS)) {
        const mongoUrl = loadProductMongoUrl(product.key);
        const dbFromEnv = extractDbName(mongoUrl);
        h.expect(
            !dbFromEnv || dbFromEnv === product.databaseName || dbFromEnv.includes(product.databaseName),
            `${product.label} env DB name`,
            dbFromEnv || '(unset)',
            {
                detail: `expected ${product.databaseName}, got ${dbFromEnv}`,
                risk: RISK.BLOCK_DEPLOYMENT,
                code: 'WRONG_DATABASE',
            },
        );

        if (!live) {
            h.skip(`${product.label} live health`, 'offline mode');
            continue;
        }

        const r = await health(product.backendBase);
        if (!r.ok) {
            h.fail(`${product.label} backend reachable`, r.error || `status=${r.status}`, {
                risk: RISK.HIGH,
                code: 'AUTH_FAILURE',
            });
            continue;
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
    }

    return h.results;
}
