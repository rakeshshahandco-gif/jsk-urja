/**
 * Checkpoint 5 — Assisted Capture HTTP (Part 29 style) with real middleware.
 */
import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import http from 'node:http';
import express from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import dataExtractorRoute, { dataExtractorPublicRoute } from '../../src/routes/v1/dataExtractor.routes.js';
import { resolveCompanyScope } from '../../src/middlewares/companyScope.middleware.js';
import { attachModuleContext, gateApiModuleByPath } from '../../src/middlewares/moduleGuard.middleware.js';
import { errorHandler } from '../../src/middlewares/error.middleware.js';
import { Company } from '../../src/models/company.model.js';
import { User } from '../../src/models/user.model.js';
import { SearchCampaign } from '../../src/models/searchCampaign.model.js';
import { SearchQuery } from '../../src/models/searchQuery.model.js';
import { AssistedCaptureSession } from '../../src/models/assistedCaptureSession.model.js';
import { AssistedCaptureEvent } from '../../src/models/assistedCaptureEvent.model.js';
import { DiscoveryAgentJob } from '../../src/models/discoveryAgentJob.model.js';
import { DiscoveryAgentToken } from '../../src/models/discoveryAgentToken.model.js';
import { RawCapture } from '../../src/models/rawCapture.model.js';
import { ExtractedLead } from '../../src/models/extractedLead.model.js';
import { Lead } from '../../src/models/lead.model.js';
import { createAgentToken } from '../../src/services/dataExtractor/discovery/agent/agentToken.service.js';

const MONGO_URI = process.env.SC_MONGO_URI || process.env.MONGODB_URL || 'mongodb://127.0.0.1:27017/crm_test';
const TAG = `AC5H-${Date.now()}`;
const JWT_SECRET = process.env.JWT_SECRET || 'secret123';
const BASE = '/api/v1/data-extractor/search-campaigns';
const AGENT_BASE = '/api/v1/data-extractor/discovery/agent';

let server; let baseUrl;
let companyA; let companyB;
let tokens = {};
let campaignAId; let campaignBId; let queryAId;
let agentTokenPlain;
let leadsBefore; let crmBefore;
let keyN = 0;

function tokenFor(user) {
    return jwt.sign({ id: String(user._id), roleName: user.roleName }, JWT_SECRET, { expiresIn: '2h' });
}

function nextKey(prefix) {
    keyN += 1;
    return `${prefix}-${TAG}-${keyN}`;
}

function buildApp() {
    const app = express();
    app.use(express.json({ limit: '2mb' }));
    app.use(resolveCompanyScope);
    const v1 = express.Router();
    v1.use(attachModuleContext);
    v1.use(gateApiModuleByPath);
    v1.use('/data-extractor', dataExtractorPublicRoute);
    v1.use('/data-extractor', dataExtractorRoute);
    app.use('/api/v1', v1);
    app.use(errorHandler);
    return app;
}

