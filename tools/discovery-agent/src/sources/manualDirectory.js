import { stripSecrets } from '../safety.js';

/**
 * Manual directory browsing: operator navigates; agent snapshots visible public links on confirm.
 */
export async function runManualDirectory(page, job, { onRecords, onManual }) {
    await page.goto('about:blank');
    console.log('Manual directory mode: navigate the visible browser to a public directory page.');
    console.log('When ready, press Enter in this terminal to capture visible http(s) links.');
    await onManual('Navigate manually, then confirm in the agent terminal to capture links.');

    // Non-interactive fallback: wait a bit then scrape current page if operator already navigated
    await page.waitForTimeout(1500);
    const hrefs = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('a[href^="http"]'))
            .map((a) => ({ href: a.href, text: (a.textContent || '').trim().slice(0, 120) }))
            .slice(0, 50);
    });
    const collected = hrefs.map((x) => stripSecrets({
        companyName: x.text || x.href,
        website: x.href,
        sourceUrl: x.href,
        sourcePlatform: 'browser_manual_directory',
        confidenceScore: 25,
        rawExtractedData: { sourceMode: 'manual_directory' },
    }));
    if (collected.length) await onRecords(collected, page.url());
    return { collected, stopped: false };
}
