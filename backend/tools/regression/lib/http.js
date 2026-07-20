export async function api(base, method, urlPath, { token, companyId, body, timeoutMs = 15000 } = {}) {
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (companyId) headers['X-Company-Id'] = String(companyId);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(`${base}${urlPath}`, {
            method,
            headers,
            body: body !== undefined ? JSON.stringify(body) : undefined,
            signal: controller.signal,
        });
        let data = null;
        const text = await res.text();
        try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
        return { status: res.status, data, ok: res.ok };
    } finally {
        clearTimeout(timer);
    }
}

export async function health(base) {
    try {
        return await api(base, 'GET', '/api/v1/health', { timeoutMs: 8000 });
    } catch (err) {
        return { status: 0, data: null, ok: false, error: err.message || String(err) };
    }
}

export async function login(base, username, password) {
    const r = await api(base, 'POST', '/api/v1/auth/login', {
        body: { username, password },
    });
    const payload = r.data?.data || {};
    const token = payload.token
        || payload.accessToken
        || payload.tokens?.accessToken
        || null;
    return {
        status: r.status,
        token,
        user: payload,
        companyContext: payload.companyContext || null,
        data: r.data,
    };
}
