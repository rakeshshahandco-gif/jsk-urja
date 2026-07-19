import { PRODUCTS, RISK } from '../config.js';
import { createHarness } from '../lib/harness.js';
import { snapshotCounts, compareSnapshots } from '../lib/dbSafety.js';
import { loadProductMongoUrl } from '../lib/env.js';

/**
 * Database safety — read-only snapshots. No deletes/migrations.
 */
export async function runDatabaseSafetySuite({ live, context }) {
    const h = createHarness({ category: 'database-safety', live });

    if (context?.ci || process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true') {
        h.skip('DB snapshots', 'SKIPPED — dedicated CI database not configured');
        h.pass('database safety policy', 'framework never runs destructive migrations or bulk deletes');
        return h.results;
    }
    for (const key of ['handloom', 'jsk']) {
        const product = PRODUCTS[key];
        const url = loadProductMongoUrl(key);
        if (!url) {
            h.skip(`${product.label} DB snapshot`, 'mongo url unavailable');
            continue;
        }
        try {
            const snap = await snapshotCounts(url);
            context.dbSnapshots = context.dbSnapshots || {};
            if (!context.dbSnapshots[key]?.before) {
                context.dbSnapshots[key] = { before: snap };
                h.pass(`${product.label} baseline snapshot`, `${snap.database} companies=${snap.counts.companies}`);
            } else {
                context.dbSnapshots[key].after = snap;
                const cmp = compareSnapshots(context.dbSnapshots[key].before, snap);
                if (cmp.deletes?.length) {
                    h.fail(
                        `${product.label} unexpected collection shrink`,
                        cmp.deletes.map((d) => `${d.collection}:${d.before}→${d.after}`).join(', '),
                        { risk: RISK.BLOCK_DEPLOYMENT, code: 'DB_CORRUPTION' },
                    );
                } else {
                    h.pass(`${product.label} no destructive count drop`, cmp.deltas.length ? JSON.stringify(cmp.deltas) : 'stable');
                }
                if (cmp.duplicateCompanyNames?.length) {
                    h.fail(
                        `${product.label} duplicate company names`,
                        JSON.stringify(cmp.duplicateCompanyNames),
                        { risk: RISK.HIGH, code: 'DB_CORRUPTION' },
                    );
                } else {
                    h.pass(`${product.label} no duplicate company names`, 'ok');
                }
            }

            // Known company present
            const hasCompany = (snap.companyIds || []).includes(product.companyId);
            h.expect(hasCompany, `${product.label} expected company id present`, product.companyId, {
                detail: `company ${product.companyId} missing in ${snap.database}`,
                risk: RISK.HIGH,
                code: 'DB_CORRUPTION',
            });
        } catch (err) {
            h.fail(`${product.label} DB snapshot`, err.message, { risk: RISK.HIGH, code: 'DB_CORRUPTION' });
        }
    }

    h.pass('database safety policy', 'framework never runs destructive migrations or bulk deletes');
    return h.results;
}
