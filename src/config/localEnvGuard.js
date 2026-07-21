import { env } from './env';
import { LOCAL_APP_EXPECTATION } from './localAppExpectation';

/**
 * Local-only backend identity guard.
 * Runs ONLY on localhost browser hosts during Vite DEV.
 * Never runs on Render / production (any non-loopback hostname).
 */
function isLocalBrowserHost() {
    if (typeof window === 'undefined') return false;
    const host = String(window.location.hostname || '').toLowerCase();
    return (
        host === 'localhost' ||
        host === '127.0.0.1' ||
        host === '[::1]' ||
        host === '::1'
    );
}

export async function verifyLocalBackendIdentity() {
    // Production / Render / any remote host: skip entirely.
    if (!isLocalBrowserHost()) {
        return { ok: true, skipped: true };
    }
    // Localhost but production build: skip (API already resolved via env.js).
    if (!import.meta.env.DEV) {
        return { ok: true, skipped: true };
    }

    const expected = LOCAL_APP_EXPECTATION;
    const apiUrl = String(env.API_URL || '');
    // Extra safety: if API is not loopback, this is not a local-backend session.
    if (!/localhost|127\.0\.0\.1|\[::1\]/i.test(apiUrl)) {
        return { ok: true, skipped: true };
    }

    const portMatch = apiUrl.match(/:(\d+)(?:\/|$)/);
    const connectedPort = portMatch ? Number(portMatch[1]) : null;

    if (connectedPort && connectedPort !== expected.backendPort) {
        return {
            ok: false,
            message: `${expected.label} frontend expected backend ${expected.applicationKey} on port ${expected.backendPort}, but API base points to port ${connectedPort}. Connection blocked.`,
            details: {
                frontend: expected.label,
                expectedBackend: `${expected.applicationKey} :${expected.backendPort}`,
                connectedBackend: `API base :${connectedPort}`,
                apiUrl,
            },
        };
    }

    const healthUrl = `${apiUrl.replace(/\/$/, '')}/health`;
    let health;
    try {
        const res = await fetch(healthUrl, { method: 'GET', cache: 'no-store' });
        if (!res.ok) {
            return {
                ok: false,
                message: `Cannot verify backend identity (${res.status}). Start the ${expected.label} backend on port ${expected.backendPort}.`,
                details: { healthUrl, status: res.status },
            };
        }
        health = await res.json();
    } catch (err) {
        return {
            ok: false,
            message: `Cannot reach ${expected.label} backend at ${healthUrl}. Start backend on port ${expected.backendPort}.`,
            details: { healthUrl, error: err?.message || String(err) },
        };
    }

    const key = String(health.applicationKey || '').trim();
    const industry = String(health.industryType || '').trim();
    const port = Number(health.port) || connectedPort;

    if (key !== expected.applicationKey || industry !== expected.industryType || port !== expected.backendPort) {
        return {
            ok: false,
            message: [
                'LOCAL ENVIRONMENT MISMATCH',
                '',
                `Frontend: ${expected.label}`,
                `Expected Backend: ${expected.applicationKey} :${expected.backendPort}`,
                `Connected Backend: ${key || '(unset)'} :${port || '?'} (${industry || 'industry unset'})`,
                '',
                `Action: Stop the wrong backend and restart the ${expected.label} backend.`,
            ].join('\n'),
            details: {
                frontend: expected.label,
                expectedBackend: `${expected.applicationKey} :${expected.backendPort}`,
                connectedBackend: `${key} :${port}`,
                health,
            },
        };
    }

    return { ok: true, health };
}

export default verifyLocalBackendIdentity;
