import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const profilesRoot = path.resolve(__dirname, '..', 'profiles');

function launchErrorMessage(err) {
    const raw = String(err && err.message ? err.message : err || 'unknown error');
    if (/Executable doesn't exist|playwright install/i.test(raw)) {
        return 'Managed browser could not start (Playwright Chromium missing). Using system Chrome/Edge is required. Restart Discovery Agent after fix.';
    }
    return raw.replace(/[\r\n]+/g, ' ').slice(0, 400);
}

/**
 * Optional China-region search proxy for Discovery Agent browser only.
 * Disabled by default. No credentials in code. Owner must approve before enabling.
 * CHINA_SEARCH_PROXY_ENABLED=false
 */
function optionalChinaSearchProxy() {
    const enabled = String(process.env.CHINA_SEARCH_PROXY_ENABLED || '').toLowerCase() === 'true';
    if (!enabled) return {};
    const server = String(process.env.CHINA_SEARCH_PROXY_SERVER || '').trim();
    if (!server) return {};
    return { proxy: { server } };
}

/**
 * China assisted sources (1688 / Baidu / Sogou / 360) must not open minimized or headless.
 * Playwright launched from a background terminal often starts Chrome iconic; restore it.
 */
export async function ensureManagedWindowVisible(context, page) {
    try {
        if (page && !page.isClosed()) {
            await page.bringToFront();
            await page.evaluate(() => { try { window.focus(); } catch (_) { /* ignore */ } }).catch(() => {});
        }
        if (!context || !page) return;
        const client = await context.newCDPSession(page);
        const { windowId } = await client.send('Browser.getWindowForTarget');
        await client.send('Browser.setWindowBounds', {
            windowId,
            bounds: {
                windowState: 'normal',
                left: 80,
                top: 80,
                width: 1280,
                height: 900,
            },
        });
    } catch (err) {
        console.warn('Could not restore managed browser window:', err && err.message ? err.message : err);
    }
}

/**
 * Open a visible managed browser for assisted Google capture.
 * Prefer installed Chrome/Edge so Cursor sandbox Playwright paths cannot block the owner workflow.
 */
export async function openVisibleContext(sourceMode) {
    const dir = path.join(profilesRoot, String(sourceMode || 'default').replace(/[^\w-]+/g, '_'));
    fs.mkdirSync(dir, { recursive: true });

    // Avoid empty Cursor sandbox Playwright browser cache when system Chrome/Edge is available.
    if (process.env.PLAYWRIGHT_BROWSERS_PATH && /cursor-sandbox-cache/i.test(process.env.PLAYWRIGHT_BROWSERS_PATH)) {
        delete process.env.PLAYWRIGHT_BROWSERS_PATH;
    }

    const headless = String(process.env.DISCOVERY_AGENT_HEADLESS || '').toLowerCase() === 'true';

    const attempts = [
        { label: 'chrome', options: { channel: 'chrome' } },
        { label: 'msedge', options: { channel: 'msedge' } },
        { label: 'chromium', options: {} },
    ];

    let lastErr = null;
    for (const attempt of attempts) {
        try {
            const context = await chromium.launchPersistentContext(dir, {
                headless,
                viewport: { width: 1280, height: 900 },
                args: [
                    '--disable-blink-features=AutomationControlled',
                    '--window-position=80,80',
                    '--window-size=1280,900',
                ],
                ...optionalChinaSearchProxy(),
                ...attempt.options,
            });
            const page = context.pages()[0] || await context.newPage();
            if (!headless) await ensureManagedWindowVisible(context, page);
            console.log('Managed browser opened via', attempt.label, 'url=', (() => {
                try { return page.url(); } catch { return ''; }
            })());
            return { context, page, profileDir: dir, browserChannel: attempt.label };
        } catch (err) {
            lastErr = err;
            console.error('Browser launch failed via', attempt.label + ':', launchErrorMessage(err));
        }
    }

    throw new Error(launchErrorMessage(lastErr) || 'Could not open managed Chrome/Edge/Chromium browser');
}

export async function clearLocalProfile(sourceMode) {
    const dir = path.join(profilesRoot, String(sourceMode || 'default').replace(/[^\w-]+/g, '_'));
    if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
    }
    return { cleared: true, profileDir: dir };
}