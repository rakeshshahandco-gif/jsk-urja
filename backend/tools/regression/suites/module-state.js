import mongoose from 'mongoose';
import { PRODUCTS, PILOT_MODULES, RISK } from '../config.js';
import { createHarness } from '../lib/harness.js';
import { api } from '../lib/http.js';
import { loadProductMongoUrl } from '../lib/env.js';
import { runApplicableUnitBundle } from '../lib/process.js';
import { detectActiveProduct } from '../lib/productContext.js';
import { recordUnitBundle } from '../lib/unitBundle.js';
import {
    evaluateModuleAccess,
    resolveModuleState,
} from '../../../src/constants/moduleAccessDecision.constants.js';

const PATH_BY_MODULE = {
    tasks: '/api/v1/tasks?limit=1',
    crm: '/api/v1/leads?limit=1',
    sales: '/api/v1/sales-orders?limit=1',
};
const CREATE_BY_MODULE = {
    tasks: { path: '/api/v1/tasks', body: { title: 'regression-block', description: 'x' } },
    crm: { path: '/api/v1/leads', body: { name: 'regression-block', phone: '9999999999' } },
};

async function setStates(mongoUrl, companyId, states) {
    const conn = await mongoose.createConnection(mongoUrl).asPromise();
    try {
        const col = conn.db.collection('companies');
        const prev = await col.findOne(
            { _id: new mongoose.Types.ObjectId(companyId) },
            { projection: { moduleStates: 1, enabledModules: 1, disabledModules: 1 } },
        );
        const now = new Date();
        const nextStates = states.map((s) => ({
            moduleKey: s.moduleKey,
            state: s.state,
            lockMode: s.lockMode || undefined,
            lockReason: s.lockReason || 'regression-suite',
            remarks: 'phase2.5-regression',
            changedBy: null,
            changedAt: now,
        }));
        let enabled = [...(prev?.enabledModules || [])].map(String);
        let disabled = [...(prev?.disabledModules || [])].map(String);
        for (const s of nextStates) {
            if (s.state === 'OFF') {
                enabled = enabled.filter((m) => m !== s.moduleKey);
                if (!disabled.includes(s.moduleKey)) disabled.push(s.moduleKey);
            } else {
                if (!enabled.includes(s.moduleKey)) enabled.push(s.moduleKey);
                disabled = disabled.filter((m) => m !== s.moduleKey);
            }
        }
        await col.updateOne(
            { _id: new mongoose.Types.ObjectId(companyId) },
            { $set: { moduleStates: nextStates, enabledModules: enabled, disabledModules: disabled } },
        );
        return prev;
    } finally {
        await conn.close();
    }
}

async function restore(mongoUrl, companyId, prev) {
    const conn = await mongoose.createConnection(mongoUrl).asPromise();
    try {
        const now = new Date();
        const moduleStates = PILOT_MODULES.map((moduleKey) => ({
            moduleKey,
            state: 'ON',
            lockReason: '',
            remarks: 'phase2.5-regression-restored',
            changedBy: null,
            changedAt: now,
        }));
        const enabled = new Set([...(prev?.enabledModules || []).map(String), ...PILOT_MODULES]);
        const disabled = (prev?.disabledModules || []).filter((m) => !PILOT_MODULES.includes(String(m)));
        await conn.db.collection('companies').updateOne(
            { _id: new mongoose.Types.ObjectId(companyId) },
            {
                $set: {
                    moduleStates,
                    enabledModules: [...enabled],
                    disabledModules: disabled,
                },
            },
        );
    } finally {
        await conn.close();
    }
}