async function api(method, path, { token, companyId, body, agentToken, sessionToken } = {}) {
    const headers = { Accept: 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (companyId) headers['X-Company-Id'] = String(companyId);
    if (agentToken) headers['X-Discovery-Agent-Token'] = agentToken;
    if (sessionToken) headers['X-Assisted-Session-Token'] = sessionToken;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch(new URL(path, baseUrl), {
        method, headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
    return { status: res.status, json, text };
}

function assertNoLeak(payload) {
    const s = typeof payload === 'string' ? payload : JSON.stringify(payload || {});
    assert.doesNotMatch(s, /Cast to ObjectId failed|MongoServerError|E11000|mongodb:\/\/|node_modules/i);
    if (payload && typeof payload === 'object' && !payload.raw) {
        assert.equal(Object.prototype.hasOwnProperty.call(payload, 'stack'), false);
    }
}

before(async () => {
    assert.match(MONGO_URI, /crm_test/);
    await mongoose.connect(MONGO_URI);
    leadsBefore = await ExtractedLead.countDocuments({}).catch(() => 0);
    crmBefore = await Lead.countDocuments({}).catch(() => 0);

    companyA = await Company.create({
        companyName: `AC5H A ${TAG}`, isActive: true, moduleGuardEnabled: false,
        enabledModules: ['crm', 'data_extractor'],
    });
    companyB = await Company.create({
        companyName: `AC5H B ${TAG}`, isActive: true, moduleGuardEnabled: false,
        enabledModules: ['crm', 'data_extractor'],
    });

    const mk = async (username, perms) => User.create({
        name: username,
        username: `${username}.${TAG}`.toLowerCase().replace(/[^a-z0-9.]/g, ''),
        email: `${username}.${TAG}@t.local`.toLowerCase(),
        password: 'TestPass123!',
        roleName: 'staff', allowLogin: true, isActive: true, companyAccessConfigured: false,
        additionalPermissions: { data_extractor: perms },
    });

    const full = await mk('full', {
        search_campaign: { view: true, manage: true },
        search_query: { view: true, manage: true, open: true, review: true },
        raw_capture: { view: true, ingest: true, manage: true },
        assisted_capture: { view: true, start: true, manage: true },
        discovery: { view: true, use_local_agent: true, settings: true },
    });
    tokens.full = tokenFor(full);
    tokens.viewOnly = tokenFor(await mk('view', {
        search_campaign: { view: true },
        search_query: { view: true },
        assisted_capture: { view: true, start: false, manage: false },
        raw_capture: { view: true, ingest: false },
    }));
    tokens.noAssisted = tokenFor(await mk('noac', {
        search_campaign: { view: true },
        search_query: { view: true, open: true },
        raw_capture: { view: true, ingest: true },
        assisted_capture: { view: false, start: false, manage: false },
    }));

    campaignAId = (await SearchCampaign.create({
        companyId: companyA._id, name: `AC5H Camp ${TAG}`, nameNormalized: `ac5h camp ${TAG}`,
        targetIndustry: 'Home Automation', country: 'India', sources: ['google'], status: 'active',
    }))._id;
    campaignBId = (await SearchCampaign.create({
        companyId: companyB._id, name: `AC5H CampB ${TAG}`, nameNormalized: `ac5h campb ${TAG}`,
        targetIndustry: 'Other', country: 'India', sources: ['google'], status: 'active',
    }))._id;
    queryAId = (await SearchQuery.create({
        companyId: companyA._id, campaignId: campaignAId,
        queryText: `q ${TAG}`, queryNormalized: `q ${TAG}`,
        sourceHint: 'google', status: 'approved', generationMethod: 'manual', queryType: 'manual',
        searchUrl: 'https://www.google.com/search?q=home+automation',
    }))._id;

    const agentTok = await createAgentToken({
        companyId: companyA._id,
        userId: full._id,
        name: `AC5H Agent ${TAG}`,
        expiresInDays: 7,
    });
    agentTokenPlain = agentTok.token;

    server = http.createServer(buildApp());
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
    if (server) await new Promise((r) => server.close(r));
    await AssistedCaptureEvent.deleteMany({ companyId: { $in: [companyA?._id, companyB?._id].filter(Boolean) } });
    await AssistedCaptureSession.deleteMany({ companyId: { $in: [companyA?._id, companyB?._id].filter(Boolean) } });
    await DiscoveryAgentJob.deleteMany({ companyId: { $in: [companyA?._id, companyB?._id].filter(Boolean) } });
    await DiscoveryAgentToken.deleteMany({ companyId: { $in: [companyA?._id, companyB?._id].filter(Boolean) } });
    await RawCapture.deleteMany({ companyId: { $in: [companyA?._id, companyB?._id].filter(Boolean) } });
    await SearchQuery.deleteMany({ companyId: { $in: [companyA?._id, companyB?._id].filter(Boolean) } });
    await SearchCampaign.deleteMany({ companyId: { $in: [companyA?._id, companyB?._id].filter(Boolean) }, name: new RegExp(TAG) });
    await User.deleteMany({ email: new RegExp(TAG, 'i') });
    await Company.deleteMany({ companyName: new RegExp(TAG) });
    await mongoose.disconnect();
});

describe('CP5 HTTP — auth permissions and CRUD', () => {
    it('1. no auth → 401', async () => {
        assert.equal((await api('POST', `${BASE}/${campaignAId}/queries/${queryAId}/assisted-captures`, {
            companyId: companyA._id, body: {},
        })).status, 401);
    });

    it('2. missing assisted start → 403', async () => {
        assert.equal((await api('POST', `${BASE}/${campaignAId}/queries/${queryAId}/assisted-captures`, {
            token: tokens.noAssisted, companyId: companyA._id, body: { idempotencyKey: nextKey('no') },
        })).status, 403);
    });

    it('3. create session success without plain token; reject forbidden fields', async () => {
        const bad = await api('POST', `${BASE}/${campaignAId}/queries/${queryAId}/assisted-captures`, {
            token: tokens.full, companyId: companyA._id,
            body: { searchUrl: 'https://www.google.com/search?q=x', idempotencyKey: nextKey('bad') },
        });
        assert.equal(bad.status, 400);

        const created = await api('POST', `${BASE}/${campaignAId}/queries/${queryAId}/assisted-captures`, {
            token: tokens.full, companyId: companyA._id,
            body: { idempotencyKey: nextKey('ok'), financialYear: '2025-26' },
        });
        assert.equal(created.status, 201);
        assert.ok(created.json.data.session._id);
        assert.equal(created.json.data.session.sessionToken, undefined);
        assert.equal(created.json.data.session.token, undefined);
        assert.equal(created.json.data.session.tokenHash, undefined);
        assertNoLeak(created.json);
    });

    it('4. cross-company campaign → 404', async () => {
        assert.equal((await api('POST', `${BASE}/${campaignBId}/queries/${queryAId}/assisted-captures`, {
            token: tokens.full, companyId: companyA._id, body: { idempotencyKey: nextKey('xc') },
        })).status, 404);
    });

    it('5. list/get/cancel/complete', async () => {
        const created = await api('POST', `${BASE}/${campaignAId}/queries/${queryAId}/assisted-captures`, {
            token: tokens.full, companyId: companyA._id,
            body: { idempotencyKey: nextKey('list'), financialYear: '2025-26' },
        });
        assert.equal(created.status, 201);
        const sid = created.json.data.session._id;

        const list = await api('GET', `${BASE}/${campaignAId}/queries/${queryAId}/assisted-captures`, {
            token: tokens.viewOnly, companyId: companyA._id,
        });
        assert.equal(list.status, 200);
        assert.ok(list.json.data.items.length >= 1);

        const one = await api('GET', `${BASE}/${campaignAId}/queries/${queryAId}/assisted-captures/${sid}`, {
            token: tokens.viewOnly, companyId: companyA._id,
        });
        assert.equal(one.status, 200);
        assert.equal(String(one.json.data.session._id), String(sid));

        const cancel = await api('POST', `${BASE}/${campaignAId}/queries/${queryAId}/assisted-captures/${sid}/cancel`, {
            token: tokens.full, companyId: companyA._id, body: {},
        });
        assert.equal(cancel.status, 200);
        assert.equal(cancel.json.data.session.status, 'cancelled');
    });
});

describe('CP5 HTTP — agent routes', () => {
    it('6-10. claim, browser-open, heartbeat, event ingest, complete; no ExtractedLead', async () => {
        const created = await api('POST', `${BASE}/${campaignAId}/queries/${queryAId}/assisted-captures`, {
            token: tokens.full, companyId: companyA._id,
            body: { idempotencyKey: nextKey('agent'), financialYear: '2025-26' },
        });
        assert.equal(created.status, 201);
        const sid = created.json.data.session._id;
        const agentInstanceId = `http-agent-${TAG}`;

        const claim = await api('POST', `${AGENT_BASE}/assisted-captures/claim`, {
            agentToken: agentTokenPlain,
            body: { sessionId: sid, agentInstanceId },
        });
        assert.equal(claim.status, 200);
        assert.ok(claim.json.data.sessionToken);
        const sessionToken = claim.json.data.sessionToken;
        assert.doesNotMatch(JSON.stringify(claim.json), /tokenHash/);

        const opened = await api('POST', `${AGENT_BASE}/assisted-captures/${sid}/browser-opened`, {
            agentToken: agentTokenPlain, sessionToken,
            body: { agentInstanceId },
        });
        assert.equal(opened.status, 200);
        assert.equal(opened.json.data.session.status, 'awaiting_user');

        const opened2 = await api('POST', `${AGENT_BASE}/assisted-captures/${sid}/browser-opened`, {
            agentToken: agentTokenPlain, sessionToken,
            body: { agentInstanceId },
        });
        assert.equal(opened2.status, 200);

        const hb = await api('POST', `${AGENT_BASE}/assisted-captures/${sid}/heartbeat`, {
            agentToken: agentTokenPlain, sessionToken,
            body: { agentInstanceId, status: 'ready_to_capture' },
        });
        assert.equal(hb.status, 200);

        const missingTok = await api('POST', `${AGENT_BASE}/assisted-captures/${sid}/events`, {
            agentToken: agentTokenPlain,
            body: {
                agentInstanceId,
                eventIdempotencyKey: nextKey('evt'),
                eventSequence: 1,
                visibleResultCount: 1,
                results: [{ title: 'A', resultUrl: `https://http-a-${TAG.toLowerCase()}.example.com/`, resultTypeHint: 'unknown' }],
            },
        });
        assert.equal(missingTok.status, 401);

        const evBody = {
            agentInstanceId,
            eventIdempotencyKey: nextKey('evt'),
            eventSequence: 1,
            visibleResultCount: 1,
            results: [{ title: 'A', resultUrl: `https://http-a-${TAG.toLowerCase()}.example.com/`, resultTypeHint: 'unknown' }],
        };
        const ev = await api('POST', `${AGENT_BASE}/assisted-captures/${sid}/events`, {
            agentToken: agentTokenPlain, sessionToken, body: evBody,
        });
        assert.ok([200, 201].includes(ev.status));
        assert.equal(ev.json.data.idempotentReplay, false);
        assert.ok(ev.json.data.ingest?.batchId);

        const replay = await api('POST', `${AGENT_BASE}/assisted-captures/${sid}/events`, {
            agentToken: agentTokenPlain, sessionToken, body: evBody,
        });
        assert.equal(replay.status, 200);
        assert.equal(replay.json.data.idempotentReplay, true);

        const forbiddenHtml = await api('POST', `${AGENT_BASE}/assisted-captures/${sid}/events`, {
            agentToken: agentTokenPlain, sessionToken,
            body: { ...evBody, eventIdempotencyKey: nextKey('html'), eventSequence: 2, html: '<b>x</b>' },
        });
        assert.equal(forbiddenHtml.status, 400);

        const tooMany = await api('POST', `${AGENT_BASE}/assisted-captures/${sid}/events`, {
            agentToken: agentTokenPlain, sessionToken,
            body: {
                agentInstanceId,
                eventIdempotencyKey: nextKey('max'),
                eventSequence: 3,
                visibleResultCount: 101,
                results: Array.from({ length: 101 }, (_, i) => ({
                    title: `T${i}`, resultUrl: `https://m${i}-${TAG.toLowerCase()}.example.com/`,
                })),
            },
        });
        assert.equal(tooMany.status, 400);

        const done = await api('POST', `${AGENT_BASE}/assisted-captures/${sid}/complete`, {
            agentToken: agentTokenPlain, sessionToken, body: { agentInstanceId },
        });
        assert.equal(done.status, 200);
        assert.equal(done.json.data.session.status, 'completed');

        const afterComplete = await api('POST', `${AGENT_BASE}/assisted-captures/${sid}/events`, {
            agentToken: agentTokenPlain, sessionToken,
            body: {
                agentInstanceId,
                eventIdempotencyKey: nextKey('late'),
                eventSequence: 9,
                visibleResultCount: 1,
                results: [{ title: 'Late', resultUrl: `https://late-${TAG.toLowerCase()}.example.com/` }],
            },
        });
        assert.equal(afterComplete.status, 400);

        assert.equal(await ExtractedLead.countDocuments({}).catch(() => 0), leadsBefore);
        assert.equal(await Lead.countDocuments({}).catch(() => 0), crmBefore);
        assertNoLeak(ev.json);
    });
});
