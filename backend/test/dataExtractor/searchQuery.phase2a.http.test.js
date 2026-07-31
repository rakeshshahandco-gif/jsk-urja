/**
 * Checkpoint 2A — SearchQuery HTTP permission matrix.
 * Campaign view is enough for query ops; campaign manage is NOT required.
 * crm_test / localhost only.
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
const TAG = `SQ2A-HTTP-${Date.now()}`;
const JWT_SECRET = process.env.JWT_SECRET || 'secret123';
const BASE = '/api/v1/data-extractor/search-campaigns';

let server; let baseUrl;
let companyA; let companyB;
let tokens = {};
let campaignAId; let campaignBId; let queryId;

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

async function api(method, path, { token, companyId, body } = {}) {
    const url = new URL(path, baseUrl);
    const headers = { Accept: 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (companyId) headers['X-Company-Id'] = String(companyId);
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch(url, {
        method, headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
    return { status: res.status, json, text };
}

before(async () => {
    assert.match(MONGO_URI, /crm_test/);
    assert.doesNotMatch(MONGO_URI, /prod|atlas|mongodb\.net/i);
    await mongoose.connect(MONGO_URI);

    companyA = await Company.create({
        companyName: `SQ2A A ${TAG}`, isActive: true, moduleGuardEnabled: false,
        enabledModules: ['crm', 'data_extractor'],
    });
    companyB = await Company.create({
        companyName: `SQ2A B ${TAG}`, isActive: true, moduleGuardEnabled: false,
        enabledModules: ['crm', 'data_extractor'],
    });

    const mk = async (username, sc, sq) => User.create({
        name: username,
        username: `${username}.${TAG}`.toLowerCase().replace(/[^a-z0-9.]/g, ''),
        email: `${username}.${TAG}@t.local`.toLowerCase(),
        password: 'TestPass123!',
        roleName: 'staff',
        allowLogin: true,
        isActive: true,
        companyAccessConfigured: false,
        additionalPermissions: {
            data_extractor: { search_campaign: sc, search_query: sq },
        },
    });

    const viewOnly = { view: true, manage: false };
    const noCamp = { view: false, manage: false };

    const users = {
        genNoCampManage: await mk('gen', viewOnly, {
            view: true, manage: false, generate: true, review: false, open: false,
        }),
        reviewNoCampManage: await mk('rev', viewOnly, {
            view: true, manage: false, generate: false, review: true, open: false,
        }),
        openNoCampManage: await mk('opn', viewOnly, {
            view: true, manage: false, generate: false, review: false, open: true,
        }),
        manageNoCampManage: await mk('man', viewOnly, {
            view: true, manage: true, generate: false, review: false, open: false,
        }),
        queryNoCampView: await mk('nocamp', noCamp, {
            view: true, manage: true, generate: true, review: true, open: true,
        }),
        campManageNoQuery: await mk('camponly', { view: true, manage: true }, {
            view: false, manage: false, generate: false, review: false, open: false,
        }),
        viewOnly: await mk('view', viewOnly, {
            view: true, manage: false, generate: false, review: false, open: false,
        }),
    };

    for (const [k, u] of Object.entries(users)) tokens[k] = tokenFor(u);

    const campA = await SearchCampaign.create({
        companyId: companyA._id,
        name: `SQ2A Camp A ${TAG}`,
        nameNormalized: `sq2a camp a ${TAG}`,
        targetIndustry: 'Home Automation',
        targetProducts: ['Smart Switch'],
        businessTypes: ['Manufacturer'],
        country: 'India',
        sources: ['google', 'web'],
        status: 'active',
    });
    const campB = await SearchCampaign.create({
        companyId: companyB._id,
        name: `SQ2A Camp B ${TAG}`,
        nameNormalized: `sq2a camp b ${TAG}`,
        targetIndustry: 'Other',
        country: 'India',
        sources: ['google'],
        status: 'active',
    });
    campaignAId = campA._id;
    campaignBId = campB._id;

    server = http.createServer(buildApp());
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
    if (server) await new Promise((r) => server.close(r));
    await SearchQuery.deleteMany({ companyId: { $in: [companyA?._id, companyB?._id].filter(Boolean) } });
    await SearchCampaign.deleteMany({ companyId: { $in: [companyA?._id, companyB?._id].filter(Boolean) }, name: new RegExp(TAG) });
    await User.deleteMany({ email: new RegExp(TAG, 'i') });
    await Company.deleteMany({ companyName: new RegExp(TAG) });
    await mongoose.disconnect();
});

describe('Checkpoint 2A HTTP permission matrix', () => {
    it('1. campaign view + query generate (no campaign manage) → generate succeeds', async () => {
        const res = await api('POST', `${BASE}/${campaignAId}/queries/generate`, {
            token: tokens.genNoCampManage, companyId: companyA._id,
            body: { requestedLimit: 5 },
        });
        assert.equal(res.status, 201);
        assert.ok(res.json.data.stats.inserted >= 1 || res.json.data.stats.generated >= 0);
        queryId = res.json.data.queries?.[0]?._id
            || (await SearchQuery.findOne({ companyId: companyA._id, campaignId: campaignAId }))._id;
    });

    it('2. campaign view + query review (no campaign manage) → approve succeeds', async () => {
        const res = await api('POST', `${BASE}/${campaignAId}/queries/${queryId}/approve`, {
            token: tokens.reviewNoCampManage, companyId: companyA._id, body: {},
        });
        assert.equal(res.status, 200);
        assert.equal(res.json.data.query.status, 'approved');
    });

    it('3. campaign view + query open (no campaign manage) → open succeeds', async () => {
        const res = await api('POST', `${BASE}/${campaignAId}/queries/${queryId}/open`, {
            token: tokens.openNoCampManage, companyId: companyA._id, body: {},
        });
        assert.equal(res.status, 200);
        assert.ok(res.json.data.openedCount >= 1);
    });

    it('4. campaign view + query manage (no campaign manage) → manual create succeeds', async () => {
        const res = await api('POST', `${BASE}/${campaignAId}/queries`, {
            token: tokens.manageNoCampManage, companyId: companyA._id,
            body: { queryText: `manual matrix ${TAG}`, sourceHint: 'google' },
        });
        assert.equal(res.status, 201);
        assert.equal(res.json.data.query.status, 'draft');
    });

    it('5. query permission without campaign view → denied', async () => {
        const res = await api('GET', `${BASE}/${campaignAId}/queries`, {
            token: tokens.queryNoCampView, companyId: companyA._id,
        });
        assert.equal(res.status, 403);
    });

    it('6. campaign manage without required query permission → denied', async () => {
        const gen = await api('POST', `${BASE}/${campaignAId}/queries/generate`, {
            token: tokens.campManageNoQuery, companyId: companyA._id,
            body: { requestedLimit: 3 },
        });
        assert.equal(gen.status, 403);
        const list = await api('GET', `${BASE}/${campaignAId}/queries`, {
            token: tokens.campManageNoQuery, companyId: companyA._id,
        });
        assert.equal(list.status, 403);
    });

    it('7. no combination exposes another company campaign/query', async () => {
        const bQ = await SearchQuery.create({
            companyId: companyB._id,
            campaignId: campaignBId,
            queryText: `secret ${TAG}`,
            queryNormalized: `secret ${TAG}`,
            sourceHint: 'google',
            status: 'draft',
            generationMethod: 'manual',
            queryType: 'manual',
        });
        for (const key of Object.keys(tokens)) {
            const g = await api('POST', `${BASE}/${campaignBId}/queries/generate`, {
                token: tokens[key], companyId: companyA._id, body: { requestedLimit: 2 },
            });
            assert.ok([403, 404].includes(g.status), `${key} generate cross-company`);
            const r = await api('GET', `${BASE}/${campaignBId}/queries/${bQ._id}`, {
                token: tokens[key], companyId: companyA._id,
            });
            assert.ok([403, 404].includes(r.status), `${key} read cross-company`);
        }
    });
});
