import { PRODUCTS, RISK } from '../config.js';
import { createHarness } from '../lib/harness.js';
import { api } from '../lib/http.js';
import { runApplicableUnitBundle } from '../lib/process.js';
import { detectActiveProduct } from '../lib/productContext.js';
import { recordUnitBundle } from '../lib/unitBundle.js';

export async function runCompanyIsolationSuite({ live, sessions, productContext } = {}) {
    const h = createHarness({ category: 'company-isolation', live });
    const ctx = productContext || detectActiveProduct();

    const unit = runApplicableUnitBundle('company', ctx.productKey);
    recordUnitBundle(h, {
        label: 'company unit tests',
        bundleResult: unit,
        failCode: 'COMPANY_LEAK',
        failRisk: RISK.HIGH,
    });

    if (!live) {
        h.skip('live company isolation APIs', 'offline mode');
        return h.results;
    }

    const hS = sessions.handloom;
    const jS = sessions.jsk;
    if (!hS?.token || !jS?.token) {
        h.skip('cross-product isolation', 'need both Handloom and JSK sessions');
        return h.results;
    }

    // Handloom token must not use JSK company on Handloom backend
    const leak1 = await api(hS.base, 'GET', '/api/v1/module-allocation/my-company/' + PRODUCTS.jsk.companyId + '/effective', {
        token: hS.token,
        companyId: PRODUCTS.jsk.companyId,
    });
    h.expect(
        leak1.status === 403 || leak1.status === 404,
        'Handloom user cannot read JSK module allocation',
        `status=${leak1.status}`,
        { detail: `expected 403/404, got ${leak1.status}`, risk: RISK.BLOCK_DEPLOYMENT, code: 'CROSS_COMPANY_ACCESS' },
    );

    const leak2 = await api(jS.base, 'GET', '/api/v1/module-allocation/my-company/' + PRODUCTS.handloom.companyId + '/effective', {
        token: jS.token,
        companyId: PRODUCTS.handloom.companyId,
    });
    h.expect(
        leak2.status === 403 || leak2.status === 404,
        'JSK user cannot read Handloom module allocation',
        `status=${leak2.status}`,
        { detail: `expected 403/404, got ${leak2.status}`, risk: RISK.BLOCK_DEPLOYMENT, code: 'CROSS_COMPANY_ACCESS' },
    );

    // Own company effective modules OK
    const ownH = await api(hS.base, 'GET', `/api/v1/module-allocation/my-company/${PRODUCTS.handloom.companyId}/effective`, {
        token: hS.token,
        companyId: PRODUCTS.handloom.companyId,
    });
    h.expect(ownH.status < 400, 'Handloom own module allocation readable', `status=${ownH.status}`, {
        detail: `status=${ownH.status}`,
        risk: RISK.HIGH,
        code: 'COMPANY_LEAK',
    });

    const ownJ = await api(jS.base, 'GET', `/api/v1/module-allocation/my-company/${PRODUCTS.jsk.companyId}/effective`, {
        token: jS.token,
        companyId: PRODUCTS.jsk.companyId,
    });
    h.expect(ownJ.status < 400, 'JSK own module allocation readable', `status=${ownJ.status}`, {
        detail: `status=${ownJ.status}`,
        risk: RISK.HIGH,
        code: 'COMPANY_LEAK',
    });

    // Sales list with foreign company header
    const salesLeak = await api(hS.base, 'GET', '/api/v1/sales-orders?limit=1', {
        token: hS.token,
        companyId: PRODUCTS.jsk.companyId,
    });
    h.expect(
        salesLeak.status === 403,
        'Handloom sales with JSK company header blocked',
        `status=${salesLeak.status}`,
        { detail: `expected 403, got ${salesLeak.status}`, risk: RISK.BLOCK_DEPLOYMENT, code: 'CROSS_COMPANY_ACCESS' },
    );

    return h.results;
}
