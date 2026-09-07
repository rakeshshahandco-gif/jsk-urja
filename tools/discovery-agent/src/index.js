#!/usr/bin/env node
import crypto from 'crypto';
import { crm } from './crmClient.js';
import { openVisibleContext, clearLocalProfile } from './browserSession.js';
import { runGoogleVisible } from './sources/googleVisible.js';
import { runFacebookPublicVisible } from './sources/facebookPublic.js';
import { runInstagramPublicVisible } from './sources/instagramPublic.js';
import { runManualDirectory } from './sources/manualDirectory.js';
import { runAssistedGoogleCapture } from './sources/assistedGoogleCapture.js';
import { runAssistedBaiduCapture } from './sources/assistedBaiduCapture.js';
import { runAssisted1688Capture } from './sources/assisted1688Capture.js';
import { runAssistedSogouCapture } from './sources/assistedSogouCapture.js';
import { runAssisted360Capture } from './sources/assisted360Capture.js';
import { stripSecrets } from './safety.js';

// Cursor may inject an empty Playwright browsers cache; prefer system Chrome/Edge via browserSession.
if (process.env.PLAYWRIGHT_BROWSERS_PATH && /cursor-sandbox-cache/i.test(process.env.PLAYWRIGHT_BROWSERS_PATH)) {
    delete process.env.PLAYWRIGHT_BROWSERS_PATH;
}

const agentInstanceId = 'agent-' + crypto.randomBytes(6).toString('hex');

function arg(name, fallback = '') {
    const i = process.argv.indexOf('--' + name);
    if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
    return fallback;
}

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

async function cmdConnect() {
    const data = await crm.connect(agentInstanceId);
    console.log('Connected to CRM');
    console.log(JSON.stringify({
        ok: data?.ok,
        status: data?.status,
        companyId: data?.companyId,
        agentTokenId: data?.agentTokenId,
        agentInstanceId: data?.agentInstanceId,
        serverTime: data?.serverTime,
        policy: data?.policy,
    }, null, 2));
    if (data?.policy?.cookiesUploadForbidden !== true) {
        console.warn('Unexpected policy response');
    }
    if (data?.status === 'WAITING_FOR_TASK') {
        console.log('Waiting for task...');
    }
}

async function cmdClearProfile() {
    const mode = arg('source', 'google_visible');
    const r = await clearLocalProfile(mode);
    console.log('Cleared local profile', r.profileDir);
}

async function runStandardJob(jobId, job) {
    let stopFlag = false;
    const { context, page } = await openVisibleContext(job.sourceMode);
    const shouldStop = () => stopFlag;

    const onManual = async (message) => {
        console.log('MANUAL ACTION REQUIRED:', message);
        await crm.heartbeat(jobId, {
            status: 'MANUAL_ACTION_REQUIRED',
            manualActionMessage: message,
            currentPageUrl: page.url(),
            agentInstanceId,
        });
        console.log('Solve CAPTCHA/login in the browser, then re-run or continue from CRM (continue_after_manual).');
        stopFlag = true;
    };

    const onRecords = async (records, currentPageUrl) => {
        const safe = (records || []).map(stripSecrets);
        for (const r of safe) {
            if (r.cookies || r.password || r.storageState) {
                throw new Error('Refusing to upload browser secrets');
            }
        }
        const res = await crm.ingest(jobId, {
            records: safe,
            currentPageUrl,
            extractedCount: safe.length,
        });
        console.log('Ingested drafts:', res.accepted, res.note || '');
    };

    let result;
    try {
        if (job.sourceMode === 'google_visible') {
            result = await runGoogleVisible(page, job, { onRecords, onManual, shouldStop });
        } else if (job.sourceMode === 'facebook_public_visible') {
            result = await runFacebookPublicVisible(page, job, { onRecords, onManual, shouldStop });
        } else if (job.sourceMode === 'instagram_public_visible') {
            result = await runInstagramPublicVisible(page, job, { onRecords, onManual, shouldStop });
        } else if (job.sourceMode === 'manual_directory') {
            result = await runManualDirectory(page, job, { onRecords, onManual, shouldStop });
        } else {
            throw new Error('Unsupported sourceMode: ' + job.sourceMode);
        }

        const hb = await crm.heartbeat(jobId, {
            status: result.stopped ? 'MANUAL_ACTION_REQUIRED' : 'COMPLETED',
            currentPageUrl: page.url(),
            extractedCount: (result.collected || []).length,
            cursor: result.cursor,
            agentInstanceId,
            manualActionMessage: result.reason || '',
        });
        if (hb.controlCommand === 'stop') stopFlag = true;
        console.log('Job finished. status heartbeat=', hb.status, 'extracted=', hb.extractedCount);
    } catch (err) {
        await crm.heartbeat(jobId, { status: 'FAILED', error: err.message, agentInstanceId }).catch(() => {});
        throw err;
    } finally {
        await context.close().catch(() => {});
    }
}