export async function runModuleStateSuite({ live, sessions, mutate = false, productContext } = {}) {
    const h = createHarness({ category: 'module-state', live });
    const ctx = productContext || detectActiveProduct();

    const unit = runApplicableUnitBundle('module', ctx.productKey);
    recordUnitBundle(h, {
        label: 'module decision unit tests',
        bundleResult: unit,
        failCode: 'MODULE_BYPASS',
        failRisk: RISK.BLOCK_DEPLOYMENT,
    });

    const matrix = [
        { state: 'ON', method: 'POST', expectAllow: true },
        { state: 'OFF', method: 'GET', expectAllow: false },
        { state: 'LOCKED', lockMode: 'READ_ONLY', method: 'GET', expectAllow: true },
        { state: 'LOCKED', lockMode: 'READ_ONLY', method: 'POST', expectAllow: false },
        { state: 'LOCKED', lockMode: 'NEW_ENTRY_BLOCKED', method: 'POST', pathname: '/tasks', expectAllow: false },
        { state: 'LOCKED', lockMode: 'NEW_ENTRY_BLOCKED', method: 'POST', pathname: '/tasks/6a5b6a3cc94043acb0576009/x', expectAllow: true },
        { state: 'LOCKED', lockMode: 'FULL_LOCK', method: 'GET', expectAllow: false },
    ];
    for (const row of matrix) {
        const decision = evaluateModuleAccess({
            moduleGuardEnabled: true,
            enabledModules: ['tasks'],
            moduleStates: [{ moduleKey: 'tasks', state: row.state, lockMode: row.lockMode }],
            moduleCode: 'tasks',
            method: row.method,
            pathname: row.pathname || '/tasks',
        });
        h.expect(
            decision.allowed === row.expectAllow,
            `decision ${row.state}${row.lockMode ? '/' + row.lockMode : ''} ${row.method}`,
            `allowed=${decision.allowed}`,
            {
                detail: `expected allowed=${row.expectAllow}, got ${decision.allowed}`,
                risk: RISK.BLOCK_DEPLOYMENT,
                code: 'MODULE_BYPASS',
            },
        );
    }

    const fb = resolveModuleState({
        moduleGuardEnabled: true,
        enabledModules: ['sales'],
        moduleStates: [],
        moduleCode: 'sales',
    });
    h.expect(fb.state === 'ON' && fb.source === 'enabledModules', 'fallback enabledModules → ON', fb.source);

    if (!live || !mutate) {
        h.skip('live module state mutate tests', 'pass --live --mutate-modules for ON/LOCKED/OFF roundtrip');
        return h.results;
    }

    const session = sessions.handloom;
    if (!session?.token) {
        h.skip('live module mutate', 'Handloom session missing');
        return h.results;
    }

    const mongoUrl = loadProductMongoUrl('handloom');
    const companyId = PRODUCTS.handloom.companyId;
    let prev = null;
    try {
        prev = await setStates(mongoUrl, companyId, [
            { moduleKey: 'tasks', state: 'LOCKED', lockMode: 'READ_ONLY' },
            { moduleKey: 'crm', state: 'ON' },
            { moduleKey: 'sales', state: 'ON' },
        ]);
        await new Promise((r) => setTimeout(r, 1200));

        const getOk = await api(session.base, 'GET', PATH_BY_MODULE.tasks, {
            token: session.token,
            companyId,
        });
        h.expect(getOk.status < 400, 'LOCKED READ_ONLY tasks GET', `status=${getOk.status}`, {
            detail: `status=${getOk.status}`,
            risk: RISK.HIGH,
            code: 'MODULE_BYPASS',
        });
        const postBlocked = await api(session.base, 'POST', CREATE_BY_MODULE.tasks.path, {
            token: session.token,
            companyId,
            body: CREATE_BY_MODULE.tasks.body,
        });
        h.expect(postBlocked.status === 403, 'LOCKED READ_ONLY tasks POST blocked', `status=${postBlocked.status}`, {
            detail: `status=${postBlocked.status} msg=${postBlocked.data?.message || ''}`,
            risk: RISK.BLOCK_DEPLOYMENT,
            code: 'MODULE_BYPASS',
        });

        await setStates(mongoUrl, companyId, [
            { moduleKey: 'tasks', state: 'ON' },
            { moduleKey: 'crm', state: 'LOCKED', lockMode: 'NEW_ENTRY_BLOCKED' },
            { moduleKey: 'sales', state: 'ON' },
        ]);
        await new Promise((r) => setTimeout(r, 1200));
        const crmPost = await api(session.base, 'POST', CREATE_BY_MODULE.crm.path, {
            token: session.token,
            companyId,
            body: CREATE_BY_MODULE.crm.body,
        });
        h.expect(crmPost.status === 403, 'NEW_ENTRY_BLOCKED crm POST blocked', `status=${crmPost.status}`, {
            detail: `status=${crmPost.status}`,
            risk: RISK.BLOCK_DEPLOYMENT,
            code: 'MODULE_BYPASS',
        });

        await setStates(mongoUrl, companyId, [
            { moduleKey: 'tasks', state: 'LOCKED', lockMode: 'FULL_LOCK' },
            { moduleKey: 'crm', state: 'ON' },
            { moduleKey: 'sales', state: 'ON' },
        ]);
        await new Promise((r) => setTimeout(r, 1200));
        const full = await api(session.base, 'GET', PATH_BY_MODULE.tasks, {
            token: session.token,
            companyId,
        });
        h.expect(full.status === 403, 'FULL_LOCK tasks GET blocked', `status=${full.status}`, {
            detail: `status=${full.status}`,
            risk: RISK.BLOCK_DEPLOYMENT,
            code: 'MODULE_BYPASS',
        });

        await setStates(mongoUrl, companyId, [
            { moduleKey: 'tasks', state: 'ON' },
            { moduleKey: 'crm', state: 'OFF' },
            { moduleKey: 'sales', state: 'ON' },
        ]);
        await new Promise((r) => setTimeout(r, 1200));
        const off = await api(session.base, 'GET', PATH_BY_MODULE.crm, {
            token: session.token,
            companyId,
        });
        h.expect(off.status === 403, 'OFF crm GET blocked', `status=${off.status}`, {
            detail: `status=${off.status}`,
            risk: RISK.BLOCK_DEPLOYMENT,
            code: 'MODULE_BYPASS',
        });

        if (sessions.jsk?.token) {
            const j = await api(sessions.jsk.base, 'GET', PATH_BY_MODULE.tasks, {
                token: sessions.jsk.token,
                companyId: PRODUCTS.jsk.companyId,
            });
            h.expect(j.status < 400, 'JSK tasks unaffected during Handloom lock cycle', `status=${j.status}`, {
                detail: `status=${j.status}`,
                risk: RISK.BLOCK_DEPLOYMENT,
                code: 'COMPANY_LEAK',
            });
        }
    } finally {
        try {
            await restore(mongoUrl, companyId, prev);
            await new Promise((r) => setTimeout(r, 1200));
            h.pass('module states restored to ON', 'tasks/crm/sales');
        } catch (err) {
            h.fail('module state restore', err.message, { risk: RISK.HIGH, code: 'DB_CORRUPTION' });
        }
    }

    return h.results;
}
