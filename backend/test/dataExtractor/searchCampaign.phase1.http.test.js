/**
 * Checkpoint 1A - SearchCampaign HTTP integration tests.
 * Mounts real Data Extractor routes with protect + company scope + module gate + errorHandler.
 * Localhost / crm_test only. Does not start the full production server.
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

const MONGO_URI = process.env.SC_MONGO_URI || process.env.MONGODB_URL || 'mongodb://127.0.0.1:27017/crm_test';
const TAG = `SC1A-HTTP-${Date.now()}`;
const JWT_SECRET = process.env.JWT_SECRET || 'secret123';
const BASE = '/api/v1/data-extractor/search-campaigns';

let server;
let baseUrl;
let companyA;
let companyB;
let manageUser;
let viewUser;
let noPermUser;
let manageToken;
let viewToken;
let noPermToken;
let companyBCampaignId;

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
        companyName: `SC1A Co A ${TAG}`,
        isActive: true,
        moduleGuardEnabled: false,
        enabledModules: ['crm', 'data_extractor'],
    });
    companyB = await Company.create({
        companyName: `SC1A Co B ${TAG}`,
        isActive: true,
        moduleGuardEnabled: false,
        enabledModules: ['crm', 'data_extractor'],
    });

    const mkUser = async (username, perms) => User.create({
        name: username,
        username: `${username}.${TAG}`.toLowerCase().replace(/[^a-z0-9.]/g, ''),
        email: `${username}.${TAG}@t.local`.toLowerCase(),
        password: 'TestPass123!',
        roleName: 'staff',
        allowLogin: true,
        isActive: true,
        companyAccessConfigured: false,
        additionalPermissions: {
            data_extractor: { search_campaign: perms },
        },
    });

    manageUser = await mkUser('sc1amanage', { view: true, manage: true });
    viewUser = await mkUser('sc1aview', { view: true, manage: false });
    noPermUser = await mkUser('sc1anoperm', { view: false, manage: false });

    manageToken = tokenFor(manageUser);
    viewToken = tokenFor(viewUser);
    noPermToken = tokenFor(noPermUser);

    const bCampaign = await SearchCampaign.create({
        companyId: companyB._id,
        name: `B Secret ${TAG}`,
        nameNormalized: `b secret ${TAG}`.toLowerCase(),
        targetIndustry: 'Other',
        country: 'India',
        status: 'draft',
        createdBy: manageUser._id,
        updatedBy: manageUser._id,
    });
    companyBCampaignId = bCampaign._id;

    server = http.createServer(buildApp());
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
    if (server) await new Promise((r) => server.close(r));
    await SearchCampaign.deleteMany({
        $or: [
            { companyId: { $in: [companyA?._id, companyB?._id].filter(Boolean) } },
            { name: new RegExp(TAG) },
        ],
    });
    if (manageUser) await User.deleteMany({ _id: { $in: [manageUser._id, viewUser._id, noPermUser._id] } });
    if (companyA) await Company.deleteMany({ _id: { $in: [companyA._id, companyB._id] } });
    await mongoose.disconnect();
});

describe('SearchCampaign HTTP auth + permissions', () => {
    it('1. unauthenticated request is rejected', async () => {
        const res = await api('GET', BASE, { companyId: companyA._id });
        assert.ok(res.status === 401 || res.status === 403);
        assertNoInternalLeak(res.json);
    });

    it('2. authenticated without view cannot list', async () => {
        const res = await api('GET', BASE, { token: noPermToken, companyId: companyA._id });
        assert.equal(res.status, 403);
        assert.equal(res.json?.data?.items == null, true);
        assertNoInternalLeak(res.json);
    });

    it('3. view user lists only own company campaigns', async () => {
        await SearchCampaign.create({
            companyId: companyA._id,
            name: `A Visible ${TAG}`,
            nameNormalized: `a visible ${TAG}`,
            targetIndustry: 'Home Automation',
            country: 'India',
            status: 'draft',
            createdBy: manageUser._id,
            updatedBy: manageUser._id,
        });
        const res = await api('GET', BASE, {
            token: viewToken,
            companyId: companyA._id,
            query: `?q=${encodeURIComponent(TAG)}&includeArchived=true`,
        });
        assert.equal(res.status, 200);
        const items = res.json?.data?.items || [];
        assert.ok(items.length >= 1);
        assert.ok(items.every((c) => String(c.companyId) === String(companyA._id)));
        assert.ok(!items.some((c) => String(c._id) === String(companyBCampaignId)));
        assertNoInternalLeak(res.json);
    });

    it('4. view user cannot create', async () => {
        const res = await api('POST', BASE, {
            token: viewToken,
            companyId: companyA._id,
            body: {
                name: `NoCreate ${TAG}`,
                targetIndustry: 'Home Automation',
                country: 'India',
            },
        });
        assert.equal(res.status, 403);
        assertNoInternalLeak(res.json);
    });

    it('5. manage user can create; companyId from auth context', async () => {
        const res = await api('POST', BASE, {
            token: manageToken,
            companyId: companyA._id,
            body: {
                name: `Created HTTP ${TAG}`,
                targetIndustry: 'Home Automation',
                country: 'India',
                minimumQualificationScore: 60,
            },
        });
        assert.equal(res.status, 201);
        const campaign = res.json?.data?.campaign;
        assert.ok(campaign);
        assert.equal(String(campaign.companyId), String(companyA._id));
        assert.equal(campaign.country, 'India');
        assert.equal(String(campaign.createdBy), String(manageUser._id));
        assertNoInternalLeak(res.json);
    });

    it('6. body companyId cannot override authenticated company', async () => {
        const res = await api('POST', BASE, {
            token: manageToken,
            companyId: companyA._id,
            body: {
                name: `OverrideAttempt ${TAG}`,
                targetIndustry: 'Home Automation',
                country: 'India',
                companyId: String(companyB._id),
            },
        });
        assert.equal(res.status, 400);
        const leaked = await SearchCampaign.findOne({ name: `OverrideAttempt ${TAG}`, companyId: companyB._id }).lean();
        assert.equal(leaked, null);
        assertNoInternalLeak(res.json);
    });
});

describe('SearchCampaign HTTP isolation + validation', () => {
    it('7. cross-company detail returns not found', async () => {
        const res = await api('GET', `${BASE}/${companyBCampaignId}`, {
            token: manageToken,
            companyId: companyA._id,
        });
        assert.equal(res.status, 404);
        assert.match(String(res.json?.message || ''), /not found/i);
        assertNoInternalLeak(res.json);
    });

    it('8. cross-company update returns not found', async () => {
        const res = await api('PATCH', `${BASE}/${companyBCampaignId}`, {
            token: manageToken,
            companyId: companyA._id,
            body: { description: 'hack' },
        });
        assert.equal(res.status, 404);
        const again = await SearchCampaign.findById(companyBCampaignId).lean();
        assert.notEqual(again.description, 'hack');
        assertNoInternalLeak(res.json);
    });

    it('9. invalid MongoDB campaign ID is handled safely', async () => {
        const res = await api('GET', `${BASE}/not-a-valid-object-id`, {
            token: manageToken,
            companyId: companyA._id,
        });
        assert.ok([400, 404].includes(res.status));
        assertNoInternalLeak(res.json);
        assert.doesNotMatch(String(res.json?.message || ''), /Cast to ObjectId failed/i);
    });

    it('10. unknown body field is rejected', async () => {
        const res = await api('POST', BASE, {
            token: manageToken,
            companyId: companyA._id,
            body: {
                name: `UnknownField ${TAG}`,
                targetIndustry: 'Home Automation',
                country: 'India',
                totallyUnknownField: true,
            },
        });
        assert.equal(res.status, 400);
        assert.match(String(res.json?.message || ''), /Unknown fields/i);
        assertNoInternalLeak(res.json);
    });

    it('11. invalid filter/operator input is rejected', async () => {
        const res3 = await fetch(`${baseUrl}${BASE}?%24where=true`, {
            headers: {
                Authorization: `Bearer ${viewToken}`,
                'X-Company-Id': String(companyA._id),
                Accept: 'application/json',
            },
        });
        const j3 = await res3.json();
        assert.ok([400, 403].includes(res3.status));
        assert.match(String(j3.message || ''), /Unknown filter|Unsafe filter|Permission/i);
        assertNoInternalLeak(j3);
    });

    it('12. archive endpoint requires manage permission', async () => {
        const created = await api('POST', BASE, {
            token: manageToken,
            companyId: companyA._id,
            body: {
                name: `ArchiveMe ${TAG}`,
                targetIndustry: 'Home Automation',
                country: 'India',
            },
        });
        assert.equal(created.status, 201);
        const id = created.json.data.campaign._id;
        const denied = await api('POST', `${BASE}/${id}/archive`, {
            token: viewToken,
            companyId: companyA._id,
        });
        assert.equal(denied.status, 403);
        const ok = await api('POST', `${BASE}/${id}/archive`, {
            token: manageToken,
            companyId: companyA._id,
        });
        assert.equal(ok.status, 200);
        assert.equal(ok.json.data.campaign.status, 'archived');
        assertNoInternalLeak(ok.json);
    });

    it('no DELETE endpoint exists', async () => {
        const res = await api('DELETE', `${BASE}/${companyBCampaignId}`, {
            token: manageToken,
            companyId: companyA._id,
        });
        assert.ok([404, 405].includes(res.status));
    });

    it('create without country stores empty country via HTTP', async () => {
        const res = await api('POST', BASE, {
            token: manageToken,
            companyId: companyA._id,
            body: {
                name: `HTTP NoCountry ${TAG}`,
                targetIndustry: 'Home Automation',
            },
        });
        assert.equal(res.status, 201);
        assert.equal(res.json.data.campaign.country, '');
    });
});