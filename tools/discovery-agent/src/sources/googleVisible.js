import { detectCaptchaOrBlock, randomDelay, stripSecrets } from '../safety.js';
import { forceGoogleWebSearchUrl, ensureGoogleWebResultsPage } from './googleWebGuard.js';

function buildQuery(job) {
    const parts = [job.keyword, job.city, job.state, job.country].map((x) => String(x || '').trim()).filter(Boolean);
    return parts.join(' ');
}

/**
 * Visible Google Search mode — organic results only, conservative paging.
 */
export async function runGoogleVisible(page, job, { onRecords, onManual, shouldStop }) {
    const q = buildQuery(job);
    const maxPages = Math.min(50, Number(job.maxPages) || 3);
    const maxCompanies = Math.min(200, Number(job.maxCompanies) || 10);
    const collected = [];
    const startPage = Number(job.cursor?.page) || 0;

    await page.goto('https://www.google.com/', { waitUntil: 'domcontentloaded' });
    const block0 = await detectCaptchaOrBlock(page);
    if (block0.blocked) {
        await onManual(block0.reason);
        return { collected, stopped: true, reason: block0.reason };
    }

    // Prefer typing into the search box when present
    const box = page.locator('textarea[name="q"], input[name="q"]').first();
    if (await box.count()) {
        await box.fill(q);
        await box.press('Enter');
        await page.waitForLoadState('domcontentloaded');
    } else {
        await page.goto(forceGoogleWebSearchUrl('https://www.google.com/search?q=' + encodeURIComponent(q)), { waitUntil: 'domcontentloaded' });
    }

    const web0 = await ensureGoogleWebResultsPage(page);
    if (web0.stillVertical) {
        if (onManual) await onManual('Google Jobs/Shopping/Images vertical detected; web retry failed. Do not scrape job pages.');
        return { collected, stopped: true, reason: 'google_vertical' };
    }

    for (let pageIdx = startPage; pageIdx < maxPages; pageIdx++) {
        if (shouldStop && shouldStop()) break;

        const block = await detectCaptchaOrBlock(page);
        if (block.blocked) {
            await onManual(block.reason);
            return { collected, stopped: true, reason: block.reason, cursor: { page: pageIdx } };
        }

        const items = await page.evaluate(() => {
            const out = [];
            const nodes = document.querySelectorAll('#search a h3');
            nodes.forEach((h3) => {
                const a = h3.closest('a');
                if (!a) return;
                const href = a.href || '';
                const title = (h3.textContent || '').trim();
                if (!href || !title) return;
                if (/google\./i.test(href)) return;
                out.push({ title, href });
            });
            return out;
        });

        for (const item of items) {
            if (collected.length >= maxCompanies) break;
            const rec = stripSecrets({
                companyName: item.title,
                website: item.href,
                sourceUrl: item.href,
                sourcePlatform: 'browser_google_visible',
                city: job.city || '',
                state: job.state || '',
                country: job.country || '',
                businessDescription: 'Discovered via visible Google Search (organic).',
                confidenceScore: 35,
                rawExtractedData: {
                    sourceProvider: 'browser_assisted',
                    sourceMode: 'google_visible',
                    searchQuery: q,
                },
            });
            collected.push(rec);
        }

        if (collected.length) await onRecords(collected.slice(), page.url());
        if (collected.length >= maxCompanies) break;

        await randomDelay(job.delayMsMin, job.delayMsMax);

        const next = page.locator('#pnnext, a[aria-label="Next page"]').first();
        if (!(await next.count())) break;
        await next.click();
        await page.waitForLoadState('domcontentloaded');
        const webNext = await ensureGoogleWebResultsPage(page);
        if (webNext.stillVertical) break;
    }

    return { collected, stopped: false, cursor: { page: maxPages } };
}
