import puppeteer from 'puppeteer';
import fs from 'fs';
import { readSocialSession, writeSocialSession, socialUserDataDir, clearSocialSession } from './sessionStore.util.js';
import { classifyFacebookUrl, classifyInstagramUrl } from './classify.util.js';
import {
    detectPlatformChallenge,
    displayNameFromSocialText,
    extractExternalWebsite,
    extractVisibleEmail,
    extractVisiblePhone,
    instagramHashtagCandidates,
    isFacebookProfilePhp,
    pickRelevantFacebookGroup,
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

async function withSocialBrowser(platform, companyId, fn, { headless = false } = {}) {
    const userDataDir = socialUserDataDir(platform, companyId);
    const executablePath = resolveChromeExecutable();
    const launchOpts = {
        headless: headless ? 'new' : false,
        userDataDir,
        args: LAUNCH_ARGS,
    };
    if (executablePath) launchOpts.executablePath = executablePath;
    const browser = await puppeteer.launch(launchOpts);
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
    for (const art of source.slice(0, 25)) {
        const text = (art.innerText || '').slice(0, 1500);
        const links = Array.from(art.querySelectorAll('a[href]')).map((a) => ({
            href: a.href,
            name: (a.getAttribute('aria-label') || a.innerText || '').split('\n')[0].slice(0, 200),
        }));
        posts.push({ text, links });
    }
    const title = document.title || '';
    const body = (document.body && document.body.innerText) ? document.body.innerText : '';
    const member = body.match(/([\d,.]+)\s*members?/i);
    const privacy = /public group/i.test(body) ? 'public' : (/private group/i.test(body) ? 'private' : '');
    return {
        title: title.slice(0, 200),
        displayedMemberCount: member ? member[1] : '',
        privacy,
        posts,
    };
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

async function scrollForMore(page, extractFn, maxResults) {
    let lastCount = 0;
    let idle = 0;
    let cards = [];
    for (let i = 0; i < SCROLL_MAX; i += 1) {
        cards = await page.evaluate(extractFn);
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

async function discoverFacebookDirect(page, { keyword, location, searchType, maxResults, metrics }) {
    const errors = [];
    const query = [keyword, location].filter(Boolean).join(' ').trim();
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
    if (searchType === 'groups' || searchType === 'group_intelligence') {
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

    const scrolled = await scrollForMore(page, browserExtractFacebookCards, Math.max(maxResults * 3, 15));
    if (scrolled.challenge) {
        metrics.challenge = scrolled.challenge;
        errors.push(scrolled.challenge);
    }
    const rawCards = scrolled.cards || [];
    metrics.rawDirectResults = rawCards.length;

    const records = [];
    const seen = new Set();
    const rejectedNoise = [];
    let enrichLeft = PROFILE_ENRICH_MAX;
    let groupMeta = null;

    if (searchType === 'groups') {
        for (const card of rawCards) {
            const classified = classifyFacebookUrl(unwrapSocialHref(card.href), 'groups');
            if (!classified) {
                metrics.rejectedNavigationNoise += 1;
                rejectedNoise.push(card.href);
                continue;
            }
            const key = classified.pageUrl.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            records.push(toDirectCandidate(classified, {
                platform: 'facebook', keyword, location, searchType,
                title: displayNameFromSocialText(card.cardText, String(card.name || '').replace(/^Profile photo of\s+/i, '')) || classified.handle,
                snippet: card.cardText || 'Facebook Group visible in authenticated search results.',
            }));
            if (records.length >= maxResults) break;
        }
        metrics.validBusinessCandidates = records.length;
        return { records, errors, groupMeta, rejectedNoise };
    }

    if (searchType === 'group_intelligence') {
        const groups = [];
        for (const card of rawCards) {
            const classified = classifyFacebookUrl(unwrapSocialHref(card.href), 'groups');
            if (!classified) continue;
            groups.push({
                ...classified,
                name: card.name || classified.handle,
                cardText: card.cardText || '',
                pageUrl: classified.pageUrl,
            });
        }
        const chosen = pickRelevantFacebookGroup(groups, keyword);
        if (!chosen) {
            metrics.rejectedNoEvidence += rawCards.length;
            return { records, errors: errors.concat(['No relevant Facebook Group was visible for this keyword.']), groupMeta: null };
        }
        challenge = await gotoSafe(page, chosen.pageUrl);
        if (challenge) {
            metrics.challenge = challenge;
            return { records, errors: errors.concat([challenge]), groupMeta: null };
        }
        await sleep(HUMAN_DELAY_MS);
        for (let i = 0; i < 6; i += 1) {
            await page.evaluate(() => {
                const main = document.querySelector('[role="main"]') || document.scrollingElement || document.body;
                main.scrollBy(0, 800);
            });
            await sleep(HUMAN_DELAY_MS);
            await waitNetworkQuiet(page);
            const ch = await readChallenge(page);
            if (ch) {
                metrics.challenge = ch;
                errors.push(ch);
                break;
            }
        }
        const activity = await page.evaluate(browserExtractGroupActivity);
        metrics.accessibleRecordsReviewed = (activity.posts || []).length;
        const memberFromCard = (chosen.cardText || '').match(/([\d.,]+[KkMm]?)\s*members?/i);
        groupMeta = {
            groupUrl: chosen.pageUrl,
            groupTitle: displayNameFromSocialText(chosen.cardText, chosen.name) || activity.title || chosen.name,
            displayedMemberCount: activity.displayedMemberCount || (memberFromCard ? memberFromCard[1] : ''),
            privacy: activity.privacy || (/public/i.test(chosen.cardText || '') ? 'public' : ''),
            accessiblePostsReviewed: (activity.posts || []).length,
            membersEnumerated: false,
        };
        const candidates = [];
        for (const post of (activity.posts || []).slice(0, GROUP_POSTS_REVIEW_MAX)) {
            for (const link of post.links || []) {
                const classified = facebookCardToClassified({ href: link.href }, 'group_intelligence');
                if (!classified) continue;
                if (classified.resultTypeHint === 'facebook_group') continue;
                const blob = `${link.name}\n${post.text}`;
                const pageFromGroup = classified.urlKind === 'page' && textHasKeywordEvidence(blob, keyword);
                if (!pageFromGroup && !shouldKeepGroupParticipant({ name: link.name, cardText: blob, keyword })) continue;
                const key = classified.pageUrl.toLowerCase();
                if (seen.has(key)) continue;
                seen.add(key);
                candidates.push({ classified, name: link.name, cardText: blob, postText: post.text });
            }
        }
        for (const c of candidates) {
            if (records.length >= maxResults) break;
            let website = extractExternalWebsite(c.cardText);
            let snippet = c.cardText;
            let profileText = '';
            if (enrichLeft > 0 && (classifiedNeedsOpen(c.classified) || !website)) {
                enrichLeft -= 1;
                const opened = await extractFacebookProfileEvidence(page, c.classified.pageUrl);
                if (opened.challenge) {
                    metrics.challenge = opened.challenge;
                    errors.push(opened.challenge);
                    break;
                }
                if (opened.evidence) {
                    profileText = opened.evidence.text || '';
                    website = website || extractExternalWebsite([...(opened.evidence.hrefs || []), opened.evidence.text]);
                    snippet = [c.name, opened.evidence.category, opened.evidence.text].filter(Boolean).join(' · ').slice(0, 1800);
                    if (!shouldKeepGroupParticipant({
                        name: c.name, cardText: c.cardText, profileText, website, keyword,
                    })) {
                        metrics.rejectedNoEvidence += 1;
                        continue;
                    }
                }
            }
            if (website) metrics.externalWebsitesFound += 1;
            records.push(toDirectCandidate(c.classified, {
                platform: 'facebook', keyword, location, searchType: 'group_intelligence',
                title: c.name || c.classified.handle,
                snippet,
                website,
                extraNotes: [
                    `groupName=${groupMeta.groupTitle}`,
                    `groupUrl=${groupMeta.groupUrl}`,
                    groupMeta.displayedMemberCount ? `displayedMemberCount=${groupMeta.displayedMemberCount}` : 'displayedMemberCount=not visible',
                    'membersEnumerated=false',
                ].join('; '),
            }));
        }
        metrics.validBusinessCandidates = records.length;
        metrics.rejectedNoEvidence += Math.max(0, metrics.accessibleRecordsReviewed - records.length);
        return { records, errors, groupMeta, rejectedNoise };
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
    return classified?.urlKind === 'profile_php' || classified?.resultTypeHint === 'facebook_page';
}

async function discoverInstagramDirect(page, { keyword, location, searchType, maxResults, metrics }) {
    const errors = [];
    let challenge = await gotoSafe(page, 'https://www.instagram.com/');
    if (challenge) {
        metrics.challenge = challenge;
        return { records: [], errors: [challenge] };
    }
    const loggedInUsername = await page.evaluate(browserLoggedInInstagramUsername);

    let hydrated = false;
    const typed = await typeInstagramSearch(page, keyword);
    if (typed) {
        hydrated = await waitForHydratedCards(page, 'instagram');
    }
    if (!hydrated) {
        challenge = await gotoSafe(page, searchUrl('instagram', keyword, searchType === 'hashtag_topic' ? 'hashtag_topic' : 'business_profiles', location));
        if (challenge) {
            metrics.challenge = challenge;
            return { records: [], errors: [challenge] };
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
        return { records: [], errors: ['results_not_hydrated', `debug=${JSON.stringify(debug)}`] };
    }
    metrics.hydration = 'ok';

    let rawCards = await page.evaluate(browserExtractInstagramCards, loggedInUsername);
    for (let i = 0; i < SCROLL_MAX && rawCards.length < maxResults * 2; i += 1) {
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
        if (rawCards.length === prev) break;
        const ch = await readChallenge(page);
        if (ch) {
            metrics.challenge = ch;
            errors.push(ch);
            break;
        }
    }
    metrics.rawDirectResults = rawCards.length;

    const extraCards = [];
    if (searchType === 'hashtag_topic' || searchType === 'community_intelligence') {
        for (const tag of instagramHashtagCandidates(keyword)) {
            const ch = await gotoSafe(page, `https://www.instagram.com/explore/tags/${encodeURIComponent(tag)}/`);
            if (ch) {
                metrics.challenge = ch;
                errors.push(ch);
                break;
            }
            await sleep(HUMAN_DELAY_MS);
            extraCards.push(...(await page.evaluate(browserHashtagPostAccounts)));
        }
    }

    const records = [];
    const seen = new Set();
    let enrichLeft = PROFILE_ENRICH_MAX;
    let seedForRelated = null;
    const queue = [...rawCards, ...extraCards];

    while (queue.length && records.length < maxResults) {
        const card = queue.shift();
        const classified = classifyInstagramUrl(unwrapSocialHref(card.href || card.pageUrl), 'business_profiles');
        if (!classified || classified.resultTypeHint !== 'instagram_profile') {
            if (!classified) metrics.rejectedNavigationNoise += 1;
            continue;
        }
        const key = classified.pageUrl.toLowerCase();
        if (seen.has(key)) continue;
        const cardLooksUseful = shouldKeepInstagramAccount({
            handle: classified.handle,
            displayName: card.name,
            bio: card.cardText,
            keyword,
            loggedInUsername,
        });
        if (!cardLooksUseful && enrichLeft <= 0) {
            metrics.rejectedNoEvidence += 1;
            continue;
        }

        let website = extractExternalWebsite(card.cardText);
        let snippet = card.cardText || '';
        let title = card.name || classified.handle;
        if (enrichLeft > 0) {
            enrichLeft -= 1;
            const ch = await gotoSafe(page, classified.pageUrl);
            if (ch) {
                metrics.challenge = ch;
                errors.push(ch);
                break;
            }
            const evidence = await page.evaluate(browserExtractProfileEvidence);
            website = website || extractExternalWebsite([...(evidence.hrefs || []), evidence.text]);
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
                continue;
            }
            if (!seedForRelated) seedForRelated = classified;
            if (searchType === 'related_accounts' || searchType === 'community_intelligence') {
                const related = await page.evaluate(browserRelatedInstagramAccounts);
                for (const r of related) {
                    queue.push({
                        ...r,
                        cardText: `${r.cardText || ''} related to ${classified.handle}`,
                        sourceRelationship: 'related_accounts',
                    });
                }
            }
        }
        seen.add(key);
        if (website) metrics.externalWebsitesFound += 1;
        records.push(toDirectCandidate(classified, {
            platform: 'instagram', keyword, location, searchType,
            title, snippet, website,
            extraNotes: card.sourceRelationship && seedForRelated
                ? `sourceRelationship=related_accounts; seedAccount=${seedForRelated.handle}`
                : '',
        }));
    }

    metrics.validBusinessCandidates = records.length;
    return { records, errors };
}

export async function discoverWithDirectLogin({ platform, companyId, keyword, location = '', searchType, maxResults = 20 }) {
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
                return discoverInstagramDirect(page, { keyword, location, searchType, maxResults, metrics });
            }
            return discoverFacebookDirect(page, { keyword, location, searchType, maxResults, metrics });
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
            metrics,
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
        };
    }
}