function ownerFriendlyAgentError(err) {
    const raw = String(err && err.message ? err.message : err || 'Assisted capture failed');
    if (/Executable doesn't exist|playwright install|Could not open managed browser|Browser launch failed/i.test(raw)) {
        return 'Managed Google browser failed to open. Install/use Chrome or Edge, restart Discovery Agent, then Retry.';
    }
    return raw.replace(/[\r\n]+/g, ' ').slice(0, 400);
}

async function failAssistedSessionSafe(sessionId, token, code, err) {
    if (!sessionId || !token) return;
    try {
        await crm.assistedFail(sessionId, {
            agentInstanceId,
            code: String(code || 'AGENT_FAILED').slice(0, 80),
            message: ownerFriendlyAgentError(err),
        }, token);
    } catch (failErr) {
        console.error('Could not report assisted session failure to CRM:', failErr && failErr.message ? failErr.message : failErr);
    }
}

async function runAssistedSession(sessionId, searchedUrlFromJob = '') {
    await crm.connect(agentInstanceId);
    const claim = await crm.claimAssisted({ sessionId, agentInstanceId });
    const session = claim?.session || {};
    const token = claim?.sessionToken || '';
    if (!token) throw new Error('Assisted session token missing on claim');

    // prefer explicit URL from job metadata when provided, fallback to claim payload
    if (searchedUrlFromJob && !session.searchUrl) session.searchUrl = searchedUrlFromJob;

    const searchUrl = String(session.searchUrl || searchedUrlFromJob || '');
    let host = '';
    try { host = new URL(searchUrl).hostname.toLowerCase(); } catch { host = ''; }
    const sourceMode = host.includes('baidu.com')
        ? 'assisted_baidu_capture'
        : (host.includes('1688.com')
            ? 'assisted_1688_capture'
            : (host.includes('sogou.com')
                ? 'assisted_sogou_capture'
                : ((host === 'so.com' || host.endsWith('.so.com'))
                    ? 'assisted_360_capture'
                    : 'assisted_google_capture')));

    let context;
    let page;
    try {
        ({ context, page } = await openVisibleContext(sourceMode));
    } catch (err) {
        await failAssistedSessionSafe(sessionId, token, 'BROWSER_LAUNCH_FAILED', err);
        throw err;
    }

    try {
        const runner = sourceMode === 'assisted_baidu_capture'
            ? runAssistedBaiduCapture
            : (sourceMode === 'assisted_1688_capture'
                ? runAssisted1688Capture
                : (sourceMode === 'assisted_sogou_capture'
                    ? runAssistedSogouCapture
                    : (sourceMode === 'assisted_360_capture'
                        ? runAssisted360Capture
                        : runAssistedGoogleCapture)));
        const result = await runner(page, session, {
            sessionId: String(sessionId),
            agentInstanceId,
            sessionToken: token,
            searchUrl,
        });
        console.log(
            'Assisted capture completed, results=',
            Array.isArray(result?.results) ? result.results.length : (result?.captured ?? 0),
        );
        // Never fail the CRM session when records were already accepted
        if (result?.failed && Number(result?.captured || 0) > 0) {
            console.warn('Assisted capture flagged failed but records were captured; skipping assistedFail');
            return { ...result, failed: false, failureKind: result.failureKind || 'session_bookkeeping_warning' };
        }
        return result;
    } catch (err) {
        await failAssistedSessionSafe(sessionId, token, 'ASSISTED_SESSION_FAILED', err);
        throw err;
    } finally {
        if (context) await context.close().catch(() => {});
    }
}

async function cmdRunJob() {
    const jobId = arg('job');
    if (!jobId) throw new Error('Usage: node src/index.js run-job --job <agentJobId>');

    await crm.connect(agentInstanceId);
    const claimed = await crm.claim(jobId, agentInstanceId);
    const job = claimed.job || (await crm.getJob(jobId)).job;
    console.log('Running agent job', jobId, 'mode=', job.sourceMode);

    if (job.sourceMode === 'assisted_google_capture') {
        const meta = job.metadata || {};
        const assistedSessionId = arg('session') || meta.assistedCaptureSessionId;
        const searchUrl = meta.searchUrl || '';
        if (!assistedSessionId) throw new Error('assisted_google_capture requires metadata.assistedCaptureSessionId or --session');
        await runAssistedSession(String(assistedSessionId), String(searchUrl || ''));
        return;
    }

    await runStandardJob(jobId, job);
}

