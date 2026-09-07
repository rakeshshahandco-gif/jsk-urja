/**
 * Assisted Visible Google Capture — operator-driven, no auto search/scroll/next.
 *
 * Capture triggers:
 * 1) stdin: type `capture` then Enter
 * 2) page flag: window.__JSK_CAPTURE_VISIBLE__ = true (polled every 1s)
 *
 * Does NOT bypass consent/captcha/login. Does NOT upload HTML/DOM/cookies.
 * Does NOT auto-scroll, auto-next, stealth, or use proxies.
 */
import readline from 'readline';
import crypto from 'crypto';
import { crm as defaultCrm } from '../crmClient.js';
import {
    forceGoogleWebSearchUrl,
    looksLikeGoogleJobsOrVerticalHtml,
    ensureGoogleWebResultsPage,
} from './googleWebGuard.js';

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

/**
 * Hard captcha interstitial only — NOT mere "recaptcha" script tags on normal SERPs.
 */
function detectPageKindFromHtml(html) {
    const s = String(html || '').toLowerCase();
    if (!s.trim()) return 'unsupported';
    const hasOrganicMarkers = s.includes('id="search"')
        || s.includes("id='search'")
        || s.includes('id="rso"')
        || s.includes("id='rso'")
        || s.includes('data-organic="1"')
        || (s.includes('class="g"') && s.includes('<h3'))
        || (s.includes('/url?q=') && s.includes('<h3'));

    if (looksLikeGoogleJobsOrVerticalHtml(html)) return 'jobs_vertical';
    if (s.includes('consent.google') || s.includes('before you continue') || s.includes('consent.google.com')) {
        return 'consent';
    }
    const hardCaptcha = s.includes('our systems have detected unusual traffic')
        || s.includes('/sorry/index')
        || s.includes('id="captcha-form"')
        || (s.includes('/sorry/') && (s.includes('unusual traffic') || s.includes('captcha')));
    if (hardCaptcha && !hasOrganicMarkers) return 'captcha';
    if (
        (s.includes('accounts.google.com') && (s.includes('signin') || s.includes('sign in')))
        || s.includes('sign in to continue')
    ) {
        if (!hasOrganicMarkers) return 'login';
    }
    if (hasOrganicMarkers) return 'organic';
    if (hardCaptcha) return 'captcha';
    if (
        s.includes('did not match any documents')
        || s.includes('your search did not return any documents')
        || s.includes('no results found')
    ) {
        return 'no_results';
    }
    return 'unsupported';
}

/**
 * In-page extractor + safe local diagnostics (no HTML/DOM upload).
 */
