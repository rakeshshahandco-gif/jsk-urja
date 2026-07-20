import { PRODUCTS, RISK } from '../config.js';
import { createHarness } from '../lib/harness.js';
import { api } from '../lib/http.js';
import { runApplicableUnitBundle } from '../lib/process.js';
import { detectActiveProduct } from '../lib/productContext.js';
import { recordUnitBundle } from '../lib/unitBundle.js';

/**
 * Sales regression — READ ONLY.
 */
export async function runSalesSuite({ live, sessions, productContext } = {}) {
    const h = createHarness({ category: 'sales', live });
    const ctx = productContext || detectActiveProduct();

    const unit = runApplicableUnitBundle('salesGst', ctx.productKey);
    recordUnitBundle(h, {
        label: 'GST/stock/accounting unit regression bundles',
        bundleResult: unit,
        failCode: 'SALES_REGRESSION',
        failRisk: RISK.BLOCK_DEPLOYMENT,
    });

    h.pass('sales regression policy', 'no mutation of SO/SI/GST/totals/series/stock/PDF in this suite');

    if (!live) {
        h.skip('sales live list APIs', 'offline mode');
        return h.results;
    }

    const endpoints = [
        { name: 'Sales Orders list', path: '/api/v1/sales-orders?limit=1' },
        { name: 'Sales Invoices list', path: '/api/v1/sales-invoices?limit=1' },
    ];

    const optional = [
        { name: 'Estimates list', path: '/api/v1/estimates?limit=1' },
        { name: 'Quotations list', path: '/api/v1/quotations?limit=1' },
        { name: 'Delivery Challans list', path: '/api/v1/delivery-challans?limit=1' },
        { name: 'Purchase Orders list', path: '/api/v1/purchase-orders?limit=1' },
    ];

    const productKeys = ctx.productKey === 'unknown' ? ['handloom', 'jsk'] : [ctx.productKey];

    for (const productKey of productKeys) {
        const session = sessions?.[productKey];
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
