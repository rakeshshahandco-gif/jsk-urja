/**
 * Multi business-type + location-scope query generation (Simple Lead Search).
 */
import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import mongoose from 'mongoose';
import { Lead } from '../../src/models/lead.model.js';
import {
    buildSimpleQueries,
    buildCampaignName,
} from '../../src/services/dataExtractor/searchCampaign/simpleLeadSearch/queryBuilder.util.js';
import {
    previewSimpleLeadSearchQueries as previewFromService,
    startSimpleLeadSearch,
} from '../../src/services/dataExtractor/searchCampaign/simpleLeadSearch/simpleLeadSearch.service.js';

const MONGO_URI = process.env.SC_MONGO_URI || process.env.MONGODB_URL || 'mongodb://127.0.0.1:27017/crm_test';
const TAG = `SLSMBT-${Date.now()}`;
const companyA = new mongoose.Types.ObjectId();
const userAId = new mongoose.Types.ObjectId();

const fullUser = {
    _id: userAId,
    id: userAId,
    roleName: 'staff',
    additionalPermissions: {
        data_extractor: {
            search_campaign: { view: true, manage: true },
            search_query: { view: true, manage: true, open: true, review: true, generate: true },
            raw_capture: { view: true, ingest: true, manage: true },
            assisted_capture: { view: true, start: true, manage: true },
        },
    },
};

let leadsBefore;

before(async () => {
    await mongoose.connect(MONGO_URI);
    leadsBefore = await Lead.countDocuments({});
});

after(async () => {
    const leadsAfter = await Lead.countDocuments({});
    assert.equal(leadsAfter, leadsBefore, 'CRM Leads must not change');
    await mongoose.disconnect();
});

describe('Multi-BT location query builder', () => {
    it('TEST A city: separate manufacturer + provider Mumbai queries', () => {
        const queries = buildSimpleQueries({
            product: 'Home Automation',
            businessTypes: ['Manufacturer', 'Provider'],
            locationScope: 'city',
            city: 'Mumbai',
            state: 'Maharashtra',
            country: 'India',
        });
        assert.equal(buildCampaignName('Home Automation', 'Mumbai', 'Maharashtra', {
            locationScope: 'city', country: 'India',
        }), 'Home Automation — Mumbai');
        assert.ok(queries.length >= 2);
        assert.match(queries[0].queryText, /manufacturer Mumbai/i);
        assert.ok(queries.some((q) => /manufacturers Mumbai/i.test(q.queryText)));
        assert.ok(queries.some((q) => /providers Mumbai/i.test(q.queryText)));
        for (const q of queries) {
            assert.doesNotMatch(q.queryText, /\bindia\b/i);
            assert.doesNotMatch(q.queryText, /\bmaharashtra\b/i);
        }
    });

    it('TEST B state: four primary Maharashtra queries; expansion off', () => {
        const queries = buildSimpleQueries({
            product: 'Home Automation',
            businessTypes: ['Manufacturer', 'Provider', 'Supplier', 'System Integrator'],
            locationScope: 'state',
            state: 'Maharashtra',
            country: 'India',
            expandCities: [],
        });
        assert.equal(buildCampaignName('Home Automation', '', 'Maharashtra', {
            locationScope: 'state', country: 'India',
        }), 'Home Automation — Maharashtra');
        const primary = queries.filter((q) => !q.isAlternate && !q.isExpansion);
        assert.equal(primary.length, 4);
        assert.ok(primary.every((q) => /Maharashtra/i.test(q.queryText)));
        assert.ok(!queries.some((q) => /Mumbai/i.test(q.queryText)));
    });

    it('TEST C country: Smart Switch country queries; expansion off', () => {
        const queries = buildSimpleQueries({
            product: 'Smart Switch',
            businessTypes: ['Manufacturer', 'OEM / ODM', 'Supplier'],
            locationScope: 'country',
            country: 'India',
        });
        assert.ok(queries.length >= 3);
        assert.ok(queries.some((q) => /manufacturers India/i.test(q.queryText)));
        assert.ok(queries.some((q) => /OEM ODM manufacturer India/i.test(q.queryText)));
        assert.ok(queries.some((q) => /suppliers India/i.test(q.queryText)));
    });

    it('TEST D China: English + Chinese queries; adapters not claimed complete', () => {
        const preview = previewFromService({
            body: {
                product: 'Smart Switch',
                relatedKeywords: 'Touch Switch, Tuya, Zigbee, Matter',
                businessTypes: ['Manufacturer', 'OEM / ODM'],
                searchMarket: 'china_suppliers',
                locationScope: 'country',
                country: 'China',
            },
        });
        assert.equal(preview.campaignName, 'Smart Switch — China Suppliers');
        assert.ok(preview.queries.some((q) => q.queryLanguage === 'en'));
        assert.ok(preview.queries.some((q) => q.queryLanguage === 'zh'));
        assert.match(preview.platformAdaptersNote, /not claimed complete/i);
        assert.ok(preview.queries.some((q) => /厂家/.test(q.queryText)));
    });

    it('legacy CP5B path unchanged when businessTypes omitted', () => {
        const queries = buildSimpleQueries({ product: 'Home Automation', city: 'Mumbai' });
        assert.ok(queries.length >= 7);
        assert.equal(
            queries[0].queryText,
            'home automation manufacturers Mumbai -jobs -course -training',
        );
    });
});

