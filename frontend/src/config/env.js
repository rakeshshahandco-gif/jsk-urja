const isLocal = typeof window !== 'undefined' && 
    (window.location.hostname === 'localhost' || 
     window.location.hostname === '127.0.0.1' || 
     window.location.hostname.startsWith('192.168.'));

const prodBackend = 'https://jsk-urja-backend.onrender.com';

export const env = {
    API_URL: !isLocal ? `${prodBackend}/api/v1` : (import.meta.env.VITE_API_URL || `${window.location.protocol}//${window.location.hostname}:5100/api/v1`),
    SOCKET_URL: !isLocal ? prodBackend : (import.meta.env.VITE_API_URL?.replace('/api/v1', '') || `${window.location.protocol}//${window.location.hostname}:5100`),
};

if (typeof window !== 'undefined') {
    console.log(`🌐 System Environment: ${!isLocal ? 'Production' : 'Local'}`);
    console.log(`🔌 Backend Target: ${env.API_URL}`);
}
