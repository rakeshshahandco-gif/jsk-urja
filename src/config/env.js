const isRender = typeof window !== 'undefined' && window.location.hostname.includes('onrender.com');
const prodBackend = 'https://jsk-urja-backend.onrender.com';

export const env = {
    API_URL: isRender ? `${prodBackend}/api/v1` : (import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1'),
    SOCKET_URL: isRender ? prodBackend : (import.meta.env.VITE_API_URL?.replace('/api/v1', '') || 'http://localhost:5000'),
};
