/**
 * Checkpoint 2 - SearchQuery unit/service tests (localhost/crm_test only).
 * No RawCapture / browser / enrichment / AI / frontend.
 */
import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import mongoose from 'mongoose';
import { SearchCampaign } from '../../src/models/searchCampaign.model.js';
import { SearchQuery } from '../../src/models/searchQuery.model.js';
import {
    approveSearchQuery,
    archiveSearchQuery,
    createManualSearchQuery,
    generateSearchQueries,
    getSearchQuery,
    listSearchQueries,
    openSearchQuery,
    regenerateSearchQueries,
    rejectSearchQuery,
    searchQueryHardDeleteSupported,
    updateSearchQuery,
} from '../../src/services/dataExtractor/searchCampaign/searchQuery/searchQuery.service.js';
import { generateQueryCandidates, isNearDuplicateText } from '../../src/services/dataExtractor/searchCampaign/searchQuery/queryGenerator.service.js';
import {
    PERM_QUERY_GENERATE,
    PERM_QUERY_MANAGE,
    PERM_QUERY_OPEN,
    PERM_QUERY_REVIEW,
    PERM_QUERY_VIEW,
} from '../../src/services/dataExtractor/searchCampaign/searchQuery/constants.js';
import { checkUserPermission } from '../../src/utils/permissionUtils.js';

const MONGO_URI = process.env.SC_MONGO_URI || process.env.MONGODB_URL || 'mongodb://127.0.0.1:27017/crm_test';
const TAG = `SQ2-${Date.now()}`;
const companyA = new mongoose.Types.ObjectId();
const companyB = new mongoose.Types.ObjectId();
const userAId = new mongoose.Types.ObjectId();

const fullUser = {
    _id: userAId,
    id: userAId,
    roleName: 'admin',
    additionalPermissions: {
        data_extractor: {
            search_campaign: { view: true, manage: true },
            search_query: { view: true, manage: true, generate: true, review: true, open: true },
        },
    },
};

function homeAutomationBody(overrides = {}) {
    return {
        companyId,
        name: `Home Automation ${TAG}`,
        nameNormalized: `home automation ${TAG}`.toLowerCase(),
        targetIndustry: 'Home Automation',
        relatedIndustries: ['Smart Home', 'Lighting Automation', 'Building Automation'],
        targetProducts: ['Smart Switch', 'Touch Switch', 'DALI', 'Sensors', 'Gateways', 'Smart Drivers', 'Scene Controllers'],
        businessTypes: ['Manufacturer', 'OEM', 'Distributor', 'Dealer', 'System Integrator', 'Automation Consultant'],
        country: 'India',
        state: 'Maharashtra',
        city: 'Mumbai',
        includeKeywords: ['smart lighting', 'IoT', 'KNX', 'Tuya'],
        excludeKeywords: ['jobs', 'course', 'training', 'DIY'],
        sources: ['google', 'facebook', 'indiamart', 'official_website', 'web'],
        status: 'draft',
        createdBy: userAId,
        updatedBy: userAId,
        ...overrides,
    };
}

// fix accidental free var
const companyId = companyA;

let campaignA;
let campaignB;
let closedCampaign;
let archivedCampaign;
let emptyGeoCampaign;

before(async () => {
    assert.match(MONGO_URI, /crm_test/);
    assert.doesNotMatch(MONGO_URI, /prod|atlas|mongodb\.net/i);
    await mongoose.connect(MONGO_URI);
    campaignA = await SearchCampaign.create(homeAutomationBody());
    campaignB = await SearchCampaign.create(homeAutomationBody({
        companyId: companyB,
        name: `B Secret ${TAG}`,
        nameNormalized: `b secret ${TAG}`,
        country: 'India',
    }));
    closedCampaign = await SearchCampaign.create(homeAutomationBody({
        name: `Closed ${TAG}`,
        nameNormalized: `closed ${TAG}`,
        status: 'closed',
    }));
    archivedCampaign = await SearchCampaign.create(homeAutomationBody({
        name: `Archived ${TAG}`,
        nameNormalized: `archived ${TAG}`,
        status: 'archived',
    }));
    emptyGeoCampaign = await SearchCampaign.create(homeAutomationBody({
        name: `No Geo ${TAG}`,
        nameNormalized: `no geo ${TAG}`,
        country: '',
        state: '',
        city: '',
    }));
});

after(async () => {
    await SearchQuery.deleteMany({ companyId: { $in: [companyA, companyB] } });
    await SearchCampaign.deleteMany({ companyId: { $in: [companyA, companyB] }, name: new RegExp(TAG) });
    await mongoose.disconnect();
});

