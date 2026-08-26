import puppeteer from 'puppeteer';
import fs from 'fs';
import { readSocialSession, writeSocialSession, socialUserDataDir, clearSocialSession } from './sessionStore.util.js';
import { classifyFacebookUrl, classifyInstagramUrl } from './classify.util.js';
import { extractWebsiteFromInstagramEvidence, stampInstagramWebsiteOnCandidate } from './instagramWebsiteBridge.util.js';
import {
    FACEBOOK_COMMUNITY_BATCH_SIZE,
    FACEBOOK_COMMUNITY_SEARCH_TYPES,
    FACEBOOK_DISCOVERY_TYPES,
    FACEBOOK_PEOPLE_TAB_MAX_REVIEW_PER_RUN,
    FACEBOOK_STOP_REASONS,
    addSeenKey as addFbSeenKey,
    classifyFacebookCommunityRelevance,
    detectFacebookGroupPeopleUi,
    emptyGroupAnalytics,
    emptyPageAnalytics,
    extractPublicContactFields,
    facebookIdentityDigitsFromText,
    facebookCompanyFirst,
    facebookGroupIdFromUrl,
    isAlreadySeen as isFbAlreadySeen,
    JOINED_GROUP_IDLE_STOP,
    JOINED_GROUP_SCROLL_SAFETY,
    normalizeFacebookGroupUrl,
    parseExactFacebookGroupSeek,
    parseDisplayedCount,
    parseFacebookGroupMembership,
    resolveFacebookStopReason,
    shouldStopJoinedGroupDiscovery,
    shouldIngestFacebookCommunity,
    stripFacebookGroupChrome,
} from './facebookCommunity.util.js';
import {
    FACEBOOK_MEMBER_DISCOVERY_BATCH,
    FACEBOOK_MEMBER_REVIEW_BATCH,
    FACEBOOK_MEMBER_STUCK_SCROLLS,
    FACEBOOK_MEMBER_SCROLL_MAX_PER_RUN,
    FACEBOOK_MEMBER_FULL_SCROLL_SAFETY,
    FACEBOOK_MEMBER_COLLECTOR_MODES,
    shouldInlineReviewAfterDiscovery,
} from './facebookMemberCollector.util.js';
import {
    INSTAGRAM_BATCH_SIZE,
    INSTAGRAM_STOP_REASONS,
    addSeenKey,
    instagramSessionExpiredFromUrl,
    isAlreadySeen,
    resolveInstagramStopReason,
} from './instagramBatch.util.js';
import { connectLinkedInOrXLogin, discoverLinkedInOrXDirect } from './linkedinX.directLogin.adapter.js';
import {
    detectPlatformChallenge,
    displayNameFromSocialText,
    extractExternalWebsite,
    extractVisibleEmail,
    extractVisiblePhone,
    instagramHashtagCandidates,
    isFacebookProfilePhp,
    facebookGroupGeoPenalty,
    facebookGroupNameCloseness,
    pickRelevantFacebookPage,
    rankFacebookGroups,
    shouldKeepGroupParticipant,
    shouldKeepInstagramAccount,
    shouldKeepProfilePhp,
    textHasKeywordEvidence,
    unwrapSocialHref,
} from './directLogin.quality.util.js';

const LAUNCH_ARGS = ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'];
const LOGIN_WAIT_MS = 10 * 60 * 1000;
const HYDRATION_TIMEOUT_MS = 18000;
const STABILIZE_MS = 1100;
const HUMAN_DELAY_MS = 900;
const SCROLL_MAX = 12;
const SCROLL_IDLE_STOP = 3;
const PEOPLE_CARD_WAIT_MS = 12000;
const PEOPLE_SCROLL_STUCK_PASSES = 3;
const PROFILE_ENRICH_MAX = 8;
const GROUP_POSTS_REVIEW_MAX = 20;

function resolveChromeExecutable() {
    const fromEnv = String(process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_PATH || '').trim();
    if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;
    const candidates = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        `${process.env.LOCALAPPDATA || ''}\\Google\\Chrome\\Application\\chrome.exe`,
    ];
    return candidates.find((p) => p && fs.existsSync(p)) || '';
}

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

const BROWSER_LAUNCH_TIMEOUT_MS = 30000;

async function launchSocialBrowser(launchOpts) {
    const launchPromise = puppeteer.launch(launchOpts);
    let timer;
    const timeoutPromise = new Promise((_, reject) => {
        timer = setTimeout(() => {
            const err = new Error(
                'Chrome did not start within 30 seconds. Close leftover Data Extractor Chrome windows and try again.',
            );
            err.code = 'LAUNCH_TIMEOUT';
            reject(err);
        }, BROWSER_LAUNCH_TIMEOUT_MS);
    });
    try {
        return await Promise.race([launchPromise, timeoutPromise]);
    } catch (err) {
        launchPromise.then((browser) => browser.close()).catch(() => {});
        throw err;
    } finally {
        clearTimeout(timer);
    }
}

