import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function loadEnvLocal() {
    const p = path.join(root, '.env.local');
    if (!fs.existsSync(p)) return;
    const lines = fs.readFileSync(p, 'utf8').split(/\r?\n/);
    for (const line of lines) {
        const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
        if (!m) continue;
        if (process.env[m[1]] == null) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
}

loadEnvLocal();

export function getConfig() {
    const baseUrl = (process.env.CRM_BASE_URL || 'http://127.0.0.1:5100/api/v1').replace(/\/$/, '');
    const token = process.env.DISCOVERY_AGENT_TOKEN || '';
    if (!token) throw new Error('DISCOVERY_AGENT_TOKEN missing. Set tools/discovery-agent/.env.local');
    return { baseUrl, token };
}

async function api(method, route, body, options = {}) {
    const { baseUrl, token } = getConfig();
    const headers = {
        'Content-Type': 'application/json',
        'X-Discovery-Agent-Token': token,
    };
    if (options.sessionToken) headers['X-Assisted-Session-Token'] = options.sessionToken;

    const controller = new AbortController();
    const timeoutMs = Number(options.timeoutMs || process.env.CRM_HTTP_TIMEOUT_MS || 120000);
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res;
    try {
        res = await fetch(baseUrl + '/data-extractor/discovery/agent' + route, {
            method,
            headers,
            body: body != null ? JSON.stringify(body) : undefined,
            signal: controller.signal,
        });
    } catch (err) {
        clearTimeout(timer);
        const e = new Error(err?.name === 'AbortError' ? 'CRM request timed out' : (err?.message || 'CRM request failed'));
        e.code = err?.name === 'AbortError' ? 'CRM_TIMEOUT' : 'CRM_NETWORK';
        e.retryable = true;
        throw e;
    }
    clearTimeout(timer);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
        const msg = json?.message || json?.error || res.statusText;
        const err = new Error(msg || ('HTTP ' + res.status));
        err.status = res.status;
        err.body = json;
        err.retryable = res.status >= 500 || res.status === 429;
        throw err;
    }
    return json?.data != null ? json.data : json;
}

async function apiWithRetry(method, route, body, options = {}) {
    const retries = Number(options.retries ?? 2);
    let lastErr;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
        try {
            return await api(method, route, body, options);
        } catch (err) {
            lastErr = err;
            if (!err?.retryable || attempt >= retries) throw err;
            await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
        }
    }
    throw lastErr;
}

export const crm = {
    connect: (agentInstanceId) => api('POST', '/connect', { agentInstanceId }),
    getJob: (id) => api('GET', '/jobs/' + id),
    claim: (id, agentInstanceId) => api('POST', '/jobs/' + id + '/claim', { agentInstanceId }),
    heartbeat: (id, payload) => api('POST', '/jobs/' + id + '/heartbeat', payload),
    ingest: (id, payload) => api('POST', '/jobs/' + id + '/records', payload),

    presence: (agentInstanceId) => api('POST', '/presence', { agentInstanceId }),
    pollAssisted: () => api('GET', '/assisted-captures/poll'),
    claimAssisted: ({ sessionId, agentInstanceId }) => api('POST', '/assisted-captures/claim', { sessionId, agentInstanceId }),
    assistedBrowserOpened: (sessionId, body, sessionToken) => api('POST', '/assisted-captures/' + sessionId + '/browser-opened', body, { sessionToken }),
    assistedHeartbeat: (sessionId, body, sessionToken) => api('POST', '/assisted-captures/' + sessionId + '/heartbeat', body, { sessionToken }),
    assistedManual: (sessionId, body, sessionToken) => api('POST', '/assisted-captures/' + sessionId + '/manual-action', body, { sessionToken }),
    assistedEvent: (sessionId, body, sessionToken) => apiWithRetry('POST', '/assisted-captures/' + sessionId + '/events', body, { sessionToken, retries: 2, timeoutMs: 180000 }),
    assistedComplete: (sessionId, body, sessionToken) => api('POST', '/assisted-captures/' + sessionId + '/complete', body, { sessionToken }),
    assistedFail: (sessionId, body, sessionToken) => api('POST', '/assisted-captures/' + sessionId + '/fail', body, { sessionToken }),
    getCaptureRequest: (sessionId, sessionToken, agentInstanceId) => {
        const q = agentInstanceId ? ('?agentInstanceId=' + encodeURIComponent(agentInstanceId)) : '';
        return api('GET', '/assisted-captures/' + sessionId + '/capture-request' + q, undefined, { sessionToken });
    },
    ackCaptureRequest: (sessionId, body, sessionToken) => api('POST', '/assisted-captures/' + sessionId + '/capture-ack', body, { sessionToken }),
    ackNavigateRequest: (sessionId, body, sessionToken) => api('POST', '/assisted-captures/' + sessionId + '/navigate-ack', body, { sessionToken }),
    completeNavigateRequest: (sessionId, body, sessionToken) => api('POST', '/assisted-captures/' + sessionId + '/navigate-complete', body, { sessionToken }),
};
