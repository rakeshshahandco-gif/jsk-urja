import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import http from 'node:http';
import express from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';

import { resolveCompanyScope } from '../../src/middlewares/companyScope.middleware.js';
import { errorHandler } from '../../src/middlewares/error.middleware.js';
import { Company } from '../../src/models/company.model.js';
import { User } from '../../src/models/user.model.js';
import { DiscoveryAgentToken } from '../../src/models/discoveryAgentToken.model.js';

const MONGO_URI = process.env.SC_MONGO_URI || process.env.MONGODB_URL || 'mongodb://127.0.0.1:27017/crm_test';
const TAG = `DA-PAIR-HTTP-${Date.now()}`;
const JWT_SECRET = process.env.JWT_SECRET || 'secret123';

let server;
let baseUrl;
let companyA;
let staffExtractUser;
let staffExtractBearer;
let routeImportError = '';
let dataExtractorRoute;
let dataExtractorPublicRoute;

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

async function api(method, path, { bearer, companyId, body } = {}) {
    const headers = { Accept: 'application/json' };
    if (bearer) headers.Authorization = `Bearer ${bearer}`;
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
        companyName: `DA Pair HTTP A ${TAG}`,
        isActive: true,
        moduleGuardEnabled: false,
        enabledModules: ['crm', 'data_extractor'],
    });
    staffExtractUser = await User.create({
        name: 'JATIN THAKKAR',
        username: `da.pair.http.${TAG}`.toLowerCase().replace(/[^a-z0-9.]/g, ''),
        email: `da.pair.http.${TAG}@t.local`.toLowerCase(),
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
    staffExtractBearer = sign(staffExtractUser);
    server = http.createServer(buildApp());
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const addr = server.address();
    baseUrl = `http://127.0.0.1:${addr.port}`;
});

after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    await DiscoveryAgentToken.deleteMany({ userId: staffExtractUser?._id });
    await User.deleteOne({ _id: staffExtractUser?._id });
    await Company.deleteOne({ _id: companyA?._id });
    await mongoose.disconnect();
});

describe('Discovery Agent pairing HTTP', () => {
    it('staff can create a pairing code and the local agent can exchange it', async () => {
        assert.equal(routeImportError, '', routeImportError);
        const created = await api('POST', '/api/v1/data-extractor/discovery/agent/pairing-codes', {
            bearer: staffExtractBearer,
            companyId: companyA._id,
            body: {},
        });
        assert.equal(created.status, 201, JSON.stringify(created.json));
        const pairingCode = created.json?.data?.pairingCode;
        assert.match(String(pairingCode), /^jskpair_/);

        const exchanged = await api('POST', '/api/v1/data-extractor/discovery/agent/pair', {
            companyId: companyA._id,
            body: {
                pairingCode,
                installId: 'inst-http-jatin',
                hostname: 'JATIN-PC',
                deviceName: 'JATIN-PC',
                agentVersion: '1.0.0',
            },
        });
        assert.equal(exchanged.status, 200, JSON.stringify(exchanged.json));
        const data = exchanged.json?.data || {};
        assert.match(String(data.token), /^jskdisc_/);
        assert.equal(data.deviceName, 'JATIN-PC');
        assert.equal(data.reused, false);

        const list = await api('GET', '/api/v1/data-extractor/discovery/agent/tokens', {
            bearer: staffExtractBearer,
            companyId: companyA._id,
        });
        assert.equal(list.status, 200);
        const blob = JSON.stringify(list.json);
        assert.equal(blob.includes(data.token), false);
        assert.equal(blob.includes(pairingCode), false);
    });

    it('rejects a used pairing code', async () => {
        const created = await api('POST', '/api/v1/data-extractor/discovery/agent/pairing-codes', {
            bearer: staffExtractBearer,
            companyId: companyA._id,
            body: {},
        });
        const pairingCode = created.json?.data?.pairingCode;
        const first = await api('POST', '/api/v1/data-extractor/discovery/agent/pair', {
            body: { pairingCode, installId: 'inst-http-jatin-2', hostname: 'JATIN-LAPTOP' },
        });
        assert.equal(first.status, 200, JSON.stringify(first.json));
        const second = await api('POST', '/api/v1/data-extractor/discovery/agent/pair', {
            body: { pairingCode, installId: 'inst-http-jatin-2', hostname: 'JATIN-LAPTOP' },
        });
        assert.equal(second.status, 401);
    });
});
