/**
 * China Suppliers Simple Lead Search — Unicode + state expansion + owner errors.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeQueryKey } from '../../src/services/dataExtractor/searchCampaign/searchQuery/normalize.util.js';
import {
    buildSimpleQueries,
    estimateQueryCount,
    normalizeBusinessTypes,
    parseLocationExpandList,
    MAX_GENERATED_QUERIES,
} from '../../src/services/dataExtractor/searchCampaign/simpleLeadSearch/queryBuilder.util.js';

const PRODUCT_ZH = '智能家居网关中控一体机';

describe('Simple Lead Search China Unicode + states', () => {
    it('normalizeQueryKey preserves Chinese product text', () => {
        const zh = `${PRODUCT_ZH}厂家`;
        const key = normalizeQueryKey(zh);
        assert.ok(key.length > 0, 'key must not be empty');
        assert.match(key, /智能家居/);
        assert.match(key, /厂家/);
        // English stop-word folding still works
        assert.equal(normalizeQueryKey('LED manufacturers in India'), 'led manufacturer india');
    });

    it('parses comma-separated selected states with trim/dedupe', () => {
        assert.deepEqual(
            parseLocationExpandList('Guangdong, Zhejiang, Jiangsu, Fujian'),
            ['Guangdong', 'Zhejiang', 'Jiangsu', 'Fujian'],
        );
        assert.deepEqual(
            parseLocationExpandList(['Guangdong', ' Guangdong ', 'Zhejiang', '']),
            ['Guangdong', 'Zhejiang'],
        );
        assert.deepEqual(parseLocationExpandList('  ,,  '), []);
    });

    it('normalizes business-type aliases including Brand Owner / oem_odm', () => {
        assert.deepEqual(
            normalizeBusinessTypes(['Manufacturer', 'OEM / ODM', 'Brand Owner']),
            ['Manufacturer', 'OEM / ODM', 'Brand Owner'],
        );
        assert.deepEqual(
            normalizeBusinessTypes(['manufacturer', 'oem_odm', 'brand_owner']),
            ['Manufacturer', 'OEM / ODM', 'Brand Owner'],
        );
    });

    it('Chinese product + China + no state expansion builds Unicode-safe queries', () => {
        const qs = buildSimpleQueries({
            product: PRODUCT_ZH,
            businessTypes: ['Manufacturer', 'OEM / ODM'],
            locationScope: 'country',
            country: 'China',
            searchMarket: 'china_suppliers',
        });
        assert.ok(qs.length >= 3);
        const zh = qs.filter((q) => q.queryLanguage === 'zh');
        assert.ok(zh.length >= 1);
        for (const q of qs) {
            assert.ok(normalizeQueryKey(q.queryText).length > 0, `empty key for ${q.queryText}`);
            assert.match(q.queryText, /智能家居网关中控一体机|厂家|OEM|manufacturer/i);
        }
    });

    it('four comma-separated states expand into separate queries under the limit', () => {
        const states = parseLocationExpandList('Guangdong, Zhejiang, Jiangsu, Fujian');
        const qs = buildSimpleQueries({
            product: PRODUCT_ZH,
            businessTypes: ['Manufacturer', 'OEM / ODM', 'Brand Owner'],
            locationScope: 'country',
            country: 'China',
            searchMarket: 'china_suppliers',
            expandStates: states,
        });
        const expansions = qs.filter((q) => q.isExpansion);
        assert.equal(expansions.length, 8); // 4 states × 2 types
        assert.ok(qs.length <= MAX_GENERATED_QUERIES);
        assert.ok(expansions.some((q) => /Guangdong/i.test(q.queryText)));
        assert.ok(expansions.some((q) => /Fujian/i.test(q.queryText)));
        for (const q of qs) {
            assert.ok(normalizeQueryKey(q.queryText).length > 0);
        }
        assert.equal(estimateQueryCount({
            product: PRODUCT_ZH,
            businessTypes: ['Manufacturer', 'OEM / ODM', 'Brand Owner'],
            locationScope: 'country',
            country: 'China',
            searchMarket: 'china_suppliers',
            expandStates: states,
        }), qs.length);
    });

    it('selectedStates as array works the same as expandStates', () => {
        const a = buildSimpleQueries({
            product: PRODUCT_ZH,
            businessTypes: ['Manufacturer'],
            locationScope: 'country',
            country: 'China',
            searchMarket: 'china_suppliers',
            expandStates: ['Guangdong', 'Zhejiang'],
        });
        const b = buildSimpleQueries({
            product: PRODUCT_ZH,
            businessTypes: ['Manufacturer'],
            locationScope: 'country',
            country: 'China',
            searchMarket: 'china_suppliers',
            expandStates: parseLocationExpandList(['Guangdong', 'Zhejiang']),
        });
        assert.equal(a.length, b.length);
    });

    it('rejects oversized China selections with owner message', () => {
        const manyStates = Array.from({ length: 20 }, (_, i) => `Province${i + 1}`);
        assert.throws(
            () => buildSimpleQueries({
                product: PRODUCT_ZH,
                businessTypes: ['Manufacturer', 'OEM / ODM', 'Brand Owner', 'Supplier', 'Dealer', 'Distributor'],
                locationScope: 'country',
                country: 'China',
                searchMarket: 'china_suppliers',
                expandStates: manyStates,
            }),
            (err) => /creates \d+ queries/i.test(err.message) && err.statusCode === 400,
        );
    });

    it('India city search still works (regression)', () => {
        const qs = buildSimpleQueries({
            product: 'LED Light',
            businessTypes: ['Manufacturer'],
            locationScope: 'city',
            city: 'Mumbai',
            state: 'Maharashtra',
            country: 'India',
            searchMarket: 'india_global_web',
        });
        assert.ok(qs.length >= 1);
        assert.match(qs[0].queryText, /led light/i);
        assert.match(qs[0].queryText, /Mumbai/i);
        assert.ok(normalizeQueryKey(qs[0].queryText).length > 0);
    });
});
