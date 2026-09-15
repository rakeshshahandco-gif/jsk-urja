import { crm } from './crmClient.js';
import { openIsolatedSourceContext, clearIsolatedSourceProfile } from './browserSession.js';
import { normalizeExtractionSource } from './sourceProfile.util.js';

const LOGIN_WAIT_MS = 10 * 60 * 1000;
const HOME = {
    facebook: 'https://www.facebook.com/',
    instagram: 'https://www.instagram.com/',
};

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

function isFacebookLoggedIn(cookies = []) {
    return cookies.some((c) => c && (c.name === 'c_user' || c.name === 'xs'));
}

function isInstagramLoggedIn(cookies = []) {
    return cookies.some((c) => c && (c.name === 'sessionid' || c.name === 'ds_user_id'));
}

function loggedIn(source, cookies) {
    return source === 'instagram' ? isInstagramLoggedIn(cookies) : isFacebookLoggedIn(cookies);
}

export async function connectLocalSource({ source, userId }) {
    const src = normalizeExtractionSource(source);
    if (src !== 'facebook' && src !== 'instagram') {
        throw new Error('Unsupported source');
    }
    if (!userId) throw new Error('userId is required');
    const { context, page } = await openIsolatedSourceContext(userId, src);
    try {
        await page.goto(HOME[src], { waitUntil: 'domcontentloaded' });
        const deadline = Date.now() + LOGIN_WAIT_MS;
        while (Date.now() < deadline) {
            const cookies = await context.cookies().catch(() => []);
            if (loggedIn(src, cookies)) {
                const now = new Date().toISOString();
                await crm.reportSourceStatus(src, {
                    status: 'connected',
                    connectedAt: now,
                    lastVerifiedAt: now,
                    lastSeen: now,
                }).catch(() => {});
                return { ok: true, source: src, status: 'connected' };
            }
            await sleep(2000);
        }
        await crm.reportSourceStatus(src, {
            status: 'disconnected',
            note: 'Login was not completed in time',
        }).catch(() => {});
        return { ok: false, source: src, status: 'disconnected', message: 'Login was not completed in time' };
    } finally {
        await context.close().catch(() => {});
    }
}

export async function logoutLocalSource({ source, userId }) {
    const src = normalizeExtractionSource(source);
    if (src !== 'facebook' && src !== 'instagram') {
        throw new Error('Unsupported source');
    }
    await clearIsolatedSourceProfile(userId, src);
    await crm.reportSourceStatus(src, { status: 'disconnected', note: 'Logged out on this PC' }).catch(() => {});
    return { ok: true, source: src, status: 'disconnected' };
}
