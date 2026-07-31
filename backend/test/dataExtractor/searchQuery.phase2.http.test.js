/**
 * Checkpoint 2 - SearchQuery HTTP integration tests.
 * Real protect + company scope + module gate + DE routes + errorHandler.
 * Localhost / crm_test only. No RawCapture / browser / frontend.
 */
import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import http from 'node:http';
import express from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import dataExtractorRoute from '../../src/routes/v1/dataExtractor.routes.js';
import { resolveCompanyScope } from '../../src/middlewares/companyScope.middleware.js';
import { attachModuleContext, gateApiModuleByPath } from '../../src/middlewares/moduleGuard.middleware.js';
import { errorHandler } from '../../src/middlewares/error.middleware.js';
import { Company } from '../../src/models/company.model.js';
import { User } from '../../src/models/user.model.js';
import { SearchCampaign } from '../../src/models/searchCampaign.model.js';
import { SearchQuery } from '../../src/models/searchQuery.model.js';

const MONGO_URI = process.env.SC_MONGO_URI || process.env.MONGODB_URL || 'mongodb://127.0.0.1:27017/crm_test';
const TAG = `SQ2-HTTP-${Date.now()}`;
const JWT_SECRET = process.env.JWT_SECRET || 'secret123';
const BASE = '/api/v1/data-extractor/search-campaigns';

let server;
let baseUrl;
let companyA;
let companyB;
let fullUser;
let viewUser;
let noPermUser;
let genOnlyUser;
let reviewUser;
let openUser;
let fullToken;
let viewToken;
let noPermToken;
let genToken;
let reviewToken;
let openToken;
let campaignAId;
let campaignBId;
let queryAId;

function tokenFor(user) {
    return jwt.sign({ id: String(user._id), roleName: user.roleName }, JWT_SECRET, { expiresIn: '2h' });
}

function buildApp() {
    const app = express();
    app.use(express.json());
    app.use(resolveCompanyScope);
    app.use(attachModuleContext);
    app.use(gateApiModuleByPath);
    app.use('/api/v1/data-extractor', dataExtractorRoute);
    app.use(errorHandler);
    return app;
}

async function api(method, path, { token, companyId, body, query } = {}) {
    const url = new URL(path + (query || ''), baseUrl);
    const headers = { Accept: 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (companyId) headers['X-Company-Id'] = String(companyId);
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
    return { status: res.status, json, text };
}

function assertNoInternalLeak(json) {
    if (json?.message) {
        assert.doesNotMatch(String(json.message), /Cast to ObjectId failed|BSONError|MongoServerError/i);
    }
    assert.doesNotMatch(JSON.stringify(json || {}), /Cast to ObjectId failed/i);
}

before(async () => {
    assert.match(MONGO_URI, /crm_test/);
    assert.doesNotMatch(MONGO_URI, /prod|atlas|mongodb\.net/i);
    await mongoose.connect(MONGO_URI);

    companyA = await Company.create({
        companyName: `SQ2 Co A ${TAG}`,
        isActive: true,
        moduleGuardEnabled: false,
        enabledModules: ['crm', 'data_extractor'],
    });
    companyB = await Company.create({
        companyName: `SQ2 Co B ${TAG}`,
        isActive: true,
        moduleGuardEnabled: false,
        enabledModules: ['crm', 'data_extractor'],
    });

    const mkUser = async (username, sc, sq) => User.create({
        name: username,
        username: `${username}.${TAG}`.toLowerCase().replace(/[^a-z0-9.]/g, ''),
        email: `${username}.${TAG}@t.local`.toLowerCase(),
        password: 'TestPass123!',
        roleName: 'staff',
        allowLogin: true,
        isActive: true,
        companyAccessConfigured: false,
        additionalPermissions: {
            data_extractor: {
                search_campaign: sc,
                search_query: sq,
            },
        },
    });

    fullUser = await mkUser('sq2full', { view: true, manage: true }, {
        view: true, manage: true, generate: true, review: true, open: true,
    });
    viewUser = await mkUser('sq2view', { view: true, manage: false }, {
        view: true, manage: false, generate: false, review: false, open: false,
    });
    noPermUser = await mkUser('sq2noperm', { view: true, manage: false }, {
        view: false, manage: false, generate: false, review: false, open: false,
    });
    genOnlyUser = await mkUser('sq2gen', { view: true, manage: false }, {
        view: true, manage: false, generate: true, review: false, open: false,
    });
    reviewUser = await mkUser('sq2rev', { view: true, manage: false }, {
        view: true, manage: false, generate: false, review: true, open: false,
    });
    openUser = await mkUser('sq2open', { view: true, manage: false }, {
        view: true, manage: false, generate: false, review: false, open: true,
    });

    fullToken = tokenFor(fullUser);
    viewToken = tokenFor(viewUser);
    noPermToken = tokenFor(noPermUser);
    genToken = tokenFor(genOnlyUser);
    reviewToken = tokenFor(reviewUser);
    openToken = tokenFor(openUser);

    const campA = await SearchCampaign.create({
        companyId: companyA._id,
        name: `SQ2 Camp A ${TAG}`,
        nameNormalized: `sq2 camp a ${TAG}`,
        targetIndustry: 'Home Automation',
        relatedIndustries: ['Smart Home'],
        targetProducts: ['Smart Switch', 'DALI'],
        businessTypes: ['Manufacturer', 'OEM', 'System Integrator'],
        country: 'India',
        state: 'Maharashtra',
        city: 'Mumbai',
        includeKeywords: ['IoT'],
        excludeKeywords: ['jobs'],
        sources: ['google', 'facebook', 'indiamart', 'official_website', 'web'],
        status: 'active',
    });
    const campB = await SearchCampaign.create({
        companyId: companyB._id,
        name: `SQ2 Camp B ${TAG}`,
        nameNormalized: `sq2 camp b ${TAG}`,
        targetIndustry: 'Other',
        country: 'India',
        sources: ['google'],
        status: 'active',
    });
    campaignAId = campA._id;
    campaignBId = campB._id;

    const app = buildApp();
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const addr = server.address();
    baseUrl = `http://127.0.0.1:${addr.port}`;
});

after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    await SearchQuery.deleteMany({ companyId: { $in: [companyA?._id, companyB?._id].filter(Boolean) } });
    await SearchCampaign.deleteMany({ companyId: { $in: [companyA?._id, companyB?._id].filter(Boolean) }, name: new RegExp(TAG) });
    await User.deleteMany({ email: new RegExp(TAG, 'i') });
    await Company.deleteMany({ companyName: new RegExp(TAG) });
    await mongoose.disconnect();
});