export function buildOrganicExtractionScript() {
    return () => {
        const diag = {
            host: location.hostname || '',
            title: (document.title || '').slice(0, 200),
            pageKind: 'unsupported',
            parserStatus: 'unsupported_layout',
            candidateCardCount: 0,
            organicCardCount: 0,
            acceptedResultCount: 0,
            excludedByReason: {
                sponsored: 0,
                paa: 0,
                related: 0,
                knowledgePanel: 0,
                localMap: 0,
                video: 0,
                news: 0,
                shopping: 0,
                noTitleAnchor: 0,
                badUrl: 0,
                dedupe: 0,
            },
        };

        function classifyBlockReason(el) {
            if (!el) return 'noTitleAnchor';
            const cls = String(el.className || '').toLowerCase();
            if (el.getAttribute('data-sponsored') === '1' || cls.includes('ads-ad') || cls.includes('commercial-unit')) return 'sponsored';
            if (el.getAttribute('data-paa') === '1') return 'paa';
            const text = String(el.innerText || '').slice(0, 200).toLowerCase();
            if (text.includes('people also ask')) return 'paa';
            if (el.getAttribute('data-related') === '1') return 'related';
            if (el.getAttribute('data-kp') === '1' || cls.includes('knowledge-panel')) return 'knowledgePanel';
            if (el.getAttribute('data-local') === '1' || cls.includes('map-pack')) return 'localMap';
            if (el.getAttribute('data-video') === '1') return 'video';
            if (el.getAttribute('data-news') === '1') return 'news';
            if (el.getAttribute('data-shopping') === '1') return 'shopping';
            return '';
        }

        function looksBlocked(el) {
            return Boolean(classifyBlockReason(el));
        }

        function isGoogleHost(host) {
            const h = String(host || '').toLowerCase();
            return h === 'google.com'
                || h.endsWith('.google.com')
                || h === 'google.co.in'
                || h.endsWith('.google.co.in');
        }

        function normalizeUrl(raw) {
            const parts = String(raw || '').trim().split(/\s+/).filter(Boolean);
            for (const part of parts) {
                const url = unwrapHref(part);
                if (url) return url;
            }
            return '';
        }

        function unwrapHref(raw) {
            let href = String(raw || '').trim();
            if (!href || /^javascript:/i.test(href)) return '';
            for (let i = 0; i < 3; i += 1) {
                try {
                    const u = new URL(href, 'https://www.google.com');
                    if (isGoogleHost(u.hostname) && (u.pathname === '/url' || u.pathname.startsWith('/url'))) {
                        const next = u.searchParams.get('q') || u.searchParams.get('url');
                        if (!next) return '';
                        href = next;
                        continue;
                    }
                    if (isGoogleHost(u.hostname)) return '';
                    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
                    return u.toString();
                } catch {
                    return '';
                }
            }
            return '';
        }

        function pickSnippet(card) {
            const sn = card.querySelector('[data-snippet="1"], .VwiC3b, .IsZvec, .aCOpRe, [data-sncf]');
            return ((sn && sn.textContent) || '').trim().slice(0, 5000);
        }

        function pickDestinationUrl(card, titleAnchor) {
            const tries = [];
            if (titleAnchor) {
                tries.push(titleAnchor.getAttribute('href') || titleAnchor.href || '');
                tries.push(titleAnchor.getAttribute('ping') || '');
            }
            for (const a of Array.from(card.querySelectorAll('a[href]'))) {
                tries.push(a.getAttribute('href') || a.href || '');
                tries.push(a.getAttribute('ping') || '');
            }
            const cite = card.querySelector('cite');
            const citeHost = ((cite && cite.textContent) || '').trim().split(/[\s›>]/)[0];
            if (citeHost && citeHost.includes('.')) {
                tries.push(citeHost.startsWith('http') ? citeHost : `https://${citeHost}`);
            }
            for (const raw of tries) {
                const url = normalizeUrl(raw);
                if (url) return url;
            }
            return '';
        }

        function cardToResult(card) {
            const reason = classifyBlockReason(card);
            if (reason) {
                diag.excludedByReason[reason] = (diag.excludedByReason[reason] || 0) + 1;
                return null;
            }
            const h3 = card.querySelector('a[href] h3, h3');
            if (!h3) {
                diag.excludedByReason.noTitleAnchor += 1;
                return null;
            }
            const a = h3.closest('a') || card.querySelector('a[href]');
            const title = (h3.textContent || '').trim();
            if (!title || title.length < 2) {
                diag.excludedByReason.noTitleAnchor += 1;
                return null;
            }
            const resultUrl = pickDestinationUrl(card, a);
            if (!resultUrl) {
                diag.excludedByReason.badUrl += 1;
                return null;
            }
            return {
                title: title.slice(0, 500),
                snippet: pickSnippet(card),
                resultUrl,
                resultPosition: 0,
                resultTypeHint: 'unknown',
            };
        }

        function resolveCardFromH3(h3) {
            const a = h3.closest('a');
            if (!a) return null;
            return a.closest('div.g')
                || a.closest('[data-organic="1"]')
                || a.closest('div[data-hveid]')
                || a.closest('.MjjYud, .hlcw0c, .N54PNb')
                || a.closest('#rso > div')
                || a.parentElement;
        }

        const html = document.documentElement ? document.documentElement.outerHTML : '';
        const lower = html.toLowerCase();
        const hasOrganicMarkers = lower.includes('id="search"')
            || lower.includes("id='search'")
            || lower.includes('id="rso"')
            || lower.includes("id='rso'")
            || lower.includes('data-organic="1"')
            || (lower.includes('class="g"') && lower.includes('<h3'))
            || (lower.includes('/url?q=') && lower.includes('<h3'));

        if (lower.includes('consent.google') || lower.includes('before you continue')) diag.pageKind = 'consent';
        else if (
            (lower.includes('our systems have detected unusual traffic')
                || lower.includes('/sorry/index')
                || lower.includes('id="captcha-form"')
                || (lower.includes('/sorry/') && (lower.includes('unusual traffic') || lower.includes('captcha'))))
            && !hasOrganicMarkers
        ) diag.pageKind = 'captcha';
        else if (
            ((lower.includes('accounts.google.com') && (lower.includes('signin') || lower.includes('sign in')))
                || lower.includes('sign in to continue'))
            && !hasOrganicMarkers
        ) diag.pageKind = 'login';
        else if (hasOrganicMarkers) diag.pageKind = 'organic';
        else if (
            lower.includes('did not match any documents')
            || lower.includes('your search did not return any documents')
            || lower.includes('no results found')
        ) diag.pageKind = 'no_results';
        else diag.pageKind = 'unsupported';

        if (diag.pageKind !== 'organic') {
            diag.parserStatus = 'unsupported_layout';
            return {
                results: [],
                status: 'unsupported_layout',
                message: 'Page kind: ' + diag.pageKind,
                pageKind: diag.pageKind,
                diagnostics: diag,
            };
        }

        const results = [];
        const seen = new Set();
        const push = (rec) => {
            if (!rec) return;
            if (seen.has(rec.resultUrl)) {
                diag.excludedByReason.dedupe += 1;
                return;
            }
            seen.add(rec.resultUrl);
            rec.resultPosition = results.length + 1;
            results.push(rec);
            diag.acceptedResultCount = results.length;
        };

        const marked = Array.from(document.querySelectorAll('[data-organic="1"]'));
        diag.candidateCardCount += marked.length;
        for (const card of marked) {
            if (results.length >= 100) break;
            push(cardToResult(card));
        }
        diag.organicCardCount = results.length;

        if (!results.length) {
            const live = Array.from(document.querySelectorAll('#search .g, #rso .g, div.g'));
            diag.candidateCardCount += live.length;
            for (const card of live) {
                if (results.length >= 100) break;
                if (card.getAttribute('data-organic') === '0') continue;
                push(cardToResult(card));
            }
            diag.organicCardCount = results.length;
        }

        if (!results.length) {
            const modern = Array.from(document.querySelectorAll('#rso div[data-hveid], #rso .MjjYud, #rso .hlcw0c, #search .MjjYud'));
            diag.candidateCardCount += modern.length;
            for (const card of modern) {
                if (results.length >= 100) break;
                if (looksBlocked(card)) {
                    const reason = classifyBlockReason(card);
                    if (reason) diag.excludedByReason[reason] = (diag.excludedByReason[reason] || 0) + 1;
                    continue;
                }
                push(cardToResult(card));
            }
            diag.organicCardCount = results.length;
        }

        if (!results.length) {
            const h3s = Array.from(document.querySelectorAll('#rso a h3, #search a h3'));
            diag.candidateCardCount += h3s.length;
            for (const h3 of h3s) {
                if (results.length >= 100) break;
                const card = resolveCardFromH3(h3);
                if (!card) {
                    diag.excludedByReason.noTitleAnchor += 1;
                    continue;
                }
                push(cardToResult(card));
            }
            diag.organicCardCount = results.length;
        }

        if (!results.length) {
            if (diag.pageKind === 'organic') diag.pageKind = 'no_results';
            diag.parserStatus = 'unsupported_layout';
            return {
                results: [],
                status: 'unsupported_layout',
                message: 'Page kind: ' + diag.pageKind,
                pageKind: diag.pageKind,
                diagnostics: diag,
            };
        }

        diag.parserStatus = 'completed';
        diag.acceptedResultCount = results.length;
        return {
            results: results.slice(0, 100),
            status: 'completed',
            message: 'Organic results parsed',
            pageKind: diag.pageKind,
            diagnostics: diag,
        };
    };
}

