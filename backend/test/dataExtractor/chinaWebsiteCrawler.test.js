import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { classifyDestinationType } from '../../src/services/dataExtractor/searchCampaign/chinaWebsiteCrawler/destinationType.util.js';
import { DESTINATION_TYPES } from '../../src/services/dataExtractor/searchCampaign/chinaWebsiteCrawler/constants.js';
import {
    extractChineseCompanyName,
    extractChinaContacts,
    discoverPriorityLinks,
    hasChineseOriginal,
    isLikelyChineseBusinessText,
} from '../../src/services/dataExtractor/searchCampaign/chinaWebsiteCrawler/chinaPageExtract.util.js';
import { assertPublicHttpUrl } from '../../src/services/dataExtractor/discovery/ssrfGuard.js';
import { packChinaNotes, unpackChinaNotes } from '../../src/services/dataExtractor/searchCampaign/simpleLeadSearch/chinaBilingual.util.js';

describe('China destination types', () => {
    it('keeps Baidu as search source vs company website destination', () => {
        assert.equal(
            classifyDestinationType('https://www.baidu.com/s?wd=ZT2S'),
            DESTINATION_TYPES.SEARCH_ENGINE_RESULT,
        );
        assert.equal(
            classifyDestinationType('https://detail.1688.com/offer/123.html'),
            DESTINATION_TYPES.MARKETPLACE_LISTING,
        );
        assert.equal(
            classifyDestinationType('https://www.abc-tech.cn/about', { title: '深圳市某某科技有限公司' }),
            DESTINATION_TYPES.COMPANY_WEBSITE,
        );
    });
});

describe('China page extract', () => {
    it('preserves full Chinese company name and WeChat from public HTML', () => {
        const html = `
          <html><head><title>深圳市飞比电子科技有限公司 - 产品中心</title></head>
          <body>
            <a href="/gsjj">关于我们</a>
            <a href="/lxwm">联系我们</a>
            <p>版权所有：深圳市飞比电子科技有限公司</p>
            <p>联系人：张工 电话：0755-12345678 手机：13800138000</p>
            <p>微信：feibee_iot 邮箱：sales@feibee.test</p>
            <p>地址：深圳市宝安区某街道1号</p>
            <p>专业生产 Zigbee 智能模组 厂家</p>
          </body></html>`;
        assert.equal(extractChineseCompanyName(html), '深圳市飞比电子科技有限公司');
        const c = extractChinaContacts(html);
        assert.equal(c.wechat, 'feibee_iot');
        assert.ok(c.phone);
        assert.ok(c.email.includes('sales@feibee.test'));
        const links = discoverPriorityLinks(html, 'https://www.feibee.test/');
        assert.ok(links.some((l) => /lxwm|gsjj/.test(l.url)));
        assert.equal(hasChineseOriginal('深圳市飞比电子科技有限公司'), true);
        assert.equal(isLikelyChineseBusinessText('デンソーウェーブ 製品'), false);
        assert.equal(isLikelyChineseBusinessText('深圳市飞比电子科技有限公司 专业生产模组'), true);
        const footerHtml = '<html><body>方太集团厨卫有限公司 查看更多 ©2014-2026 杭州涂鸦信息技术有限公司 版权</body></html>';
        assert.equal(extractChineseCompanyName(footerHtml), '杭州涂鸦信息技术有限公司');
    });
});

describe('SSRF guard', () => {
    it('rejects localhost and private IPs', () => {
        assert.throws(() => assertPublicHttpUrl('http://127.0.0.1/secret'));
        assert.throws(() => assertPublicHttpUrl('http://localhost/admin'));
        assert.throws(() => assertPublicHttpUrl('http://192.168.1.8/x'));
        assert.throws(() => assertPublicHttpUrl('file:///etc/passwd'));
    });
});

describe('China notes pack', () => {
    it('round-trips original Chinese and crawl provenance', () => {
        const packed = packChinaNotes({
            sourceName: 'baidu',
            companyNameOriginal: '深圳市飞比电子科技有限公司',
            evidenceOriginal: '专业生产 Zigbee 智能模组',
            destinationDomain: 'feibee.test',
            destinationType: 'COMPANY_WEBSITE',
            crawlStatus: 'EXTRACTED',
            hasChineseOriginal: true,
            discoveredThrough: 'baidu',
            wechat: 'feibee_iot',
        });
        const u = unpackChinaNotes(packed);
        assert.equal(u.companyNameOriginal, '深圳市飞比电子科技有限公司');
        assert.equal(u.destinationDomain, 'feibee.test');
        assert.equal(u.discoveredThrough, 'baidu');
        assert.equal(u.hasChineseOriginal, true);
        assert.equal(u.wechat, 'feibee_iot');
    });
});
