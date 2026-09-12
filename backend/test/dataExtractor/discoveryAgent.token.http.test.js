import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import http from 'node:http';
import express from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import mongoose from 'mongoose';

import { resolveCompanyScope } from '../../src/middlewares/companyScope.middleware.js';
import { errorHandler } from '../../src/middlewares/error.middleware.js';

import { Company } from '../../src/models/company.model.js';
import { User } from '../../src/models/user.model.js';
import { DiscoveryAgentToken } from '../../src/models/discoveryAgentToken.model.js';

const MONGO_URI = process.env.SC_MONGO_URI || process.env.MONGODB_URL || 'mongodb://127.0.0.1:27017/crm_test';
const TAG = `DA-TOKEN-${Date.now()}`;
const JWT_SECRET = process.env.JWT_SECRET || 'secret123';

let server;
let baseUrl;
let companyA;
let companyB;
let adminUser;
let staffNoPermUser;
let staffExtractUser;
let adminBearer;
let staffBearer;
let staffExtractBearer;
let routeImportError = '';
let dataExtractorRoute;
let dataExtractorPublicRoute;
let createdPlainToken = '';
let createdTokenId = '';

function sign(user) {
    return jwt.sign({ id: String(user._id), roleName: user.roleName }, JWT_SECRET, { expiresIn: '2h' });
}

function buildApp() {
    const app = express();
    app.use(express.json({ limit: '2mb' }));
    app.use(resolveCompanyScope);
    app.use('/api/v1/data-extractor', dataExtractorPublicRoute);
    app.use('/api/v1/data-extractor', dataExtractorRoute);
    app.use(errorHandler);
    return app;
}

