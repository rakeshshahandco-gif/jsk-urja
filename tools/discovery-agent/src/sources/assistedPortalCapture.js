/**
 * Generic assisted portal capture (Baidu / 1688).
 * Same owner-driven loop as Google: no auto-next, no CAPTCHA bypass.
 */
import { crm as defaultCrm } from '../crmClient.js';
import { ensureManagedWindowVisible } from '../browserSession.js';

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

export async function runAssistedPortalCapture(page, session, opts = {}) {
    const crm = opts.crm || defaultCrm;
    const sessionId = String(opts.sessionId || session?._id || session?.id || '').trim();
    const sessionToken = opts.sessionToken;
    const agentInstanceId = opts.agentInstanceId;
    const onManual = opts.onManual;
    const shouldStop = opts.shouldStop;
    const assertUrl = opts.assertUrl;
    const detectPageKind = opts.detectPageKind;
    const extractScript = opts.extractScript;
    const sourceLabel = opts.sourceLabel || 'portal';

    if (!sessionId) throw new Error('Assisted capture sessionId missing');
    if (!sessionToken) throw new Error('Assisted session token missing');

    const searchUrl = String(session?.searchUrl || opts.searchUrl || '').trim();
    if (!searchUrl) throw new Error('Assisted capture session missing searchUrl');
    try {
        assertUrl(searchUrl);
    } catch (err) {
        throw new Error(err?.message || `Only ${sourceLabel} URLs are allowed`);
    }

    await crm.assistedHeartbeat(sessionId, { agentInstanceId, status: 'opening' }, sessionToken);
    try {
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
    } catch (err) {
        if (!/Timeout|exceeded/i.test(String(err?.message || ''))) throw err;
        console.warn(sourceLabel, 'navigation slow/timeout; keeping visible browser for owner. url=', searchUrl);
    }
    try {
        const host = new URL(page.url() || searchUrl).hostname;
        console.log(sourceLabel, 'visible window host=', host, 'url=', page.url());
    } catch {
        console.log(sourceLabel, 'visible window url=', page.url() || searchUrl);
    }
    await ensureManagedWindowVisible(page.context(), page);
    await crm.assistedBrowserOpened(sessionId, { agentInstanceId }, sessionToken);

    const htmlProbe = await page.content().catch(() => '');
    let kind = detectPageKind(htmlProbe, page.url());
    if (kind === 'consent' || kind === 'captcha' || kind === 'login') {
        const msg = sourceLabel === '1688'
            ? 'Waiting for User — Complete 1688 verification'
            : `Manual action required: ${kind} on ${sourceLabel}. Resolve in the visible browser, then Continue After Manual Action.`;
        if (onManual) await onManual(msg);
        await crm.assistedManual(sessionId, { agentInstanceId, message: msg }, sessionToken);
        await ensureManagedWindowVisible(page.context(), page);
        console.log(sourceLabel, 'waiting for owner verification. host=', (() => {
            try { return new URL(page.url()).hostname; } catch { return ''; }
        })(), 'url=', page.url());
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
                if (pending?.pending && pending?.idempotencyKey) break;
                if (remoteStatus === 'awaiting_user' || remoteStatus === 'ready_to_capture') {
                    const kind2 = detectPageKind(await page.content().catch(() => ''), page.url());
                    if (kind2 === 'consent' || kind2 === 'captcha' || kind2 === 'login') {
                        await crm.assistedManual(sessionId, {
                            agentInstanceId,
                            message: 'Still blocked by ' + kind2 + '. Resolve in the window, then Continue again.',
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

    let eventSequence = 0;
    let lastSubmitted = null;
    const allResults = [];
    let totalCaptured = 0;

    while (true) {
        if (shouldStop && shouldStop()) {
            return { stopped: true, reason: 'stopped', results: allResults, captured: totalCaptured };
        }

        let wait;
        try {
            wait = await crm.getCaptureRequest(sessionId, sessionToken, agentInstanceId);
        } catch (err) {
            if (err && Number(err.status) === 401) throw err;
            await sleep(1000);
            continue;
        }

        const remoteStatus = String(wait?.sessionStatus || '');
        if (['completed', 'cancelled', 'expired', 'failed'].includes(remoteStatus)) {
            return { stopped: false, failed: false, results: allResults, captured: totalCaptured, endedBy: remoteStatus };
        }

        const nav = wait?.pendingNavigation || wait;
        if ((nav?.pending && nav?.targetUrl) || (wait.navigate && wait.targetUrl)) {
            const targetUrl = String(nav.targetUrl || wait.targetUrl);
            try {
                await crm.ackNavigateRequest(sessionId, { agentInstanceId }, sessionToken);
            } catch (err) {
                if (err && Number(err.status) === 401) throw err;
            }
            await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
            await crm.assistedBrowserOpened(sessionId, { agentInstanceId }, sessionToken);
            const kindNav = detectPageKind(await page.content().catch(() => ''), page.url());
            if (kindNav === 'consent' || kindNav === 'captcha' || kindNav === 'login') {
                const msg = sourceLabel === '1688'
                    ? 'Waiting for User — Complete 1688 verification'
                    : 'Manual action required: ' + kindNav;
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

        if (!wait?.pending || !wait?.idempotencyKey) {
            await sleep(1000);
            continue;
        }

        try {
            await crm.ackCaptureRequest(sessionId, {
                agentInstanceId,
                idempotencyKey: String(wait.idempotencyKey),
            }, sessionToken);
        } catch (err) {
            if (err && Number(err.status) === 401) throw err;
        }

        const htmlBefore = await page.content().catch(() => '');
        const kindBefore = detectPageKind(htmlBefore, page.url());
        if (kindBefore === 'consent' || kindBefore === 'captcha' || kindBefore === 'login') {
            const msg = sourceLabel === '1688'
                ? 'Waiting for User — Complete 1688 verification'
                : 'Manual action required: ' + kindBefore + '. Resolve, then Capture again.';
            if (onManual) await onManual(msg);
            await crm.assistedManual(sessionId, { agentInstanceId, message: msg }, sessionToken);
            continue;
        }

        await crm.assistedHeartbeat(sessionId, { agentInstanceId, status: 'capturing' }, sessionToken);
        const extracted = await page.evaluate(extractScript);
        const results = Array.isArray(extracted?.results) ? extracted.results.slice(0, 100) : [];
        if (!results.length) {
            await crm.assistedFail(sessionId, {
                agentInstanceId,
                code: 'UNSUPPORTED_LAYOUT',
                message: extracted?.message || `No visible ${sourceLabel} results extracted`,
            }, sessionToken);
            return { stopped: false, failed: true, results: allResults, captured: totalCaptured, extracted };
        }

        eventSequence += 1;
        const eventIdempotencyKey = `${sessionId}:e${eventSequence}`;
        lastSubmitted = await crm.assistedEvent(sessionId, {
            agentInstanceId,
            eventIdempotencyKey,
            eventSequence,
            visibleResultCount: results.length,
            results,
            googlePageIndex: 1,
        }, sessionToken);

        totalCaptured += Number(lastSubmitted?.ingest?.acceptedCount || results.length || 0);
        allResults.push(...results);
        await crm.assistedHeartbeat(sessionId, { agentInstanceId, status: 'awaiting_user' }, sessionToken);
    }
}