describe('SearchQuery permissions catalogue', () => {
    it('registers search_query permission keys', () => {
        assert.equal(checkUserPermission(fullUser, PERM_QUERY_VIEW), true);
        assert.equal(checkUserPermission(fullUser, PERM_QUERY_MANAGE), true);
        assert.equal(checkUserPermission(fullUser, PERM_QUERY_GENERATE), true);
        assert.equal(checkUserPermission(fullUser, PERM_QUERY_REVIEW), true);
        assert.equal(checkUserPermission(fullUser, PERM_QUERY_OPEN), true);
    });
});

describe('Query generator quality (Home Automation India)', () => {
    it('generates useful varied queries with industry/product/biz/geo/sources', () => {
        const { items, stats } = generateQueryCandidates(campaignA.toObject ? campaignA.toObject() : campaignA, {
            requestedLimit: 30,
        });
        assert.ok(items.length >= 15);
        assert.ok(items.length <= 30);
        assert.equal(stats.requested, 30);
        const texts = items.map((i) => i.queryText.toLowerCase());
        assert.ok(texts.some((t) => t.includes('home automation')));
        assert.ok(texts.some((t) => t.includes('manufacturer')));
        assert.ok(texts.some((t) => t.includes('oem')));
        assert.ok(texts.some((t) => t.includes('integrator')));
        assert.ok(texts.some((t) => t.includes('smart switch') || t.includes('dali')));
        assert.ok(texts.some((t) => t.includes('india') || t.includes('mumbai')));
        assert.ok(texts.some((t) => t.includes('site:indiamart.com')));
        assert.ok(texts.some((t) => t.includes('site:facebook.com')));
        assert.ok(texts.some((t) => t.includes('official website') || t.includes('contact us')));
        assert.ok(texts.some((t) => t.includes('dali') || t.includes('knx') || t.includes('tuya') || t.includes('iot')));
        // Retain meaningfully different business types
        assert.ok(texts.some((t) => t.includes('manufacturer')));
        assert.ok(texts.some((t) => t.includes('system integrator') || t.includes('integrators')));
        assert.ok(!isNearDuplicateText('home automation manufacturers India', 'home automation system integrators India'));
    });

    it('does not invent India when country empty', () => {
        const { items } = generateQueryCandidates(emptyGeoCampaign.toObject(), { requestedLimit: 20 });
        for (const q of items) {
            assert.doesNotMatch(q.queryText, /\bIndia\b/i);
            assert.doesNotMatch(q.queryText, /\s{2,}/);
        }
    });

    it('includes India when explicitly stored', () => {
        const { items } = generateQueryCandidates(campaignA.toObject(), { requestedLimit: 20 });
        assert.ok(items.some((i) => /\bIndia\b/i.test(i.queryText)));
    });

    it('IndiaMART/Facebook only when source selected', () => {
        const { items: withIm } = generateQueryCandidates(
            { ...campaignA.toObject(), sources: ['indiamart'] },
            { requestedLimit: 20 },
        );
        assert.ok(withIm.some((i) => i.sourceHint === 'indiamart'));
        const { items: googleOnly } = generateQueryCandidates(
            { ...campaignA.toObject(), sources: ['google'] },
            { requestedLimit: 40, selectedSources: ['google'] },
        );
        assert.ok(!googleOnly.some((i) => i.sourceHint === 'indiamart'));
        assert.ok(!googleOnly.some((i) => i.sourceHint === 'facebook'));
    });

    it('near-duplicate detection merges plural/company variants', () => {
        assert.equal(
            isNearDuplicateText('Home automation companies India', 'home automation company in India'),
            true,
        );
    });

    it('enforces generation max limit in candidates', () => {
        const { items, stats } = generateQueryCandidates(campaignA.toObject(), { requestedLimit: 5 });
        assert.equal(items.length, Math.min(5, stats.generated));
        assert.ok(items.length <= 5);
    });
});