describe('Multi-BT start + role criteria', () => {
    it('creates campaign with business types and stores selectedCriteria roles', async () => {
        const data = await startSimpleLeadSearch({
            companyId: companyA,
            user: fullUser,
            body: {
                product: `Home Automation ${TAG}`,
                businessTypes: ['Manufacturer', 'Provider', 'Supplier', 'System Integrator'],
                locationScope: 'state',
                country: 'India',
                state: 'Maharashtra',
                searchMarket: 'india_global_web',
                idempotencyKey: `sls-mbt-${TAG}`,
            },
        });
        assert.equal(data.campaignAction, 'created');
        assert.equal(data.campaign.name, `Home Automation ${TAG} — Maharashtra`);
        assert.deepEqual(data.campaign.businessTypes?.slice().sort(), [
            'Manufacturer', 'Provider', 'Supplier', 'System Integrator',
        ].sort());
        assert.ok(data.queries.length >= 4);
        const roles = new Set(data.queries.map((q) => q.businessType).filter(Boolean));
        assert.ok(roles.has('Manufacturer'));
        assert.ok(roles.has('Provider'));
        assert.ok(roles.has('Supplier'));
        assert.ok(roles.has('System Integrator'));
        assert.match(data.queries[0].queryText, /manufacturer Maharashtra/i);
        assert.ok(data.queries.some((q) => /manufacturers Maharashtra/i.test(q.queryText)));
        assert.ok(data.platformAdaptersNote);
    });

    it('does not reuse Mumbai campaign for Maharashtra scope', async () => {
        const product = `Scope Diff ${TAG}`;
        const cityRun = await startSimpleLeadSearch({
            companyId: companyA,
            user: fullUser,
            body: {
                product,
                businessTypes: ['Manufacturer', 'Provider'],
                locationScope: 'city',
                country: 'India',
                state: 'Maharashtra',
                city: 'Mumbai',
                idempotencyKey: `sls-city-${TAG}`,
            },
        });
        const stateRun = await startSimpleLeadSearch({
            companyId: companyA,
            user: fullUser,
            body: {
                product,
                businessTypes: ['Manufacturer', 'Provider', 'Supplier', 'System Integrator'],
                locationScope: 'state',
                country: 'India',
                state: 'Maharashtra',
                idempotencyKey: `sls-state-${TAG}`,
            },
        });
        assert.notEqual(String(cityRun.campaign._id), String(stateRun.campaign._id));
        assert.match(cityRun.campaign.name, /Mumbai/);
        assert.match(stateRun.campaign.name, /Maharashtra/);
    });
});
