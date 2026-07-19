import fs from 'fs';
import path from 'path';
import { RISK, PRODUCTS } from '../config.js';
import { createHarness } from '../lib/harness.js';
import { runApplicableUnitBundle } from '../lib/process.js';
import { backendRoot } from '../lib/env.js';
import { api } from '../lib/http.js';
import { detectActiveProduct } from '../lib/productContext.js';
import { recordUnitBundle } from '../lib/unitBundle.js';

/**
 * Print/PDF regression — read-only unit + isolation checks.
 */
export async function runPrintSuite({ live, sessions, productContext } = {}) {
    const h = createHarness({ category: 'print', live });
    const ctx = productContext || detectActiveProduct();

    const unit = runApplicableUnitBundle('print', ctx.productKey);
    recordUnitBundle(h, {
        label: 'print/golden unit regression',
        bundleResult: unit,
        failCode: 'WRONG_PRINT',
        failRisk: RISK.BLOCK_DEPLOYMENT,
    });

    const soPrint = path.join(backendRoot(), 'src/features/sales/print');
    if (fs.existsSync(soPrint)) {
        h.pass('sales print helper folder present', soPrint);
    } else {
        h.skip('sales print helper folder', 'path not found (layout may differ)');
    }

    const lockedScript = path.join(backendRoot(), '../scripts/check-locked-form-changes.cjs');
    if (ctx.productKey === 'handloom') {
        h.expect(fs.existsSync(lockedScript), 'locked-forms check script exists', lockedScript, {
            detail: 'missing scripts/check-locked-form-changes.cjs',
            risk: RISK.MEDIUM,
        });
    } else {
        h.skip(
            'locked-forms check script exists',
            `SKIPPED — locked-forms script is handloom-only; active product is ${ctx.productKey}`,
        );
    }

    if (!live) {
        h.skip('live print format isolation APIs', 'offline mode');
        return h.results;
    }

    const keys = ctx.productKey === 'unknown' ? ['handloom', 'jsk'] : [ctx.productKey];
    for (const key of keys) {
        const s = sessions?.[key];
        const p = PRODUCTS[key];
        if (!s?.token) {
            h.skip(`${p.label} print formats`, 'no session');
            continue;
        }
        const r = await api(s.base, 'GET', '/api/v1/print-formats?limit=5', {
            token: s.token,
            companyId: p.companyId,
        });
        if (r.status === 404) {
            h.skip(`${p.label} print-formats route`, 'not mounted');
            continue;
        }
        const msg = String(r.data?.message || '');
        if (/module locked|module disabled/i.test(msg)) {
            h.fail(`${p.label} print formats module-blocked`, msg, { risk: RISK.HIGH, code: 'WRONG_PRINT' });
        } else {
            h.pass(`${p.label} print formats request scoped`, `status=${r.status}`);
        }

        const other = key === 'handloom' ? PRODUCTS.jsk.companyId : PRODUCTS.handloom.companyId;
        const leak = await api(s.base, 'GET', '/api/v1/print-formats?limit=1', {
            token: s.token,
            companyId: other,
        });
        h.expect(
            leak.status === 403 || leak.status === 404,
            `${p.label} print formats reject foreign company`,
            `status=${leak.status}`,
            { detail: `expected 403/404, got ${leak.status}`, risk: RISK.BLOCK_DEPLOYMENT, code: 'WRONG_PRINT' },
        );
    }

    return h.results;
}
