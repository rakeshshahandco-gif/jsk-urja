export const DEFAULT_SAFETY = {
    concurrency: 1,
    maxTabs: 2,
    minDelayMs: 2500,
    maxDelayMs: 6000,
    autoRetries: 1,
    aggressiveMode: false,
};

export function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

export function randomDelay(minMs, maxMs) {
    const a = Math.max(500, Number(minMs) || 2500);
    const b = Math.max(a, Number(maxMs) || 6000);
    return sleep(a + Math.floor(Math.random() * (b - a + 1)));
}

export async function detectCaptchaOrBlock(page) {
    const url = page.url();
    const text = await page.locator('body').innerText().catch(() => '');
    const lower = (text || '').toLowerCase();
    if (/captcha|recaptcha|unusual traffic|verify you are human|are you a robot/.test(lower)) {
        return { blocked: true, reason: 'CAPTCHA / bot check detected' };
    }
    if (/sorry|blocked|access denied/.test(lower) && /google\.com\/sorry/.test(url)) {
        return { blocked: true, reason: 'Google sorry/block page' };
    }
    return { blocked: false };
}

/** Never ship secrets to CRM */
export function stripSecrets(record) {
    const out = { ...record };
    delete out.cookies;
    delete out.password;
    delete out.passwords;
    delete out.sessionStorage;
    delete out.localStorage;
    delete out.storageState;
    delete out.credentials;
    return out;
}