async function cmdAssistedCapture() {
    const sessionId = arg('session');
    if (!sessionId) throw new Error('Usage: node src/index.js assisted-capture --session <sessionId>');
    await runAssistedSession(sessionId);
}

/**
 * Listen mode (Checkpoint 5B): presence + poll queued sessions; max one at a time.
 * Keeps terminal `capture` working inside runAssistedGoogleCapture.
 */
async function cmdListen() {
    let stop = false;
    let busy = false;
    let backoffMs = 2000;
    const maxBackoff = 30000;
    const presenceEveryMs = 15000;
    let lastPresence = 0;

    const onSig = () => {
        console.log('\nListen mode stopping (SIGINT/SIGTERM)...');
        stop = true;
    };
    process.on('SIGINT', onSig);
    process.on('SIGTERM', onSig);

    console.log('Listen mode started. agentInstanceId=', agentInstanceId);
    // Retry CRM connect — brief backend reloads must not kill the agent permanently
    for (let attempt = 1; attempt <= 10; attempt += 1) {
        try {
            await crm.connect(agentInstanceId);
            await crm.presence(agentInstanceId);
            lastPresence = Date.now();
            console.log('CRM connect/presence OK (attempt', attempt + ') base=', (process.env.CRM_BASE_URL || '').replace(/\/$/, ''));
            break;
        } catch (err) {
            console.error('CRM connect failed (attempt', attempt + '):', err && err.message ? err.message : err);
            if (attempt === 10) throw err;
            await sleep(Math.min(1000 * attempt, 5000));
        }
    }
    while (!stop) {
        try {
            const now = Date.now();
            if (now - lastPresence >= presenceEveryMs) {
                await crm.presence(agentInstanceId);
                lastPresence = now;
            }

            if (!busy) {
                const poll = await crm.pollAssisted();
                const queued = poll?.queued || null;
                if (queued && queued._id) {
                    busy = true;
                    console.log(
                        queued.status === 'manual_action_required'
                            ? 'Reclaiming live assisted session'
                            : 'Claiming queued assisted session',
                        String(queued._id),
                    );
                    try {
                        await runAssistedSession(String(queued._id));
                        backoffMs = 2000;
                    } catch (err) {
                        console.error('Assisted session error:', err && err.message ? err.message : err);
                        backoffMs = Math.min(maxBackoff, Math.floor(backoffMs * 1.5));
                    } finally {
                        busy = false;
                    }
                }
            }
        } catch (err) {
            console.error('Listen loop error:', err && err.message ? err.message : err);
            backoffMs = Math.min(maxBackoff, Math.floor(backoffMs * 1.5));
            if (err && (Number(err.status) === 401 || Number(err.status) === 403)) {
                console.error('Fatal auth error — exiting listen mode');
                process.exitCode = 1;
                stop = true;
                break;
            }
            // fetch failed / ECONNREFUSED during backend reload — keep listening
            if (/fetch failed|ECONNREFUSED|network/i.test(String(err && err.message ? err.message : err))) {
                try {
                    await crm.connect(agentInstanceId);
                    await crm.presence(agentInstanceId);
                    lastPresence = Date.now();
                    console.log('CRM reconnected after transient error');
                    backoffMs = 2000;
                } catch (_) { /* keep retrying in loop */ }
            }
        }

        await sleep(Math.min(backoffMs, 5000));
    }

    process.off('SIGINT', onSig);
    process.off('SIGTERM', onSig);
    console.log('Listen mode exited.');
}

const cmd = process.argv[2] || 'connect';
const map = {
    connect: cmdConnect,
    'run-job': cmdRunJob,
    'clear-profile': cmdClearProfile,
    'assisted-capture': cmdAssistedCapture,
    listen: cmdListen,
};

async function main() {
    if (!map[cmd]) {
        console.log('Commands: connect | run-job --job <id> | clear-profile --source <mode> | assisted-capture --session <id> | listen');
        process.exitCode = 1;
        return;
    }
    try {
        await map[cmd]();
    } catch (err) {
        // Keep the original auth/connect error visible; avoid process.exit() while
        // undici/fetch handles are still closing (UV_HANDLE_CLOSING assertion).
        console.error('Agent error:', err && err.message ? err.message : err);
        process.exitCode = 1;
    }
}

main();
