import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { facebookPublicQueries } from '../../src/services/dataExtractor/socialSources/classify.util.js';
import { discoverFacebookPublic } from '../../src/services/dataExtractor/socialSources/publicSearch.adapter.js';
import { publicHtmlPageUrl } from '../../src/services/dataExtractor/providers/publicHtmlSearchProvider.js';
import {
    FACEBOOK_PUBLIC_MAX_PAGES,
    facebookPublicPageQueries,
    isFacebookPublicPagesSearch,
    keywordSynonyms,
    localityQueryVariants,
} from '../../src/services/dataExtractor/socialSources/facebookPublicPages.util.js';
import { isFalseCompleteFromProvider } from '../../src/services/dataExtractor/socialSources/unlimitedExtraction.util.js';

function hashQuery(query) {
    return [...String(query)].reduce((n, ch) => n + ch.charCodeAt(0), 0);
}

function mockSearchFactory({ pagesPerQuery = 5 } = {}) {
    let calls = 0;
    const queriesSeen = [];
    const searchImpl = async ({ query, maxPages = 1, startPage = 0 }) => {
        calls += 1;
        queriesSeen.push(query);
        const page = Math.max(0, Number(startPage) || 0);
        if (page >= pagesPerQuery) {
            return { items: [], error: '', providerName: 'mock_html', statusCode: '', pagesFetched: 1 };
        }
        const items = [];
        const count = 20;
        for (let i = 0; i < count; i += 1) {
            items.push({
                link: `https://www.facebook.com/biz${Math.abs(hashQuery(query))}_${page}_${i}`,
                title: `Business ${page}-${i}`,
                snippet: `${query} phone 9876543210`,
            });
        }
        void maxPages;
        return {
            items,
            error: '',
            providerName: 'mock_html',
            statusCode: '',
            pagesFetched: 1,
        };
    };
    return { searchImpl, stats: () => ({ calls, queriesSeen }) };
}