function logSafeDiagnostics(extracted) {
    const d = extracted?.diagnostics || {};
    console.log('Capture diagnostics:', JSON.stringify({
        host: d.host || '',
        title: d.title || '',
        parserStatus: d.parserStatus || extracted?.status || '',
        pageKind: d.pageKind || extracted?.pageKind || '',
        candidateCardCount: d.candidateCardCount || 0,
        organicCardCount: d.organicCardCount || 0,
        acceptedResultCount: d.acceptedResultCount || (extracted?.results || []).length,
        excludedByReason: d.excludedByReason || {},
    }));
}

async function waitForCaptureSignal(page, {
    shouldStop,
    sessionId,
    sessionToken,
    agentInstanceId,
    crm: crmClient,
} = {}) {
    let captureRequested = false;
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const onLine = (line) => {
        if (String(line || '').trim().toLowerCase() === 'capture') captureRequested = true;
    };
    rl.on('line', onLine);
    // Terminal `capture` remains optional fallback only — CRM Capture Visible Results is the normal path.
    console.log('Waiting for CRM Capture Visible Results (polled). Optional fallback: type `capture` here.');

    const client = crmClient || defaultCrm;
    let lastCaptureKey = '';

    try {
        while (!captureRequested) {
            if (shouldStop && shouldStop()) return { cancelled: true };

            const flag = await page.evaluate(() => Boolean(window.__JSK_CAPTURE_VISIBLE__)).catch(() => false);
            if (flag) {
                await page.evaluate(() => { window.__JSK_CAPTURE_VISIBLE__ = false; }).catch(() => {});
                return { cancelled: false, source: 'browser_flag' };
            }

            if (sessionId && sessionToken) {
                try {
                    const pending = await client.getCaptureRequest(sessionId, sessionToken, agentInstanceId);
                    const remoteStatus = String(pending?.sessionStatus || '');
                    if (['completed', 'cancelled', 'expired', 'failed'].includes(remoteStatus)) {
                        return { cancelled: false, endedBySession: remoteStatus };
                    }
                    if (pending?.sessionActive === false) {
                        return { cancelled: false, endedBySession: remoteStatus || 'completed' };
                    }
                    if (pending?.pending && pending?.idempotencyKey) {
                        const key = String(pending.idempotencyKey);
                        if (key !== lastCaptureKey) {
                            lastCaptureKey = key;
                            await client.ackCaptureRequest(sessionId, {
                                agentInstanceId,
                                idempotencyKey: key,
                            }, sessionToken);
                            return { cancelled: false, source: 'crm_capture_request', idempotencyKey: key };
                        }
                    }
                    if (pending?.pendingNavigation?.pending && pending?.pendingNavigation?.targetUrl) {
                        return {
                            cancelled: false,
                            source: 'crm_navigate_next_page',
                            navigate: true,
                            targetUrl: String(pending.pendingNavigation.targetUrl),
                        };
                    }
                } catch (err) {
                    // Soft-fail poll; keep waiting for stdin / browser flag
                    if (err && Number(err.status) === 401) throw err;
                }
            }

            await sleep(1000);
        }
        return { cancelled: false, source: 'stdin' };
    } finally {
        rl.off('line', onLine);
        rl.close();
    }
}

