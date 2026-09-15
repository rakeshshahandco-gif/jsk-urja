import http from 'http';
import os from 'os';
import { agentVersion, localHostname, readOrCreateInstallId } from './installId.js';
import { applyCredentialsToEnv, clearCredentials, hasStoredCredentials, writeCredentials } from './credentialStore.js';
import { connectLocalSource, logoutLocalSource } from './sourceConnect.js';
import { normalizeExtractionSource } from './sourceProfile.util.js';

export const LOCAL_PAIR_PORT = 17373;

let server = null;
let onPaired = null;

function json(res, status, body) {
    const payload = JSON.stringify(body);
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(payload),
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end(payload);
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', () => {
            const raw = Buffer.concat(chunks).toString('utf8');
            if (!raw) return resolve({});
            try { resolve(JSON.parse(raw)); } catch (err) { reject(err); }
        });
        req.on('error', reject);
    });
}

function safeCrmBaseUrl(value) {
    const url = String(value || '').trim().replace(/\/$/, '');
    if (!/^https?:\/\/[^\s]+$/i.test(url)) return '';
    return url;
}

async function exchangeWithCrm(pairingCode, crmBaseUrl) {
    const installId = readOrCreateInstallId();
    const hostname = localHostname();
    const res = await fetch(crmBaseUrl + '/data-extractor/discovery/agent/pair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            pairingCode,
            installId,
            hostname,
            deviceName: hostname || os.hostname(),
            agentVersion: agentVersion(),
        }),
    });
    const jsonBody = await res.json().catch(() => ({}));
    if (!res.ok) {
        const err = new Error(jsonBody?.message || jsonBody?.error || ('HTTP ' + res.status));
        err.status = res.status;
        throw err;
    }
    return jsonBody?.data != null ? jsonBody.data : jsonBody;
}

async function handlePair(body) {
    const pairingCode = String(body?.pairingCode || '').trim();
    const crmBaseUrl = safeCrmBaseUrl(body?.crmBaseUrl);
    if (!pairingCode) throw new Error('pairingCode missing');
    if (!crmBaseUrl) throw new Error('crmBaseUrl missing or invalid');
    const data = await exchangeWithCrm(pairingCode, crmBaseUrl);
    if (!data?.token) throw new Error('Pairing did not return a device credential');
    writeCredentials({
        token: data.token,
        crmBaseUrl,
        deviceId: data.deviceId || '',
        deviceName: data.deviceName || localHostname(),
        installId: readOrCreateInstallId(),
    });
    applyCredentialsToEnv();
    if (typeof onPaired === 'function') onPaired(data);
    return {
        ok: true,
        deviceName: data.deviceName || localHostname(),
        reused: Boolean(data.reused),
    };
}

function requestHandler(req, res) {
    if (req.method === 'OPTIONS') {
        res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        });
        res.end();
        return;
    }

    const url = new URL(req.url || '/', 'http://127.0.0.1');

    if (req.method === 'GET' && (url.pathname === '/health' || url.pathname === '/status')) {
        const paired = hasStoredCredentials() || Boolean(process.env.DISCOVERY_AGENT_TOKEN);
        json(res, 200, {
            ok: true,
            installed: true,
            paired,
            product: 'JSK Extraction Agent',
            capabilities: ['web', 'facebook', 'instagram'],
            deviceName: process.env.DISCOVERY_AGENT_DEVICE_NAME || localHostname(),
            version: agentVersion(),
            protocol: 'jskextract',
            legacyProtocol: 'jskdiscovery',
        });
        return;
    }

    if (req.method === 'POST' && url.pathname === '/pair') {
        readBody(req).then((body) => handlePair(body)).then((data) => {
            json(res, 200, data);
        }).catch((err) => {
            json(res, 400, { ok: false, message: String(err && err.message ? err.message : err) });
        });
        return;
    }

    if (req.method === 'POST' && /^\/sources\/(facebook|instagram)\/(connect|logout)$/.test(url.pathname)) {
        const parts = url.pathname.split('/').filter(Boolean);
        const source = normalizeExtractionSource(parts[1]);
        const action = parts[2];
        readBody(req).then(async (body) => {
            const userId = String(body?.userId || process.env.DISCOVERY_AGENT_USER_ID || '').trim();
            if (action === 'logout') return logoutLocalSource({ source, userId });
            return connectLocalSource({ source, userId });
        }).then((data) => {
            json(res, data?.ok === false ? 400 : 200, data);
        }).catch((err) => {
            json(res, 400, { ok: false, message: String(err && err.message ? err.message : err) });
        });
        return;
    }

    if (req.method === 'POST' && url.pathname === '/start') {
        json(res, 200, { ok: true, paired: hasStoredCredentials() || Boolean(process.env.DISCOVERY_AGENT_TOKEN) });
        return;
    }

    if (req.method === 'POST' && url.pathname === '/forget') {
        clearCredentials();
        delete process.env.DISCOVERY_AGENT_TOKEN;
        json(res, 200, { ok: true, paired: false });
        return;
    }

    json(res, 404, { ok: false, message: 'Not found' });
}

export function startLocalPairServer(options = {}) {
    if (server) {
        if (options.onPaired) onPaired = options.onPaired;
        return server;
    }
    onPaired = options.onPaired || null;
    server = http.createServer(requestHandler);
    server.listen(LOCAL_PAIR_PORT, '127.0.0.1', () => {
        console.log('Local pairing listener on http://127.0.0.1:' + LOCAL_PAIR_PORT);
    });
    server.on('error', (err) => {
        if (err && err.code === 'EADDRINUSE') {
            console.log('Local pairing listener already running on port', LOCAL_PAIR_PORT);
            return;
        }
        console.error('Local pairing listener error:', err && err.message ? err.message : err);
    });
    return server;
}
