const hostname =
    typeof window !== 'undefined' ? window.location.hostname : '';

/** Hosted on Render (never use localhost:5000 on these hosts). */
const isRenderHost = hostname.endsWith('.onrender.com');

/** Combined API + UI on same Render Web Service. */
const isJskBackendRenderService = hostname === 'jsk-urja-backend.onrender.com';
const isHandloomBackendRenderService = hostname === 'handloom-crm-backend.onrender.com';
/** Combined staging service — must never fall through to production API. */
const isJskStagingRenderService =
    hostname === 'jsk-urja-staging.onrender.com' ||
    /^jsk-urja-staging(?:-[a-z0-9]+)?\.onrender\.com$/i.test(hostname);
const isSameOriginRenderBackend =
    isJskBackendRenderService || isHandloomBackendRenderService || isJskStagingRenderService;

/** Handloom static frontend → dedicated Handloom backend (not JSK). */
const isHandloomFrontendRenderService = hostname === 'handloom-crm-frontend.onrender.com';
const HANDLOOM_BACKEND_ORIGIN = 'https://handloom-crm-backend.onrender.com';

/** True when the UI is opened on a loopback / LAN host (not a public deploy hostname). */
const isLocalHostname =
    !isRenderHost &&
    (hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname === '[::1]' ||
        hostname === '::1' ||
        hostname === '0.0.0.0' ||
        hostname === '10.0.2.2' ||
        hostname.startsWith('192.168.'));

/** Vite dev server — always talk to local backend even if hostname is unusual. */
const isViteDev =
    typeof import.meta !== 'undefined' && import.meta.env?.DEV && !isRenderHost;

const useLocalBackend = isViteDev || isLocalHostname;

const prodBackend = 'https://jsk-urja-backend.onrender.com';

const viteApiUrl =
    typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL
        ? String(import.meta.env.VITE_API_URL).trim()
        : '';
const viteSocketUrl =
    typeof import.meta !== 'undefined' && import.meta.env?.VITE_SOCKET_URL
        ? String(import.meta.env.VITE_SOCKET_URL).trim()
        : '';

/** PC browser: localhost. Phone/emulator on LAN: same host as CRM page (e.g. 192.168.x.x or 10.0.2.2). */
const localBackendHost =
    typeof window !== 'undefined' &&
    (hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname === '[::1]' ||
        hostname === '::1')
        ? 'localhost'
        : hostname || 'localhost';

function stripTrailingSlash(url) {
    return String(url || '').replace(/\/$/, '');
}

function isLoopbackApiUrl(url) {
    return /^(https?:\/\/)?(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(String(url || '').trim());
}

function resolveProductionApiUrl() {
    // Staging combined service must stay on its own origin — never production.
    if (isJskStagingRenderService) return `${window.location.origin}/api/v1`;
    // Never bake localhost into production: a local VITE_API_URL would break every other PC.
    if (viteApiUrl && !isLoopbackApiUrl(viteApiUrl)) return stripTrailingSlash(viteApiUrl);
    if (isSameOriginRenderBackend) return `${window.location.origin}/api/v1`;
    if (isHandloomFrontendRenderService) return `${HANDLOOM_BACKEND_ORIGIN}/api/v1`;
    return `${prodBackend}/api/v1`;
}

function resolveProductionSocketUrl() {
    if (isJskStagingRenderService) return window.location.origin;
    if (viteSocketUrl && !isLoopbackApiUrl(viteSocketUrl)) return stripTrailingSlash(viteSocketUrl);
    if (isSameOriginRenderBackend) return window.location.origin;
    if (isHandloomFrontendRenderService) return HANDLOOM_BACKEND_ORIGIN;
    return prodBackend;
}

// On Render: same-origin when API+UI share one service; Handloom static site → Handloom backend.
// Local: prefer VITE_API_URL / VITE_SOCKET_URL when set (JSK backend on :5100); else default :5000.
export const env = {
    API_URL: useLocalBackend
        ? (viteApiUrl || `http://${localBackendHost}:5000/api/v1`)
        : resolveProductionApiUrl(),
    SOCKET_URL: useLocalBackend
        ? (viteSocketUrl || `http://${localBackendHost}:5000`)
        : resolveProductionSocketUrl(),
    /** Textile FG transfer demo — localhost / LAN only, never on Render production. */
    TEXTILE_DEMO_ENABLED: useLocalBackend,
};

if (typeof window !== 'undefined') {
    const lane = useLocalBackend ? 'Local' : isJskStagingRenderService ? 'Staging' : 'Production';
    console.log(`🌐 System Environment: ${lane}`);
    console.log(`🔌 Backend Target: ${env.API_URL}`);
}
