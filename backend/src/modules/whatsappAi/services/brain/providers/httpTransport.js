/**
 * Phase 1C.4 — HTTPS transport abstraction (no vendor SDK).
 * Injected fetch; adapters stay SDK-free.
 */

export function createHttpTransport(options = {}) {
    const fetchImpl = options.fetchImpl || globalThis.fetch;
    const defaultTimeoutMs = Number(options.timeoutMs) || 15000;

    return {
        async request({ url, method = 'POST', headers = {}, body, timeoutMs }) {
            if (typeof fetchImpl !== 'function') {
                const err = new Error('HTTP fetch is not available in this runtime');
                err.code = 'WHATSAPP_AI_HTTP_UNAVAILABLE';
                throw err;
            }
            const ms = Number(timeoutMs) || defaultTimeoutMs;
            const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
            const timer = controller ? setTimeout(() => controller.abort(), ms) : null;
            try {
                const res = await fetchImpl(url, {
                    method,
                    headers: { 'Content-Type': 'application/json', ...headers },
                    body: body == null ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)),
                    signal: controller?.signal,
                });
                const text = await res.text();
                let json = null;
                try { json = text ? JSON.parse(text) : null; } catch { json = null; }
                return { ok: res.ok, status: res.status, text, json };
            } finally {
                if (timer) clearTimeout(timer);
            }
        },
    };
}

export default createHttpTransport;