describe('SearchQuery HTTP auth and permissions', () => {
    it('no token → 401', async () => {
        const res = await api('GET', `${BASE}/${campaignAId}/queries`, { companyId: companyA._id });
        assert.equal(res.status, 401);
        assertNoInternalLeak(res.json);
    });

    it('missing view permission → 403 list', async () => {
        const res = await api('GET', `${BASE}/${campaignAId}/queries`, {
            token: noPermToken, companyId: companyA._id,
        });
        assert.equal(res.status, 403);
    });

    it('view permission lists only company queries', async () => {
        // seed a query for company A via generate
        const gen = await api('POST', `${BASE}/${campaignAId}/queries/generate`, {
            token: genToken, companyId: companyA._id, body: { requestedLimit: 8 },
        });
        assert.equal(gen.status, 201);
        assert.ok(gen.json?.data?.stats?.inserted >= 1);
        queryAId = gen.json.data.queries[0]._id;

        const list = await api('GET', `${BASE}/${campaignAId}/queries`, {
            token: viewToken, companyId: companyA._id,
        });
        assert.equal(list.status, 200);
        assert.ok(Array.isArray(list.json.data.items));
        assert.ok(list.json.data.items.every((q) => String(q.companyId) === String(companyA._id)));
    });

    it('missing generate permission → 403', async () => {
        const res = await api('POST', `${BASE}/${campaignAId}/queries/generate`, {
            token: viewToken, companyId: companyA._id, body: { requestedLimit: 3 },
        });
        assert.equal(res.status, 403);
    });

    it('generate creates under authenticated company; body companyId ignored/rejected', async () => {
        const bad = await api('POST', `${BASE}/${campaignAId}/queries/generate`, {
            token: genToken, companyId: companyA._id,
            body: { requestedLimit: 3, companyId: String(companyB._id) },
        });
        assert.equal(bad.status, 400);

        const ok = await api('POST', `${BASE}/${campaignAId}/queries/generate`, {
            token: genToken, companyId: companyA._id, body: { requestedLimit: 5 },
        });
        assert.equal(ok.status, 201);
        assert.ok(ok.json.data.queries.every((q) => String(q.companyId) === String(companyA._id)));
    });

    it('Company A cannot generate under Company B campaign', async () => {
        const res = await api('POST', `${BASE}/${campaignBId}/queries/generate`, {
            token: genToken, companyId: companyA._id, body: { requestedLimit: 3 },
        });
        assert.equal(res.status, 404);
        assertNoInternalLeak(res.json);
    });

    it('Company A cannot read Company B query', async () => {
        // create query owned by B
        const bQuery = await SearchQuery.create({
            companyId: companyB._id,
            campaignId: campaignBId,
            queryText: `secret ${TAG}`,
            queryNormalized: `secret ${TAG}`,
            sourceHint: 'google',
            queryType: 'manual',
            status: 'draft',
            generationMethod: 'manual',
            searchUrl: 'https://www.google.com/search?q=secret',
        });
        const res = await api('GET', `${BASE}/${campaignBId}/queries/${bQuery._id}`, {
            token: viewToken, companyId: companyA._id,
        });
        assert.equal(res.status, 404);
        assertNoInternalLeak(res.json);
    });

    it('Company A cannot update Company B query', async () => {
        const bQuery = await SearchQuery.findOne({ companyId: companyB._id, campaignId: campaignBId });
        const res = await api('PATCH', `${BASE}/${campaignBId}/queries/${bQuery._id}`, {
            token: fullToken, companyId: companyA._id, body: { notes: 'x' },
        });
        assert.equal(res.status, 404);
    });

    it('missing review → 403; review allows approve', async () => {
        const forbid = await api('POST', `${BASE}/${campaignAId}/queries/${queryAId}/approve`, {
            token: viewToken, companyId: companyA._id, body: {},
        });
        assert.equal(forbid.status, 403);

        const ok = await api('POST', `${BASE}/${campaignAId}/queries/${queryAId}/approve`, {
            token: reviewToken, companyId: companyA._id, body: {},
        });
        assert.equal(ok.status, 200);
        assert.equal(ok.json.data.query.status, 'approved');
    });

    it('missing open → 403; open returns safe search URL', async () => {
        const forbid = await api('POST', `${BASE}/${campaignAId}/queries/${queryAId}/open`, {
            token: viewToken, companyId: companyA._id, body: {},
        });
        assert.equal(forbid.status, 403);

        const ok = await api('POST', `${BASE}/${campaignAId}/queries/${queryAId}/open`, {
            token: openToken, companyId: companyA._id, body: {},
        });
        assert.equal(ok.status, 200);
        assert.ok(ok.json.data.searchUrl.includes('google.com/search') || ok.json.data.searchUrl === '');
        assert.ok(ok.json.data.openedCount >= 1);
    });

    it('invalid campaign/query IDs handled safely', async () => {
        const badCamp = await api('GET', `${BASE}/not-an-id/queries`, {
            token: viewToken, companyId: companyA._id,
        });
        assert.equal(badCamp.status, 404);
        assertNoInternalLeak(badCamp.json);

        const badQ = await api('GET', `${BASE}/${campaignAId}/queries/not-an-id`, {
            token: viewToken, companyId: companyA._id,
        });
        assert.equal(badQ.status, 404);
        assertNoInternalLeak(badQ.json);
    });

    it('unknown body field and mongo operator rejected', async () => {
        const unk = await api('POST', `${BASE}/${campaignAId}/queries`, {
            token: fullToken, companyId: companyA._id,
            body: { queryText: `manual http ${TAG}`, sourceHint: 'google', unexpected: true },
        });
        assert.equal(unk.status, 400);

        const inj = await api('GET', `${BASE}/${campaignAId}/queries`, {
            token: viewToken, companyId: companyA._id, query: '?$where=1',
        });
        assert.ok([400, 404].includes(inj.status));
        assertNoInternalLeak(inj.json);
    });

    it('archived excluded by default; DELETE absent', async () => {
        const create = await api('POST', `${BASE}/${campaignAId}/queries`, {
            token: fullToken, companyId: companyA._id,
            body: { queryText: `to archive ${TAG}`, sourceHint: 'web' },
        });
        assert.equal(create.status, 201);
        const qid = create.json.data.query._id;
        await api('POST', `${BASE}/${campaignAId}/queries/${qid}/archive`, {
            token: fullToken, companyId: companyA._id, body: {},
        });
        const list = await api('GET', `${BASE}/${campaignAId}/queries`, {
            token: viewToken, companyId: companyA._id,
        });
        assert.ok(!list.json.data.items.some((i) => String(i._id) === String(qid)));

        const del = await api('DELETE', `${BASE}/${campaignAId}/queries/${qid}`, {
            token: fullToken, companyId: companyA._id,
        });
        assert.ok([404, 405].includes(del.status));
    });
});
