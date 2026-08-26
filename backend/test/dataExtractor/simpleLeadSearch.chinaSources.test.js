/**
 * China multi-source planner + bilingual notes + Sogou/360 URL/parser contracts.
 * Does not start live capture.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    buildSimpleQueries,
    sourceHintFromPlatform,
    chinaSourceBucket,
} from '../../src/services/dataExtractor/searchCampaign/simpleLeadSearch/queryBuilder.util.js';
import { previewSimpleLeadSearchQueries } from '../../src/services/dataExtractor/searchCampaign/simpleLeadSearch/simpleLeadSearch.service.js';
import { buildSearchUrl } from '../../src/services/dataExtractor/searchCampaign/searchQuery/normalize.util.js';
import { validateAssistedSearchUrl, assistedSourceFromUrl } from '../../src/services/dataExtractor/searchCampaign/assistedCapture/googleUrl.util.js';
import {
    attachBilingualToRecord,
    packChinaNotes,
    unpackChinaNotes,
    translateChinaText,
    classifyChinaSupplier,
    extractUscc,
} from '../../src/services/dataExtractor/searchCampaign/simpleLeadSearch/chinaBilingual.util.js';
import { detectBaiduPageKind } from '../../../tools/discovery-agent/src/sources/assistedBaiduCapture.js';
import { detect1688PageKind } from '../../../tools/discovery-agent/src/sources/assisted1688Capture.js';
import { detectSogouPageKind } from '../../../tools/discovery-agent/src/sources/assistedSogouCapture.js';
import { detect360PageKind } from '../../../tools/discovery-agent/src/sources/assisted360Capture.js';

const PRODUCT = 'BT2S, ZT2S, BTC, ZTC';

describe('China native-first source planner', () => {
    it('prioritizes 1688 then Baidu/Sogou/360 and keeps Google secondary', () => {
        const queries = buildSimpleQueries({ product: PRODUCT, country: 'China' });
        assert.ok(queries.length <= 110);
        assert.equal(queries[0].sourcePlatform, '1688');
        assert.ok(queries.some((q) => q.sourcePlatform === '1688' && q.queryText === 'ZT2S 模组'));
        assert.ok(queries.some((q) => q.sourcePlatform === '1688' && q.queryText === 'BT2S 涂鸦'));
        assert.ok(queries.some((q) => q.sourcePlatform === '1688' && q.queryText === 'BTC 蓝牙模组'));
        assert.ok(queries.some((q) => q.sourcePlatform === '1688' && q.queryText === 'ZTC Zigbee 模组'));
        assert.ok(queries.some((q) => q.sourcePlatform === 'baidu' && q.queryText === 'ZT2S 厂家'));
        assert.ok(queries.some((q) => q.sourcePlatform === 'baidu' && q.queryText === 'BT2S 供应商'));
        assert.ok(queries.some((q) => q.sourcePlatform === 'sogou' && q.queryText.includes('ZT2S')));
        assert.ok(queries.some((q) => q.sourcePlatform === 'so360' && q.queryText.includes('ZT2S')));
        assert.ok(queries.some((q) => q.sourcePlatform === 'google_global' && q.queryText.includes('"ZT2S" manufacturer China')));
        assert.equal(sourceHintFromPlatform('baidu'), 'baidu');
        assert.equal(sourceHintFromPlatform('1688'), '1688');
        assert.equal(sourceHintFromPlatform('sogou'), 'sogou');
        assert.equal(sourceHintFromPlatform('so360'), 'so360');
        assert.equal(sourceHintFromPlatform('google_global'), 'google');
        assert.equal(chinaSourceBucket('alibaba'), 'alibaba');
        assert.equal(chinaSourceBucket('google_global'), 'google');
        assert.equal(chinaSourceBucket('1688'), '1688');
    });

    it('builds native portal URLs and does not treat site:1688.com as direct 1688', () => {
        const g = buildSearchUrl('google', '"ZT2S" manufacturer China');
        assert.ok(g.startsWith('https://www.google.com/search?q='));
        const b = buildSearchUrl('baidu', 'ZT2S 供应商');
        assert.ok(b.startsWith('https://www.baidu.com/s?wd='));
        const s = buildSearchUrl('1688', 'ZT2S 模组');
        assert.ok(s.startsWith('https://s.1688.com/s.html?keywords='));
        const sg = buildSearchUrl('sogou', 'ZT2S 模组');
        assert.ok(sg.startsWith('https://www.sogou.com/web?query='));
        const so = buildSearchUrl('so360', 'ZT2S 模组');
        assert.ok(so.startsWith('https://www.so.com/s?q='));
        assert.equal(validateAssistedSearchUrl(b).startsWith('https://www.baidu.com/s'), true);
        assert.ok(validateAssistedSearchUrl(s).includes('1688.com'));
        assert.ok(validateAssistedSearchUrl(g).includes('google.com'));
        assert.equal(assistedSourceFromUrl(sg), 'sogou');
        assert.equal(assistedSourceFromUrl(so), 'so360');
        const indexed = buildSearchUrl('google', 'site:1688.com "ZT2S"');
        assert.ok(indexed.includes('google.com'));
        assert.equal(assistedSourceFromUrl(indexed), 'google');
    });

    it('India Home Automation is unchanged', () => {
        const queries = buildSimpleQueries({ product: 'Home Automation', city: 'Mumbai' });
        assert.equal(
            queries[0].queryText,
            'home automation manufacturers Mumbai -jobs -course -training',
        );
        assert.ok(!queries.some((q) => q.sourcePlatform === 'baidu' || q.sourcePlatform === '1688'));
    });

    it('Country=China with blank city still generates native sources before Google', () => {
        const queries = buildSimpleQueries({
            product: PRODUCT,
            country: 'China',
            city: '',
            state: '',
        });
        assert.ok(queries.some((q) => q.sourcePlatform === 'baidu'));
        assert.ok(queries.some((q) => q.sourcePlatform === '1688'));
        assert.ok(queries.some((q) => q.sourcePlatform === 'sogou'));
        assert.ok(queries.some((q) => q.sourcePlatform === 'so360'));
        assert.ok(queries.some((q) => q.sourcePlatform === 'google_global' && q.queryText.includes('"ZT2S" manufacturer China')));
        const googleIdx = queries.findIndex((q) => q.sourcePlatform === 'google_global' && /manufacturer China/.test(q.queryText));
        const baiduIdx = queries.findIndex((q) => q.sourcePlatform === 'baidu');
        assert.ok(googleIdx > baiduIdx);
        assert.ok(queries.length <= 110);
    });

    it('preview with default City scope and blank city still plans China multi-source queries', () => {
        const preview = previewSimpleLeadSearchQueries({
            body: {
                product: PRODUCT,
                country: 'China',
                city: '',
                state: '',
                locationScope: 'city',
                searchMarket: 'india_global_web',
            },
        });
        assert.equal(preview.searchMarket, 'china_suppliers');
        assert.ok(preview.queries.some((q) => q.sourcePlatform === 'baidu'));
        assert.ok(preview.queries.some((q) => q.sourcePlatform === '1688'));
        assert.ok(preview.queries.some((q) => q.sourcePlatform === 'google_global'));
        assert.equal(preview.queries[0].sourcePlatform, '1688');
    });

    it('Chinese product phrases stay native-first and are not translated before 1688/Baidu', () => {
        const queries = buildSimpleQueries({
            product: '智能触摸开关,玻璃触摸开关',
            country: 'China',
            searchMarket: 'china_suppliers',
            locationScope: 'country',
            businessTypes: ['Manufacturer', 'Provider', 'Supplier', 'System Integrator'],
            relatedKeywords: ['涂鸦', 'Zigbee'],
        });
        assert.equal(queries[0].sourcePlatform, '1688');
        assert.ok(queries.some((q) => q.sourcePlatform === '1688' && q.queryText === '智能触摸开关'));
        assert.ok(queries.some((q) => q.sourcePlatform === '1688' && q.queryText === '玻璃触摸开关'));
        assert.ok(queries.some((q) => q.sourcePlatform === '1688' && q.queryText === '涂鸦智能开关'));
        assert.ok(queries.some((q) => q.sourcePlatform === '1688' && q.queryText === 'Zigbee智能开关'));
        assert.ok(queries.some((q) => q.sourcePlatform === 'baidu' && q.queryText === '智能触摸开关 厂家'));
        assert.ok(queries.some((q) => q.sourcePlatform === 'baidu' && q.queryText === '玻璃触摸开关 生产厂家'));
        assert.ok(queries.some((q) => q.sourcePlatform === 'sogou' && q.queryText.includes('智能触摸开关')));
        assert.ok(queries.some((q) => q.sourcePlatform === 'so360' && q.queryText.includes('玻璃触摸开关')));
        assert.ok(queries.some((q) => q.sourcePlatform === 'alibaba' && q.queryText.includes('site:alibaba.com')));
        assert.ok(queries.some((q) => q.sourcePlatform === 'made_in_china'));
        assert.ok(queries.some((q) => q.sourcePlatform === 'global_sources'));
        const platforms = [];
        for (const q of queries) {
            if (!platforms.includes(q.sourcePlatform)) platforms.push(q.sourcePlatform);
        }
        assert.deepEqual(platforms.slice(0, 4), ['1688', 'baidu', 'sogou', 'so360']);
        assert.equal(platforms[platforms.length - 1], 'google_global');
        assert.ok(!queries.some((q) => q.queryText.includes('智能触摸开关,玻璃触摸开关')));
        assert.ok(!queries.some((q) => /system integrators/i.test(q.queryText)));
        const googleIdx = queries.findIndex((q) => q.sourcePlatform === 'google_global');
        const baiduIdx = queries.findIndex((q) => q.sourcePlatform === 'baidu');
        assert.ok(googleIdx > baiduIdx);
    });
});

describe('China bilingual notes', () => {
    it('keeps original Chinese and adds an English copy without dropping the record', () => {
        const rec = attachBilingualToRecord(
            { title: '深圳市XXXX科技有限公司', snippet: '涂鸦 ZT2S Zigbee 模组供应', resultUrl: 'https://detail.1688.com/x' },
            { sourceName: '1688', sourceQuery: 'ZT2S 模组', relatedKeyword: 'ZT2S' },
        );
        assert.equal(rec.title, '深圳市XXXX科技有限公司');
        assert.match(rec.snippet, /涂鸦 ZT2S/);
        assert.ok(rec.notes);
        const unpacked = unpackChinaNotes(rec.notes);
        assert.equal(unpacked.companyNameOriginal, '深圳市XXXX科技有限公司');
        assert.match(unpacked.companyNameEnglish, /Shenzhen/i);
        assert.ok(unpacked.matchedModels.includes('ZT2S'));
        assert.equal(rec.resultTypeHint, 'marketplace_supplier');
        assert.equal(unpacked.verificationStatus, 'MARKETPLACE_SELLER_ONLY');
        const failed = translateChinaText('');
        assert.equal(failed, '');
        const packed = packChinaNotes({ companyNameOriginal: '测试', companyNameEnglish: 'Test' });
        assert.ok(unpackChinaNotes(packed).companyNameOriginal === '测试');
    });

    it('does not mark a 1688 listing as verified manufacturer', () => {
        assert.equal(
            classifyChinaSupplier({
                url: 'https://detail.1688.com/offer/1.html',
                title: 'ZT2S 厂家',
                snippet: '深圳生产厂家',
                source: '1688',
            }),
            'MARKETPLACE_SELLER_ONLY',
        );
        assert.equal(
            classifyChinaSupplier({
                url: 'https://www.tianyancha.com/company/1',
                title: '深圳市某某科技有限公司',
                snippet: '统一社会信用代码 91440300MA5EXAMPLE 经营范围：电子产品销售',
                source: 'baidu',
                uscc: '91440300MA5EXAMPLE',
            }),
            'REGISTERED_MANUFACTURER',
        );
        assert.ok(extractUscc('统一社会信用代码91440300MA5EXXXXXX').length === 18 || extractUscc('统一社会信用代码 91110000MA01234567').length === 18);
    });
});

describe('Chinese search page-kind detection', () => {
    it('pauses on captcha/slider without treating them as organic', () => {
        assert.equal(detectBaiduPageKind('<div>请输入验证码</div> wappass.baidu'), 'captcha');
        assert.equal(detectBaiduPageKind('<div id="content_left" class="c-container"><h3>厂家</h3></div>'), 'organic');
        assert.equal(detect1688PageKind('<div class="nc_wrapper">请完成验证</div>'), 'captcha');
        assert.equal(detect1688PageKind('<a href="https://detail.1688.com/offer/1.html" class="offer">模组</a>'), 'organic');
        assert.equal(detectSogouPageKind('<div>antispider 请输入验证码</div>'), 'captcha');
        assert.equal(detectSogouPageKind('<div id="main"><div class="vrwrap"><h3 class="vr-title">ZT2S</h3></div></div>'), 'organic');
        assert.equal(detect360PageKind('<div>滑动验证 captcha</div>'), 'captcha');
        assert.equal(detect360PageKind('<div id="main"><li class="res-list"><h3 class="res-title">ZT2S</h3></li></div>'), 'organic');
    });
});
