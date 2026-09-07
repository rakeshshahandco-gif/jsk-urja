import { detectCaptchaOrBlock, stripSecrets } from '../safety.js';

/**
 * Facebook public business page mode.
 * User may log in manually in the visible browser. Agent never asks for password.
 */
export async function runFacebookPublicVisible(page, job, { onRecords, onManual, shouldStop }) {
    await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded' });
    console.log('If login is required, log in manually in the browser window. Do not share your password with the agent.');
    const block = await detectCaptchaOrBlock(page);
    if (block.blocked) {
        await onManual(block.reason);
        return { collected: [], stopped: true, reason: block.reason };
    }

    // Keyword search for pages — best effort; may require manual navigation
    const q = [job.keyword, job.city].filter(Boolean).join(' ');
    if (q) {
        await page.goto('https://www.facebook.com/search/pages/?q=' + encodeURIComponent(q), {
            waitUntil: 'domcontentloaded',
        });
    }

    if (shouldStop && shouldStop()) return { collected: [], stopped: true };

    const hrefs = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('a[href*="facebook.com/"]'))
            .map((a) => a.href)
            .filter((h) => h && !/\/(groups|login|watch|marketplace)\//i.test(h))
            .slice(0, 20);
    });

    const collected = [];
    for (const href of hrefs) {
        if (/\/groups\//i.test(href)) continue; // skip private/group URLs
        collected.push(stripSecrets({
            companyName: href.split('/').filter(Boolean).pop() || 'Facebook Page',
            sourceUrl: href,
            socialLinks: { facebook: href },
            sourcePlatform: 'browser_facebook_public',
            confidenceScore: 30,
            rawExtractedData: { sourceMode: 'facebook_public_visible', publicOnly: true },
        }));
    }
    if (collected.length) await onRecords(collected, page.url());
    return { collected, stopped: false };
}