describe('Facebook Public Business/Pages unlimited discovery', () => {
    it('Home Automation + Mumbai expands beyond two overlapping queries', () => {
        const queries = facebookPublicQueries({
            keyword: 'Home Automation',
            location: 'Mumbai',
            searchType: 'pages',
        });
        assert.ok(queries.length > 2, `expected query expansion, got ${queries.length}`);
        assert.ok(queries.length >= 10);
        const blob = queries.join('\n').toLowerCase();
        assert.ok(blob.includes('dealer'));
        assert.ok(blob.includes('manufacturer'));
        assert.ok(blob.includes('supplier'));
        assert.ok(blob.includes('integrator'));
        assert.ok(blob.includes('navi mumbai'));
        assert.ok(blob.includes('thane'));
        assert.ok(blob.includes('smart home'));
        assert.ok(queries.some((q) => /facebook/i.test(q)));
        assert.equal(localityQueryVariants('Mumbai').includes('Navi Mumbai'), true);
        assert.ok(keywordSynonyms('Home Automation').includes('smart home'));
    });

    it('does not hard-code Home Automation into unrelated keywords', () => {
        const queries = facebookPublicPageQueries({ keyword: 'LED Driver', location: 'India' });
        assert.ok(queries.some((q) => /led driver/i.test(q)));
        assert.ok(!queries.join(' ').toLowerCase().includes('home automation'));
        assert.ok(isFacebookPublicPagesSearch('pages'));
        assert.equal(isFacebookPublicPagesSearch('groups'), false);
        assert.equal(isFacebookPublicPagesSearch('group_intelligence'), false);
    });

    it('keeps Group Member / Find Groups query list unchanged', () => {
        const groups = facebookPublicQueries({
            keyword: 'Home Automation',
            location: 'Mumbai',
            searchType: 'groups',
        });
        assert.deepEqual(groups, [
            'site:facebook.com/groups Home Automation Mumbai',
            'site:facebook.com Home Automation Mumbai group',
        ]);
    });

    it('builds provider page 2+ URLs without treating page 1 as the last page', () => {
        assert.equal(
            publicHtmlPageUrl('ddg_lite', 'site:facebook.com Home Automation Mumbai', 0),
            'https://lite.duckduckgo.com/lite/?q=site%3Afacebook.com%20Home%20Automation%20Mumbai',
        );
        assert.match(publicHtmlPageUrl('ddg_lite', 'site:facebook.com Home Automation Mumbai', 1), /[?&]s=10/);
        assert.match(publicHtmlPageUrl('bing', 'Home Automation Mumbai Facebook', 2), /first=21/);
        assert.ok(FACEBOOK_PUBLIC_MAX_PAGES >= 3);
    });

    it('does not stop after the first 12 classified results', async () => {
        let calls = 0;
        const searchImpl = async ({ query, startPage = 0 }) => {
            calls += 1;
            const page = Math.max(0, Number(startPage) || 0);
            if (page >= 5) {
                return { items: [], error: '', providerName: 'mock_html', statusCode: '', pagesFetched: 1 };
            }
            const count = calls === 1 ? 12 : 8;
            const items = [];
            for (let i = 0; i < count; i += 1) {
                items.push({
                    link: `https://www.facebook.com/page${hashQuery(query)}_${page}_${i}`,
                    title: `Page ${page} ${i}`,
                    snippet: query,
                });
            }
            return { items, error: '', providerName: 'mock_html', statusCode: '', pagesFetched: 1 };
        };
        const found = await discoverFacebookPublic({
            keyword: 'Home Automation',
            location: 'Mumbai',
            searchType: 'pages',
            searchImpl,
        });
        assert.ok(found.queries.length > 2);
        assert.ok(found.records.length > 12);
        assert.ok(found.records.length > 50);
        assert.ok(found.facebookPublicRun.uniqueBusinesses > 12);
        assert.equal(found.stopReason, 'source_exhausted');
        assert.ok(calls > 1);
    });

    it('continues past 50 / 100 / 500 simulated source pages', async () => {
        const { searchImpl, stats } = mockSearchFactory();
        const found = await discoverFacebookPublic({
            keyword: 'Home Automation',
            location: 'Mumbai',
            searchType: 'pages',
            searchImpl,
        });
        assert.ok(found.records.length > 50, `got ${found.records.length}`);
        assert.ok(found.records.length > 100, `got ${found.records.length}`);
        assert.ok(found.records.length > 500, `got ${found.records.length}`);
        assert.equal(found.stopReason, 'source_exhausted');
        assert.equal(found.facebookPublicRun.collectionMode, 'Unlimited — Until Exhausted / Stopped');
        assert.ok(stats().calls >= found.queries.length);
        assert.ok(found.facebookPublicRun.currentResultPage >= 1);
        assert.ok(found.facebookPublicRun.queryTotal > 2);
    });

    it('dedupe does not stop remaining queries', async () => {
        let calls = 0;
        const searchImpl = async ({ startPage = 0 }) => {
            calls += 1;
            const page = Math.max(0, Number(startPage) || 0);
            if (page >= 2) {
                return { items: [], error: '', providerName: 'mock_html', statusCode: '', pagesFetched: 1 };
            }
            const items = [{
                link: 'https://www.facebook.com/SameCompanyMumbai',
                title: 'Same Company',
                snippet: 'duplicate',
            }];
            for (let i = 0; i < 8; i += 1) {
                items.push({
                    link: `https://www.facebook.com/unique_${calls}_${page}_${i}`,
                    title: `Unique ${calls} ${i}`,
                    snippet: 'Home Automation',
                });
            }
            return { items, error: '', providerName: 'mock_html', statusCode: '', pagesFetched: 1 };
        };
        const found = await discoverFacebookPublic({
            keyword: 'Home Automation',
            location: 'Mumbai',
            searchType: 'pages',
            searchImpl,
        });
        assert.ok(calls > 2);
        assert.ok(found.records.length > 12);
        assert.equal(found.records.filter((r) => /samecompanymumbai/i.test(r.resultUrl)).length, 1);
    });

    it('provider rate-limit is a pause, not Completed', async () => {
        let calls = 0;
        const searchImpl = async () => {
            calls += 1;
            if (calls >= 3) {
                return {
                    items: [],
                    error: 'Search provider temporarily blocked the request (HTTP 429).',
                    providerName: 'mock_html',
                    statusCode: 'RATE_LIMITED',
                    pagesFetched: 1,
                };
            }
            return {
                items: [{
                    link: `https://www.facebook.com/ok_${calls}`,
                    title: `Ok ${calls}`,
                    snippet: 'Mumbai',
                }],
                error: '',
                providerName: 'mock_html',
                statusCode: '',
                pagesFetched: 1,
            };
        };
        const found = await discoverFacebookPublic({
            keyword: 'Home Automation',
            location: 'Mumbai',
            searchType: 'pages',
            searchImpl,
        });
        assert.equal(found.stopReason, 'source_safety_pause');
        assert.equal(isFalseCompleteFromProvider(found.stopReason), true);
        assert.ok(found.records.length >= 1);
        assert.ok(found.records.length < found.queries.length * 20);
    });

    it('page window 5 is not a query ceiling — continues through page 12 then exhausts on 13', async () => {
        const windows = [];
        const searchImpl = async ({ startPage = 0 }) => {
            const page1 = Number(startPage) + 1;
            if (page1 > 12) {
                return { items: [], error: '', providerName: 'mock_html', statusCode: '', pagesFetched: 1 };
            }
            return {
                items: [{
                    link: `https://www.facebook.com/deep_page_${page1}`,
                    title: `Deep ${page1}`,
                    snippet: 'Home Automation Mumbai',
                }],
                error: '',
                providerName: 'mock_html',
                statusCode: '',
                pagesFetched: 1,
            };
        };
        const found = await discoverFacebookPublic({
            keyword: 'Home Automation',
            location: 'Mumbai',
            searchType: 'pages',
            queries: ['site:facebook.com Home Automation Mumbai'],
            searchImpl,
            onCheckpoint: (ck) => { windows.push({ lastSuccessfulPage: ck.lastSuccessfulPage, nextPage: ck.nextPage, status: ck.status }); },
        });
        assert.ok(found.records.some((r) => /deep_page_5$/i.test(r.resultUrl)));
        assert.ok(found.records.some((r) => /deep_page_10$/i.test(r.resultUrl)));
        assert.ok(found.records.some((r) => /deep_page_12$/i.test(r.resultUrl)));
        assert.equal(found.records.some((r) => /deep_page_13$/i.test(r.resultUrl)), false);
        assert.equal(found.records.length, 12);
        assert.equal(found.stopReason, 'source_exhausted');
        assert.ok(windows.some((w) => w.lastSuccessfulPage === 5 && w.status === 'window_complete'));
        assert.ok(windows.some((w) => w.lastSuccessfulPage === 10 && w.status === 'window_complete'));
        assert.equal(found.facebookPublicRun.lastSuccessfulPage, 12);
        assert.ok(found.checkpoint.nextPage >= 13);
    });

    it('pause after page 7 resumes at page 8, not page 1', async () => {
        let fetched = [];
        const searchImpl = async ({ startPage = 0 }) => {
            const page1 = Number(startPage) + 1;
            fetched.push(page1);
            if (page1 > 12) {
                return { items: [], error: '', providerName: 'mock_html', statusCode: '', pagesFetched: 1 };
            }
            return {
                items: [{
                    link: `https://www.facebook.com/resume_page_${page1}`,
                    title: `Resume ${page1}`,
                    snippet: 'Mumbai',
                }],
                error: '',
                providerName: 'mock_html',
                statusCode: '',
                pagesFetched: 1,
            };
        };
        const first = await discoverFacebookPublic({
            keyword: 'Home Automation',
            location: 'Mumbai',
            searchType: 'pages',
            queries: ['site:facebook.com Home Automation Mumbai'],
            searchImpl,
            shouldStop: () => fetched.includes(7) && fetched[fetched.length - 1] === 7,
        });
        assert.equal(first.stopReason, 'user_stop');
        assert.equal(first.checkpoint.lastSuccessfulPage, 7);
        assert.equal(first.checkpoint.nextPage, 8);
        assert.ok(first.records.some((r) => /resume_page_7$/i.test(r.resultUrl)));
        assert.equal(first.records.some((r) => /resume_page_8$/i.test(r.resultUrl)), false);

        fetched = [];
        const second = await discoverFacebookPublic({
            keyword: 'Home Automation',
            location: 'Mumbai',
            searchType: 'pages',
            queries: ['site:facebook.com Home Automation Mumbai'],
            searchImpl,
            checkpoint: first.checkpoint,
        });
        assert.equal(fetched[0], 8);
        assert.equal(fetched.includes(1), false);
        assert.ok(second.records.some((r) => /resume_page_8$/i.test(r.resultUrl)));
        assert.ok(second.records.some((r) => /resume_page_12$/i.test(r.resultUrl)));
        assert.equal(second.stopReason, 'source_exhausted');
    });
});