async function withSocialBrowser(platform, companyId, fn, { headless = false } = {}) {
    const userDataDir = socialUserDataDir(platform, companyId);
    const executablePath = resolveChromeExecutable();
    const launchOpts = {
        headless: headless ? 'new' : false,
        userDataDir,
        args: LAUNCH_ARGS,
    };
    if (executablePath) launchOpts.executablePath = executablePath;
    const browser = await launchSocialBrowser(launchOpts);
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
    if (platform === 'linkedin' || platform === 'x') {
        return connectLinkedInOrXLogin({ platform, companyId });
    }
    const home = platform === 'instagram' ? 'https://www.instagram.com/' : 'https://www.facebook.com/';
    const result = await withSocialBrowser(platform, companyId, async (page) => {
        await page.goto(home, { waitUntil: 'domcontentloaded' });
        const deadline = Date.now() + LOGIN_WAIT_MS;
        while (Date.now() < deadline) {
            const cookies = await page.cookies();
            const ok = platform === 'instagram' ? instagramLoggedInCookies(cookies) : facebookLoggedInCookies(cookies);
            if (ok) {
                return { ok: true };
            }
            await sleep(2000);
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

function searchUrl(platform, keyword, searchType, location = '') {
    const q = encodeURIComponent([keyword, location].filter(Boolean).join(' ').trim());
    if (platform === 'instagram') {
        if (searchType === 'hashtag_topic') {
            const tag = encodeURIComponent(String(keyword).replace(/^#/, '').replace(/\s+/g, ''));
            return `https://www.instagram.com/explore/tags/${tag}/`;
        }
        return `https://www.instagram.com/explore/search/keyword/?q=${q}`;
    }
    if (searchType === 'groups' || searchType === 'group_intelligence') {
        return `https://www.facebook.com/search/groups/?q=${encodeURIComponent(keyword)}`;
    }
    if (searchType === 'posts') return `https://www.facebook.com/search/posts/?q=${q}`;
    return `https://www.facebook.com/search/pages/?q=${q}`;
}

function emptyMetrics() {
    return {
        rawDirectResults: 0,
        validBusinessCandidates: 0,
        rejectedNavigationNoise: 0,
        rejectedNoEvidence: 0,
        externalWebsitesFound: 0,
        hydration: '',
        challenge: '',
        accessibleRecordsReviewed: 0,
    };
}

function toDirectCandidate(classified, {
    platform, keyword, location, searchType,
    title = '', snippet = '', website = '', extraNotes = '',
}) {
    const name = String(title || classified.handle || '').slice(0, 500);
    const notes = [
        `source=${platform}`,
        'mode=direct_login',
        `searchType=${searchType}`,
        `keyword=${keyword}`,
        String(location || '').trim() ? `location=${String(location).trim()}` : '',
        `evidenceUrl=${classified.pageUrl}`,
        website ? `website=${website}` : '',
        extraNotes,
        `extractedAt=${new Date().toISOString()}`,
    ].filter(Boolean).join('; ').slice(0, 2000);
    const rec = {
        title: name,
        snippet: String(snippet || '').slice(0, 2000),
        resultUrl: classified.pageUrl,
        resultTypeHint: classified.resultTypeHint,
        sourceRecordId: `${platform}:${classified.handle}`.slice(0, 300),
        notes,
    };
    if (website) rec.website = website;
    return rec;
}

async function readChallenge(page) {
    const pageUrl = page.url();
    const text = await page.evaluate(() => (document.body ? document.body.innerText : '').slice(0, 5000)).catch(() => '');
    return detectPlatformChallenge(text, pageUrl);
}

async function waitNetworkQuiet(page) {
    if (typeof page.waitForNetworkIdle === 'function') {
        await page.waitForNetworkIdle({ idleTime: 700, timeout: 8000 }).catch(() => {});
    }
    await sleep(STABILIZE_MS);
}

async function gotoSafe(page, url) {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await waitNetworkQuiet(page);
    return readChallenge(page);
}

function browserExtractFacebookCards() {
    const main = document.querySelector('[role="main"]') || document.body;
    if (!main) return [];
    const items = [];
    const seen = new Set();
    const links = Array.from(main.querySelectorAll('a[href]'));
    for (const a of links) {
        if (a.closest('[role="banner"]') || a.closest('[role="navigation"]') || a.closest('div[role="banner"]')) continue;
        const href = a.href || '';
        if (!href || !/facebook\.com/i.test(href)) continue;
        const container = a.closest('[role="article"]')
            || a.closest('[role="listitem"]')
            || a.parentElement;
        const cardText = [a.innerText, container && container !== a ? container.innerText : '']
            .filter(Boolean)
            .join('\n')
            .slice(0, 500);
        const name = (a.getAttribute('aria-label') || a.innerText || '')
            .split('\n').map((s) => s.trim()).find(Boolean) || '';
        const key = href.split('?')[0].toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        items.push({ href, name: name.slice(0, 200), cardText });
    }
    return items.slice(0, 80);
}

function browserExtractFacebookGroupCards() {
    const main = document.querySelector('[role="main"]') || document.body;
    if (!main) return [];
    const items = [];
    const seen = new Set();
    const skipSlug = /^(search|feed|joins|discover|notifications|create)$/i;
    for (const a of main.querySelectorAll('a[href*="/groups/"]')) {
        if (a.closest('[role="banner"]') || a.closest('[role="navigation"]')) continue;
        const href = a.href || '';
        const m = href.match(/facebook\.com\/groups\/([^/?#]+)/i);
        if (!m) continue;
        const slug = m[1];
        if (skipSlug.test(slug)) continue;
        if (/\/groups\/[^/]+\/(user|members|people|posts|permalink)/i.test(href)) continue;
        const pageUrl = `https://www.facebook.com/groups/${slug}`;
        const key = pageUrl.toLowerCase();
        if (seen.has(key)) continue;
        const card = a.closest('[role="article"]')
            || a.closest('[role="listitem"]')
            || a.closest('[role="list"] > div')
            || a.parentElement;
        const name = (a.getAttribute('aria-label') || a.innerText || '')
            .split('\n').map((s) => s.trim()).find(Boolean) || '';
        if (!name || /^(see all|groups|join|joined|manage|invite)$/i.test(name)) continue;
        const controls = Array.from((card || a).querySelectorAll('[role="button"], button'))
            .map((el) => (el.getAttribute('aria-label') || el.innerText || '').trim().split('\n')[0])
            .filter((t) => t && t.length < 40);
        seen.add(key);
        items.push({
            href: pageUrl,
            name: name.slice(0, 200),
            cardText: ((card && card.innerText) || a.innerText || '').slice(0, 800),
            controls: controls.slice(0, 12),
        });
    }
    return items.slice(0, 80);
}

function browserExtractInstagramCards(loggedInUsername) {
    const root = document.querySelector('[role="listbox"]')
        || document.querySelector('[role="dialog"]')
        || document.querySelector('[role="main"]')
        || document.body;
    if (!root) return [];
    const reserved = new Set(['explore', 'popular', 'reels', 'stories', 'accounts', 'direct', 'about', 'legal', 'p', 'reel', 'tv']);
    const items = [];
    const seen = new Set();
    const own = String(loggedInUsername || '').replace(/^@/, '').toLowerCase();
    for (const a of root.querySelectorAll('a[href]')) {
        const hrefAttr = a.getAttribute('href') || '';
        const m = hrefAttr.match(/^\/([A-Za-z0-9._]+)\/?(\?.*)?$/);
        if (!m) continue;
        const handle = m[1];
        if (reserved.has(handle.toLowerCase())) continue;
        if (own && handle.toLowerCase() === own) continue;
        const key = handle.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        const text = ((a.innerText || a.parentElement?.innerText || '')).slice(0, 600);
        const lines = text.split('\n').map((s) => s.trim()).filter(Boolean);
        items.push({
            href: `https://www.instagram.com/${handle}/`,
            handle,
            name: (lines[1] && lines[1] !== handle ? lines[1] : lines[0] || handle).slice(0, 200),
            cardText: text,
        });
    }
    return items.slice(0, 80);
}

function browserExtractGroupActivity() {
    const main = document.querySelector('[role="main"]') || document.body;
    const posts = [];
    const articles = Array.from(main.querySelectorAll('[role="article"], div[aria-posinset]'));
    const source = articles.length ? articles : [];
    for (const art of source.slice(0, 80)) {
        const text = (art.innerText || '').slice(0, 1500);
        const links = Array.from(art.querySelectorAll('a[href]')).map((a) => ({
            href: a.href,
            name: (a.getAttribute('aria-label') || a.innerText || '').split('\n')[0].slice(0, 200),
        }));
        posts.push({ text, links });
    }
    const title = document.title || '';
    const body = (document.body && document.body.innerText) ? document.body.innerText : '';
    const member = body.match(/([\d,.]+[KkMm]?)\s*members?/i);
    const privacy = /public group/i.test(body) ? 'public' : (/private group/i.test(body) ? 'private' : '');
    return {
        title: title.slice(0, 200),
        displayedMemberCount: member ? member[1] : '',
        privacy,
        posts,
    };
}

function browserDetectGroupPeopleUi() {
    const body = (document.body && document.body.innerText) ? document.body.innerText.slice(0, 12000) : '';
    const hrefs = Array.from(document.querySelectorAll('a[href]')).map((a) => a.href || '');
    const tabs = Array.from(document.querySelectorAll('[role="tab"], a')).map((el) => (el.innerText || '').trim().split('\n')[0]);
    const h1 = (document.querySelector('h1')?.innerText || '').split('\n')[0].trim();
    return {
        title: ((document.title || '').split('|')[0] || '').trim().slice(0, 200),
        h1: h1.slice(0, 200),
        bodyText: body.slice(0, 4000),
        hrefs: hrefs.filter((h) => /\/groups\/[^/]+\/(members|people)/i.test(h)).slice(0, 8),
        pathname: location.pathname || '',
        pageUrl: location.href || '',
        peopleTabLabelVisible: tabs.includes('People'),
        findAMember: /find a member/i.test(body),
        displayedMemberCount: (body.match(/([\d,.]+[KkMm]?)\s*members?/i) || [])[1] || '',
        isPublicGroup: /public group/i.test(body) || /\bpublic\b[^\n]{0,48}\bmembers?\b/i.test(body),
        skeleton: Boolean(document.querySelector('[role="progressbar"], [aria-busy="true"]'))
            || /loading/i.test((document.querySelector('[role="main"]')?.innerText || '').slice(0, 400)),
    };
}

function browserExtractExactGroupLanding() {
    const ui = {
        title: ((document.title || '').split('|')[0] || '').trim().slice(0, 200),
        ogTitle: (document.querySelector('meta[property="og:title"]')?.getAttribute('content') || '').trim().slice(0, 200),
        h1: ((document.querySelector('h1')?.innerText || '').split('\n')[0] || '').trim().slice(0, 200),
        bodyText: ((document.body && document.body.innerText) ? document.body.innerText : '').slice(0, 4000),
        hrefs: Array.from(document.querySelectorAll('a[href]'))
            .map((a) => a.href || '')
            .filter((h) => /\/groups\/[^/]+\/(members|people)/i.test(h))
            .slice(0, 8),
        pathname: location.pathname || '',
        pageUrl: location.href || '',
        peopleTabLabelVisible: Array.from(document.querySelectorAll('[role="tab"], a'))
            .map((el) => (el.innerText || '').trim().split('\n')[0])
            .includes('People'),
        displayedMemberCount: (((document.body && document.body.innerText) ? document.body.innerText : '').match(/([\d,.]+[KkMm]?)\s*members?/i) || [])[1] || '',
        isPublicGroup: /public group/i.test((document.body && document.body.innerText) ? document.body.innerText : ''),
        controls: Array.from(document.querySelectorAll('[role="button"], button'))
            .map((el) => (el.getAttribute('aria-label') || el.innerText || '').trim().split('\n')[0])
            .filter((t) => t && t.length < 40)
            .slice(0, 20),
    };
    return ui;
}

function browserDetectPeopleBlockers() {
    const dialogs = Array.from(document.querySelectorAll('[role="dialog"]'));
    const texts = dialogs.map((d) => (d.innerText || '').slice(0, 240));
    const joined = texts.join('\n');
    return {
        dialogCount: dialogs.length,
        cookie: /cookies|allow all cookies|consent/i.test(joined),
        login: /log in to facebook|sign up|create new account/i.test(joined),
        sample: texts[0] || '',
    };
}

function browserExtractGroupPeopleCards() {
    const main = document.querySelector('[role="main"]') || document.body;
    const items = [];
    const seen = new Set();
    const reservedHandle = /^(pages|groups|search|events|watch|people|hashtag|reel|photo|photos|videos|help|home|marketplace|login|friends|stories|reels|notifications|messages|settings|gaming|ads|bookmarks|saved|permalink\.php|photo\.php)$/i;
    for (const a of main.querySelectorAll('a[href]')) {
        if (a.closest('[role="banner"]') || a.closest('[role="navigation"]')) continue;
        const href = a.href || '';
        if (!href || !/facebook\.com/i.test(href)) continue;
        if (/\/(login|watch|reel|share|photo\.php|marketplace|stories)\b/i.test(href)) continue;
        const path = href.split('?')[0];
        const isGroupMember = /\/groups\/[^/]+\/user\/\d{5,}/i.test(path);
        const isProfilePhp = /profile\.php\?id=\d{5,}/i.test(href);
        const isPeoplePath = /\/people\/[^/]+\/\d{5,}/i.test(path);
        let isUsername = false;
        if (!isGroupMember && !isProfilePhp && !isPeoplePath) {
            const m = path.match(/https?:\/\/(?:www\.)?facebook\.com\/([^/?#]+)\/?$/i);
            if (m && !reservedHandle.test(m[1]) && /^[A-Za-z0-9._-]{2,80}$/.test(m[1])) {
                const inCard = a.closest('[role="listitem"]')
                    || a.closest('[role="article"]')
                    || a.closest('[role="list"]');
                if (inCard) isUsername = true;
            }
        }
        if (!isGroupMember && !isProfilePhp && !isPeoplePath && !isUsername) continue;
        const key = (isProfilePhp ? href.split('&')[0] : path).toLowerCase().replace(/\/$/, '');
        if (seen.has(key)) continue;
        const name = (a.getAttribute('aria-label') || a.innerText || '')
            .split('\n').map((s) => s.trim()).find(Boolean) || '';
        if (!name || /^(invite|add friend|message|see all|people|members)$/i.test(name)) continue;
        if (/only shared it with|small group of people|this content isn.?t available/i.test(name)) continue;
        const container = a.closest('[role="listitem"]') || a.closest('[role="article"]') || a.parentElement;
        const cardText = [a.innerText, container && container !== a ? container.innerText : '']
            .filter(Boolean)
            .join('\n')
            .slice(0, 500);
        seen.add(key);
        items.push({
            href: isProfilePhp ? href.split('&')[0] : path,
            name: name.slice(0, 200),
            cardText,
        });
    }
    return items;
}

function browserScrollPeopleMemberList() {
    const main = document.querySelector('[role="main"]') || document.body;
    const overflowing = Array.from(main.querySelectorAll('div')).find((el) => {
        const style = window.getComputedStyle(el);
        const oy = style.overflowY;
        return el.scrollHeight > el.clientHeight + 80
            && el.clientHeight > 180
            && (oy === 'auto' || oy === 'scroll' || oy === 'overlay');
    });
    const box = overflowing
        || document.querySelector('[role="dialog"] [role="list"]')
        || main
        || document.scrollingElement
        || document.body;
    const before = box.scrollTop || 0;
    const height = box.scrollHeight || 0;
    box.scrollBy(0, Math.min(1100, box.clientHeight || 900));
    if (box === main || box === document.body || box === document.scrollingElement) {
        window.scrollBy(0, 900);
    }
    return {
        usedInternal: Boolean(overflowing),
        scrollHeight: box.scrollHeight || height,
        scrollTop: box.scrollTop || 0,
        before,
    };
}

function browserExtractPageCommunityMeta() {
    const body = (document.body && document.body.innerText) ? document.body.innerText : '';
    const followers = body.match(/([\d,.]+[KkMm]?)\s*followers/i);
    const likes = body.match(/([\d,.]+[KkMm]?)\s*likes/i);
    return {
        title: (document.title || '').split('|')[0].trim().slice(0, 200),
        displayedFollowerCount: followers ? followers[1] : '',
        displayedLikeCount: likes ? likes[1] : '',
        url: location.href,
    };
}

function browserExtractRelatedFacebookPages() {
    const items = [];
    const seen = new Set();
    const headings = Array.from(document.querySelectorAll('span, h2, h3, div'));
    const relatedRoot = headings.find((el) => /people also like|related pages|suggested pages|similar pages/i.test(el.innerText || ''));
    const root = relatedRoot ? (relatedRoot.closest('section, div') || relatedRoot.parentElement || document.body) : document.body;
    for (const a of root.querySelectorAll('a[href*="facebook.com/"]')) {
        const href = a.href || '';
        if (/\/(groups|login|watch|reel|share)\b/i.test(href)) continue;
        const key = href.split('?')[0].toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        items.push({
            href,
            name: (a.getAttribute('aria-label') || a.innerText || '').split('\n')[0].slice(0, 200),
            cardText: (a.innerText || '').slice(0, 400),
        });
        if (items.length >= 40) break;
    }
    return items;
}

function browserExtractRelatedFacebookGroups(currentGroupUrl) {
    const items = [];
    const seen = new Set();
    const current = String(currentGroupUrl || '').replace(/\/$/, '').toLowerCase();
    const headings = Array.from(document.querySelectorAll('span, h2, h3, div, a'));
    const relatedRoot = headings.find((el) => /related groups|suggested groups|similar groups|groups you might like/i.test((el.innerText || '').slice(0, 80)));
    const root = relatedRoot ? (relatedRoot.closest('section, div') || relatedRoot.parentElement || document.body) : document.body;
    for (const a of root.querySelectorAll('a[href*="/groups/"]')) {
        const href = a.href || '';
        if (!/facebook\.com\/groups\/[^/?#]+/i.test(href)) continue;
        if (/\/groups\/[^/]+\/(user|members|people|posts|permalink)/i.test(href)) continue;
        const key = href.split('?')[0].replace(/\/$/, '').toLowerCase();
        if (seen.has(key) || key === current) continue;
        seen.add(key);
        const container = a.closest('[role="listitem"]') || a.closest('[role="article"]') || a.parentElement;
        items.push({
            href: href.split('?')[0],
            name: (a.getAttribute('aria-label') || a.innerText || '').split('\n').map((s) => s.trim()).find(Boolean) || '',
            cardText: (container && container.innerText ? container.innerText : a.innerText || '').slice(0, 400),
        });
        if (items.length >= 12) break;
    }
    return items;
}

function browserExtractPostParticipants() {
    const items = [];
    const seen = new Set();
    const main = document.querySelector('[role="main"]') || document.body;
    for (const art of Array.from(main.querySelectorAll('[role="article"], div[aria-posinset]')).slice(0, 40)) {
        const text = (art.innerText || '').slice(0, 1200);
        for (const a of art.querySelectorAll('a[href]')) {
            const href = a.href || '';
            if (!/facebook\.com/i.test(href)) continue;
            if (/\/(groups|watch|reel|share|login)\b/i.test(href)) continue;
            const key = href.split('?')[0].toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            items.push({
                href,
                name: (a.getAttribute('aria-label') || a.innerText || '').split('\n')[0].slice(0, 200),
                cardText: text,
            });
        }
    }
    return items;
}

function browserExtractProfileEvidence() {
    const main = document.querySelector('[role="main"]') || document.body;
    const text = ((main && main.innerText) ? main.innerText : '').slice(0, 4000);
    const title = (document.title || '').split('|')[0].trim();
    const hrefs = Array.from(document.querySelectorAll('a[href]')).map((a) => a.href).slice(0, 80);
    const tel = (document.querySelector('a[href^="tel:"]') || {}).href || '';
    const mail = (document.querySelector('a[href^="mailto:"]') || {}).href || '';
    const categoryEl = document.querySelector('[aria-label*="category" i], [aria-label*="Category" i]');
    return {
        title: title.slice(0, 200),
        text,
        hrefs,
        tel: tel.replace(/^tel:/i, ''),
        mail: mail.replace(/^mailto:/i, ''),
        category: categoryEl ? (categoryEl.innerText || '').slice(0, 120) : '',
    };
}

function browserLoggedInInstagramUsername() {
    const alts = Array.from(document.querySelectorAll('img[alt]')).map((img) => img.getAttribute('alt') || '');
    for (const alt of alts) {
        const m = alt.match(/^(.+?)'s profile picture$/i);
        if (m) return m[1].replace(/^@/, '').trim();
    }
    const profileLink = Array.from(document.querySelectorAll('a[href^="/"]')).find((a) => {
        const href = a.getAttribute('href') || '';
        return /^\/[A-Za-z0-9._]+\/$/.test(href) && a.querySelector('img');
    });
    if (profileLink) return (profileLink.getAttribute('href') || '').replace(/\//g, '');
    return '';
}

function browserRelatedInstagramAccounts() {
    const items = [];
    const seen = new Set();
    const headings = Array.from(document.querySelectorAll('h2, h3, span, div'));
    const relatedRoot = headings.find((el) => /related accounts|suggested for you|similar accounts/i.test(el.innerText || ''));
    const root = relatedRoot ? (relatedRoot.closest('section') || relatedRoot.parentElement || document.body) : null;
    if (!root) return items;
    for (const a of root.querySelectorAll('a[href^="/"]')) {
        const href = a.getAttribute('href') || '';
        const m = href.match(/^\/([A-Za-z0-9._]+)\/?$/);
        if (!m) continue;
        const handle = m[1];
        if (seen.has(handle.toLowerCase())) continue;
        seen.add(handle.toLowerCase());
        items.push({
            href: `https://www.instagram.com/${handle}/`,
            handle,
            name: (a.innerText || handle).split('\n')[0].slice(0, 200),
            cardText: (a.innerText || '').slice(0, 400),
            sourceRelationship: 'related_accounts',
        });
    }
    return items.slice(0, 20);
}

function browserHashtagPostAccounts() {
    const items = [];
    const seen = new Set();
    const main = document.querySelector('[role="main"]') || document.body;
    for (const a of main.querySelectorAll('a[href^="/"]')) {
        const href = a.getAttribute('href') || '';
        const m = href.match(/^\/([A-Za-z0-9._]+)\/?$/);
        if (!m) continue;
        const handle = m[1];
        if (['explore', 'reels', 'p', 'reel'].includes(handle.toLowerCase())) continue;
        if (seen.has(handle.toLowerCase())) continue;
        seen.add(handle.toLowerCase());
        items.push({
            href: `https://www.instagram.com/${handle}/`,
            handle,
            name: handle,
            cardText: (a.innerText || '').slice(0, 300),
        });
    }
    return items.slice(0, 40);
}

async function waitForHydratedCards(page, platform) {
    try {
        await page.waitForFunction((p) => {
            const main = document.querySelector('[role="main"]')
                || document.querySelector('[role="listbox"]')
                || document.querySelector('[role="dialog"]')
                || document.body;
            if (!main) return false;
            if (p === 'instagram') {
                let n = 0;
                const roots = [
                    document.querySelector('[role="listbox"]'),
                    document.querySelector('[role="dialog"]'),
                    document.querySelector('input[placeholder="Search"]')?.closest('div[style]')?.parentElement,
                    document.querySelector('[role="main"]'),
                    document.body,
                ].filter(Boolean);
                const root = roots[0] || document.body;
                root.querySelectorAll('a[href]').forEach((a) => {
                    const h = a.getAttribute('href') || '';
                    if (/^\/[A-Za-z0-9._]+\/?$/.test(h) && !/^\/(explore|reels|direct|accounts|popular)\b/.test(h)) n += 1;
                });
                return n >= 1;
            }
            let n = 0;
            main.querySelectorAll('a[href*="facebook.com/"]').forEach((a) => {
                if (a.closest('[role="banner"]') || a.closest('[role="navigation"]')) return;
                n += 1;
            });
            return n >= 3;
        }, { timeout: HYDRATION_TIMEOUT_MS }, platform);
        await sleep(STABILIZE_MS);
        return true;
    } catch {
        return false;
    }
}

async function clickNamedControl(page, names = []) {
    await page.evaluate((labels) => {
        const nodes = Array.from(document.querySelectorAll('a, div[role="tab"], span, div[role="button"]'));
        for (const name of labels) {
            const el = nodes.find((e) => (e.innerText || '').trim().split('\n')[0] === name);
            if (el) {
                el.click();
                return;
            }
        }
    }, names);
    await sleep(HUMAN_DELAY_MS);
}

async function typeInstagramSearch(page, keyword) {
    await page.evaluate(() => {
        const nodes = Array.from(document.querySelectorAll('span, a, div[role="link"], div[role="button"], svg'));
        const el = nodes.find((e) => {
            const label = (e.getAttribute('aria-label') || '').trim();
            const text = (e.textContent || '').trim();
            return label === 'Search' || text === 'Search';
        });
        if (el) {
            const clickable = el.closest('a, div[role="link"], div[role="button"]') || el;
            clickable.click();
        }
    });
    await sleep(1000);
    const input = await page.waitForSelector(
        'input[aria-label="Search input"], input[placeholder="Search"], input[aria-label="Search"], input[type="text"]',
        { timeout: 8000 },
    ).catch(() => null);
    if (!input) return false;
    await input.click({ clickCount: 3 }).catch(() => {});
    await input.type(keyword, { delay: 70 });
    await sleep(2000);
    return true;
}

async function scrollForMore(page, extractFn, maxResults, onTick) {
    let lastCount = 0;
    let idle = 0;
    let cards = [];
    for (let i = 0; i < SCROLL_MAX; i += 1) {
        cards = await page.evaluate(extractFn);
        if (typeof onTick === 'function') {
            try { onTick(cards); } catch { /* live UI only */ }
        }
        if (cards.length >= maxResults) break;
        if (cards.length === lastCount) {
            idle += 1;
            if (idle >= SCROLL_IDLE_STOP) break;
        } else {
            idle = 0;
        }
        lastCount = cards.length;
        await page.evaluate(() => {
            const main = document.querySelector('[role="main"]') || document.scrollingElement || document.body;
            main.scrollBy(0, Math.min(900, main.scrollHeight || 900));
        });
        await sleep(HUMAN_DELAY_MS);
        await waitNetworkQuiet(page);
        const challenge = await readChallenge(page);
        if (challenge) return { cards, challenge };
    }
    return { cards, challenge: '' };
}

async function extractFacebookProfileEvidence(page, pageUrl) {
    const challenge = await gotoSafe(page, pageUrl);
    if (challenge) return { challenge, evidence: null };
    let evidence = await page.evaluate(browserExtractProfileEvidence);
    const aboutUrl = pageUrl.includes('profile.php')
        ? `${pageUrl}${pageUrl.includes('?') ? '&' : '?'}sk=about`
        : `${pageUrl.replace(/\/$/, '')}/about`;
    await sleep(HUMAN_DELAY_MS);
    const aboutChallenge = await gotoSafe(page, aboutUrl);
    if (!aboutChallenge) {
        const about = await page.evaluate(browserExtractProfileEvidence);
        evidence = {
            ...evidence,
            text: `${evidence.text}\n${about.text}`.slice(0, 5000),
            hrefs: [...(evidence.hrefs || []), ...(about.hrefs || [])],
            tel: evidence.tel || about.tel,
            mail: evidence.mail || about.mail,
            category: evidence.category || about.category,
            title: evidence.title || about.title,
        };
    }
    return { challenge: '', evidence };
}

function facebookCardToClassified(card, searchType) {
    const classified = classifyFacebookUrl(unwrapSocialHref(card.href), searchType)
        || (searchType === 'group_intelligence'
            ? (classifyFacebookUrl(unwrapSocialHref(card.href), 'pages')
                || classifyFacebookUrl(unwrapSocialHref(card.href), 'posts'))
            : null);
    return classified;
}

async function waitForGroupPeopleCards(page, { timeoutMs = PEOPLE_CARD_WAIT_MS, minCount = 1 } = {}) {
    const started = Date.now();
    let cards = [];
    while (Date.now() - started < timeoutMs) {
        cards = await page.evaluate(browserExtractGroupPeopleCards);
        if (cards.length >= minCount) return cards;
        await sleep(400);
    }
    return cards;
}

async function openGroupPeopleTab(page, groupUrl) {
    const clicked = await page.evaluate(() => {
        const nodes = Array.from(document.querySelectorAll('[role="tab"], a[role="tab"], a, div[role="tab"]'));
        const people = nodes.find((el) => {
            const t = (el.innerText || '').trim().split('\n')[0];
            if (t === 'People') return true;
            const href = el.href || el.getAttribute('href') || '';
            return /\/groups\/[^/]+\/(members|people)\/?(\?|$)/i.test(href);
        });
        if (!people) return false;
        const clickable = people.closest('a, [role="tab"]') || people;
        clickable.click();
        return true;
    });
    await sleep(HUMAN_DELAY_MS);
    let cards = await waitForGroupPeopleCards(page, { timeoutMs: 8000 });
    const urlLooksPeople = /\/(members|people)\b/i.test(page.url());
    if (!cards.length && !urlLooksPeople && groupUrl) {
        const membersUrl = `${String(groupUrl).replace(/\/$/, '')}/members`;
        const ch = await gotoSafe(page, membersUrl);
        if (ch) return { opened: false, challenge: ch, peopleUrl: page.url(), cards: [], clicked };
        cards = await waitForGroupPeopleCards(page, { timeoutMs: 8000 });
    }
    const raw = await page.evaluate(browserDetectGroupPeopleUi);
    const ui = detectFacebookGroupPeopleUi(raw);
    const blockers = await page.evaluate(browserDetectPeopleBlockers);
    const onPeopleSurface = /\/(members|people)\b/i.test(page.url()) || ui.peopleTabLikelyActive || raw.findAMember;
    const opened = cards.length > 0 || onPeopleSurface;
    return {
        opened,
        challenge: '',
        peopleUrl: page.url(),
        cards,
        ui: {
            ...ui,
            displayedMemberCount: raw.displayedMemberCount,
            isPublicGroup: raw.isPublicGroup || ui.isPublicGroup,
            skeleton: Boolean(raw.skeleton),
        },
        clicked,
        blockers,
    };
}

function tallyRelevance(analytics, relevance) {
    if (relevance === 'private_unavailable') analytics.privateUnavailable += 1;
    else if (relevance === 'not_relevant') analytics.notRelevant += 1;
    else if (relevance === 'possibly_relevant') analytics.possiblyRelevant += 1;
    else analytics.relevant += 1;
}

async function reviewGroupMemberCard(page, {
    card, keyword, location, analytics, metrics, seen, errors, records, searchType, discoveryType,
    reviewExisting = false,
}) {
    const classified = facebookCardToClassified(card, 'group_intelligence');
    if (!classified || classified.resultTypeHint === 'facebook_group') return '';
    if (classified.urlKind === 'page' && /\/(photo|photos|videos)(\/|$)/i.test(classified.pageUrl)) return '';
    analytics.accessibleProfilesReviewed += 1;
    const probe = { resultUrl: classified.pageUrl };
    if (!reviewExisting && isFbAlreadySeen(seen, probe)) {
        analytics.alreadyKnown += 1;
        return '';
    }
    let website = extractExternalWebsite(card.cardText || '');
    let snippet = stripFacebookGroupChrome(card.cardText || '', analytics.groupTitle);
    let profileText = '';
    let evidenceHrefs = [];
    let evidenceTel = '';
    let evidenceMail = '';
    let category = '';
    let relevance = classifyFacebookCommunityRelevance({
        name: card.name, cardText: snippet, keyword,
    });
    const thinCard = String(card.cardText || '').replace(card.name || '', '').trim().length < 24;
    const shouldOpen = reviewExisting
        || shouldIngestFacebookCommunity(relevance)
        || thinCard
        || classifiedNeedsOpen(classified);
    if (shouldOpen) {
        const opened = await extractFacebookProfileEvidence(page, classified.pageUrl);
        if (opened.challenge) {
            metrics.challenge = opened.challenge;
            errors.push(opened.challenge);
            return resolveFacebookStopReason({ challenge: opened.challenge });
        }
        if (opened.evidence) {
            profileText = stripFacebookGroupChrome(opened.evidence.text || '', analytics.groupTitle);
            evidenceHrefs = opened.evidence.hrefs || [];
            evidenceTel = opened.evidence.tel || '';
            evidenceMail = opened.evidence.mail || '';
            website = website || extractExternalWebsite([...(opened.evidence.hrefs || []), profileText, opened.evidence.mail, opened.evidence.tel]);
            category = opened.evidence.category || '';
            snippet = [card.name, opened.evidence.category, profileText].filter(Boolean).join(' · ').slice(0, 1800);
            relevance = classifyFacebookCommunityRelevance({
                name: card.name, cardText: stripFacebookGroupChrome(card.cardText || '', analytics.groupTitle), profileText, website, keyword,
            });
        }
    }
    tallyRelevance(analytics, relevance);
    addFbSeenKey(seen, probe);
    if (!reviewExisting && !shouldIngestFacebookCommunity(relevance)) {
        metrics.rejectedNoEvidence += 1;
        return '';
    }
    const contacts = extractPublicContactFields({
        text: `${card.cardText || ''}\n${snippet}\n${profileText}`,
        hrefs: evidenceHrefs,
        tel: evidenceTel,
        mail: evidenceMail,
        website,
        ignoreDigits: facebookIdentityDigitsFromText(`${analytics.groupUrl || ''}\n${classified.pageUrl || ''}`, {
            parentGroupId: facebookGroupIdFromUrl(analytics.groupUrl || ''),
            groupUrl: analytics.groupUrl || '',
        }),
    });
    const first = facebookCompanyFirst(`${card.name}\n${snippet}\n${profileText}`, card.name);
    if (website || contacts.website) {
        metrics.externalWebsitesFound += 1;
        analytics.websites += 1;
    }
    if (contacts.email) analytics.emails += 1;
    if (contacts.phone) analytics.phones += 1;
    if (contacts.instagramUrl) analytics.instagrams += 1;
    const snippetWithContacts = [
        snippet,
        contacts.email ? `email=${contacts.email}` : '',
        contacts.phone ? `phone=${contacts.phone}` : '',
        contacts.instagramUrl ? `instagram=${contacts.instagramUrl}` : '',
    ].filter(Boolean).join(' · ').slice(0, 1800);
    records.push(toDirectCandidate(classified, {
        platform: 'facebook', keyword, location, searchType,
        title: reviewExisting ? (card.name || classified.handle) : (first.companyName || card.name || classified.handle),
        snippet: snippetWithContacts,
        website: website || contacts.website,
        extraNotes: [
            `discoveryType=${discoveryType}`,
            `sourceSurface=${discoveryType === FACEBOOK_DISCOVERY_TYPES.GROUP_PEOPLE_TAB ? 'facebook_people_tab' : 'facebook_group_activity'}`,
            `parentGroup=${analytics.groupTitle}`,
            `parentUrl=${analytics.groupUrl}`,
            `groupName=${analytics.groupTitle}`,
            `groupUrl=${analytics.groupUrl}`,
            facebookGroupIdFromUrl(analytics.groupUrl) ? `parentGroupId=${facebookGroupIdFromUrl(analytics.groupUrl)}` : '',
            'sourceKind=facebook_group_member',
            `facebookUrl=${classified.pageUrl}`,
            `memberName=${card.name || ''}`,
            contacts.instagramUrl ? `instagramUrl=${contacts.instagramUrl}` : '',
            contacts.phone ? `phone=${contacts.phone}` : '',
            contacts.email ? `email=${contacts.email}` : '',
            contacts.whatsapp ? `whatsapp=${contacts.whatsapp}` : '',
            analytics.displayedMemberCount ? `displayedMemberCount=${analytics.displayedMemberCount}` : 'displayedMemberCount=not visible',
            'membersEnumerated=false',
            `relevance=${relevance}`,
            'reviewStatus=reviewed',
            first.companyFirst ? `companyFirst=true; personEvidence=${first.personEvidence}; companyName=${first.companyName}` : '',
            category ? `category=${category}` : '',
            (website || contacts.website) ? 'websiteSource=company_website_or_public_profile' : '',
        ].join('; '),
    }));
    analytics.newUniqueCompanies += 1;
    return '';
}

async function collectSelectedGroupIntelligence(page, {
    chosen,
    keyword,
    location,
    metrics,
    seen,
    errors,
    shouldStop,
    onProgress,
    skipDiscussion = false,
    discoveryBatchSize = FACEBOOK_MEMBER_DISCOVERY_BATCH,
    reviewBatchSize = FACEBOOK_MEMBER_REVIEW_BATCH,
    collectorMode = FACEBOOK_MEMBER_COLLECTOR_MODES.NEXT_BATCH,
    onDiscoveryBatch,
    pendingCards = [],
    onMemberCard,
    autoReviewAfterDiscovery = false,
} = {}) {
    const records = [];
    const isReviewMode = collectorMode === FACEBOOK_MEMBER_COLLECTOR_MODES.REVIEW_NEXT
        || collectorMode === FACEBOOK_MEMBER_COLLECTOR_MODES.REVIEW_ALL;
    const isFullDiscovery = collectorMode === FACEBOOK_MEMBER_COLLECTOR_MODES.FULL_DISCOVERY
        || collectorMode === FACEBOOK_MEMBER_COLLECTOR_MODES.FULL_AUTOMATIC;
    const landingUi = await page.evaluate(browserDetectGroupPeopleUi);
    const detected = detectFacebookGroupPeopleUi(landingUi);
    const memberFromCard = (chosen.cardText || '').match(/([\d.,]+[KkMm]?)\s*members?/i);
    const analytics = emptyGroupAnalytics();
    analytics.groupUrl = chosen.pageUrl;
    analytics.groupTitle = displayNameFromSocialText(
        chosen.cardText,
        chosen.name || landingUi.h1 || landingUi.title,
    ) || chosen.name || landingUi.h1 || landingUi.title || '';
    analytics.displayedMemberCount = landingUi.displayedMemberCount || (memberFromCard ? memberFromCard[1] : '');
    analytics.displayedMemberCountParsed = parseDisplayedCount(analytics.displayedMemberCount);
    analytics.isPublicGroup = Boolean(landingUi.isPublicGroup || detected.isPublicGroup || /public group/i.test(chosen.cardText || ''));
    analytics.peopleTabAvailable = Boolean(landingUi.peopleTabLabelVisible || detected.peopleTabVisible);
    analytics.privacy = analytics.isPublicGroup ? 'public' : (/private group/i.test(chosen.cardText || '') ? 'private' : '');
    analytics.membersEnumerated = false;

    const report = (patch) => {
        Object.assign(analytics, patch);
        onProgress?.({
            groupTitle: analytics.groupTitle,
            groupUrl: analytics.groupUrl,
            displayedMemberCount: analytics.displayedMemberCount,
            privacy: analytics.privacy,
            groupAccess: analytics.isPublicGroup ? 'Public' : (analytics.privacy || 'unknown'),
            peopleTabStatus: analytics.peopleTabStatus,
            peopleTabAvailable: analytics.peopleTabAvailable,
            visibleCards: analytics.visibleCards,
            uniqueMembersCollected: analytics.uniqueMembersCollected || analytics.accessiblePeopleTabProfilesLoaded,
            reviewed: analytics.accessibleProfilesReviewed,
            newUnseen: analytics.newUnseen,
            relevant: analytics.relevant,
            websites: analytics.websites,
            phones: analytics.phones,
            emails: analytics.emails,
            alreadyKnown: analytics.alreadyKnown,
            scrollPass: analytics.scrollPass,
            currentBatch: analytics.currentBatch || 0,
            status: analytics.stopReason || analytics.peopleTabStatus || 'working',
            stopNote: analytics.stopNote || '',
        });
    };
    report({ peopleTabStatus: 'opening' });

    const relatedRaw = await page.evaluate(browserExtractRelatedFacebookGroups, chosen.pageUrl);
    for (const card of relatedRaw || []) {
        const classified = classifyFacebookUrl(unwrapSocialHref(card.href), 'groups');
        if (!classified || classified.resultTypeHint !== 'facebook_group') continue;
        const key = classified.pageUrl.toLowerCase();
        if (key === String(chosen.pageUrl || '').replace(/\/$/, '').toLowerCase()) continue;
        if (isFbAlreadySeen(seen, { resultUrl: classified.pageUrl })) {
            analytics.alreadyKnown += 1;
            continue;
        }
        const meta = (card.cardText || '').match(/([\d.,]+[KkMm]?)\s*members?/i);
        const privacy = /private group/i.test(card.cardText || '') ? 'private' : (/public group/i.test(card.cardText || '') ? 'public' : '');
        addFbSeenKey(seen, { resultUrl: classified.pageUrl });
        analytics.relatedGroupsFound += 1;
        analytics.relatedGroups.push({
            groupName: displayNameFromSocialText(card.cardText, card.name) || classified.handle,
            groupUrl: classified.pageUrl,
            privacy: privacy || '—',
            members: meta ? meta[1] : '—',
        });
        records.push(toDirectCandidate(classified, {
            platform: 'facebook', keyword, location, searchType: 'group_intelligence',
            title: displayNameFromSocialText(card.cardText, card.name) || classified.handle,
            snippet: card.cardText || 'Related Facebook Group visible on the selected group.',
            extraNotes: [
                `discoveryType=${FACEBOOK_DISCOVERY_TYPES.RELATED_GROUP}`,
                'sourceSurface=facebook_related_groups',
                `parentGroup=${analytics.groupTitle}`,
                `parentUrl=${analytics.groupUrl}`,
                `groupName=${analytics.groupTitle}`,
                `groupUrl=${analytics.groupUrl}`,
                privacy ? `privacy=${privacy}` : '',
                meta ? `displayedMemberCount=${meta[1]}` : '',
                'relevance=source_only',
                'membersEnumerated=false',
            ].join('; '),
        }));
    }
    report({ relatedGroupsFound: analytics.relatedGroupsFound });

    const peopleLoadedKeys = new Set();
    const enqueuePeopleCards = (cards) => {
        const fresh = [];
        for (const card of cards || []) {
            const classified = facebookCardToClassified(card, 'group_intelligence');
            if (!classified || classified.resultTypeHint === 'facebook_group') continue;
            const key = classified.pageUrl.toLowerCase();
            if (peopleLoadedKeys.has(key)) continue;
            peopleLoadedKeys.add(key);
            if (isFbAlreadySeen(seen, { resultUrl: classified.pageUrl })) {
                analytics.alreadyKnown += 1;
                continue;
            }
            fresh.push(card);
        }
        analytics.accessiblePeopleTabProfilesLoaded = peopleLoadedKeys.size;
        analytics.visibleCards = (cards || []).length;
        analytics.newUnseen = (analytics.newUnseen || 0) + fresh.length;
        return fresh;
    };

    let peopleUrl = '';
    if (!isReviewMode && (analytics.isPublicGroup || analytics.peopleTabAvailable)) {
        report({ peopleTabStatus: 'loading' });
        const people = await openGroupPeopleTab(page, chosen.pageUrl);
        if (people.challenge) {
            metrics.challenge = people.challenge;
            errors.push(people.challenge);
            analytics.stopReason = resolveFacebookStopReason({ challenge: people.challenge });
            analytics.stopNote = people.challenge;
        } else {
            analytics.peopleUrl = people.peopleUrl || page.url();
            analytics.overlayDetected = Boolean(people.blockers?.cookie || people.blockers?.login);
            if (people.ui?.isPublicGroup) analytics.isPublicGroup = true;
            if (people.ui?.displayedMemberCount && !analytics.displayedMemberCount) {
                analytics.displayedMemberCount = people.ui.displayedMemberCount;
                analytics.displayedMemberCountParsed = parseDisplayedCount(analytics.displayedMemberCount);
            }
            peopleUrl = people.peopleUrl || page.url();
            analytics.peopleTabOpened = Boolean(people.opened);
            if (people.opened) analytics.peopleTabAvailable = true;
            if (people.blockers?.login) {
                analytics.peopleTabStatus = 'blocked_overlay';
                analytics.stopReason = FACEBOOK_STOP_REASONS.SAFETY_PAUSE;
                analytics.stopNote = 'A login/consent overlay is blocking the People list.';
            } else if (!people.opened) {
                analytics.peopleTabStatus = 'unavailable';
                analytics.stopReason = FACEBOOK_STOP_REASONS.TECHNICAL_FAILURE;
                analytics.stopNote = 'Could not open the People tab on this group.';
            } else if (!(people.cards || []).length) {
                analytics.peopleTabStatus = 'opened_no_cards';
                analytics.peopleTabOpened = true;
                analytics.stopReason = FACEBOOK_STOP_REASONS.TECHNICAL_FAILURE;
                analytics.stopNote = people.ui?.skeleton
                    ? 'People tab still showing a loading skeleton; no member cards became visible.'
                    : 'People tab opened but no member/profile cards were visible (selectors: /groups/.../user/, profile.php, /people/Name/ID, username in listitem).';
            } else {
                analytics.peopleTabStatus = 'open';
            }
            report({});
        }
    } else if (!isReviewMode) {
        analytics.peopleTabOpened = false;
        analytics.peopleTabStatus = analytics.isPublicGroup ? 'unavailable' : 'not_public';
        analytics.stopReason = FACEBOOK_STOP_REASONS.SOURCE_EXHAUSTED;
        analytics.stopNote = analytics.isPublicGroup
            ? 'People tab is not visible on this public group.'
            : 'Group does not appear Public, so the People list was not collected.';
        report({});
    }

    const discoveredCards = [];
    const toLightweightRecord = (card) => {
        const classified = facebookCardToClassified(card, 'group_intelligence');
        if (!classified || classified.resultTypeHint === 'facebook_group') return null;
        const capturedAt = new Date().toISOString();
        return toDirectCandidate(classified, {
            platform: 'facebook',
            keyword,
            location,
            searchType: 'group_intelligence',
            title: card.name || classified.handle,
            snippet: stripFacebookGroupChrome(card.cardText || '', analytics.groupTitle) || card.name || '',
            extraNotes: [
                `discoveryType=${FACEBOOK_DISCOVERY_TYPES.GROUP_PEOPLE_TAB}`,
                'sourceSurface=facebook_people_tab',
                `parentGroup=${analytics.groupTitle}`,
                `parentUrl=${analytics.groupUrl}`,
                `groupName=${analytics.groupTitle}`,
                `groupUrl=${analytics.groupUrl}`,
                facebookGroupIdFromUrl(analytics.groupUrl) ? `parentGroupId=${facebookGroupIdFromUrl(analytics.groupUrl)}` : '',
                'sourceKind=facebook_group_member',
                `facebookUrl=${classified.pageUrl}`,
                `memberName=${card.name || ''}`,
                analytics.displayedMemberCount ? `displayedMemberCount=${analytics.displayedMemberCount}` : 'displayedMemberCount=not visible',
                'membersEnumerated=false',
                'reviewStatus=not_reviewed',
                `capturedAt=${capturedAt}`,
            ].join('; '),
        });
    };

    const flushLightweight = async (cards) => {
        const chunk = [];
        for (const card of cards || []) {
            const rec = toLightweightRecord(card);
            if (!rec) continue;
            records.push(rec);
            chunk.push(rec);
        }
        if (chunk.length && typeof onDiscoveryBatch === 'function') {
            const saved = await onDiscoveryBatch(chunk, { ...analytics });
            return Number(saved || 0);
        }
        return chunk.length;
    };

    if (isReviewMode) {
        if (!(pendingCards || []).length) {
            analytics.stopReason = FACEBOOK_STOP_REASONS.BATCH_COMPLETE;
            analytics.stopNote = 'No pending profiles awaiting review.';
            return {
                records,
                errors,
                groupMeta: {
                    groupUrl: analytics.groupUrl,
                    groupTitle: analytics.groupTitle,
                    displayedMemberCount: analytics.displayedMemberCount,
                    privacy: analytics.privacy,
                    peopleTabOpened: false,
                    peopleTabStatus: 'reviewing',
                    stopNote: analytics.stopNote,
                },
                communityMeta: analytics,
                stopReason: analytics.stopReason,
                alreadyKnown: analytics.alreadyKnown,
            };
        }
        const reviewLimit = Math.max(1, Number(reviewBatchSize) || FACEBOOK_MEMBER_REVIEW_BATCH);
        const queueReview = collectorMode === FACEBOOK_MEMBER_COLLECTOR_MODES.REVIEW_ALL
            ? [...pendingCards]
            : pendingCards.slice(0, reviewLimit);
        analytics.currentBatch = 1;
        analytics.peopleTabStatus = 'reviewing';
        report({ status: 'REVIEWING', peopleTabStatus: 'reviewing' });
        for (const card of queueReview) {
            if (shouldStop?.()) {
                analytics.stopReason = FACEBOOK_STOP_REASONS.MANUAL_STOP;
                analytics.stopNote = 'Stop requested. Captured members were kept.';
                break;
            }
            const stop = await reviewGroupMemberCard(page, {
                card,
                keyword,
                location,
                analytics,
                metrics,
                seen,
                errors,
                records,
                searchType: 'group_intelligence',
                discoveryType: FACEBOOK_DISCOVERY_TYPES.GROUP_PEOPLE_TAB,
                reviewExisting: true,
            });
            analytics.reviewed = analytics.accessibleProfilesReviewed;
            if (stop) {
                analytics.stopReason = stop;
                break;
            }
            report({ reviewed: analytics.accessibleProfilesReviewed, status: 'REVIEWING' });
        }
        if (!analytics.stopReason) {
            analytics.stopReason = collectorMode === FACEBOOK_MEMBER_COLLECTOR_MODES.REVIEW_ALL
                ? FACEBOOK_STOP_REASONS.BATCH_COMPLETE
                : FACEBOOK_STOP_REASONS.BATCH_COMPLETE;
            analytics.stopNote = `Reviewed ${analytics.accessibleProfilesReviewed || 0} profile(s) this run.`;
        }
        const groupMetaEarly = {
            groupUrl: analytics.groupUrl,
            groupTitle: analytics.groupTitle,
            displayedMemberCount: analytics.displayedMemberCount,
            privacy: analytics.privacy,
            peopleTabOpened: analytics.peopleTabOpened,
            peopleTabStatus: analytics.peopleTabStatus,
            stopNote: analytics.stopNote,
        };
        return {
            records,
            errors,
            groupMeta: groupMetaEarly,
            communityMeta: analytics,
            stopReason: analytics.stopReason,
            alreadyKnown: analytics.alreadyKnown,
        };
    }

    const queue = [];
    if (analytics.peopleTabOpened && !analytics.stopReason) {
        let firstCards = await page.evaluate(browserExtractGroupPeopleCards);
        if (!firstCards.length) firstCards = await waitForGroupPeopleCards(page);
        analytics.peopleTabFirstLoadCount = firstCards.length;
        queue.push(...enqueuePeopleCards(firstCards));
        report({
            peopleTabStatus: 'open',
            visibleCards: firstCards.length,
            uniqueMembersCollected: analytics.uniqueMembersCollected || 0,
            groupAccess: analytics.isPublicGroup ? 'Public' : analytics.privacy,
        });
        let idle = 0;
        let lastScrollHeight = 0;
        const discoveryLimit = Math.max(1, Number(discoveryBatchSize) || FACEBOOK_MEMBER_DISCOVERY_BATCH);
        const reviewLimit = Math.max(1, Number(reviewBatchSize) || FACEBOOK_MEMBER_REVIEW_BATCH);
        const scrollSafety = isFullDiscovery ? FACEBOOK_MEMBER_FULL_SCROLL_SAFETY : FACEBOOK_MEMBER_SCROLL_MAX_PER_RUN;
        let batchCards = [];

        const flushBatchCards = async (note) => {
            if (!batchCards.length) return 0;
            try {
                const n = await flushLightweight(batchCards);
                analytics.uniqueMembersCollected = (analytics.uniqueMembersCollected || 0) + n;
                analytics.profilesDiscovered = (analytics.profilesDiscovered || 0) + n;
                analytics.currentBatch = (analytics.currentBatch || 0) + 1;
                discoveredCards.push(...batchCards);
                batchCards = [];
                report({
                    uniqueMembersCollected: analytics.uniqueMembersCollected,
                    currentBatch: analytics.currentBatch,
                    status: isFullDiscovery ? 'DISCOVERING' : 'Running',
                    stopNote: note || '',
                });
                return n;
            } catch (err) {
                analytics.stopReason = FACEBOOK_STOP_REASONS.PERSISTENCE_FAILURE;
                analytics.stopNote = String(err?.message || err || 'persistence_failure');
                batchCards = [];
                report({
                    uniqueMembersCollected: analytics.uniqueMembersCollected || 0,
                    status: 'Paused',
                    stopNote: analytics.stopNote,
                });
                return 0;
            }
        };

        while (!analytics.stopReason) {
            if (shouldStop?.()) {
                await flushBatchCards('Stop requested. Captured members were kept.');
                analytics.stopReason = FACEBOOK_STOP_REASONS.MANUAL_STOP;
                analytics.stopNote = 'Stop requested. Captured members were kept.';
                break;
            }
            if (!queue.length) {
                if (!isFullDiscovery && (discoveredCards.length + batchCards.length) >= discoveryLimit) {
                    await flushBatchCards();
                    analytics.stopReason = FACEBOOK_STOP_REASONS.BATCH_COMPLETE;
                    analytics.stopNote = `Discovery batch complete (${analytics.uniqueMembersCollected || 0} new members). Use Run Full Accessible Group to continue automatically.`;
                    break;
                }
                analytics.scrollPass += 1;
                report({ peopleTabStatus: 'loading_more', status: 'Loading More' });
                const scroll = await page.evaluate(browserScrollPeopleMemberList);
                analytics.scrollHeight = scroll.scrollHeight || 0;
                await sleep(HUMAN_DELAY_MS);
                const visible = await page.evaluate(browserExtractGroupPeopleCards);
                analytics.peopleTabAfterScrollCount = visible.length;
                const prev = peopleLoadedKeys.size;
                queue.push(...enqueuePeopleCards(visible));
                const noNewUrls = peopleLoadedKeys.size === prev;
                if (noNewUrls) {
                    idle += 1;
                    if (idle >= FACEBOOK_MEMBER_STUCK_SCROLLS) {
                        await flushBatchCards();
                        analytics.stopReason = FACEBOOK_STOP_REASONS.SOURCE_EXHAUSTED;
                        analytics.stopNote = analytics.uniqueMembersCollected
                            ? `People tab stopped producing new member cards after ${FACEBOOK_MEMBER_STUCK_SCROLLS} scrolls. Accessible members saved.`
                            : 'People tab stopped producing new member cards after 5 scrolls (no new profile URLs).';
                        break;
                    }
                } else {
                    idle = 0;
                }
                lastScrollHeight = scroll.scrollHeight || lastScrollHeight;
                if (analytics.scrollPass >= scrollSafety) {
                    await flushBatchCards();
                    analytics.stopReason = isFullDiscovery
                        ? FACEBOOK_STOP_REASONS.BATCH_COMPLETE
                        : FACEBOOK_STOP_REASONS.BATCH_COMPLETE;
                    analytics.stopNote = isFullDiscovery
                        ? 'Reached a safety scroll limit for this session. Resume Full Accessible Group to continue.'
                        : 'Reached operational scroll limit for this run. Resume to continue.';
                    break;
                }
                continue;
            }
            const card = queue.shift();
            batchCards.push(card);
            if (typeof onMemberCard === 'function') {
                const rec = toLightweightRecord(card);
                if (rec) {
                    try { await onMemberCard(rec, { ...analytics, lastMemberName: card.name || rec.title }); } catch { /* live label only */ }
                }
            }
            report({
                uniqueMembersCollected: analytics.uniqueMembersCollected || 0,
                cardsSeen: (analytics.uniqueMembersCollected || 0) + batchCards.length,
                status: isFullDiscovery ? 'DISCOVERING' : 'Running',
                lastMemberName: card.name || '',
            });
            if (batchCards.length >= discoveryLimit) {
                await flushBatchCards();
                if (!isFullDiscovery) {
                    analytics.stopReason = FACEBOOK_STOP_REASONS.BATCH_COMPLETE;
                    analytics.stopNote = `Discovery batch complete (${analytics.uniqueMembersCollected || 0} new members). Use Run Full Accessible Group to continue automatically.`;
                    break;
                }
            }
        }

        const toReview = shouldInlineReviewAfterDiscovery({ collectorMode, autoReviewAfterDiscovery })
            ? discoveredCards.slice(0, reviewLimit)
            : [];
        for (const card of toReview) {
            if (shouldStop?.()) {
                analytics.stopReason = FACEBOOK_STOP_REASONS.MANUAL_STOP;
                analytics.stopNote = 'Stop requested. Captured members were kept.';
                break;
            }
            report({ peopleTabStatus: 'reviewing', status: 'Reviewing profiles' });
            const stop = await reviewGroupMemberCard(page, {
                card,
                keyword,
                location,
                analytics,
                metrics,
                seen,
                errors,
                records,
                searchType: 'group_intelligence',
                discoveryType: FACEBOOK_DISCOVERY_TYPES.GROUP_PEOPLE_TAB,
            });
            analytics.reviewed = analytics.accessibleProfilesReviewed;
            if (stop) {
                analytics.stopReason = stop;
                break;
            }
            if (peopleUrl && !/\/(members|people)\b/i.test(page.url())) {
                const back = await gotoSafe(page, peopleUrl);
                if (back) {
                    metrics.challenge = back;
                    errors.push(back);
                    analytics.stopReason = resolveFacebookStopReason({ challenge: back });
                    analytics.stopNote = back;
                    break;
                }
            }
            report({});
        }

        analytics.accessiblePeopleTabProfilesLoaded = Math.max(
            analytics.accessiblePeopleTabProfilesLoaded || 0,
            peopleLoadedKeys.size,
        );
    }

    if (!skipDiscussion && !analytics.stopReason && !shouldStop?.() && !analytics.peopleTabOpened) {
        const discussion = await gotoSafe(page, chosen.pageUrl);
        if (discussion) {
            metrics.challenge = discussion;
            errors.push(discussion);
            analytics.stopReason = resolveFacebookStopReason({ challenge: discussion });
        } else {
            for (let i = 0; i < 4; i += 1) {
                if (shouldStop?.()) break;
                await page.evaluate(() => {
                    const main = document.querySelector('[role="main"]') || document.scrollingElement || document.body;
                    main.scrollBy(0, 800);
                });
                await sleep(HUMAN_DELAY_MS);
                const ch = await readChallenge(page);
                if (ch) {
                    metrics.challenge = ch;
                    errors.push(ch);
                    analytics.stopReason = resolveFacebookStopReason({ challenge: ch });
                    break;
                }
            }
            const activity = await page.evaluate(browserExtractGroupActivity);
            metrics.accessibleRecordsReviewed = (activity.posts || []).length;
            analytics.accessiblePostsReviewed = (activity.posts || []).length;
            if (activity.displayedMemberCount && !analytics.displayedMemberCount) {
                analytics.displayedMemberCount = activity.displayedMemberCount;
                analytics.displayedMemberCountParsed = parseDisplayedCount(analytics.displayedMemberCount);
            }
            if (activity.title && !analytics.groupTitle) {
                analytics.groupTitle = displayNameFromSocialText(activity.title, analytics.groupTitle);
            }
            for (const post of (activity.posts || []).slice(0, GROUP_POSTS_REVIEW_MAX)) {
                if (analytics.stopReason || shouldStop?.()) break;
                for (const link of post.links || []) {
                    if (analytics.stopReason || shouldStop?.()) break;
                    if (analytics.accessibleProfilesReviewed >= FACEBOOK_PEOPLE_TAB_MAX_REVIEW_PER_RUN) break;
                    const stop = await reviewGroupMemberCard(page, {
                        card: { href: link.href, name: link.name, cardText: `${link.name}\n${post.text}` },
                        keyword,
                        location,
                        analytics,
                        metrics,
                        seen,
                        errors,
                        records,
                        searchType: 'group_intelligence',
                        discoveryType: FACEBOOK_DISCOVERY_TYPES.GROUP_INTELLIGENCE,
                    });
                    if (stop) {
                        analytics.stopReason = stop;
                        break;
                    }
                }
            }
        }
    }

    const groupMeta = {
        groupUrl: analytics.groupUrl,
        groupTitle: analytics.groupTitle,
        displayedMemberCount: analytics.displayedMemberCount,
        privacy: analytics.privacy,
        accessiblePostsReviewed: analytics.accessiblePostsReviewed,
        membersEnumerated: false,
        peopleTabOpened: analytics.peopleTabOpened,
        peopleTabStatus: analytics.peopleTabStatus,
        peopleUrl: analytics.peopleUrl,
        stopNote: analytics.stopNote,
        relatedGroupsFound: analytics.relatedGroupsFound,
        relatedGroups: analytics.relatedGroups,
    };
    analytics.stopReason = analytics.stopReason || resolveFacebookStopReason({
        stopRequested: shouldStop?.(),
        challenge: metrics.challenge,
        queueEmpty: true,
    });
    report({ peopleTabStatus: analytics.peopleTabStatus || analytics.stopReason });
    metrics.validBusinessCandidates = records.length;
    return {
        records,
        errors,
        groupMeta,
        communityMeta: analytics,
        stopReason: analytics.stopReason,
        alreadyKnown: analytics.alreadyKnown,
    };
}

async function collectJoinedFacebookGroups(page, {
    keyword = '',
    location = '',
    metrics,
    onGroupFound,
    onProgress,
    shouldStop,
    seekGroupId = '',
} = {}) {
    const errors = [];
    const wantId = parseExactFacebookGroupSeek(seekGroupId) || String(seekGroupId || '').trim();
    const urls = [
        'https://www.facebook.com/groups/joins/',
        'https://www.facebook.com/groups/joins/?nav_source=tab',
        'https://www.facebook.com/groups/',
    ];
    let opened = false;
    for (const url of urls) {
        const challenge = await gotoSafe(page, url);
        if (challenge) {
            metrics.challenge = challenge;
            errors.push(challenge);
            continue;
        }
        await sleep(HUMAN_DELAY_MS);
        await clickNamedControl(page, ['Your groups', 'Joined', 'Groups']);
        opened = true;
        break;
    }
    if (!opened) {
        metrics.validBusinessCandidates = 0;
        return { records: [], errors, groupMeta: null, stopReason: FACEBOOK_STOP_REASONS.TECHNICAL_FAILURE };
    }

    const records = [];
    const seen = new Set();
    let idle = 0;
    let exactFound = false;
    let lastChallenge = '';

    const ingestVisible = (cards = []) => {
        for (const card of cards) {
            const classified = classifyFacebookUrl(unwrapSocialHref(card.href), 'groups');
            if (!classified || classified.resultTypeHint !== 'facebook_group') continue;
            const key = classified.pageUrl.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            const membership = parseFacebookGroupMembership({
                text: card.cardText,
                controls: card.controls,
            });
            const stamped = membership === 'Unknown' ? 'Joined' : membership;
            const rec = toDirectCandidate(classified, {
                platform: 'facebook',
                keyword: keyword || 'joined groups',
                location,
                searchType: 'joined_groups',
                title: displayNameFromSocialText(card.cardText, String(card.name || '').replace(/^Profile photo of\s+/i, '')) || classified.handle,
                snippet: card.cardText || 'Facebook group visible on My Joined Groups.',
                extraNotes: `joinedStatus=${stamped}; groupId=${classified.handle}; sourceSurface=facebook_joined_groups`,
            });
            records.push(rec);
            onGroupFound?.(rec);
            const id = String(classified.handle || facebookGroupIdFromUrl(classified.pageUrl) || '');
            if (wantId && id === wantId) exactFound = true;
        }
    };

    for (let pass = 0; pass < JOINED_GROUP_SCROLL_SAFETY; pass += 1) {
        if (shouldStop?.()) break;
        const cards = await page.evaluate(browserExtractFacebookGroupCards);
        const before = seen.size;
        ingestVisible(cards);
        metrics.rawDirectResults = seen.size;
        onProgress?.({
            status: wantId ? `Loading more joined groups...` : 'Searching Facebook...',
            joinedGroupsDiscovered: records.length,
            seekGroupId: wantId,
            exactFound,
        });
        if (exactFound) break;
        if (seen.size === before) idle += 1;
        else idle = 0;
        if (shouldStopJoinedGroupDiscovery({
            exactFound,
            idlePasses: idle,
            idleStop: JOINED_GROUP_IDLE_STOP,
            scrollPass: pass + 1,
            scrollSafety: JOINED_GROUP_SCROLL_SAFETY,
            sessionAttention: Boolean(lastChallenge),
        })) break;
        await page.evaluate(() => {
            const main = document.querySelector('[role="main"]') || document.scrollingElement || document.body;
            main.scrollBy(0, Math.min(1100, main.scrollHeight || 1100));
        });
        await sleep(HUMAN_DELAY_MS);
        await waitNetworkQuiet(page);
        lastChallenge = await readChallenge(page);
        if (lastChallenge) {
            metrics.challenge = lastChallenge;
            errors.push(lastChallenge);
            break;
        }
    }

    metrics.validBusinessCandidates = records.length;
    return {
        records,
        errors,
        groupMeta: null,
        matchedGroupId: exactFound ? wantId : '',
        stopReason: exactFound
            ? 'exact_group_found'
            : (lastChallenge ? resolveFacebookStopReason({ challenge: lastChallenge }) : FACEBOOK_STOP_REASONS.SOURCE_EXHAUSTED),
    };
}

async function discoverFacebookDirect(page, {
    keyword,
    location,
    searchType,
    maxResults,
    metrics,
    seenKeys,
    shouldStop,
    batchSize = FACEBOOK_COMMUNITY_BATCH_SIZE,
    groupUrl = '',
    groupName = '',
    onProgress,
    collectorMode = FACEBOOK_MEMBER_COLLECTOR_MODES.NEXT_BATCH,
    onDiscoveryBatch,
    pendingCards = [],
    onGroupFound,
    onMemberCard,
    seekGroupId = '',
    autoReviewAfterDiscovery = false,
} = {}) {
    const errors = [];
    const query = [keyword, location].filter(Boolean).join(' ').trim();
    const exactGroupUrl = searchType === 'group_intelligence' ? normalizeFacebookGroupUrl(groupUrl) : '';
    if (exactGroupUrl) {
        onProgress?.({
            groupTitle: groupName || '',
            groupUrl: exactGroupUrl,
            peopleTabStatus: 'opening',
            status: 'Opening selected group',
        });
        const directChallenge = await gotoSafe(page, exactGroupUrl);
        if (directChallenge) {
            metrics.challenge = directChallenge;
            return {
                records: [],
                errors: [directChallenge],
                groupMeta: null,
                stopReason: resolveFacebookStopReason({ challenge: directChallenge }),
            };
        }
        await sleep(HUMAN_DELAY_MS);
        const seenDirect = seenKeys instanceof Set ? seenKeys : new Set();
        return collectSelectedGroupIntelligence(page, {
            chosen: { pageUrl: exactGroupUrl, name: groupName || keyword, cardText: '' },
            keyword,
            location,
            metrics,
            seen: seenDirect,
            errors,
            shouldStop,
            onProgress,
            skipDiscussion: true,
            collectorMode,
            onDiscoveryBatch,
            pendingCards,
            onMemberCard,
            autoReviewAfterDiscovery,
        });
    }
    if (searchType === 'joined_groups') {
        return collectJoinedFacebookGroups(page, {
            keyword,
            location,
            metrics,
            onGroupFound,
            onProgress,
            shouldStop,
            seekGroupId,
        });
    }
    if (searchType === 'group_intelligence') {
        return {
            records: [],
            errors: ['Select an exact Facebook Group (Find Groups → Analyze Group, or paste a group URL). Group Intelligence does not guess a group from the keyword.'],
            groupMeta: null,
            communityMeta: emptyGroupAnalytics(),
            stopReason: FACEBOOK_STOP_REASONS.TECHNICAL_FAILURE,
        };
    }
    let challenge = await gotoSafe(page, 'https://www.facebook.com/');
    if (challenge) {
        metrics.challenge = challenge;
        return { records: [], errors: [challenge], groupMeta: null };
    }
    challenge = await gotoSafe(page, searchUrl('facebook', keyword, searchType, location));
    if (challenge) {
        metrics.challenge = challenge;
        return { records: [], errors: [challenge], groupMeta: null };
    }
    if (searchType === 'pages') {
        await clickNamedControl(page, ['Pages', 'Page']);
    }
    if (searchType === 'groups') {
        await clickNamedControl(page, ['Groups', 'Group']);
    }

    let hydrated = await waitForHydratedCards(page, 'facebook');
    if (!hydrated) {
        const box = await page.$('input[type="search"], input[aria-label="Search Facebook"], input[placeholder*="Search"]');
        if (box) {
            await box.click({ clickCount: 3 }).catch(() => {});
            await box.type(query, { delay: 60 });
            await page.keyboard.press('Enter').catch(() => {});
            await sleep(1600);
            await waitNetworkQuiet(page);
            hydrated = await waitForHydratedCards(page, 'facebook');
        }
    }
    if (!hydrated) {
        metrics.hydration = 'results_not_hydrated';
        return { records: [], errors: ['results_not_hydrated'], groupMeta: null };
    }
    metrics.hydration = 'ok';

    const scrollTarget = FACEBOOK_COMMUNITY_SEARCH_TYPES.includes(searchType)
        ? 80
        : Math.max((Number(maxResults) || 20) * 3, 15);
    const emitGroupTick = searchType === 'groups'
        ? (visible) => {
            for (const card of visible || []) {
                const classified = classifyFacebookUrl(unwrapSocialHref(card.href), 'groups');
                if (!classified || classified.resultTypeHint !== 'facebook_group') continue;
                onGroupFound?.({
                    resultUrl: classified.pageUrl,
                    groupUrl: classified.pageUrl,
                    title: displayNameFromSocialText(card.cardText, String(card.name || '').replace(/^Profile photo of\s+/i, '')) || classified.handle,
                    snippet: card.cardText || '',
                    notes: `joinedStatus=${parseFacebookGroupMembership({ text: card.cardText, controls: card.controls })}; groupId=${classified.handle}`,
                });
            }
        }
        : undefined;
    const scrolled = await scrollForMore(
        page,
        searchType === 'groups' ? browserExtractFacebookGroupCards : browserExtractFacebookCards,
        scrollTarget,
        emitGroupTick,
    );
    if (scrolled.challenge) {
        metrics.challenge = scrolled.challenge;
        errors.push(scrolled.challenge);
    }
    const rawCards = scrolled.cards || [];
    metrics.rawDirectResults = rawCards.length;

    const records = [];
    const seen = seenKeys instanceof Set ? seenKeys : new Set();
    const rejectedNoise = [];
    let enrichLeft = FACEBOOK_COMMUNITY_SEARCH_TYPES.includes(searchType) ? 40 : PROFILE_ENRICH_MAX;
    let groupMeta = null;
    let communityMeta = null;

    if (searchType === 'groups') {
        for (const card of rawCards) {
            const classified = classifyFacebookUrl(unwrapSocialHref(card.href), 'groups');
            if (!classified || classified.resultTypeHint !== 'facebook_group') {
                metrics.rejectedNavigationNoise += 1;
                rejectedNoise.push(card.href);
                continue;
            }
            const key = classified.pageUrl.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            const membership = parseFacebookGroupMembership({
                text: card.cardText,
                controls: card.controls,
            });
            const rec = toDirectCandidate(classified, {
                platform: 'facebook', keyword, location, searchType,
                title: displayNameFromSocialText(card.cardText, String(card.name || '').replace(/^Profile photo of\s+/i, '')) || classified.handle,
                snippet: card.cardText || 'Facebook Group visible in authenticated search results.',
                extraNotes: `joinedStatus=${membership}; groupId=${classified.handle}; sourceSurface=facebook_group_search`,
            });
            records.push(rec);
            onGroupFound?.(rec);
            if (records.length >= maxResults) break;
        }
        metrics.validBusinessCandidates = records.length;
        return { records, errors, groupMeta, rejectedNoise };
    }


    if (['page_audience', 'page_engagement', 'related_pages'].includes(searchType)) {
        const pages = [];
        for (const card of rawCards) {
            const classified = classifyFacebookUrl(unwrapSocialHref(card.href), 'pages');
            if (!classified || classified.resultTypeHint === 'facebook_group') continue;
            pages.push({
                ...classified,
                name: card.name || classified.handle,
                cardText: card.cardText || '',
                title: card.name,
            });
        }
        const chosen = pickRelevantFacebookPage(pages, keyword);
        const analytics = emptyPageAnalytics();
        if (!chosen) {
            analytics.stopReason = FACEBOOK_STOP_REASONS.SOURCE_EXHAUSTED;
            return {
                records,
                errors: errors.concat(['No relevant Facebook Page was visible for this keyword.']),
                groupMeta: null,
                communityMeta: analytics,
                stopReason: analytics.stopReason,
            };
        }
        challenge = await gotoSafe(page, chosen.pageUrl);
        if (challenge) {
            metrics.challenge = challenge;
            analytics.stopReason = resolveFacebookStopReason({ challenge });
            return { records, errors: errors.concat([challenge]), groupMeta: null, communityMeta: analytics, stopReason: analytics.stopReason };
        }
        const meta = await page.evaluate(browserExtractPageCommunityMeta);
        analytics.parentPage = /\(\d+\+?\)\s*facebook/i.test(meta.title || '')
            ? (chosen.name || chosen.handle)
            : (meta.title || chosen.name);
        analytics.parentUrl = chosen.pageUrl;
        const followerRaw = /\(\d+\+?\)\s*facebook/i.test(meta.title || '') ? '' : (meta.displayedFollowerCount || '');
        analytics.displayedFollowerCount = followerRaw;
        analytics.displayedFollowerCountParsed = parseDisplayedCount(analytics.displayedFollowerCount);
        analytics.followerListAccessible = false;
        analytics.followerListNote = analytics.displayedFollowerCount
            ? 'Follower count available, follower list not accessible'
            : 'Follower count not visible';

        if (shouldStop?.()) {
            analytics.stopReason = FACEBOOK_STOP_REASONS.MANUAL_STOP;
            communityMeta = analytics;
            return { records, errors, groupMeta: null, communityMeta, stopReason: analytics.stopReason };
        }

        const related = await page.evaluate(browserExtractRelatedFacebookPages);
        analytics.relatedPagesAccessible = related.length > 0;
        await page.evaluate(() => {
            const main = document.querySelector('[role="main"]') || document.scrollingElement || document.body;
            main.scrollBy(0, 900);
        });
        await sleep(HUMAN_DELAY_MS);
        const participants = await page.evaluate(browserExtractPostParticipants);
        analytics.engagementAccessible = participants.length > 0;

        const pool = [];
        const wantRelated = searchType === 'related_pages' || searchType === 'page_audience';
        const wantEngage = searchType === 'page_engagement' || searchType === 'page_audience';
        if (wantRelated) {
            for (const item of related) {
                pool.push({ ...item, discoveryType: FACEBOOK_DISCOVERY_TYPES.RELATED_PAGE });
            }
        }
        if (wantEngage) {
            for (const item of participants) {
                pool.push({ ...item, discoveryType: FACEBOOK_DISCOVERY_TYPES.PAGE_ENGAGEMENT });
            }
        }
        if (!pool.length && searchType === 'page_audience') {
            errors.push(analytics.followerListNote);
        }

        for (const item of pool) {
            if (shouldStop?.()) {
                analytics.stopReason = FACEBOOK_STOP_REASONS.MANUAL_STOP;
                break;
            }
            const classified = classifyFacebookUrl(unwrapSocialHref(item.href), 'pages')
                || classifyFacebookUrl(unwrapSocialHref(item.href), 'posts');
            if (!classified || classified.pageUrl === chosen.pageUrl) continue;
            analytics.accessibleProfilesReviewed += 1;
            const blob = `${item.name}\n${item.cardText}`;
            const relevance = classifyFacebookCommunityRelevance({ name: item.name, cardText: blob, keyword });
            if (relevance === 'not_relevant') analytics.notRelevant += 1;
            else if (relevance === 'possibly_relevant') analytics.possiblyRelevant += 1;
            else if (relevance === 'relevant') analytics.relevant += 1;
            else analytics.privateUnavailable += 1;
            if (!shouldIngestFacebookCommunity(relevance)) continue;
            const probe = { resultUrl: classified.pageUrl };
            if (isFbAlreadySeen(seen, probe)) {
                analytics.alreadyKnown += 1;
                continue;
            }
            addFbSeenKey(seen, probe);
            let website = extractExternalWebsite(blob);
            let snippet = blob;
            if (enrichLeft > 0 && item.discoveryType === FACEBOOK_DISCOVERY_TYPES.RELATED_PAGE) {
                enrichLeft -= 1;
                const opened = await extractFacebookProfileEvidence(page, classified.pageUrl);
                if (opened.challenge) {
                    metrics.challenge = opened.challenge;
                    errors.push(opened.challenge);
                    analytics.stopReason = resolveFacebookStopReason({ challenge: opened.challenge });
                    break;
                }
                if (opened.evidence) {
                    website = website || extractExternalWebsite([...(opened.evidence.hrefs || []), opened.evidence.text]);
                    snippet = [item.name, opened.evidence.category, opened.evidence.text].filter(Boolean).join(' · ').slice(0, 1800);
                }
            }
            const first = facebookCompanyFirst(`${item.name}\n${snippet}`, item.name);
            if (website) {
                metrics.externalWebsitesFound += 1;
                analytics.websites += 1;
            }
            if (extractVisibleEmail(snippet)) analytics.emails += 1;
            if (extractVisiblePhone(snippet)) analytics.phones += 1;
            records.push(toDirectCandidate(classified, {
                platform: 'facebook', keyword, location, searchType,
                title: first.companyName || item.name || classified.handle,
                snippet,
                website,
                extraNotes: [
                    `discoveryType=${item.discoveryType}`,
                    `parentPage=${analytics.parentPage}`,
                    `parentUrl=${analytics.parentUrl}`,
                    analytics.displayedFollowerCount ? `displayedFollowerCount=${analytics.displayedFollowerCount}` : '',
                    `followerListAccessible=false`,
                    `relevance=${relevance}`,
                    first.companyFirst ? `companyFirst=true; personEvidence=${first.personEvidence}` : '',
                ].join('; '),
            }));
            analytics.newUniqueCompanies += 1;
        }
        analytics.stopReason = analytics.stopReason || resolveFacebookStopReason({
            stopRequested: shouldStop?.(),
            challenge: metrics.challenge,
            queueEmpty: true,
        });
        metrics.validBusinessCandidates = records.length;
        communityMeta = analytics;
        return { records, errors, groupMeta: null, communityMeta, rejectedNoise, stopReason: analytics.stopReason, alreadyKnown: analytics.alreadyKnown };
    }

    for (const card of rawCards) {
        const classified = classifyFacebookUrl(unwrapSocialHref(card.href), searchType === 'posts' ? 'posts' : 'pages');
        if (!classified) {
            metrics.rejectedNavigationNoise += 1;
            continue;
        }
        if (classified.resultTypeHint === 'facebook_group' && searchType === 'pages') {
            metrics.rejectedNavigationNoise += 1;
            continue;
        }
        const key = classified.pageUrl.toLowerCase();
        if (seen.has(key)) continue;

        const profilePhp = classified.urlKind === 'profile_php' || isFacebookProfilePhp(classified.pageUrl);
        let website = extractExternalWebsite(card.cardText);
        let snippet = card.cardText || '';
        let title = displayNameFromSocialText(card.cardText, card.name) || classified.handle;
        let keep = profilePhp
            ? shouldKeepProfilePhp({ cardText: card.cardText, keyword })
            : (textHasKeywordEvidence(title, keyword)
                || textHasKeywordEvidence(String(card.cardText || '').slice(0, 350), keyword));

        if ((keep || profilePhp) && enrichLeft > 0 && (profilePhp || !website || !textHasKeywordEvidence(`${title} ${card.cardText}`, keyword))) {
            enrichLeft -= 1;
            const opened = await extractFacebookProfileEvidence(page, classified.pageUrl);
            if (opened.challenge) {
                metrics.challenge = opened.challenge;
                errors.push(opened.challenge);
                break;
            }
            if (opened.evidence) {
                title = displayNameFromSocialText(opened.evidence.text, opened.evidence.title || title) || title;
                website = website || extractExternalWebsite([...(opened.evidence.hrefs || []), opened.evidence.text]);
                const phone = opened.evidence.tel || extractVisiblePhone(opened.evidence.text);
                const email = opened.evidence.mail || extractVisibleEmail(opened.evidence.text);
                snippet = [
                    opened.evidence.category,
                    opened.evidence.text.slice(0, 900),
                    phone ? `phone=${phone}` : '',
                    email ? `email=${email}` : '',
                    website ? `website=${website}` : '',
                ].filter(Boolean).join(' · ');
                keep = profilePhp
                    ? shouldKeepProfilePhp({
                        cardText: card.cardText,
                        profileText: opened.evidence.text,
                        keyword,
                    })
                    : (textHasKeywordEvidence(title, keyword)
                        || textHasKeywordEvidence(String(snippet).slice(0, 400), keyword));
            }
        }

        if (!keep) {
            metrics.rejectedNoEvidence += 1;
            continue;
        }
        seen.add(key);
        if (website) metrics.externalWebsitesFound += 1;
        records.push(toDirectCandidate(classified, {
            platform: 'facebook', keyword, location, searchType,
            title, snippet, website,
        }));
        if (records.length >= maxResults) break;
    }
    metrics.validBusinessCandidates = records.length;
    return { records, errors, groupMeta, rejectedNoise };
}

function classifiedNeedsOpen(classified) {
    return classified?.urlKind === 'profile_php'
        || classified?.urlKind === 'group_member'
        || classified?.resultTypeHint === 'facebook_page'
        || classified?.resultTypeHint === 'facebook_profile';
}

async function discoverInstagramDirect(page, {
    keyword,
    location,
    searchType,
    metrics,
    seenKeys,
    shouldStop,
    batchSize = INSTAGRAM_BATCH_SIZE,
    onBatch,
} = {}) {
    const errors = [];
    const seen = seenKeys instanceof Set ? seenKeys : new Set();
    let alreadyKnown = 0;
    let stopReason = '';
    const size = Math.max(1, Number(batchSize) || INSTAGRAM_BATCH_SIZE);

    const markStop = (reason, extra = '') => {
        stopReason = reason;
        if (extra && !errors.includes(extra)) errors.push(extra);
    };

    const checkAbort = async () => {
        if (shouldStop?.()) {
            markStop(INSTAGRAM_STOP_REASONS.USER_STOP);
            return true;
        }
        const pageUrl = page.url();
        if (instagramSessionExpiredFromUrl(pageUrl)) {
            markStop(INSTAGRAM_STOP_REASONS.SESSION_EXPIRED, 'session_expired');
            return true;
        }
        const ch = await readChallenge(page);
        if (ch) {
            metrics.challenge = ch;
            markStop(resolveInstagramStopReason({
                sessionExpired: instagramSessionExpiredFromUrl(pageUrl),
                challenge: ch,
            }), ch);
            return true;
        }
        return false;
    };

    let challenge = await gotoSafe(page, 'https://www.instagram.com/');
    if (instagramSessionExpiredFromUrl(page.url())) {
        metrics.challenge = 'session_expired';
        return {
            records: [],
            errors: ['session_expired'],
            alreadyKnown: 0,
            stopReason: INSTAGRAM_STOP_REASONS.SESSION_EXPIRED,
        };
    }
    if (challenge) {
        metrics.challenge = challenge;
        return {
            records: [],
            errors: [challenge],
            alreadyKnown: 0,
            stopReason: resolveInstagramStopReason({ challenge }),
        };
    }
    const loggedInUsername = await page.evaluate(browserLoggedInInstagramUsername);

    let hydrated = false;
    const typed = await typeInstagramSearch(page, [keyword, location].filter(Boolean).join(' '));
    if (typed) {
        hydrated = await waitForHydratedCards(page, 'instagram');
    }
    if (!hydrated) {
        challenge = await gotoSafe(page, searchUrl('instagram', keyword, searchType === 'hashtag_topic' ? 'hashtag_topic' : 'business_profiles', location));
        if (challenge) {
            metrics.challenge = challenge;
            return {
                records: [],
                errors: [challenge],
                alreadyKnown: 0,
                stopReason: resolveInstagramStopReason({
                    sessionExpired: instagramSessionExpiredFromUrl(page.url()),
                    challenge,
                }),
            };
        }
        hydrated = await waitForHydratedCards(page, 'instagram');
    }
    if (!hydrated) {
        const debug = await page.evaluate(() => ({
            url: location.href,
            hasSearchInput: Boolean(document.querySelector('input[placeholder="Search"], input[aria-label="Search input"], input[aria-label="Search"]')),
            hrefSample: Array.from(document.querySelectorAll('a[href]')).map((a) => a.getAttribute('href')).filter(Boolean).slice(0, 25),
        }));
        metrics.hydration = 'results_not_hydrated';
        return {
            records: [],
            errors: ['results_not_hydrated', `debug=${JSON.stringify(debug)}`],
            alreadyKnown: 0,
            stopReason: INSTAGRAM_STOP_REASONS.SOURCE_EXHAUSTED,
        };
    }
    metrics.hydration = 'ok';

    let rawCards = await page.evaluate(browserExtractInstagramCards, loggedInUsername);
    let idle = 0;
    for (let i = 0; i < SCROLL_MAX; i += 1) {
        if (await checkAbort()) break;
        const prev = rawCards.length;
        await page.evaluate(() => {
            const main = document.querySelector('[role="listbox"]')
                || document.querySelector('[role="dialog"]')
                || document.querySelector('[role="main"]')
                || document.scrollingElement;
            if (main) main.scrollBy(0, 700);
        });
        await sleep(HUMAN_DELAY_MS);
        rawCards = await page.evaluate(browserExtractInstagramCards, loggedInUsername);
        if (rawCards.length === prev) {
            idle += 1;
            if (idle >= SCROLL_IDLE_STOP) break;
        } else {
            idle = 0;
        }
    }
    metrics.rawDirectResults = rawCards.length;

    const extraCards = [];
    if (!stopReason && (searchType === 'hashtag_topic' || searchType === 'community_intelligence')) {
        for (const tag of instagramHashtagCandidates(keyword)) {
            if (await checkAbort()) break;
            const ch = await gotoSafe(page, `https://www.instagram.com/explore/tags/${encodeURIComponent(tag)}/`);
            if (ch) {
                metrics.challenge = ch;
                errors.push(ch);
                markStop(resolveInstagramStopReason({ challenge: ch }), ch);
                break;
            }
            await sleep(HUMAN_DELAY_MS);
            extraCards.push(...(await page.evaluate(browserHashtagPostAccounts)));
        }
    }

    const records = [];
    let seedForRelated = null;
    const queue = [...rawCards, ...extraCards];
    let currentBatch = [];
    const refillQueries = [];
    if (String(location || '').trim()) {
        refillQueries.push({ kind: 'search', q: String(keyword).trim() });
    }
    if (searchType !== 'hashtag_topic' && searchType !== 'community_intelligence') {
        for (const tag of instagramHashtagCandidates(keyword)) {
            refillQueries.push({ kind: 'hashtag', q: tag });
        }
    }

    const flushBatch = async () => {
        if (!currentBatch.length) return;
        if (typeof onBatch === 'function') {
            await onBatch(currentBatch.slice());
        }
        currentBatch = [];
    };

    const refillQueue = async () => {
        while (!queue.length && refillQueries.length && !stopReason) {
            if (await checkAbort()) return;
            const next = refillQueries.shift();
            if (next.kind === 'hashtag') {
                const ch = await gotoSafe(page, `https://www.instagram.com/explore/tags/${encodeURIComponent(next.q)}/`);
                if (ch) {
                    metrics.challenge = ch;
                    errors.push(ch);
                    markStop(resolveInstagramStopReason({ challenge: ch }), ch);
                    return;
                }
                await sleep(HUMAN_DELAY_MS);
                queue.push(...(await page.evaluate(browserHashtagPostAccounts)));
                continue;
            }
            const typed = await typeInstagramSearch(page, next.q);
            if (typed) await waitForHydratedCards(page, 'instagram');
            let more = await page.evaluate(browserExtractInstagramCards, loggedInUsername);
            let idleMore = 0;
            for (let i = 0; i < SCROLL_MAX; i += 1) {
                if (await checkAbort()) return;
                const prev = more.length;
                await page.evaluate(() => {
                    const main = document.querySelector('[role="listbox"]')
                        || document.querySelector('[role="dialog"]')
                        || document.querySelector('[role="main"]')
                        || document.scrollingElement;
                    if (main) main.scrollBy(0, 700);
                });
                await sleep(HUMAN_DELAY_MS);
                more = await page.evaluate(browserExtractInstagramCards, loggedInUsername);
                if (more.length === prev) {
                    idleMore += 1;
                    if (idleMore >= SCROLL_IDLE_STOP) break;
                } else idleMore = 0;
            }
            metrics.rawDirectResults = (metrics.rawDirectResults || 0) + more.length;
            queue.push(...more);
        }
    };

    while (!stopReason) {
        if (!queue.length) {
            await refillQueue();
            if (!queue.length) break;
        }
        if (await checkAbort()) break;
        const card = queue.shift();
        const classified = classifyInstagramUrl(unwrapSocialHref(card.href || card.pageUrl), 'business_profiles');
        if (!classified || classified.resultTypeHint !== 'instagram_profile') {
            if (!classified) metrics.rejectedNavigationNoise += 1;
            continue;
        }
        const probe = { resultUrl: classified.pageUrl, sourceRecordId: `instagram:${classified.handle}` };
        if (isAlreadySeen(seen, probe)) {
            alreadyKnown += 1;
            continue;
        }
        const cardLooksUseful = shouldKeepInstagramAccount({
            handle: classified.handle,
            displayName: card.name,
            bio: card.cardText,
            keyword,
            loggedInUsername,
        });

        let website = extractWebsiteFromInstagramEvidence({ snippet: card.cardText });
        let snippet = card.cardText || '';
        let title = card.name || classified.handle;
        let visited = false;
        if (cardLooksUseful || !website) {
            const ch = await gotoSafe(page, classified.pageUrl);
            visited = true;
            if (instagramSessionExpiredFromUrl(page.url())) {
                markStop(INSTAGRAM_STOP_REASONS.SESSION_EXPIRED, 'session_expired');
                break;
            }
            if (ch) {
                metrics.challenge = ch;
                errors.push(ch);
                markStop(resolveInstagramStopReason({ challenge: ch }), ch);
                break;
            }
            const evidence = await page.evaluate(browserExtractProfileEvidence);
            website = website || extractWebsiteFromInstagramEvidence({
                snippet: evidence.text,
                hrefs: evidence.hrefs || [],
            });
            title = displayNameFromSocialText(evidence.text, evidence.title || title) || title;
            snippet = [evidence.category, evidence.text.slice(0, 900), website ? `website=${website}` : ''].filter(Boolean).join(' · ');
            if (!shouldKeepInstagramAccount({
                handle: classified.handle,
                displayName: title,
                bio: snippet,
                category: evidence.category,
                keyword,
                loggedInUsername,
            })) {
                metrics.rejectedNoEvidence += 1;
                addSeenKey(seen, probe);
                continue;
            }
            if (!seedForRelated) seedForRelated = classified;
            const related = await page.evaluate(browserRelatedInstagramAccounts);
            for (const r of related) {
                queue.push({
                    ...r,
                    cardText: `${r.cardText || ''} related to ${classified.handle}`,
                    sourceRelationship: 'related_accounts',
                });
            }
            await sleep(HUMAN_DELAY_MS);
        } else if (!cardLooksUseful) {
            metrics.rejectedNoEvidence += 1;
            addSeenKey(seen, probe);
            continue;
        }

        const rec = stampInstagramWebsiteOnCandidate(toDirectCandidate(classified, {
            platform: 'instagram', keyword, location, searchType,
            title, snippet, website,
            extraNotes: card.sourceRelationship && seedForRelated
                ? `sourceRelationship=related_accounts; seedAccount=${seedForRelated.handle}`
                : '',
        }));
        addSeenKey(seen, rec);
        if (website) metrics.externalWebsitesFound += 1;
        records.push(rec);
        currentBatch.push(rec);
        if (currentBatch.length >= size) {
            await flushBatch();
        }
        void visited;
    }

    if (!stopReason) {
        stopReason = resolveInstagramStopReason({ queueEmpty: queue.length === 0, noNewAfterScroll: true });
    }
    await flushBatch();
    metrics.validBusinessCandidates = records.length;
    return { records, errors, alreadyKnown, stopReason };
}

export async function verifyExactFacebookGroup({ companyId, groupUrl = '' }) {
    const want = normalizeFacebookGroupUrl(groupUrl);
    if (!want) {
        return { ok: false, error: 'Enter a numeric Facebook Group ID or exact group URL.' };
    }
    const session = readSocialSession('facebook', companyId);
    if (session.status !== 'connected') {
        return { ok: false, error: 'Connect Direct Facebook Login first, then Find Exact Group.' };
    }
    return withSocialBrowser('facebook', companyId, async (page) => {
        const challenge = await gotoSafe(page, want);
        if (challenge) {
            return { ok: false, error: challenge, attentionRequired: true, requestedUrl: want };
        }
        await page.waitForSelector('h1', { timeout: 15000 }).catch(() => {});
        await sleep(HUMAN_DELAY_MS * 2);
        const landing = await page.evaluate(browserExtractExactGroupLanding);
        const wall = `${landing.pageUrl || ''} ${landing.bodyText || ''}`.toLowerCase();
        if (/\/login/i.test(landing.pageUrl || '') || /log in to facebook|create new account/i.test(wall)) {
            return {
                ok: false,
                error: 'Facebook session needs attention. Complete login in the Chrome window, then try Find Exact Group again.',
                attentionRequired: true,
                requestedUrl: want,
                landing,
            };
        }
        return { ok: true, landing, requestedUrl: want };
    }, { headless: false });
}

export async function discoverWithDirectLogin({
    platform,
    companyId,
    keyword,
    location = '',
    searchType,
    maxResults = 20,
    seenKeys,
    shouldStop,
    batchSize,
    onBatch,
    groupUrl = '',
    groupName = '',
    onProgress,
    collectorMode = FACEBOOK_MEMBER_COLLECTOR_MODES.NEXT_BATCH,
    onDiscoveryBatch,
    pendingCards = [],
    onGroupFound,
    onMemberCard,
    seekGroupId = '',
    autoReviewAfterDiscovery = false,
} = {}) {
    if (platform === 'linkedin' || platform === 'x') {
        return discoverLinkedInOrXDirect({ platform, companyId, keyword, location, searchType, maxResults });
    }
    const session = readSocialSession(platform, companyId);
    if (session.status !== 'connected') {
        return {
            records: [],
            errors: ['Direct login is disconnected. Connect first, then search only data visible to that session.'],
            session,
            metrics: emptyMetrics(),
        };
    }

    const metrics = emptyMetrics();
    try {
        const collected = await withSocialBrowser(platform, companyId, async (page) => {
            if (platform === 'instagram') {
                return discoverInstagramDirect(page, {
                    keyword,
                    location,
                    searchType,
                    metrics,
                    seenKeys,
                    shouldStop,
                    batchSize,
                    onBatch,
                });
            }
            return discoverFacebookDirect(page, {
                keyword,
                location,
                searchType,
                maxResults,
                metrics,
                seenKeys,
                shouldStop,
                batchSize,
                groupUrl,
                groupName,
                onProgress,
                collectorMode,
                onDiscoveryBatch,
                pendingCards,
                onGroupFound,
                onMemberCard,
                seekGroupId,
                autoReviewAfterDiscovery,
            });
        }, { headless: false });

        writeSocialSession(platform, companyId, { status: 'connected' });
        const errors = [...(collected.errors || [])];
        if (metrics.challenge && !errors.includes(metrics.challenge)) errors.push(metrics.challenge);
        if (metrics.hydration === 'results_not_hydrated' && !errors.includes('results_not_hydrated')) {
            errors.push('results_not_hydrated');
        }
        return {
            records: collected.records || [],
            errors,
            session: readSocialSession(platform, companyId),
            groupMeta: collected.groupMeta || null,
            communityMeta: collected.communityMeta || null,
            metrics,
            alreadyKnown: collected.alreadyKnown || 0,
            stopReason: collected.stopReason || '',
        };
    } catch (err) {
        writeSocialSession(platform, companyId, {
            status: 'expired',
            note: String(err?.message || 'Direct session failed').slice(0, 240),
        });
        return {
            records: [],
            errors: [String(err?.message || 'Direct search failed').slice(0, 240)],
            session: readSocialSession(platform, companyId),
            metrics,
            alreadyKnown: 0,
            stopReason: platform === 'instagram'
                ? INSTAGRAM_STOP_REASONS.TECHNICAL_FAILURE
                : (platform === 'facebook' ? FACEBOOK_STOP_REASONS.TECHNICAL_FAILURE : ''),
        };
    }
}
