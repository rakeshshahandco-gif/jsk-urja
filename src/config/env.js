const hostname =
    typeof window !== 'undefined' ? window.location.hostname : '';

/** Hosted on Render (never use localhost:5000 on these hosts). */
const isRenderHost = hostname.endsWith('.onrender.com');

/** Backend service serves API + built frontend on the same origin. */
const isBackendRenderService = hostname === 'jsk-urja-backend.onrender.com';

/** True when the UI is opened on a loopback / LAN host (not a public deploy hostname). */
const isLocalHostname =
    !isRenderHost &&
    (hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname === '[::1]' ||
        hostname === '::1' ||
        hostname === '0.0.0.0' ||
        hostname.startsWith('192.168.'));

/** Vite dev server — always talk to local backend even if hostname is unusual. */
const isViteDev =
    typeof import.meta !== 'undefined' && import.meta.env?.DEV && !isRenderHost;

const useLocalBackend = isViteDev || isLocalHostname;

const prodBackend = 'https://jsk-urja-backend.onrender.com';

// On Render: same-origin when API+UI share one service; otherwise call backend URL.
// Local dev: always localhost:5000.
export const env = {
    API_URL: useLocalBackend
        ? 'http://localhost:5000/api/v1'
        : isBackendRenderService
            ? `${window.location.origin}/api/v1`
            : `${prodBackend}/api/v1`,
    SOCKET_URL: useLocalBackend
        ? 'http://localhost:5000'
        : isBackendRenderService
            ? window.location.origin
            : prodBackend,
};

if (typeof window !== 'undefined') {
    console.log(`🌐 System Environment: ${!useLocalBackend ? 'Production' : 'Local'}`);
    console.log(`🔌 Backend Target: ${env.API_URL}`);
}
