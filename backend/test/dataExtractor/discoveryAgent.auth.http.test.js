import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import http from 'node:http';
import express from 'express';
import crypto from 'crypto';
import mongoose from 'mongoose';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveCompanyScope } from '../../src/middlewares/companyScope.middleware.js';
import { errorHandler } from '../../src/middlewares/error.middleware.js';
import { Company } from '../../src/models/company.model.js';
import { User } from '../../src/models/user.model.js';
import { DiscoveryAgentToken } from '../../src/models/discoveryAgentToken.model.js';
import { SearchCampaign } from '../../src/models/searchCampaign.model.js';
import { SearchQuery } from '../../src/models/searchQuery.model.js';
import { AssistedCaptureSession } from '../../src/models/assistedCaptureSession.model.js';

const MONGO_URI = process.env.SC_MONGO_URI || process.env.MONGODB_URL || 'mongodb://127.0.0.1:27017/crm_test';
const TAG = `DA-AUTH-${Date.now()}`;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AGENT_INDEX = path.resolve(__dirname, '../../../tools/discovery-agent/src/index.js');

let server; let baseUrl;
let companyA; let companyB;
let plainA = ''; let plainRevoked = ''; let plainExpired = '';
let tokenAId = '';
let sessionBId = '';
let routeImportError = '';
let dataExtractorRoute; let dataExtractorPublicRoute;

function hashToken(plain) {
    return crypto.createHash('sha256').update(String(plain)).digest('hex');
}

function mintPlain() {
    return 'jskdisc_' + crypto.randomBytes(32).toString('hex');
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

async function api(method, pathName, { agentToken, companyId, body } = {}) {
    const headers = { Accept: 'application/json', 'Content-Type': 'application/json' };
    if (agentToken) headers['X-Discovery-Agent-Token'] = agentToken;
    if (companyId) headers['X-Company-Id'] = String(companyId);
    const res = await fetch(new URL(pathName, baseUrl), {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : JSON.stringify({}),
    });
    const text = await res.text();
    let json = {};
    try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
    return { status: res.status, json };
}

function runAgentConnect({ token, baseApiUrl, timeoutMs = 15000 }) {
    return new Promise((resolve) => {
        const child = spawn(process.execPath, [AGENT_INDEX, 'connect'], {
            env: {
                ...process.env,
                DISCOVERY_AGENT_TOKEN: token,
                CRM_BASE_URL: baseApiUrl,
            },
            cwd: path.dirname(path.dirname(AGENT_INDEX)),
            stdio: ['ignore', 'pipe', 'pipe'],
            windowsHide: true,
        });
        let stdout = '';
        let stderr = '';
        const timer = setTimeout(() => {
            try { child.kill(); } catch { /* ignore */ }
            resolve({ code: child.exitCode ?? 1, stdout, stderr, timedOut: true });
        }, timeoutMs);
        child.stdout.on('data', (d) => { stdout += String(d); });
        child.stderr.on('data', (d) => { stderr += String(d); });
        child.on('close', (code) => {
            clearTimeout(timer);
            resolve({ code: code == null ? 1 : code, stdout, stderr, timedOut: false });
        });
    });
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
        companyName: `DA Auth A ${TAG}`,
        isActive: true,
        moduleGuardEnabled: false,
        enabledModules: ['crm', 'data_extractor'],
    });
    companyB = await Company.create({
        companyName: `DA Auth B ${TAG}`,
        isActive: true,
        moduleGuardEnabled: false,
        enabledModules: ['crm', 'data_extractor'],
    });
    const user = await User.create({
        name: 'DA Auth User',
        username: `da.auth.${TAG}`.toLowerCase().replace(/[^a-z0-9.]/g, ''),
        email: `da.auth.${TAG}@t.local`.toLowerCase(),
        password: 'TestPass123!',
        roleName: 'admin',
        allowLogin: true,
        isActive: true,
        companyAccessConfigured: false,
    });

    plainA = mintPlain();
    plainRevoked = mintPlain();
    plainExpired = mintPlain();

    const docA = await DiscoveryAgentToken.create({
        companyId: companyA._id,
        name: `active-${TAG}`,
        tokenHash: hashToken(plainA),
        tokenPrefix: plainA.slice(0, 12),
        createdBy: user._id,
        isActive: true,
        expiresAt: new Date(Date.now() + 86400000),
    });
    tokenAId = String(docA._id);

    await DiscoveryAgentToken.create({
        companyId: companyA._id,
        name: `revoked-${TAG}`,
        tokenHash: hashToken(plainRevoked),
        tokenPrefix: plainRevoked.slice(0, 12),
        createdBy: user._id,
        isActive: false,
        revokedAt: new Date(),
    });

    await DiscoveryAgentToken.create({
        companyId: companyA._id,
        name: `expired-${TAG}`,
        tokenHash: hashToken(plainExpired),
        tokenPrefix: plainExpired.slice(0, 12),
        createdBy: user._id,
        isActive: true,
        expiresAt: new Date(Date.now() - 60000),
    });

    const campaignB = await SearchCampaign.create({
        companyId: companyB._id,
        name: `Camp B ${TAG}`,
        nameNormalized: `camp b ${TAG}`.toLowerCase(),
        targetIndustry: 'Home Automation',
        country: 'India',
        sources: ['google'],
        status: 'active',
    });
    const queryB = await SearchQuery.create({
        companyId: companyB._id,
        campaignId: campaignB._id,
        queryText: `q ${TAG}`,
        queryNormalized: `q ${TAG}`,
        sourceHint: 'google',
        status: 'approved',
        generationMethod: 'manual',
        queryType: 'manual',
        searchUrl: 'https://www.google.com/search?q=auth-isolation',
    });
    const sessionB = await AssistedCaptureSession.create({
        companyId: companyB._id,
        campaignId: campaignB._id,
        queryId: queryB._id,
        source: 'google',
        sourceHint: 'google',
        searchUrl: queryB.searchUrl,
        searchUrlHash: crypto.createHash('sha256').update(queryB.searchUrl).digest('hex'),
        status: 'queued',
        requestFingerprint: crypto.createHash('sha256').update(`fp-${TAG}`).digest('hex'),
        tokenHash: crypto.createHash('sha256').update(`sess-${TAG}`).digest('hex'),
        tokenExpiresAt: new Date(Date.now() + 3600000),
        sessionExpiresAt: new Date(Date.now() + 3600000),
        createdBy: user._id,
    });
    sessionBId = String(sessionB._id);

    server = http.createServer(buildApp());
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    const ids = [companyA?._id, companyB?._id].filter(Boolean);
    if (ids.length) {
        await AssistedCaptureSession.deleteMany({ companyId: { $in: ids } });
        await SearchQuery.deleteMany({ companyId: { $in: ids } });
        await SearchCampaign.deleteMany({ companyId: { $in: ids } });
        await DiscoveryAgentToken.deleteMany({ companyId: { $in: ids } });
        await Company.deleteMany({ _id: { $in: ids } });
    }
    await User.deleteMany({ email: new RegExp(TAG, 'i') });
    await mongoose.disconnect();
});