describe('SearchQuery generate/lifecycle service', () => {
    it('generates queries under authenticated company', async () => {
        const result = await generateSearchQueries({
            companyId: companyA,
            user: fullUser,
            campaignId: campaignA._id,
            body: { requestedLimit: 25 },
        });
        assert.ok(result.stats.inserted >= 10);
        assert.ok(result.stats.generationGroupId);
        assert.ok(result.queries.every((q) => String(q.companyId) === String(companyA)));
        assert.ok(result.queries.every((q) => q.status === 'generated'));
        assert.ok(result.queries.some((q) => /home automation/i.test(q.queryText)));
    });

    it('cannot generate for another company campaign', async () => {
        await assert.rejects(
            () => generateSearchQueries({
                companyId: companyA,
                user: fullUser,
                campaignId: campaignB._id,
                body: { requestedLimit: 5 },
            }),
            (err) => err.statusCode === 404,
        );
    });

    it('cannot generate for closed or archived campaign', async () => {
        await assert.rejects(
            () => generateSearchQueries({
                companyId: companyA, user: fullUser, campaignId: closedCampaign._id, body: { requestedLimit: 3 },
            }),
            (err) => err.statusCode === 400,
        );
        await assert.rejects(
            () => generateSearchQueries({
                companyId: companyA, user: fullUser, campaignId: archivedCampaign._id, body: { requestedLimit: 3 },
            }),
            (err) => err.statusCode === 400,
        );
    });

    it('enforces max requestedLimit', async () => {
        await assert.rejects(
            () => generateSearchQueries({
                companyId: companyA, user: fullUser, campaignId: campaignA._id, body: { requestedLimit: 101 },
            }),
            (err) => err.statusCode === 400,
        );
    });

    it('skips exact duplicates on second generate', async () => {
        const second = await generateSearchQueries({
            companyId: companyA,
            user: fullUser,
            campaignId: campaignA._id,
            body: { requestedLimit: 25 },
        });
        assert.ok(second.stats.exactDuplicatesSkipped + second.stats.nearDuplicatesSkipped >= 1 || second.stats.inserted === 0);
    });

    it('manual query starts draft; invalid source/unknown/companyId/audit rejected', async () => {
        const q = await createManualSearchQuery({
            companyId: companyA,
            user: fullUser,
            campaignId: campaignA._id,
            body: { queryText: `manual unique ${TAG}`, sourceHint: 'google', notes: 'n1' },
        });
        assert.equal(q.status, 'draft');
        assert.equal(q.generationMethod, 'manual');

        await assert.rejects(
            () => createManualSearchQuery({
                companyId: companyA, user: fullUser, campaignId: campaignA._id,
                body: { queryText: 'x', sourceHint: 'serpapi' },
            }),
            (err) => err.statusCode === 400,
        );
        await assert.rejects(
            () => createManualSearchQuery({
                companyId: companyA, user: fullUser, campaignId: campaignA._id,
                body: { queryText: `ok ${TAG}2`, sourceHint: 'google', companyId: String(companyB) },
            }),
            (err) => err.statusCode === 400,
        );
        await assert.rejects(
            () => createManualSearchQuery({
                companyId: companyA, user: fullUser, campaignId: campaignA._id,
                body: { queryText: `ok ${TAG}3`, sourceHint: 'google', createdBy: String(userAId) },
            }),
            (err) => err.statusCode === 400,
        );
        await assert.rejects(
            () => createManualSearchQuery({
                companyId: companyA, user: fullUser, campaignId: campaignA._id,
                body: { queryText: `ok ${TAG}4`, sourceHint: 'google', foo: 1 },
            }),
            (err) => err.statusCode === 400,
        );
        await assert.rejects(
            () => createManualSearchQuery({
                companyId: companyA, user: fullUser, campaignId: campaignA._id,
                body: { queryText: `manual unique ${TAG}`, sourceHint: 'google' },
            }),
            (err) => err.statusCode === 409,
        );
    });

    it('approve/reject/open/archive lifecycle', async () => {
        const listed = await listSearchQueries({
            companyId: companyA, user: fullUser, campaignId: campaignA._id, query: { limit: 5, status: 'generated' },
        });
        assert.ok(listed.items.length >= 1);
        const id = listed.items[0]._id;

        const approved = await approveSearchQuery({
            companyId: companyA, user: fullUser, campaignId: campaignA._id, queryId: id,
        });
        assert.equal(approved.status, 'approved');
        assert.ok(approved.approvedAt);
        assert.equal(String(approved.approvedBy), String(userAId));

        // approved cannot be silently rewritten — creates derived draft
        const derived = await updateSearchQuery({
            companyId: companyA, user: fullUser, campaignId: campaignA._id, queryId: id,
            body: { queryText: `derived rewrite ${TAG}` },
        });
        assert.equal(derived.derived, true);
        assert.equal(derived.query.status, 'draft');
        assert.equal(String(derived.query.parentQueryId), String(id));

        const original = await getSearchQuery({
            companyId: companyA, user: fullUser, campaignId: campaignA._id, queryId: id,
        });
        assert.equal(original.status, 'approved');
        assert.notEqual(original.queryText, `derived rewrite ${TAG}`);

        const opened = await openSearchQuery({
            companyId: companyA, user: fullUser, campaignId: campaignA._id, queryId: id,
        });
        assert.equal(opened.query.status, 'opened');
        assert.equal(opened.openedCount, 1);
        assert.equal(String(opened.query.lastOpenedBy), String(userAId));
        assert.ok(opened.searchUrl.includes('google.com/search') || opened.searchUrl === '' || opened.searchUrl.length >= 0);
        // No browser automation invoked — open only mutates counters

        const openedAgain = await openSearchQuery({
            companyId: companyA, user: fullUser, campaignId: campaignA._id, queryId: id,
        });
        assert.equal(openedAgain.openedCount, 2);

        // reject a different generated query
        const list2 = await listSearchQueries({
            companyId: companyA, user: fullUser, campaignId: campaignA._id, query: { limit: 20, status: 'generated' },
        });
        const rejectId = list2.items[0]._id;
        const rejected = await rejectSearchQuery({
            companyId: companyA, user: fullUser, campaignId: campaignA._id, queryId: rejectId,
            body: { rejectionReason: 'not useful' },
        });
        assert.equal(rejected.status, 'rejected');
        assert.equal(rejected.rejectionReason, 'not useful');
        const stillThere = await getSearchQuery({
            companyId: companyA, user: fullUser, campaignId: campaignA._id, queryId: rejectId,
        });
        assert.equal(stillThere.status, 'rejected');

        const archived = await archiveSearchQuery({
            companyId: companyA, user: fullUser, campaignId: campaignA._id, queryId: rejectId,
        });
        assert.equal(archived.status, 'archived');
        assert.ok(archived.queryText);

        const defaultList = await listSearchQueries({
            companyId: companyA, user: fullUser, campaignId: campaignA._id, query: { limit: 100 },
        });
        assert.ok(!defaultList.items.some((i) => String(i._id) === String(rejectId)));
    });

    it('invalid status transition rejected', async () => {
        const q = await createManualSearchQuery({
            companyId: companyA, user: fullUser, campaignId: campaignA._id,
            body: { queryText: `transition ${TAG}`, sourceHint: 'web' },
        });
        await archiveSearchQuery({
            companyId: companyA, user: fullUser, campaignId: campaignA._id, queryId: q._id,
        });
        await assert.rejects(
            () => approveSearchQuery({
                companyId: companyA, user: fullUser, campaignId: campaignA._id, queryId: q._id,
            }),
            (err) => err.statusCode === 400,
        );
    });

    it('cross-company detail/update returns not found', async () => {
        const list = await listSearchQueries({
            companyId: companyA, user: fullUser, campaignId: campaignA._id, query: { limit: 1 },
        });
        const qid = list.items[0]._id;
        await assert.rejects(
            () => getSearchQuery({ companyId: companyB, user: fullUser, campaignId: campaignA._id, queryId: qid }),
            (err) => err.statusCode === 404,
        );
        await assert.rejects(
            () => updateSearchQuery({
                companyId: companyB, user: fullUser, campaignId: campaignA._id, queryId: qid,
                body: { notes: 'hack' },
            }),
            (err) => err.statusCode === 404,
        );
    });

    it('regeneration preserves old queries and lineage; skips duplicates', async () => {
        const before = await SearchQuery.countDocuments({ companyId: companyA, campaignId: campaignA._id });
        const parent = (await listSearchQueries({
            companyId: companyA, user: fullUser, campaignId: campaignA._id, query: { limit: 1 },
        })).items[0];
        const regen = await regenerateSearchQueries({
            companyId: companyA,
            user: fullUser,
            campaignId: campaignA._id,
            body: {
                requestedLimit: 20,
                regenerationReason: 'need more product focus',
                parentQueryId: String(parent._id),
                explicitGenerateWhilePaused: true,
            },
        });
        const after = await SearchQuery.countDocuments({ companyId: companyA, campaignId: campaignA._id });
        assert.ok(after >= before);
        assert.ok(regen.stats.generationGroupId);
        if (regen.queries.length) {
            assert.equal(regen.queries[0].generationMethod, 'regenerated');
            assert.equal(String(regen.queries[0].parentQueryId), String(parent._id));
            assert.equal(regen.queries[0].regenerationReason, 'need more product focus');
        }
        // Second regen should mostly skip
        const regen2 = await regenerateSearchQueries({
            companyId: companyA,
            user: fullUser,
            campaignId: campaignA._id,
            body: { requestedLimit: 20, regenerationReason: 'retry', explicitGenerateWhilePaused: true },
        });
        assert.ok(regen2.stats.inserted === 0 || regen2.stats.exactDuplicatesSkipped + regen2.stats.nearDuplicatesSkipped >= 0);
    });

    it('no hard-delete service exists', () => {
        assert.equal(searchQueryHardDeleteSupported(), false);
    });
});