async function waitForSearchSettled(page) {
    // Do not auto-scroll. Wait briefly for organic anchors if the page is still painting.
    await page.waitForFunction(() => {
        const organic = document.querySelectorAll('#rso a h3, #search a h3, [data-organic="1"] a h3, #search .g a h3').length;
        const blocked = /unusual traffic|before you continue|sign in to continue/i.test(document.body?.innerText || '');
        return organic > 0 || blocked;
    }, { timeout: 8000 }).catch(() => {});
    await sleep(400);
}

/**
 * @param {import('playwright').Page} page
 * @param {object} session
 * @param {object} opts
 */
export async function runAssistedGoogleCapture(page, session, opts = {}) {
    const crm = opts.crm || defaultCrm;
    const sessionId = String(opts.sessionId || session?._id || session?.id || '').trim();
    const sessionToken = opts.sessionToken;
    const agentInstanceId = opts.agentInstanceId;
    const onManual = opts.onManual;
    const shouldStop = opts.shouldStop;

    if (!sessionId) throw new Error('Assisted capture sessionId missing');
    if (!sessionToken) throw new Error('Assisted session token missing');

    const searchUrl = forceGoogleWebSearchUrl(String(session?.searchUrl || opts.searchUrl || '').trim());
    if (!searchUrl) throw new Error('Assisted capture session missing searchUrl');
    // Hard guard: only managed Google Search URLs (never Bing / maps / arbitrary sites)
    try {
        const u = new URL(searchUrl);
        const host = String(u.hostname || '').toLowerCase();
        const isGoogle = host === 'google.com'
            || host.endsWith('.google.com')
            || host === 'google.co.in'
            || host.endsWith('.google.co.in');
        if (!isGoogle || !u.pathname.includes('/search')) {
            throw new Error('Only Google Search URLs are allowed for assisted capture');
        }
    } catch (err) {
        if (err && /Only Google Search/.test(err.message)) throw err;
        throw new Error('Invalid Google Search URL for assisted capture');
    }

    await crm.assistedHeartbeat(sessionId, { agentInstanceId, status: 'opening' }, sessionToken);
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });
    await crm.assistedBrowserOpened(sessionId, { agentInstanceId }, sessionToken);

    const webGuard = await ensureGoogleWebResultsPage(page);
    if (webGuard.stillVertical) {
        const msg = 'Google Jobs/Shopping/Images vertical detected. Do not scrape this page. Retry Web/All results, then Capture.';
        if (onManual) await onManual(msg);
        await crm.assistedManual(sessionId, { agentInstanceId, message: msg }, sessionToken);
    }

    const htmlProbe = await page.content().catch(() => '');
    const kind = detectPageKindFromHtml(htmlProbe);
    if (kind === 'consent' || kind === 'captcha' || kind === 'login') {
        const msg = 'Manual action required: ' + kind + ' page detected. Do not bypass; resolve in the visible browser, then click Continue After Manual Action in CRM.';
        if (onManual) await onManual(msg);
        await crm.assistedManual(sessionId, { agentInstanceId, message: msg }, sessionToken);

        // Wait until CRM Continue After Manual Action (status -> awaiting_user) or Capture request / session end.
        // Do NOT auto-capture after CAPTCHA resolution.
        while (true) {
            if (shouldStop && shouldStop()) {
                return { stopped: true, reason: 'stopped', results: [], captured: 0 };
            }
            try {
                const pending = await crm.getCaptureRequest(sessionId, sessionToken, agentInstanceId);
                const remoteStatus = String(pending?.sessionStatus || '');
                if (['completed', 'cancelled', 'expired', 'failed'].includes(remoteStatus)) {
                    return { stopped: false, failed: false, results: [], captured: 0, endedBy: remoteStatus };
                }
                if (pending?.pending && pending?.idempotencyKey) {
                    // Owner clicked Capture while still on interstitial — re-check page first
                    break;
                }
                if (remoteStatus === 'awaiting_user' || remoteStatus === 'ready_to_capture') {
                    const html2 = await page.content().catch(() => '');
                    const kind2 = detectPageKindFromHtml(html2);
                    if (kind2 === 'consent' || kind2 === 'captcha' || kind2 === 'login') {
                        await crm.assistedManual(sessionId, {
                            agentInstanceId,
                            message: 'Still blocked by ' + kind2 + '. Resolve in the Google window, then Continue again.',
                        }, sessionToken);
                    } else {
                        break;
                    }
                }
            } catch (err) {
                if (err && Number(err.status) === 401) throw err;
            }
            await sleep(1000);
        }
    }

    await crm.assistedHeartbeat(sessionId, { agentInstanceId, status: 'awaiting_user' }, sessionToken);

    // Multi-capture loop: CRM Capture / Capture Again keeps the session active.
    // Do NOT auto-complete after one capture — owner clicks Complete Session in CRM.
    let eventSequence = 0;
    let lastSubmitted = null;
    let lastExtracted = null;
    let totalCaptured = 0;
    const allResults = [];

    while (true) {
        if (shouldStop && shouldStop()) {
            return { stopped: true, reason: 'stopped', results: allResults, captured: totalCaptured };
        }

        // If CRM already completed/cancelled the session, exit quietly
        try {
            const pendingProbe = await crm.getCaptureRequest(sessionId, sessionToken, agentInstanceId);
            const remoteStatus = String(pendingProbe?.sessionStatus || pendingProbe?.pendingCapture?.sessionStatus || '');
            if (['completed', 'cancelled', 'expired', 'failed'].includes(remoteStatus)) {
                return {
                    stopped: false,
                    failed: false,
                    results: allResults,
                    captured: totalCaptured,
                    submitted: lastSubmitted,
                    extracted: lastExtracted,
                    endedBy: remoteStatus,
                };
            }
        } catch (_) {
            /* soft-fail; continue waiting for capture */
        }

        await crm.assistedHeartbeat(sessionId, { agentInstanceId, status: 'awaiting_user' }, sessionToken);

        const wait = await waitForCaptureSignal(page, {
            shouldStop,
            sessionId,
            sessionToken,
            agentInstanceId,
            crm,
        });
        if (wait.cancelled) {
            return { stopped: true, reason: 'stopped', results: allResults, captured: totalCaptured };
        }
        if (wait.endedBySession) {
            return {
                stopped: false,
                failed: false,
                results: allResults,
                captured: totalCaptured,
                submitted: lastSubmitted,
                extracted: lastExtracted,
                endedBy: wait.endedBySession,
            };
        }

        // Owner-driven Open Next Google Page (single navigation; never auto-loop)
        if (wait.navigate && wait.targetUrl) {
            try {
                await crm.ackNavigateRequest(sessionId, { agentInstanceId }, sessionToken);
            } catch (err) {
                if (err && Number(err.status) === 401) throw err;
            }
            await crm.assistedHeartbeat(sessionId, { agentInstanceId, status: 'opening' }, sessionToken);
            const nextUrl = forceGoogleWebSearchUrl(String(wait.targetUrl));
            await page.goto(nextUrl, { waitUntil: 'domcontentloaded' });
            await crm.assistedBrowserOpened(sessionId, { agentInstanceId }, sessionToken);
            await ensureGoogleWebResultsPage(page);

            const htmlNav = await page.content().catch(() => '');
            const kindNav = detectPageKindFromHtml(htmlNav);
            if (kindNav === 'consent' || kindNav === 'captcha' || kindNav === 'login') {
                const msg = 'Manual action required: ' + kindNav + ' page detected after next-page navigation. Resolve in the visible browser, then Continue After Manual Action.';
                if (onManual) await onManual(msg);
                await crm.assistedManual(sessionId, { agentInstanceId, message: msg }, sessionToken);
            } else {
                try {
                    await crm.completeNavigateRequest(sessionId, { agentInstanceId }, sessionToken);
                } catch (_) { /* soft */ }
                await crm.assistedHeartbeat(sessionId, { agentInstanceId, status: 'awaiting_user' }, sessionToken);
            }
            continue;
        }

        await waitForSearchSettled(page);

        // Re-check consent/captcha before each capture
        const htmlBefore = await page.content().catch(() => '');
        const kindBefore = detectPageKindFromHtml(htmlBefore);
        if (kindBefore === 'consent' || kindBefore === 'captcha' || kindBefore === 'login') {
            const msg = 'Manual action required: ' + kindBefore + ' page detected. Resolve in the Google window, then click Capture again in CRM.';
            if (onManual) await onManual(msg);
            await crm.assistedManual(sessionId, { agentInstanceId, message: msg }, sessionToken);
            continue;
        }
        if (kindBefore === 'jobs_vertical') {
            const retried = await ensureGoogleWebResultsPage(page);
            const kindAfter = detectPageKindFromHtml(await page.content().catch(() => ''));
            if (retried.stillVertical || kindAfter === 'jobs_vertical') {
                const msg = 'Google Jobs/Shopping/Images vertical detected. Capture skipped. Open Web/All results, then Capture.';
                if (onManual) await onManual(msg);
                await crm.assistedManual(sessionId, { agentInstanceId, message: msg }, sessionToken);
                continue;
            }
        }

        await crm.assistedHeartbeat(sessionId, { agentInstanceId, status: 'ready_to_capture' }, sessionToken);
        await crm.assistedHeartbeat(sessionId, { agentInstanceId, status: 'capturing' }, sessionToken);

        const extracted = await page.evaluate(buildOrganicExtractionScript());
        logSafeDiagnostics(extracted);
        lastExtracted = extracted;
        const results = Array.isArray(extracted?.results) ? extracted.results.slice(0, 100) : [];

        if (!results.length) {
            const kind = String(extracted?.pageKind || kindBefore || 'unsupported');
            const code = (kind === 'no_results' || extracted?.message === 'No organic results extracted')
                ? 'NO_ORGANIC_RESULTS'
                : 'UNSUPPORTED_LAYOUT';
            await crm.assistedFail(sessionId, {
                agentInstanceId,
                code,
                message: extracted?.message || ('Page kind: ' + kind),
            }, sessionToken);
            // Stay attached so CRM can retry this page or advance query/provider.
            // Do not abandon the session and leave Auto Collection looping on the same page.
            continue;
        }

        eventSequence += 1;
        const eventIdempotencyKey = 'evt-' + sessionId + '-' + Date.now() + '-' + crypto.randomBytes(4).toString('hex');
        try {
            lastSubmitted = await crm.assistedEvent(sessionId, {
                agentInstanceId,
                eventIdempotencyKey,
                eventSequence,
                visibleResultCount: results.length,
                googlePageIndex: Number(opts.googlePageIndex || 0) || undefined,
                results,
            }, sessionToken);
            const accepted = Number(lastSubmitted?.ingest?.acceptedCount
                ?? lastSubmitted?.event?.acceptedCount
                ?? results.length);
            totalCaptured += accepted > 0 ? accepted : results.length;
            allResults.push(...results);
            if (lastSubmitted?.bookkeepingWarning) {
                console.warn('[assisted] session bookkeeping warning (ingest accepted):', lastSubmitted.bookkeepingWarning);
            }
        } catch (err) {
            // Provider/extract succeeded; classify CRM failure
            const status = Number(err?.status || 0);
            const msg = String(err?.message || err || '');
            // If CRM reports idempotent replay / accepted counts in body, do not fail session
            const bodyAccepted = Number(err?.body?.data?.ingest?.acceptedCount
                || err?.body?.data?.event?.acceptedCount
                || 0);
            if (bodyAccepted > 0 || /idempotent|accepted|bookkeeping/i.test(msg)) {
                console.warn('[assisted] event ingest accepted with warning; continuing session:', msg.slice(0, 200));
                totalCaptured += results.length;
                allResults.push(...results);
            } else if (status >= 500 || err?.retryable || err?.code === 'CRM_TIMEOUT' || err?.code === 'CRM_NETWORK') {
                // Retry once with SAME idempotency key to avoid duplicate RawCapture
                try {
                    lastSubmitted = await crm.assistedEvent(sessionId, {
                        agentInstanceId,
                        eventIdempotencyKey,
                        eventSequence,
                        visibleResultCount: results.length,
                        results,
                    }, sessionToken);
                    totalCaptured += results.length;
                    allResults.push(...results);
                    console.warn('[assisted] event ingest recovered after retry');
                } catch (err2) {
                    const err2Accepted = Number(err2?.body?.data?.ingest?.acceptedCount
                        || err2?.body?.data?.event?.acceptedCount || 0);
                    if (err2Accepted > 0) {
                        totalCaptured += results.length;
                        allResults.push(...results);
                        console.warn('[assisted] treating as accepted despite bookkeeping error');
                    } else {
                        // Do not call assistedFail if we may have partially ingested — surface and continue loop
                        console.error('[assisted] event ingest failure (non-fatal to browser loop):', err2?.message || err2);
                        return {
                            stopped: false,
                            failed: false,
                            warning: 'event_ingest_failure',
                            results: allResults,
                            captured: totalCaptured,
                            submitted: lastSubmitted,
                            extracted: lastExtracted,
                            lastError: String(err2?.message || err2).slice(0, 300),
                        };
                    }
                }
            } else if (status === 400 && /cannot accept capture events/i.test(msg)) {
                return {
                    stopped: false,
                    failed: false,
                    results: allResults,
                    captured: totalCaptured,
                    endedBy: 'session_not_accepting_events',
                };
            } else {
                await crm.assistedFail(sessionId, {
                    agentInstanceId,
                    code: 'EVENT_INGEST_FAILED',
                    message: msg.slice(0, 400),
                }, sessionToken).catch(() => null);
                return {
                    stopped: false,
                    failed: true,
                    failureKind: 'event_ingest_failure',
                    results: allResults,
                    captured: totalCaptured,
                    extracted: lastExtracted,
                };
            }
        }

        // Return to Google Ready for Capture Again; do not auto-complete.
        await crm.assistedHeartbeat(sessionId, { agentInstanceId, status: 'awaiting_user' }, sessionToken);
    }
}