describe('Discovery Agent auth company-from-token contract', () => {
    it('imports routes', () => {
        assert.equal(routeImportError, '', routeImportError);
    });

    it('1. Valid agent token connects without X-Company-Id', async () => {
        assert.equal(routeImportError, '', routeImportError);
        const res = await api('POST', '/api/v1/data-extractor/discovery/agent/connect', {
            agentToken: plainA,
            body: { agentInstanceId: 'agent-auth-1' },
        });
        assert.equal(res.status, 200, JSON.stringify(res.json));
        assert.equal(res.json?.data?.ok, true);
        assert.equal(res.json?.data?.status, 'WAITING_FOR_TASK');
    });

    it('2. Missing agent token -> 401', async () => {
        const res = await api('POST', '/api/v1/data-extractor/discovery/agent/connect', {
            body: { agentInstanceId: 'agent-auth-missing' },
        });
        assert.equal(res.status, 401);
        assert.match(String(res.json?.message || ''), /X-Discovery-Agent-Token/i);
        assert.equal(String(res.json?.message || '').includes('X-Company-Id'), false);
    });

    it('3. Revoked token -> 401', async () => {
        const res = await api('POST', '/api/v1/data-extractor/discovery/agent/connect', {
            agentToken: plainRevoked,
            body: { agentInstanceId: 'agent-auth-revoked' },
        });
        assert.equal(res.status, 401);
    });

    it('4. Expired token -> 401', async () => {
        const res = await api('POST', '/api/v1/data-extractor/discovery/agent/connect', {
            agentToken: plainExpired,
            body: { agentInstanceId: 'agent-auth-expired' },
        });
        assert.equal(res.status, 401);
    });

    it('5. Token derives correct companyId', async () => {
        const res = await api('POST', '/api/v1/data-extractor/discovery/agent/connect', {
            agentToken: plainA,
            body: { agentInstanceId: 'agent-auth-co' },
        });
        assert.equal(res.status, 200);
        assert.equal(String(res.json?.data?.companyId), String(companyA._id));
        assert.equal(String(res.json?.data?.agentTokenId), tokenAId);
        assert.notEqual(String(res.json?.data?.companyId), String(companyB._id));
    });

    it('6. Company A token cannot access Company B task/session', async () => {
        const res = await api('POST', '/api/v1/data-extractor/discovery/agent/assisted-captures/claim', {
            agentToken: plainA,
            body: { sessionId: sessionBId, agentInstanceId: 'agent-auth-cross' },
        });
        assert.ok([404, 403].includes(res.status), JSON.stringify(res.json));
    });

    it('7. Conflicting X-Company-Id cannot override token company', async () => {
        const res = await api('POST', '/api/v1/data-extractor/discovery/agent/connect', {
            agentToken: plainA,
            companyId: companyB._id,
            body: { agentInstanceId: 'agent-auth-override' },
        });
        assert.equal(res.status, 403);
        assert.match(String(res.json?.message || ''), /Company scope|cannot be overridden/i);
    });

    it('8. Connect failure shuts down cleanly without UV assertion', async () => {
        const result = await runAgentConnect({
            token: plainRevoked,
            baseApiUrl: baseUrl + '/api/v1',
        });
        assert.equal(result.timedOut, false, 'child should exit');
        assert.equal(result.code, 1);
        const combined = `${result.stdout}\n${result.stderr}`;
        assert.match(combined, /Agent error:/i);
        assert.equal(/UV_HANDLE_CLOSING/i.test(combined), false, combined);
        assert.equal(/Assertion failed/i.test(combined), false, combined);
    });

    it('9. Successful connect reaches waiting-for-task state', async () => {
        const result = await runAgentConnect({
            token: plainA,
            baseApiUrl: baseUrl + '/api/v1',
        });
        assert.equal(result.timedOut, false);
        assert.equal(result.code, 0);
        const combined = `${result.stdout}\n${result.stderr}`;
        assert.match(combined, /WAITING_FOR_TASK|Waiting for task/i);
        assert.equal(/UV_HANDLE_CLOSING/i.test(combined), false, combined);
        assert.equal(/Agent error:/i.test(combined), false, combined);
    });
});
