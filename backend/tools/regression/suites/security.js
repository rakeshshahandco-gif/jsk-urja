import { PRODUCTS, RISK } from '../config.js';
import { createHarness } from '../lib/harness.js';
import { api } from '../lib/http.js';

export async function runSecuritySuite({ live, sessions }) {
    const h = createHarness({ category: 'security', live });

    if (!live) {
        h.skip('security live tests', 'offline mode');
        return h.results;
    }

    const base = PRODUCTS.handloom.backendBase;

    // No token
    const noToken = await api(base, 'GET', '/api/v1/auth/me');
    h.expect(
        noToken.status === 401,
        'No token → 401',
        `status=${noToken.status}`,
        { detail: `expected 401, got ${noToken.status}`, risk: RISK.BLOCK_DEPLOYMENT, code: 'SECURITY_BYPASS' },
    );

    // Bad token
    const bad = await api(base, 'GET', '/api/v1/tasks?limit=1', {
        token: 'Bearer-not-real',
        companyId: PRODUCTS.handloom.companyId,
    });
    h.expect(
        bad.status === 401,
        'Bad token → 401',
        `status=${bad.status}`,
        { detail: `expected 401, got ${bad.status}`, risk: RISK.BLOCK_DEPLOYMENT, code: 'SECURITY_BYPASS' },
    );

    if (sessions.handloom?.token) {
        const missingCompany = await api(base, 'GET', '/api/v1/tasks?limit=1', {
            token: sessions.handloom.token,
        });
        // Some routes may 400 for missing company
        h.expect(
            [400, 403].includes(missingCompany.status) || missingCompany.status < 400,
            'Missing X-Company-Id handled',
            `status=${missingCompany.status}`,
            { detail: `unexpected ${missingCompany.status}`, risk: RISK.MEDIUM },
        );

        const wrongCo = await api(base, 'GET', '/api/v1/tasks?limit=1', {
            token: sessions.handloom.token,
            companyId: PRODUCTS.jsk.companyId,
        });
        h.expect(
            wrongCo.status === 403,
            'Wrong company header → 403',
            `status=${wrongCo.status}`,
            { detail: `expected 403, got ${wrongCo.status}`, risk: RISK.BLOCK_DEPLOYMENT, code: 'CROSS_COMPANY_ACCESS' },
        );

        // Platform allocation without platform role
        const alloc = await api(base, 'PUT', `/api/v1/module-allocation/company/${PRODUCTS.handloom.companyId}`, {
            token: sessions.handloom.token,
            companyId: PRODUCTS.handloom.companyId,
            body: { enabledModules: ['tasks'] },
        });
        h.expect(
            alloc.status === 403,
            'Non-platform cannot update allocation → 403',
            `status=${alloc.status}`,
            { detail: `expected 403, got ${alloc.status}`, risk: RISK.BLOCK_DEPLOYMENT, code: 'SECURITY_BYPASS' },
        );
    } else {
        h.skip('authenticated security probes', 'Handloom session missing');
    }

    // Health remains public
    const health = await api(base, 'GET', '/api/v1/health');
    h.expect(health.status === 200, 'Health endpoint public 200', `status=${health.status}`, {
        detail: `status=${health.status}`,
        risk: RISK.MEDIUM,
    });

    return h.results;
}
