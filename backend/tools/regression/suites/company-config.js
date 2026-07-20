import { PRODUCTS, RISK } from '../config.js';
import { createHarness } from '../lib/harness.js';
import { api } from '../lib/http.js';

export async function runCompanyConfigSuite({ live, sessions }) {
    const h = createHarness({ category: 'company-config', live });

    if (!live) {
        h.skip('company configuration live tests', 'offline mode');
        return h.results;
    }

    for (const key of ['handloom', 'jsk']) {
        const s = sessions[key];
        const p = PRODUCTS[key];
        if (!s?.token) {
            h.skip(`${p.label} config APIs`, 'no session');
            continue;
        }

        const effective = await api(s.base, 'GET', `/api/v1/module-allocation/my-company/${p.companyId}/effective`, {
            token: s.token,
            companyId: p.companyId,
        });
        h.expect(effective.status < 400, `${p.label} module allocation effective`, `status=${effective.status}`, {
            detail: `status=${effective.status}`,
            risk: RISK.HIGH,
            code: 'COMPANY_LEAK',
        });

        const ctx = await api(s.base, 'GET', '/api/v1/dev/active-context', {
            token: s.token,
            companyId: p.companyId,
        });
        if (ctx.status === 404) {
            h.skip(`${p.label} active-context`, 'not development or route missing');
        } else if (ctx.status < 400) {
            const d = ctx.data?.data || {};
            h.pass(`${p.label} active-context`, `db=${d.databaseName || '?'} key=${d.applicationKey || '?'}`);
            if (d.databaseName && d.databaseName !== p.databaseName) {
                h.fail(`${p.label} active-context database mismatch`, `${d.databaseName} != ${p.databaseName}`, {
                    risk: RISK.BLOCK_DEPLOYMENT,
                    code: 'WRONG_DATABASE',
                });
            }
        } else {
            h.fail(`${p.label} active-context`, `status=${ctx.status}`, { risk: RISK.MEDIUM });
        }

        // Client admin must not update allocation
        const put = await api(s.base, 'PUT', `/api/v1/module-allocation/company/${p.companyId}`, {
            token: s.token,
            companyId: p.companyId,
            body: { moduleStates: [{ moduleKey: 'tasks', state: 'ON' }] },
        });
        h.expect(
            put.status === 403 || put.status === 401,
            `${p.label} client cannot change module allocation`,
            `status=${put.status}`,
            { detail: `expected 403, got ${put.status}`, risk: RISK.BLOCK_DEPLOYMENT, code: 'SECURITY_BYPASS' },
        );
    }

    return h.results;
}
