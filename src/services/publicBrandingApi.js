import axios from 'axios';
import { env } from '@/config/env';

const baseURL = env.API_URL.endsWith('/') ? env.API_URL : `${env.API_URL}/`;

export async function fetchPublicBranding(slug = '') {
    const trimmed = String(slug || '').trim();
    const path = trimmed
        ? `public/branding/${encodeURIComponent(trimmed)}`
        : 'public/branding';
    const res = await axios.get(path, { baseURL, timeout: 15000 });
    return res.data?.data ?? res.data;
}
