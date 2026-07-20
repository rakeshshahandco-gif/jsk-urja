import { PRODUCTS, RISK } from '../config.js';
import { createHarness } from '../lib/harness.js';
import { api, login } from '../lib/http.js';
import { credentialFor } from '../lib/env.js';

export async function runAuthenticationSuite({ live, sessions }) {
    const h = createHarness({ category: 'authentication', live });
    if (!live) {
        h.skip('authentication live tests', 'offline mode — set credentials and --live');
        return h.results;
    }

    for (const product of Object.values(PRODUCTS)) {
        const creds = credentialFor(product);
        if (!creds.password) {
            h.skip(`${product.label} login`, `set ${product.defaultPassEnv} or REGRESSION_PASS`);
            continue;
        }
        const res = await login(product.backendBase, creds.username, creds.password);
        if (!res.token) {
            h.fail(`${product.label} login`, `status=${res.status}`, {
                risk: RISK.BLOCK_DEPLOYMENT,
                code: 'AUTH_FAILURE',
            });
            continue;
        }
        h.pass(`${product.label} login`, `status=${res.status}`);
        sessions[product.key] = {
            token: res.token,
            user: res.user,
            companyContext: res.companyContext,
            companyId: product.companyId,
            base: product.backendBase,
        };

        const ctx = res.companyContext || {};
        const activeId = String(ctx.activeCompany?._id || ctx.activeCompanyId || '');
        if (activeId) {
            h.expect(
                activeId === product.companyId,
                `${product.label} auto-open company`,
                activeId,
                {
                    detail: `expected ${product.companyId}, got ${activeId}`,
                    risk: RISK.HIGH,
                    code: 'COMPANY_LEAK',
                },
            );
        } else {
            h.skip(`${product.label} auto-open company`, 'companyContext.activeCompany missing in login payload');
        }

        const canSwitch = res.user?.canSwitchCompany;
        if (canSwitch === false) {
            h.pass(`${product.label} company switch disabled for local admin`, 'canSwitchCompany=false');
        } else {
            h.pass(`${product.label} canSwitchCompany observed`, String(canSwitch));
        }
    }

    // Wrong token → 401
    const handloom = PRODUCTS.handloom;
    const bad = await api(handloom.backendBase, 'GET', '/api/v1/auth/me', {
        token: 'invalid.token.value',
        companyId: handloom.companyId,
    });
    h.expect(
        bad.status === 401,
        'Wrong token → 401',
        `status=${bad.status}`,
        { detail: `expected 401, got ${bad.status}`, risk: RISK.BLOCK_DEPLOYMENT, code: 'SECURITY_BYPASS' },
    );

    // Wrong company header → 403 (when session exists)
    if (sessions.handloom?.token) {
        const wrong = await api(handloom.backendBase, 'GET', '/api/v1/dev/active-context', {
            token: sessions.handloom.token,
            companyId: PRODUCTS.jsk.companyId,
        });
        h.expect(
            wrong.status === 403,
            'Wrong X-Company-Id → 403',
            `status=${wrong.status}`,
            { detail: `expected 403, got ${wrong.status}`, risk: RISK.BLOCK_DEPLOYMENT, code: 'CROSS_COMPANY_ACCESS' },
        );
    }

    return h.results;
}
