import puppeteer from 'puppeteer';
import fs from 'fs';
import { readSocialSession, writeSocialSession, socialUserDataDir } from './sessionStore.util.js';
import { classifyLinkedInUrl, classifyXUrl, xPostToProfileEvidence } from './linkedinX.classify.util.js';
import {
    detectPlatformChallenge,
    displayNameFromSocialText,
    extractExternalWebsite,
    textHasKeywordEvidence,
    unwrapSocialHref,
} from './directLogin.quality.util.js';

const LAUNCH_ARGS = ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'];
const LOGIN_WAIT_MS = 20 * 60 * 1000;
const HYDRATION_TIMEOUT_MS = 18000;
const STABILIZE_MS = 1100;
const HUMAN_DELAY_MS = 900;
const SCROLL_MAX = 12;
const PROFILE_ENRICH_MAX = 6;

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

async function withSocialBrowser(platform, companyId, fn) {
    const userDataDir = socialUserDataDir(platform, companyId);
    const executablePath = resolveChromeExecutable();
    const launchOpts = {
        headless: false,
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

function linkedinLoggedIn(cookies = []) {
    return cookies.some((c) => c.name === 'li_at');
}

function xLoggedIn(cookies = []) {
    return cookies.some((c) => c.name === 'auth_token' || c.name === 'twid');
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

function toCandidate(classified, {
    platform, keyword, location, searchType, title = '', snippet = '', website = '', extraNotes = '', evidenceUrl = '',
}) {
    const notes = [
        `source=${platform}`,
        'mode=direct_login',
        `searchType=${searchType}`,
        `keyword=${keyword}`,
        String(location || '').trim() ? `location=${String(location).trim()}` : '',
        `evidenceUrl=${evidenceUrl || classified.pageUrl}`,
        website ? `website=${website}` : '',
        extraNotes,
        `extractedAt=${new Date().toISOString()}`,
    ].filter(Boolean).join('; ').slice(0, 2000);
    const rec = {
        title: String(title || classified.handle || '').slice(0, 500),
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
    return detectPlatformChallenge(text, pageUrl)
        || (/rate limit|too many requests|temporarily restricted/i.test(`${pageUrl}\n${text}`) ? 'platform_challenge' : '');
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

function searchUrl(platform, keyword, searchType, location = '') {
    const q = encodeURIComponent([keyword, location].filter(Boolean).join(' ').trim());
    if (platform === 'linkedin') {
        if (searchType === 'professionals') {
            return `https://www.linkedin.com/search/results/people/?keywords=${q}`;
        }
        return `https://www.linkedin.com/search/results/companies/?keywords=${q}`;
    }
    if (searchType === 'posts') return `https://x.com/search?q=${q}&src=typed_query&f=live`;
    return `https://x.com/search?q=${q}&src=typed_query&f=user`;
}

function browserExtractLinkedInCards(kind) {
    const main = document.querySelector('[role="main"]') || document.body;
    const items = [];
    const seen = new Set();
    const want = kind === 'professionals' ? '/in/' : '/company/';
    for (const a of main.querySelectorAll('a[href]')) {
        if (a.closest('header') || a.closest('[role="banner"]') || a.closest('nav')) continue;
        const href = a.href || '';
        if (!href.toLowerCase().includes(want)) continue;
        const container = a.closest('li') || a.closest('[role="listitem"]') || a.closest('[role="article"]') || a.parentElement;
        const cardText = ((container && container.innerText) ? container.innerText : (a.innerText || '')).slice(0, 700);
        const name = (a.innerText || a.getAttribute('aria-label') || '').split('\n').map((s) => s.trim()).find(Boolean) || '';
        const key = href.split('?')[0].toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        items.push({ href: href.split('?')[0], name: name.slice(0, 200), cardText });
    }
    return items.slice(0, 80);
}

function browserExtractXCards(kind) {
    const main = document.querySelector('[role="main"]') || document.body;
    const items = [];
    const seen = new Set();
    if (kind === 'posts') {
        for (const a of main.querySelectorAll('a[href*="/status/"]')) {
            const href = (a.href || '').split('?')[0];
            if (seen.has(href.toLowerCase())) continue;
            seen.add(href.toLowerCase());
            const article = a.closest('article') || a.closest('[role="article"]') || a.parentElement;
            items.push({
                href,
                name: '',
                cardText: ((article && article.innerText) ? article.innerText : '').slice(0, 700),
                kind: 'post',
            });
        }
        return items.slice(0, 80);
    }
    const cells = main.querySelectorAll('[data-testid="UserCell"]');
    const nodes = cells.length ? cells : main.querySelectorAll('a[href]');
    for (const node of nodes) {
        const a = node.tagName === 'A' ? node : node.querySelector('a[href^="/"]');
        if (!a) continue;
        const hrefAttr = a.getAttribute('href') || '';
        const m = hrefAttr.match(/^\/([A-Za-z0-9_]{1,15})\/?$/);
        if (!m) continue;
        const handle = m[1];
        const key = handle.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        const text = ((node.innerText || a.innerText || '')).slice(0, 700);
        items.push({
            href: `https://x.com/${handle}`,
            name: text.split('\n')[0] || handle,
            cardText: text,
            handle,
            kind: 'profile',
        });
    }
    return items.slice(0, 80);
}

function browserExtractProfileEvidence() {
    const main = document.querySelector('[role="main"]') || document.body;
    const text = ((main && main.innerText) ? main.innerText : '').slice(0, 4000);
    const title = (document.title || '').split('|')[0].split('(')[0].trim();
    const hrefs = Array.from(document.querySelectorAll('a[href]')).map((a) => a.href).slice(0, 80);
    return { title: title.slice(0, 200), text, hrefs };
}

async function waitHydrated(page, platform, searchType) {
    try {
        await page.waitForFunction((p, st) => {
            const main = document.querySelector('[role="main"]') || document.body;
            if (!main) return false;
            if (p === 'linkedin') {
                const needle = st === 'professionals' ? '/in/' : '/company/';
                let n = 0;
                main.querySelectorAll('a[href]').forEach((a) => {
                    if (a.closest('nav') || a.closest('header')) return;
                    if ((a.href || '').includes(needle)) n += 1;
                });
                return n >= 2;
            }
            if (st === 'posts') return main.querySelectorAll('a[href*="/status/"]').length >= 1;
            return (main.querySelectorAll('[data-testid="UserCell"]').length
                + Array.from(main.querySelectorAll('a[href^="/"]')).filter((a) => /^\/[A-Za-z0-9_]{1,15}\/?$/.test(a.getAttribute('href') || '')).length) >= 1;
        }, { timeout: HYDRATION_TIMEOUT_MS }, platform, searchType);
        await sleep(STABILIZE_MS);
        return true;
    } catch {
        return false;
    }
}

async function scrollMore(page, extractFn, arg, maxResults) {
    let cards = [];
    let idle = 0;
    let last = 0;
    for (let i = 0; i < SCROLL_MAX; i += 1) {
        cards = await page.evaluate(extractFn, arg);
        if (cards.length >= maxResults) break;
        if (cards.length === last) {
            idle += 1;
            if (idle >= 3) break;
        } else idle = 0;
        last = cards.length;
        await page.evaluate(() => {
            const main = document.querySelector('[role="main"]') || document.scrollingElement || document.body;
            main.scrollBy(0, 800);
        });
        await sleep(HUMAN_DELAY_MS);
        const ch = await readChallenge(page);
        if (ch) return { cards, challenge: ch };
    }
    return { cards, challenge: '' };
}

export async function connectLinkedInOrXLogin({ platform, companyId }) {
    const home = platform === 'linkedin' ? 'https://www.linkedin.com/' : 'https://x.com/';
    const result = await withSocialBrowser(platform, companyId, async (page) => {
        await page.goto(home, { waitUntil: 'domcontentloaded' });
        const deadline = Date.now() + LOGIN_WAIT_MS;
        while (Date.now() < deadline) {
            const cookies = await page.cookies();
            const ok = platform === 'linkedin' ? linkedinLoggedIn(cookies) : xLoggedIn(cookies);
            if (ok) return { ok: true };
            await sleep(2000);
        }
        return { ok: false, reason: 'Login was not completed in time. Complete login in the browser window (CAPTCHA is not bypassed).' };
    });
    if (result.ok) {
        return writeSocialSession(platform, companyId, {
            status: 'connected',
            connectedAt: new Date().toISOString(),
            note: 'Authenticated session stored in an isolated Data Extractor profile. Not WhatsApp.',
        });
    }
    return writeSocialSession(platform, companyId, { status: 'disconnected', note: result.reason });
}

export async function discoverLinkedInOrXDirect({ platform, companyId, keyword, location = '', searchType, maxResults = 20 }) {
    const session = readSocialSession(platform, companyId);
    const metrics = emptyMetrics();
    if (session.status !== 'connected') {
        return {
            records: [],
            errors: ['Direct login is disconnected. Connect first, then search only data visible to that session.'],
            session,
            metrics,
        };
    }
    try {
        const collected = await withSocialBrowser(platform, companyId, async (page) => {
            const home = platform === 'linkedin' ? 'https://www.linkedin.com/' : 'https://x.com/';
            let challenge = await gotoSafe(page, home);
            if (challenge) {
                metrics.challenge = challenge;
                return { records: [], errors: [challenge] };
            }
            challenge = await gotoSafe(page, searchUrl(platform, keyword, searchType, location));
            if (challenge) {
                metrics.challenge = challenge;
                return { records: [], errors: [challenge] };
            }
            const hydrated = await waitHydrated(page, platform, searchType);
            if (!hydrated) {
                metrics.hydration = 'results_not_hydrated';
                return { records: [], errors: ['results_not_hydrated'] };
            }
            metrics.hydration = 'ok';
            const extractFn = platform === 'linkedin' ? browserExtractLinkedInCards : browserExtractXCards;
            const arg = platform === 'linkedin'
                ? (searchType === 'professionals' ? 'professionals' : 'companies')
                : (searchType === 'posts' ? 'posts' : 'profiles');
            const scrolled = await scrollMore(page, extractFn, arg, Math.max(maxResults * 2, 12));
            if (scrolled.challenge) {
                metrics.challenge = scrolled.challenge;
            }
            const rawCards = scrolled.cards || [];
            metrics.rawDirectResults = rawCards.length;
            const records = [];
            const seen = new Set();
            let enrichLeft = PROFILE_ENRICH_MAX;

            for (const card of rawCards) {
                if (records.length >= maxResults) break;
                let classified = platform === 'linkedin'
                    ? classifyLinkedInUrl(unwrapSocialHref(card.href), searchType)
                    : classifyXUrl(unwrapSocialHref(card.href), searchType);
                if (!classified) {
                    metrics.rejectedNavigationNoise += 1;
                    continue;
                }
                let evidenceUrl = classified.pageUrl;
                if (platform === 'x' && classified.urlKind === 'post') {
                    const mapped = xPostToProfileEvidence(classified, { snippet: card.cardText });
                    if (!mapped) continue;
                    classified = { ...mapped };
                    evidenceUrl = mapped.evidenceUrl;
                }
                if (platform === 'linkedin' && searchType === 'companies' && classified.urlKind !== 'company') {
                    metrics.rejectedNavigationNoise += 1;
                    continue;
                }
                if (platform === 'linkedin' && searchType === 'professionals' && classified.urlKind === 'professional') {
                    /* keep professional as evidence; company-first applied after enrich */
                }
                const key = classified.pageUrl.toLowerCase();
                if (seen.has(key)) continue;

                const blob = `${card.name || ''} ${card.cardText || ''}`;
                if (!textHasKeywordEvidence(blob, keyword) && enrichLeft <= 0) {
                    metrics.rejectedNoEvidence += 1;
                    continue;
                }

                let website = extractExternalWebsite(card.cardText);
                let snippet = card.cardText || '';
                let title = displayNameFromSocialText(card.cardText, card.name) || classified.handle;
                let extraNotes = evidenceUrl !== classified.pageUrl ? `postEvidence=${evidenceUrl}` : '';

                if (enrichLeft > 0) {
                    enrichLeft -= 1;
                    const ch = await gotoSafe(page, classified.pageUrl);
                    if (ch) {
                        metrics.challenge = ch;
                        break;
                    }
                    const evidence = await page.evaluate(browserExtractProfileEvidence);
                    website = website || extractExternalWebsite([...(evidence.hrefs || []), evidence.text]);
                    title = displayNameFromSocialText(evidence.text, evidence.title || title) || title;
                    snippet = [evidence.text.slice(0, 900), website ? `website=${website}` : ''].filter(Boolean).join(' · ');
                    if (!textHasKeywordEvidence(`${title} ${snippet} ${blob}`, keyword)) {
                        metrics.rejectedNoEvidence += 1;
                        continue;
                    }
                    if (platform === 'linkedin' && searchType === 'professionals') {
                        const companyLink = (evidence.hrefs || []).map((h) => classifyLinkedInUrl(h, 'companies')).find((c) => c?.urlKind === 'company');
                        if (companyLink) {
                            extraNotes = [
                                extraNotes,
                                `professionalUrl=https://www.linkedin.com/in/${classified.handle}`,
                                `professionalName=${title}`,
                                `companyUrl=${companyLink.pageUrl}`,
                            ].filter(Boolean).join('; ');
                            classified = companyLink;
                        } else {
                            extraNotes = [extraNotes, 'companyFirst=professional_only'].filter(Boolean).join('; ');
                        }
                    }
                } else if (!textHasKeywordEvidence(blob, keyword)) {
                    metrics.rejectedNoEvidence += 1;
                    continue;
                }

                if (seen.has(classified.pageUrl.toLowerCase())) continue;
                seen.add(classified.pageUrl.toLowerCase());
                if (website) metrics.externalWebsitesFound += 1;
                records.push(toCandidate(classified, {
                    platform, keyword, location, searchType, title, snippet, website, extraNotes, evidenceUrl,
                }));
            }
            metrics.validBusinessCandidates = records.length;
            return { records, errors: metrics.challenge ? [metrics.challenge] : [] };
        });

        writeSocialSession(platform, companyId, { status: 'connected' });
        return {
            records: collected.records || [],
            errors: collected.errors || [],
            session: readSocialSession(platform, companyId),
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
