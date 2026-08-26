/**
 * China module-number query generator — native-first, Google secondary.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    buildSimpleQueries,
    parseProductModels,
    chinaSourceBucket,
    sourceHintFromPlatform,
} from '../../src/services/dataExtractor/searchCampaign/simpleLeadSearch/queryBuilder.util.js';
import { previewSimpleLeadSearchQueries } from '../../src/services/dataExtractor/searchCampaign/simpleLeadSearch/simpleLeadSearch.service.js';
import { buildGoogleSearchUrl } from '../../src/services/dataExtractor/searchCampaign/searchQuery/normalize.util.js';
import {
    forceGoogleWebSearchUrl,
    isGoogleVerticalUrl,
    looksLikeGoogleJobsOrVerticalHtml,
} from '../../../tools/discovery-agent/src/sources/googleWebGuard.js';

const PRODUCT = 'BT2S, ZT2S, BTC, ZTC';
const MODELS = ['BT2S', 'ZT2S', 'BTC', 'ZTC'];
const JOB_NEG = /-(jobs|job|course|training|career|vacancy|tutor|tutorial)\b/i;

function textsOf(queries) {
    return queries.map((q) => q.queryText);
}

describe('China model query generator', () => {
    it('parses four models separately', () => {
        assert.deepEqual(parseProductModels(PRODUCT), MODELS);
        assert.deepEqual(parseProductModels('ZT2S, BT2S, ZTC, BTC'), ['ZT2S', 'BT2S', 'ZTC', 'BTC']);
        assert.deepEqual(parseProductModels('Home Automation'), []);
        assert.deepEqual(parseProductModels('Smart Switch'), []);
        assert.deepEqual(parseProductModels('ZT2S MODULE'), ['ZT2S']);
        assert.deepEqual(
            parseProductModels('ZT2S MODULE, BT2S MODULE, BTC MODULE'),
            ['ZT2S', 'BT2S', 'BTC'],
        );
        assert.deepEqual(parseProductModels('ZT2S 模组, BT2S 模块'), ['ZT2S', 'BT2S']);
    });

    it('plans China native-first: 1688 then Baidu then Sogou/360 then indexed B2B then Google', () => {
        const queries = buildSimpleQueries({
            product: PRODUCT,
            country: 'China',
            city: '',
            state: '',
        });
        const texts = textsOf(queries);
        assert.ok(queries.length >= 40, `expected a family per model, got ${queries.length}`);
        assert.ok(queries.length <= 110);

        assert.equal(queries[0].sourcePlatform, '1688');
        assert.match(queries[0].queryText, /模组|涂鸦|蓝牙/);
        const firstGoogle = queries.findIndex((q) => q.sourcePlatform === 'google_global' && /manufacturer China/i.test(q.queryText));
        const first1688 = queries.findIndex((q) => q.sourcePlatform === '1688');
        const firstBaidu = queries.findIndex((q) => q.sourcePlatform === 'baidu');
        assert.ok(first1688 === 0);
        assert.ok(firstBaidu > first1688);
        assert.ok(firstGoogle > firstBaidu);

        assert.ok(texts.some((t) => t === 'ZT2S 模组'));
        assert.ok(texts.some((t) => t === 'ZT2S 涂鸦'));
        assert.ok(texts.some((t) => t === 'ZT2S 供应商'));
        assert.ok(texts.some((t) => t === 'ZT2S 厂家'));
        assert.ok(texts.some((t) => t === 'ZT2S 生产厂家'));
        assert.ok(texts.some((t) => t === 'ZT2S Zigbee 模组'));
        assert.ok(texts.some((t) => t === 'ZT2S 深圳 供应商'));
        assert.ok(texts.some((t) => t === 'ZT2S 东莞 厂家'));
        assert.ok(texts.some((t) => t === 'BT2S 蓝牙模组'));
        assert.ok(texts.some((t) => t === 'BTC 蓝牙模组'));
        assert.ok(texts.some((t) => t === 'ZTC Zigbee 模组'));

        for (const model of MODELS) {
            assert.ok(texts.some((t) => t.includes(`${model} 厂家`) || t.includes(`"${model}" manufacturer China`)));
        }

        const combined = texts.filter((t) => (
            /ZT2S\s*,\s*BT2S/i.test(t) || /BT2S\s*,\s*ZT2S/i.test(t)
            || (MODELS.every((m) => t.includes(m)) && !/\bOR\b/.test(t) && /manufacturer/i.test(t))
        ));
        assert.equal(combined.length, 0, `combined query still present: ${combined[0] || ''}`);

        const orDiscovery = texts.filter((t) => /\bOR\b/.test(t) && MODELS.every((m) => t.includes(`"${m}"`)));
        assert.equal(orDiscovery.length, 0);

        for (const t of texts) {
            assert.doesNotMatch(t, JOB_NEG);
        }
    });

    it('generates Chinese city expansion and keeps site:1688.com as Google-indexed', () => {
        const queries = buildSimpleQueries({
            product: PRODUCT,
            country: 'China',
        });
        const texts = textsOf(queries);

        assert.ok(queries.some((q) => q.queryLanguage === 'zh'));
        assert.ok(queries.some((q) => q.queryLanguage === 'en'));
        assert.ok(texts.some((t) => t.includes('深圳')));
        assert.ok(texts.some((t) => t.includes('东莞')));
        assert.ok(texts.some((t) => t.includes('广州')));
        assert.ok(texts.some((t) => t.includes('杭州')));
        assert.ok(texts.some((t) => t.includes('宁波')));

        for (const model of MODELS) {
            const indexed1688 = queries.find((q) => q.queryText === `site:1688.com "${model}"`);
            assert.ok(indexed1688, `indexed 1688 ${model}`);
            assert.equal(indexed1688.sourcePlatform, 'google_global');
            assert.equal(sourceHintFromPlatform(indexed1688.sourcePlatform), 'google');
            assert.equal(chinaSourceBucket(indexed1688.sourcePlatform), 'google');
        }
        assert.ok(queries.some((q) => q.sourcePlatform === 'alibaba' && q.queryText.startsWith('site:alibaba.com')));
        assert.ok(queries.some((q) => q.sourcePlatform === 'made_in_china' && q.queryText.startsWith('site:made-in-china.com')));
        assert.ok(queries.some((q) => q.sourcePlatform === 'global_sources' && q.queryText.startsWith('site:globalsources.com')));
        assert.ok(!texts.some((t) => /site:1688\.com/.test(t) && MODELS.filter((m) => t.includes(`"${m}"`)).length > 1));

        const modelsRetained = new Set(queries.map((q) => q.relatedKeyword).filter(Boolean));
        for (const model of MODELS) assert.ok(modelsRetained.has(model), `matched model ${model}`);
    });

    it('preview uses China suppliers path without requiring owner city list', () => {
        const preview = previewSimpleLeadSearchQueries({
            body: {
                product: PRODUCT,
                country: 'China',
                city: '',
                state: '',
            },
        });
        assert.ok(preview.estimatedQueryCount >= 40);
        assert.equal(preview.searchMarket, 'china_suppliers');
        assert.ok(preview.queries.every((q) => !JOB_NEG.test(q.queryText)));
        assert.equal(preview.queries[0].sourcePlatform, '1688');
        assert.match(preview.platformAdaptersNote, /native first/i);
        assert.match(preview.platformAdaptersNote, /not claimed complete/i);
    });

    it('India Home Automation still uses legacy job-style negatives', () => {
        const queries = buildSimpleQueries({ product: 'Home Automation', city: 'Mumbai' });
        assert.equal(
            queries[0].queryText,
            'home automation manufacturers Mumbai -jobs -course -training',
        );
    });

    it('Google URLs force Web/All and China search region for China queries', () => {
        const chinaUrl = buildGoogleSearchUrl('"ZT2S" manufacturer China');
        assert.ok(chinaUrl.startsWith('https://www.google.com/search?q='));
        assert.ok(chinaUrl.includes('udm=14'));
        assert.ok(chinaUrl.includes('gl=cn'));
        assert.ok(chinaUrl.includes('hl=en'));

        const zhUrl = buildGoogleSearchUrl('ZT2S 涂鸦 模组 厂家');
        assert.ok(zhUrl.includes('udm=14'));
        assert.ok(zhUrl.includes('gl=cn'));
        assert.ok(zhUrl.includes('hl=zh-CN'));

        const indiaUrl = buildGoogleSearchUrl('home automation manufacturers Mumbai');
        assert.ok(indiaUrl.includes('udm=14'));
        assert.ok(!indiaUrl.includes('gl=cn'));
    });

    it('rewrites Jobs vertical URLs back to Google Web', () => {
        const jobs = 'https://www.google.com/search?q=ZT2S&tbm=jobs';
        assert.equal(isGoogleVerticalUrl(jobs), true);
        const web = forceGoogleWebSearchUrl(jobs);
        assert.equal(isGoogleVerticalUrl(web), false);
        assert.ok(web.includes('udm=14'));
        assert.ok(!web.includes('tbm=jobs'));
        assert.equal(
            looksLikeGoogleJobsOrVerticalHtml('<div>Remote</div><div>Job type</div><div>Date posted</div>'),
            true,
        );
        assert.equal(looksLikeGoogleJobsOrVerticalHtml('<div id="search"><h3>Supplier</h3></div>'), false);
    });
});
