import { PRODUCTS, RISK, UNIT_TEST_BUNDLES } from '../config.js';
import { createHarness } from '../lib/harness.js';
import { api } from '../lib/http.js';
import { runUnitTests } from '../lib/process.js';

/**
 * Sales regression — READ ONLY.
 * Does not create/edit/delete sales documents.
 * Verifies unit GST/stock/accounting regression bundles + list API reachability.
 */
export async function runSalesSuite({ live, sessions }) {
    const h = createHarness({ category: 'sales', live });

    const unit = runUnitTests(UNIT_TEST_BUNDLES.salesGst);
    h.expect(unit.ok, 'GST/stock/accounting unit regression bundles', unit.ok ? 'pass' : 'fail', {
        detail: unit.output.slice(-500),
        risk: RISK.BLOCK_DEPLOYMENT,
        code: unit.ok ? null : 'SALES_REGRESSION',
    });

    // Static invariant: sales module decision ON allows GET
    h.pass('sales regression policy', 'no mutation of SO/SI/GST/totals/series/stock/PDF in this suite');

    if (!live) {
        h.skip('sales live list APIs', 'offline mode');
        return h.results;
    }

    const endpoints = [
        { name: 'Sales Orders list', path: '/api/v1/sales-orders?limit=1' },
        { name: 'Sales Invoices list', path: '/api/v1/sales-invoices?limit=1' },
    ];

    // Optional docs if routes exist — treat 404 as skip, permission 403 as pass (not module regression)
    const optional = [
        { name: 'Estimates list', path: '/api/v1/estimates?limit=1' },
        { name: 'Quotations list', path: '/api/v1/quotations?limit=1' },
        { name: 'Delivery Challans list', path: '/api/v1/delivery-challans?limit=1' },
        { name: 'Purchase Orders list', path: '/api/v1/purchase-orders?limit=1' },
    ];

    for (const productKey of ['handloom', 'jsk']) {
        const session = sessions[productKey];
        const product = PRODUCTS[productKey];
        if (!session?.token) {
            h.skip(`${product.label} sales APIs`, 'no session');
            continue;
        }
        for (const ep of endpoints) {
            const r = await api(session.base, 'GET', ep.path, {
                token: session.token,
                companyId: product.companyId,
            });
            const msg = String(r.data?.message || '');
            const moduleBlocked = /module locked|module disabled|MODULE_/i.test(msg);
            if (moduleBlocked) {
                h.fail(`${product.label} ${ep.name} module-blocked unexpectedly`, msg, {
                    risk: RISK.BLOCK_DEPLOYMENT,
                    code: 'SALES_REGRESSION',
                });
            } else if (r.status < 400 || r.status === 403) {
                // 403 permission is acceptable; proves route exists and company scope ran
                h.pass(`${product.label} ${ep.name}`, `status=${r.status}${r.status === 403 ? ' (permission)' : ''}`);
            } else {
                h.fail(`${product.label} ${ep.name}`, `status=${r.status} ${msg}`, {
                    risk: RISK.HIGH,
                    code: 'SALES_REGRESSION',
                });
            }
        }
        for (const ep of optional) {
            const r = await api(session.base, 'GET', ep.path, {
                token: session.token,
                companyId: product.companyId,
            });
            if (r.status === 404) h.skip(`${product.label} ${ep.name}`, 'route not present');
            else if (r.status < 400 || r.status === 403) h.pass(`${product.label} ${ep.name}`, `status=${r.status}`);
            else h.fail(`${product.label} ${ep.name}`, `status=${r.status}`, { risk: RISK.MEDIUM });
        }
    }

    return h.results;
}
