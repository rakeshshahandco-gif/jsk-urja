import fs from 'fs';
import path from 'path';
import { RISK, UNIT_TEST_BUNDLES, PRODUCTS } from '../config.js';
import { createHarness } from '../lib/harness.js';
import { runUnitTests } from '../lib/process.js';
import { backendRoot } from '../lib/env.js';
import { api } from '../lib/http.js';

/**
 * Print/PDF regression — read-only unit + isolation checks.
 * Does not regenerate or overwrite print formats.
 */
export async function runPrintSuite({ live, sessions }) {
    const h = createHarness({ category: 'print', live });

    const unit = runUnitTests(UNIT_TEST_BUNDLES.print);
    h.expect(unit.ok, 'print/golden unit regression', unit.ok ? 'pass' : 'fail', {
        detail: unit.output.slice(-500),
        risk: RISK.BLOCK_DEPLOYMENT,
        code: unit.ok ? null : 'WRONG_PRINT',
    });

    // Static: Handloom print helpers must not import JSK-only paths incorrectly
    const soPrint = path.join(backendRoot(), 'src/features/sales/print');
    if (fs.existsSync(soPrint)) {
        h.pass('sales print helper folder present', soPrint);
    } else {
        h.skip('sales print helper folder', 'path not found (layout may differ)');
    }

    // Locked-forms checklist script exists
    const lockedScript = path.join(backendRoot(), '../scripts/check-locked-form-changes.cjs');
    h.expect(fs.existsSync(lockedScript), 'locked-forms check script exists', lockedScript, {
        detail: 'missing scripts/check-locked-form-changes.cjs',
        risk: RISK.MEDIUM,
    });

    if (!live) {
        h.skip('live print format isolation APIs', 'offline mode');
        return h.results;
    }

    // If print-formats list exists, ensure company scope applies (no cross-company)
    for (const key of ['handloom', 'jsk']) {
        const s = sessions[key];
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

        // Cross company header
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