async function api(method, path, { bearer, agentToken, companyId, body } = {}) {
    const headers = { Accept: 'application/json' };
    if (bearer) headers.Authorization = `Bearer ${bearer}`;
    if (agentToken) headers['X-Discovery-Agent-Token'] = agentToken;
    if (companyId) headers['X-Company-Id'] = String(companyId);
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    const res = await fetch(new URL(path, baseUrl), {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = {};
    try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
    return { status: res.status, json };
}

before(async () => {
    assert.match(MONGO_URI, /crm_test/);
    await mongoose.connect(MONGO_URI);

    try {
        const mod = await import('../../src/routes/v1/dataExtractor.routes.js');
        dataExtractorRoute = mod.default;
        dataExtractorPublicRoute = mod.dataExtractorPublicRoute;
    } catch (err) {
        routeImportError = String(err?.message || err);
        return;
    }

    companyA = await Company.create({
        companyName: `DA Token A ${TAG}`,
        isActive: true,
        moduleGuardEnabled: false,
        enabledModules: ['crm', 'data_extractor'],
    });
    companyB = await Company.create({
        companyName: `DA Token B ${TAG}`,
        isActive: true,
        moduleGuardEnabled: false,
        enabledModules: ['crm', 'data_extractor'],
    });

    adminUser = await User.create({
        name: 'DA Admin',
        username: `da.admin.${TAG}`.toLowerCase().replace(/[^a-z0-9.]/g, ''),
        email: `da.admin.${TAG}@t.local`.toLowerCase(),
        password: 'TestPass123!',
        roleName: 'admin',
        allowLogin: true,
        isActive: true,
        companyAccessConfigured: false,
        additionalPermissions: {
            data_extractor: {
                discovery: { use_local_agent: true, view: true },
            },
        },
    });
    staffNoPermUser = await User.create({
        name: 'DA Staff',
        username: `da.staff.${TAG}`.toLowerCase().replace(/[^a-z0-9.]/g, ''),
        email: `da.staff.${TAG}@t.local`.toLowerCase(),
        password: 'TestPass123!',
        roleName: 'staff',
        allowLogin: true,
        isActive: true,
        companyAccessConfigured: false,
        additionalPermissions: {
            data_extractor: {
                discovery: { view: true, use_local_agent: false },
            },
        },
    });
    staffExtractUser = await User.create({
        name: 'JATIN THAKKAR',
        username: `da.jatin.${TAG}`.toLowerCase().replace(/[^a-z0-9.]/g, ''),
        email: `da.jatin.${TAG}@t.local`.toLowerCase(),
        password: 'TestPass123!',
        roleName: 'staff',
        allowLogin: true,
        isActive: true,
        companyAccessConfigured: false,
        additionalPermissions: {
            data_extractor: {
                discovery: { view: true, use_local_agent: false },
                assisted_capture: { start: true, view: true },
            },
        },
    });
    adminBearer = sign(adminUser);
    staffBearer = sign(staffNoPermUser);
    staffExtractBearer = sign(staffExtractUser);

    server = http.createServer(buildApp());
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    const ids = [companyA?._id, companyB?._id].filter(Boolean);
    if (ids.length) {
        await DiscoveryAgentToken.deleteMany({ companyId: { $in: ids } });
        await Company.deleteMany({ _id: { $in: ids } });
    }
    await User.deleteMany({ email: new RegExp(TAG, 'i') });
    await mongoose.disconnect();
});

describe('Discovery Agent token creation HTTP contract', () => {
    it('imports dataExtractor private/public routes', () => {
        assert.equal(routeImportError, '', routeImportError);
        assert.equal(typeof dataExtractorRoute, 'function');
        assert.equal(typeof dataExtractorPublicRoute, 'function');
    });

    it('1. No CRM login → 401', async () => {
        assert.equal(routeImportError, '', routeImportError);
        const res = await api('POST', '/api/v1/data-extractor/discovery/agent/tokens', {
            companyId: companyA._id,
            body: { name: `no-auth-${TAG}` },
        });
        assert.equal(res.status, 401);
        const msg = String(res.json?.message || res.json?.raw || '');
        assert.equal(msg.includes('X-Discovery-Agent-Token'), false, msg);
    });

    it('2. Missing company header → 400', async () => {
        assert.equal(routeImportError, '', routeImportError);
        const res = await api('POST', '/api/v1/data-extractor/discovery/agent/tokens', {
            bearer: adminBearer,
            body: { name: `no-co-${TAG}` },
        });
        assert.equal(res.status, 400);
        assert.match(String(res.json?.message || ''), /X-Company-Id/i);
    });

    it('3. Missing token-management permission → 403', async () => {
        assert.equal(routeImportError, '', routeImportError);
        const res = await api('POST', '/api/v1/data-extractor/discovery/agent/tokens', {
            bearer: staffBearer,
            companyId: companyA._id,
            body: { name: `no-perm-${TAG}` },
        });
        assert.equal(res.status, 403);
        assert.match(String(res.json?.message || ''), /use_local_agent/i);
    });

    it('3b. Staff with assisted_capture.start can register their own PC', async () => {
        assert.equal(routeImportError, '', routeImportError);
        const res = await api('POST', '/api/v1/data-extractor/discovery/agent/tokens', {
            bearer: staffExtractBearer,
            companyId: companyA._id,
            body: { name: 'JATIN-PC', deviceName: 'JATIN-PC' },
        });
        assert.equal(res.status, 201, JSON.stringify(res.json));
        const data = res.json?.data || {};
        assert.ok(data.token);
        assert.ok(data.deviceId);
        assert.equal(data.deviceName, 'JATIN-PC');
        const list = await api('GET', '/api/v1/data-extractor/discovery/agent/tokens', {
            bearer: staffExtractBearer,
            companyId: companyA._id,
        });
        assert.equal(list.status, 200);
        const tokens = list.json?.data?.tokens || [];
        assert.ok(tokens.every((t) => String(t.userId) === String(staffExtractUser._id)));
        assert.equal(JSON.stringify(list.json).includes(data.token), false);
    });

    it('4+5. Valid admin + company creates token without X-Discovery-Agent-Token', async () => {
        assert.equal(routeImportError, '', routeImportError);
        const res = await api('POST', '/api/v1/data-extractor/discovery/agent/tokens', {
            bearer: adminBearer,
            companyId: companyA._id,
            body: { name: `bootstrap-${TAG}`, expiresInDays: 30 },
        });
        assert.equal(res.status, 201, JSON.stringify(res.json));
        const data = res.json?.data || {};
        assert.ok(data.token);
        assert.match(String(data.token), /^jskdisc_/);
        assert.ok(data.id);
        assert.ok(data.tokenPrefix);
        assert.equal(Object.prototype.hasOwnProperty.call(data, 'tokenHash'), false);
        createdPlainToken = data.token;
        createdTokenId = data.id;
    });

    it('6. Raw token returned only on creation (list has no raw token)', async () => {
        assert.equal(routeImportError, '', routeImportError);
        assert.ok(createdPlainToken);
        const list = await api('GET', '/api/v1/data-extractor/discovery/agent/tokens', {
            bearer: adminBearer,
            companyId: companyA._id,
        });
        assert.equal(list.status, 200, JSON.stringify(list.json));
        const tokens = list.json?.data?.tokens || [];
        const row = tokens.find((t) => String(t.id) === String(createdTokenId));
        assert.ok(row, 'created token should appear in list');
        assert.equal(Object.prototype.hasOwnProperty.call(row, 'token'), false);
        assert.equal(Object.prototype.hasOwnProperty.call(row, 'tokenHash'), false);
        const blob = JSON.stringify(list.json);
        assert.equal(blob.includes(createdPlainToken), false);
    });

    it('7. Stored value is hashed (not raw token)', async () => {
        assert.equal(routeImportError, '', routeImportError);
        assert.ok(createdTokenId);
        const doc = await DiscoveryAgentToken.findById(createdTokenId).lean();
        assert.ok(doc);
        assert.ok(doc.tokenHash);
        assert.equal(doc.tokenHash, crypto.createHash('sha256').update(createdPlainToken).digest('hex'));
        assert.notEqual(doc.tokenHash, createdPlainToken);
        assert.equal(Object.prototype.hasOwnProperty.call(doc, 'token'), false);
    });

    it('8. Agent-facing route rejects missing X-Discovery-Agent-Token', async () => {
        assert.equal(routeImportError, '', routeImportError);
        const res = await api('POST', '/api/v1/data-extractor/discovery/agent/connect', {
            companyId: companyA._id,
            body: {},
        });
        assert.equal(res.status, 401);
        assert.match(String(res.json?.message || ''), /X-Discovery-Agent-Token/i);
    });

    it('9. Agent-facing route accepts the newly created token', async () => {
        assert.equal(routeImportError, '', routeImportError);
        assert.ok(createdPlainToken);
        const res = await api('POST', '/api/v1/data-extractor/discovery/agent/connect', {
            agentToken: createdPlainToken,
            companyId: companyA._id,
            body: {},
        });
        assert.ok([200, 201].includes(res.status), JSON.stringify(res.json));
    });

    it('10. Company isolation works (cross-company token access blocked)', async () => {
        assert.equal(routeImportError, '', routeImportError);
        assert.ok(createdPlainToken);

        const bodyReject = await api('POST', '/api/v1/data-extractor/discovery/agent/tokens', {
            bearer: adminBearer,
            companyId: companyA._id,
            body: { name: `body-co-${TAG}`, companyId: String(companyB._id) },
        });
        assert.equal(bodyReject.status, 400);
        assert.match(String(bodyReject.json?.message || ''), /companyId/i);

        const cross = await api('POST', '/api/v1/data-extractor/discovery/agent/connect', {
            agentToken: createdPlainToken,
            companyId: companyB._id,
            body: {},
        });
        assert.equal(cross.status, 403);
        assert.match(String(cross.json?.message || ''), /Company scope|cannot be overridden/i);

        const listB = await api('GET', '/api/v1/data-extractor/discovery/agent/tokens', {
            bearer: adminBearer,
            companyId: companyB._id,
        });
        assert.equal(listB.status, 200);
        const tokensB = listB.json?.data?.tokens || [];
        assert.equal(tokensB.some((t) => String(t.id) === String(createdTokenId)), false);
    });
});
