import { detectCaptchaOrBlock, stripSecrets } from '../safety.js';

export async function runInstagramPublicVisible(page, job, { onRecords, onManual, shouldStop }) {
    await page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded' });
    console.log('If login is required, log in manually. Agent never stores Instagram passwords or cookies in CRM.');
    const block = await detectCaptchaOrBlock(page);
    if (block.blocked) {
        await onManual(block.reason);
        return { collected: [], stopped: true, reason: block.reason };
    }
    if (shouldStop && shouldStop()) return { collected: [], stopped: true };

    // Without a known profile URL, open search and collect visible public profile links only
    const q = String(job.keyword || '').trim();
    if (q) {
        await page.goto('https://www.instagram.com/explore/search/keyword/?q=' + encodeURIComponent(q), {
            waitUntil: 'domcontentloaded',
        }).catch(() => {});
    }

    const hrefs = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('a[href^="/"]'))
            .map((a) => a.getAttribute('href'))
            .filter((h) => h && /^\/[A-Za-z0-9._]+\/?$/.test(h))
            .slice(0, 20);
    });

    const collected = [];
    for (const h of hrefs) {
        const handle = h.replace(/\//g, '');
        if (['reel', 'reels', 'p', 'stories', 'explore', 'accounts', 'direct'].includes(handle.toLowerCase())) continue;
        const url = 'https://www.instagram.com/' + handle + '/';
        collected.push(stripSecrets({
            companyName: handle,
            sourceUrl: url,
            socialLinks: { instagram: url },
            sourcePlatform: 'browser_instagram_public',
            confidenceScore: 30,
            rawExtractedData: { sourceMode: 'instagram_public_visible', publicOnly: true },
        }));
    }
    if (collected.length) await onRecords(collected, page.url());
    return { collected, stopped: false };
}
