/**
 * Checkpoint 5 — Google organic parser fixtures (Part 17 style, no live Google).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    detectPageKind,
    extractVisibleOrganicFromDocumentHtml,
    parseGoogleOrganicResults,
} from '../../src/services/dataExtractor/searchCampaign/assistedCapture/googleOrganic.parser.js';

function organicCard({ href, title, snippet = 'Snippet text' }) {
    return `<div class="g" data-organic="1"><a href="${href}"><h3>${title}</h3></a><div data-snippet="1">${snippet}</div></div>`;
}

function wrapSearch(inner) {
    return `<html><body><div id="search">${inner}</div></body></html>`;
}

describe('CP5 parser Part17 fixtures', () => {
    it('1. basic organic card with title+url+snippet', () => {
        const html = wrapSearch(organicCard({
            href: 'https://acme.example.com/',
            title: 'Acme Home Automation',
            snippet: 'Smart lighting OEM',
        }));
        const parsed = parseGoogleOrganicResults(html);
        assert.equal(parsed.status, 'completed');
        assert.equal(parsed.results.length, 1);
        assert.equal(parsed.results[0].title, 'Acme Home Automation');
        assert.equal(parsed.results[0].resultUrl, 'https://acme.example.com/');
        assert.equal(parsed.results[0].snippet, 'Smart lighting OEM');
        assert.equal(parsed.results[0].resultTypeHint, 'unknown');
        assert.equal(parsed.results[0].resultPosition, 1);
    });

    it('2. sponsored data-sponsored excluded', () => {
        const html = wrapSearch(
            `<div class="g" data-sponsored="1"><a href="https://ad.example.com/"><h3>Ad</h3></a></div>`
            + organicCard({ href: 'https://ok.example.com/', title: 'Ok Co' }),
        );
        const parsed = parseGoogleOrganicResults(html);
        assert.equal(parsed.results.length, 1);
        assert.equal(parsed.results[0].resultUrl, 'https://ok.example.com/');
    });

    it('3. ads-ad / commercial-unit excluded', () => {
        const html = wrapSearch(
            `<div class="g ads-ad"><a href="https://ad2.example.com/"><h3>Ad2</h3></a></div>`
            + `<div class="commercial-unit g"><a href="https://ad3.example.com/"><h3>Ad3</h3></a></div>`
            + organicCard({ href: 'https://ok3.example.com/', title: 'Ok3' }),
        );
        const parsed = parseGoogleOrganicResults(html);
        assert.equal(parsed.results.map((r) => r.resultUrl).join(','), 'https://ok3.example.com/');
    });

    it('4. PAA excluded', () => {
        const html = wrapSearch(
            `<div class="g" data-paa="1"><a href="https://paa.example.com/"><h3>PAA</h3></a></div>`
            + `<div class="g"><a href="https://paa2.example.com/"><h3>people also ask</h3></a></div>`
            + organicCard({ href: 'https://ok4.example.com/', title: 'Ok4' }),
        );
        const parsed = parseGoogleOrganicResults(html);
        assert.ok(parsed.results.every((r) => !r.resultUrl.includes('paa')));
        assert.equal(parsed.results[0].resultUrl, 'https://ok4.example.com/');
    });

    it('5. related excluded', () => {
        const html = wrapSearch(
            `<div class="g" data-related="1"><a href="https://rel.example.com/"><h3>Rel</h3></a></div>`
            + organicCard({ href: 'https://ok5.example.com/', title: 'Ok5' }),
        );
        assert.equal(parseGoogleOrganicResults(html).results[0].resultUrl, 'https://ok5.example.com/');
    });

    it('6. knowledge panel excluded', () => {
        const html = wrapSearch(
            `<div class="g knowledge-panel" data-kp="1"><a href="https://kp.example.com/"><h3>KP</h3></a></div>`
            + organicCard({ href: 'https://ok6.example.com/', title: 'Ok6' }),
        );
        assert.equal(parseGoogleOrganicResults(html).results[0].resultUrl, 'https://ok6.example.com/');
    });

    it('7. local / map-pack excluded', () => {
        const html = wrapSearch(
            `<div class="g map-pack" data-local="1"><a href="https://local.example.com/"><h3>Local</h3></a></div>`
            + organicCard({ href: 'https://ok7.example.com/', title: 'Ok7' }),
        );
        assert.equal(parseGoogleOrganicResults(html).results[0].resultUrl, 'https://ok7.example.com/');
    });

    it('8. video excluded', () => {
        const html = wrapSearch(
            `<div class="g" data-video="1"><a href="https://vid.example.com/"><h3>Vid</h3></a></div>`
            + organicCard({ href: 'https://ok8.example.com/', title: 'Ok8' }),
        );
        assert.equal(parseGoogleOrganicResults(html).results[0].resultUrl, 'https://ok8.example.com/');
    });

    it('9. news excluded', () => {
        const html = wrapSearch(
            `<div class="g" data-news="1"><a href="https://news.example.com/"><h3>News</h3></a></div>`
            + organicCard({ href: 'https://ok9.example.com/', title: 'Ok9' }),
        );
        assert.equal(parseGoogleOrganicResults(html).results[0].resultUrl, 'https://ok9.example.com/');
    });

    it('10. shopping excluded', () => {
        const html = wrapSearch(
            `<div class="g" data-shopping="1"><a href="https://shop.example.com/"><h3>Shop</h3></a></div>`
            + organicCard({ href: 'https://ok10.example.com/', title: 'Ok10' }),
        );
        assert.equal(parseGoogleOrganicResults(html).results[0].resultUrl, 'https://ok10.example.com/');
    });

    it('11. unwrap /url?q=', () => {
        const html = wrapSearch(organicCard({
            href: '/url?q=https%3A%2F%2Funwrap.example.com%2Fpath&sa=U',
            title: 'Unwrap',
        }));
        assert.equal(parseGoogleOrganicResults(html).results[0].resultUrl, 'https://unwrap.example.com/path');
    });

    it('12. reject javascript:', () => {
        const html = wrapSearch(organicCard({ href: 'javascript:alert(1)', title: 'Bad JS' })
            + organicCard({ href: 'https://ok12.example.com/', title: 'Ok12' }));
        const parsed = parseGoogleOrganicResults(html);
        assert.equal(parsed.results.length, 1);
        assert.equal(parsed.results[0].resultUrl, 'https://ok12.example.com/');
    });

    it('13. reject relative google paths', () => {
        const html = wrapSearch(organicCard({ href: '/search?q=x', title: 'RelPath' })
            + organicCard({ href: 'https://ok13.example.com/', title: 'Ok13' }));
        assert.equal(parseGoogleOrganicResults(html).results[0].resultUrl, 'https://ok13.example.com/');
    });

    it('14. reject google hosts', () => {
        const html = wrapSearch(
            organicCard({ href: 'https://www.google.com/maps', title: 'GMaps' })
            + organicCard({ href: 'https://accounts.google.co.in/', title: 'Accounts' })
            + organicCard({ href: 'https://ok14.example.com/', title: 'Ok14' }),
        );
        assert.equal(parseGoogleOrganicResults(html).results.length, 1);
        assert.equal(parseGoogleOrganicResults(html).results[0].resultUrl, 'https://ok14.example.com/');
    });

    it('15. dedupe URL preserve first order', () => {
        const html = wrapSearch(
            organicCard({ href: 'https://dup.example.com/', title: 'First' })
            + organicCard({ href: 'https://dup.example.com/', title: 'Second' })
            + organicCard({ href: 'https://other.example.com/', title: 'Other' }),
        );
        const parsed = parseGoogleOrganicResults(html);
        assert.equal(parsed.results.length, 2);
        assert.equal(parsed.results[0].title, 'First');
        assert.equal(parsed.results[0].resultPosition, 1);
        assert.equal(parsed.results[1].resultUrl, 'https://other.example.com/');
        assert.equal(parsed.results[1].resultPosition, 2);
    });

    it('16. preserve order across multiple cards', () => {
        const html = wrapSearch(
            organicCard({ href: 'https://a.example.com/', title: 'Title A' })
            + organicCard({ href: 'https://b.example.com/', title: 'Title B' })
            + organicCard({ href: 'https://c.example.com/', title: 'Title C' }),
        );
        assert.deepEqual(
            parseGoogleOrganicResults(html).results.map((r) => r.title),
            ['Title A', 'Title B', 'Title C'],
        );
    });

    it('17. cap at 100 results', () => {
        let inner = '';
        for (let i = 0; i < 120; i += 1) {
            inner += organicCard({ href: `https://n${i}.example.com/`, title: `N${i}` });
        }
        const parsed = parseGoogleOrganicResults(wrapSearch(inner));
        assert.equal(parsed.results.length, 100);
        assert.equal(parsed.results[99].resultPosition, 100);
    });

    it('18. consent page => unsupported_layout', () => {
        const html = '<html><body>Before you continue consent.google</body></html>';
        assert.equal(detectPageKind(html), 'consent');
        const parsed = parseGoogleOrganicResults(html);
        assert.equal(parsed.status, 'unsupported_layout');
        assert.deepEqual(parsed.results, []);
    });

    it('19. captcha page => unsupported_layout', () => {
        const html = '<html><body>Our systems have detected unusual traffic /sorry/ recaptcha</body></html>';
        assert.equal(detectPageKind(html), 'captcha');
        const parsed = parseGoogleOrganicResults(html);
        assert.equal(parsed.status, 'unsupported_layout');
        assert.equal(parsed.results.length, 0);
    });

    it('20. login page => unsupported_layout', () => {
        const html = '<html><body>accounts.google.com Sign in</body></html>';
        assert.equal(detectPageKind(html), 'login');
        assert.equal(parseGoogleOrganicResults(html).status, 'unsupported_layout');
    });

    it('21. empty / unsupported layout', () => {
        assert.equal(parseGoogleOrganicResults('').status, 'unsupported_layout');
        assert.equal(parseGoogleOrganicResults('<html><body>hello</body></html>').status, 'unsupported_layout');
    });

    it('22. prefer data-organic over unmarked g', () => {
        const html = wrapSearch(
            `<div class="g"><a href="https://live.example.com/"><h3>Live</h3></a></div>`
            + organicCard({ href: 'https://marked.example.com/', title: 'Marked' }),
        );
        const parsed = parseGoogleOrganicResults(html);
        assert.equal(parsed.results.length, 1);
        assert.equal(parsed.results[0].resultUrl, 'https://marked.example.com/');
    });

    it('23. live #search .g heuristic when no markers', () => {
        const html = wrapSearch(
            `<div class="g"><a href="https://live23.example.com/"><h3>Live23</h3></a></div>`
            + `<div class="g ads-ad"><a href="https://ad23.example.com/"><h3>Ad23</h3></a></div>`,
        );
        const parsed = parseGoogleOrganicResults(html);
        assert.equal(parsed.results.length, 1);
        assert.equal(parsed.results[0].resultUrl, 'https://live23.example.com/');
    });

    it('24. extractVisibleOrganicFromDocumentHtml alias', () => {
        const html = wrapSearch(organicCard({ href: 'https://alias.example.com/', title: 'Alias' }));
        const a = parseGoogleOrganicResults(html);
        const b = extractVisibleOrganicFromDocumentHtml(html);
        assert.deepEqual(a, b);
        assert.equal(extractVisibleOrganicFromDocumentHtml, parseGoogleOrganicResults);
    });

    it('25. missing h3 skipped; resultTypeHint default unknown', () => {
        const html = wrapSearch(
            `<div class="g" data-organic="1"><a href="https://noh3.example.com/">No H3</a></div>`
            + organicCard({ href: 'https://ok25.example.com/', title: 'Ok25' }),
        );
        const parsed = parseGoogleOrganicResults(html);
        assert.equal(parsed.results.length, 1);
        assert.equal(parsed.results[0].resultTypeHint, 'unknown');
        assert.equal(parsed.results[0].resultUrl, 'https://ok25.example.com/');
    });

    it('26. recaptcha script noise on SERP is NOT captcha (false-positive fix)', () => {
        const html = `<html><head><script src="https://www.google.com/recaptcha/api.js"></script></head><body>`
            + `<div id="search">`
            + organicCard({ href: 'https://oem.example.com/', title: 'Home Automation OEM Mumbai', snippet: 'Manufacturer' })
            + `</div></body></html>`;
        assert.equal(detectPageKind(html), 'organic');
        const parsed = parseGoogleOrganicResults(html);
        assert.equal(parsed.status, 'completed');
        assert.equal(parsed.results.length, 1);
        assert.equal(parsed.results[0].resultUrl, 'https://oem.example.com/');
        assert.notEqual(parsed.message, 'Page kind: captcha');
    });

    it('27. modern layout without class=g (MjjYud / data-hveid) still extracts organic', () => {
        const html = `<html><body><div id="rso">`
            + `<div class="MjjYud" data-hveid="CBAQAA"><div>`
            + `<a href="https://modern-a.example.com/products"><h3>Modern A Controls</h3></a>`
            + `<div class="VwiC3b">Mumbai home automation supplier</div>`
            + `</div></div>`
            + `<div class="ads-ad commercial-unit" data-hveid="AD1"><a href="https://ad-modern.example.com/"><h3>Sponsored Ad</h3></a></div>`
            + `<div class="MjjYud" data-hveid="CCAQAA"><div>`
            + `<a href="/url?q=https%3A%2F%2Fmodern-b.example.com%2F&sa=U"><h3>Modern B Systems</h3></a>`
            + `<span class="IsZvec">Building automation</span>`
            + `</div></div>`
            + `<div data-paa="1" data-hveid="PAA1"><a href="https://paa-modern.example.com/"><h3>people also ask</h3></a></div>`
            + `</div>`
            + `<script src="https://www.gstatic.com/recaptcha/releases/x/recaptcha__en.js"></script>`
            + `</body></html>`;
        assert.equal(detectPageKind(html), 'organic');
        const parsed = parseGoogleOrganicResults(html);
        assert.equal(parsed.status, 'completed');
        assert.ok(parsed.results.length >= 1, JSON.stringify(parsed));
        assert.equal(parsed.results[0].title, 'Modern A Controls');
        assert.equal(parsed.results[0].resultUrl, 'https://modern-a.example.com/products');
        assert.match(parsed.results[0].snippet, /Mumbai home automation/i);
        assert.ok(parsed.results.every((r) => !/ad-modern|paa-modern/i.test(r.resultUrl)));
        const urls = parsed.results.map((r) => r.resultUrl);
        assert.ok(urls.includes('https://modern-b.example.com/'));
    });

    it('28. hard captcha interstitial still unsupported (no organic markers)', () => {
        const html = '<html><body>Our systems have detected unusual traffic '
            + '<form id="captcha-form" action="/sorry/index">challenge</form></body></html>';
        assert.equal(detectPageKind(html), 'captcha');
        const parsed = parseGoogleOrganicResults(html);
        assert.equal(parsed.status, 'unsupported_layout');
        assert.equal(parsed.results.length, 0);
    });
});
