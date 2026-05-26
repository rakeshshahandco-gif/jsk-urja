/** True when the UI is opened on a loopback / LAN host (not a public deploy hostname). */
const isLocalHostname =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1' ||
        window.location.hostname === '[::1]' ||
        window.location.hostname === '::1' ||
        window.location.hostname === '0.0.0.0' ||
        window.location.hostname.startsWith('192.168.'));

/** Vite dev server — always talk to local backend even if hostname is unusual (IPv6, 0.0.0.0, tunnel, etc.). */
const isViteDev = typeof import.meta !== 'undefined' && import.meta.env?.DEV;

const useLocalBackend = isViteDev || isLocalHostname;

const prodBackend = 'https://jsk-urja-backend.onrender.com';

// FORCE LOCAL TO 5000 FOR STABILITY
export const env = {
    API_URL: !useLocalBackend ? `${prodBackend}/api/v1` : `http://localhost:5000/api/v1`,
    SOCKET_URL: !useLocalBackend ? prodBackend : `http://localhost:5000`,
};

if (typeof window !== 'undefined') {
    console.log(`🌐 System Environment: ${!useLocalBackend ? 'Production' : 'Local'}`);
    console.log(`🔌 Backend Target: ${env.API_URL}`);
}
