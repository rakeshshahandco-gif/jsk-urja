import puppeteer from 'puppeteer';
import { readSocialSession, writeSocialSession, socialUserDataDir, clearSocialSession } from './sessionStore.util.js';
import { classifyFacebookUrl, classifyInstagramUrl } from './classify.util.js';

const LAUNCH_ARGS = ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'];

async function withSocialBrowser(platform, companyId, fn, { headless = false } = {}) {
    const userDataDir = socialUserDataDir(platform, companyId);
    const browser = await puppeteer.launch({
        headless: headless ? 'new' : false,
        userDataDir,
        args: LAUNCH_ARGS,
    });
    try {
        const page = await browser.newPage();
        page.setDefaultTimeout(25000);
        return await fn(page);
    } finally {
        await browser.close().catch(() => {});
    }
}

function facebookLoggedInCookies(cookies = []) {
    return cookies.some((c) => c.name === 'c_user' || c.name === 'xs');
}

function instagramLoggedInCookies(cookies = []) {
    return cookies.some((c) => c.name === 'sessionid' || c.name === 'ds_user_id');
}

export async function connectSocialLogin({ platform, companyId }) {
    const home = platform === 'instagram' ? 'https://www.instagram.com/' : 'https://www.facebook.com/';
    const result = await withSocialBrowser(platform, companyId, async (page) => {
        await page.goto(home, { waitUntil: 'domcontentloaded' });
        const deadline = Date.now() + 120000;
        while (Date.now() < deadline) {
            const cookies = await page.cookies();
            const ok = platform === 'instagram' ? instagramLoggedInCookies(cookies) : facebookLoggedInCookies(cookies);
            if (ok) {
                return { ok: true };
            }
            await new Promise((r) => setTimeout(r, 2000));
        }
        return { ok: false, reason: 'Login was not completed in time. Complete login in the browser window (CAPTCHA is not bypassed).' };
    }, { headless: false });

    if (result.ok) {
        return writeSocialSession(platform, companyId, {
            status: 'connected',
            connectedAt: new Date().toISOString(),
            note: 'Authenticated session stored in an isolated Data Extractor profile. Not WhatsApp.',
        });
    }
    return writeSocialSession(platform, companyId, {
        status: 'disconnected',
        note: result.reason,
    });
}

export async function disconnectSocialLogin({ platform, companyId }) {
    return clearSocialSession(platform, companyId);
}

export function getSocialLoginStatus({ platform, companyId }) {
    return readSocialSession(platform, companyId);
}

function searchUrl(platform, keyword, searchType) {
    const q = encodeURIComponent(keyword);
    if (platform === 'instagram') {
        if (searchType === 'hashtag_topic') return `https://www.instagram.com/explore/tags/${encodeURIComponent(String(keyword).replace(/^#/, ''))}/`;
        return `https://www.instagram.com/explore/search/keyword/?q=${q}`;
    }
    if (searchType === 'groups' || searchType === 'group_intelligence') {
        return `https://www.facebook.com/search/groups/?q=${q}`;
    }
    if (searchType === 'posts') return `https://www.facebook.com/search/posts/?q=${q}`;
    return `https://www.facebook.com/search/pages/?q=${q}`;
}

export async function discoverWithDirectLogin({ platform, companyId, keyword, location = '', searchType, maxResults = 20 }) {
    const session = readSocialSession(platform, companyId);
    if (session.status !== 'connected') {
        return {
            records: [],
            errors: ['Direct login is disconnected. Connect first, then search only data visible to that session.'],
            session,
        };
    }

    try {
        const collected = await withSocialBrowser(platform, companyId, async (page) => {
            await page.goto(searchUrl(platform, keyword, searchType), { waitUntil: 'domcontentloaded' });
            const hrefs = await page.evaluate(() => Array.from(document.querySelectorAll('a[href]'))
                .map((a) => a.href)
                .filter(Boolean)
                .slice(0, 80));
            return hrefs;
        }, { headless: false });

        const records = [];
        const seen = new Set();
        for (const href of collected) {
            const classified = platform === 'instagram'
                ? classifyInstagramUrl(href, searchType)
                : classifyFacebookUrl(href, searchType);
            if (!classified) continue;
            const key = classified.pageUrl.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            records.push({
                title: classified.handle,
                snippet: searchType === 'group_intelligence'
                    ? 'Visible group listing only. Full member enumeration is not performed (Facebook Groups API deprecated).'
                    : (searchType === 'community_intelligence'
                        ? 'Community/profile signal visible to the authenticated session. Follower dumps are not collected.'
                        : ''),
                resultUrl: classified.pageUrl,
                resultTypeHint: classified.resultTypeHint,
                sourceRecordId: `${platform}:${classified.handle}`.slice(0, 300),
                notes: [
                    `source=${platform}`,
                    'mode=direct_login',
                    `searchType=${searchType}`,
                    `keyword=${keyword}`,
                    String(location || '').trim() ? `location=${String(location).trim()}` : '',
                    `evidenceUrl=${classified.pageUrl}`,
                    `extractedAt=${new Date().toISOString()}`,
                ].filter(Boolean).join('; ').slice(0, 2000),
            });
            if (records.length >= maxResults) break;
        }
        writeSocialSession(platform, companyId, { status: 'connected' });
        return { records, errors: [], session: readSocialSession(platform, companyId) };
    } catch (err) {
        writeSocialSession(platform, companyId, {
            status: 'expired',
            note: String(err?.message || 'Direct session failed').slice(0, 240),
        });
        return {
            records: [],
            errors: [String(err?.message || 'Direct search failed').slice(0, 240)],
            session: readSocialSession(platform, companyId),
        };
    }
}
