/**
 * Checkpoint 2A — SearchQuery hardening (index, concurrency, archive-recreate,
 * derived edit, URL safety, Home Automation full batch). crm_test only.
 */
import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import mongoose from 'mongoose';
import { SearchCampaign } from '../../src/models/searchCampaign.model.js';
import { SearchQuery } from '../../src/models/searchQuery.model.js';
import {
    SEARCH_QUERY_ACTIVE_STATUSES,
    SEARCH_QUERY_UNIQUE_INDEX_NAME,
} from '../../src/services/dataExtractor/searchCampaign/searchQuery/constants.js';
import {
    buildGoogleSearchUrl,
    buildSearchUrl,
    normalizeQueryKey,
} from '../../src/services/dataExtractor/searchCampaign/searchQuery/normalize.util.js';
import { generateQueryCandidates } from '../../src/services/dataExtractor/searchCampaign/searchQuery/queryGenerator.service.js';
import {
    approveSearchQuery,
    archiveSearchQuery,
    createManualSearchQuery,
    generateSearchQueries,
    getSearchQuery,
    listSearchQueries,
    openSearchQuery,
    updateSearchQuery,
} from '../../src/services/dataExtractor/searchCampaign/searchQuery/searchQuery.service.js';

const MONGO_URI = process.env.SC_MONGO_URI || process.env.MONGODB_URL || 'mongodb://127.0.0.1:27017/crm_test';
const TAG = `SQ2A-${Date.now()}`;
const companyA = new mongoose.Types.ObjectId();
const companyB = new mongoose.Types.ObjectId();
const userId = new mongoose.Types.ObjectId();
const editorId = new mongoose.Types.ObjectId();

const fullUser = {
    _id: userId,
    id: userId,
    roleName: 'staff',
    additionalPermissions: {
        data_extractor: {
            search_campaign: { view: true, manage: false },
            search_query: { view: true, manage: true, generate: true, review: true, open: true },
        },
    },
};
const editorUser = {
    _id: editorId,
    id: editorId,
    roleName: 'staff',
    additionalPermissions: fullUser.additionalPermissions,
};

function haCampaign(overrides = {}) {
    return {
        companyId: companyA,
        name: `HA ${TAG}`,
        nameNormalized: `ha ${TAG}`,
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
        status: 'active',
        createdBy: userId,
        updatedBy: userId,
        ...overrides,
    };
}

let campaignA;
let campaignB;
let campaignA2;

before(async () => {
    assert.match(MONGO_URI, /crm_test/);
    assert.doesNotMatch(MONGO_URI, /prod|atlas|mongodb\.net/i);
    await mongoose.connect(MONGO_URI);

    // Drop legacy unsupported $ne partial index if present, then sync schema indexes.
    try {
        await SearchQuery.collection.dropIndex(SEARCH_QUERY_UNIQUE_INDEX_NAME);
    } catch {
        /* may not exist yet */
    }
    // Also drop any unnamed compound unique on same keys if present
    const existing = await SearchQuery.collection.indexes();
    for (const idx of existing) {
        if (idx.name === SEARCH_QUERY_UNIQUE_INDEX_NAME) continue;
        const keys = Object.keys(idx.key || {});
        if (keys.join(',') === 'companyId,campaignId,queryNormalized' && idx.unique) {
            try { await SearchQuery.collection.dropIndex(idx.name); } catch { /* ignore */ }
        }
    }
    await SearchQuery.syncIndexes();

    campaignA = await SearchCampaign.create(haCampaign());
    campaignA2 = await SearchCampaign.create(haCampaign({
        name: `HA2 ${TAG}`,
        nameNormalized: `ha2 ${TAG}`,
    }));
    campaignB = await SearchCampaign.create(haCampaign({
        companyId: companyB,
        name: `HB ${TAG}`,
        nameNormalized: `hb ${TAG}`,
    }));
});

after(async () => {
    await SearchQuery.deleteMany({ companyId: { $in: [companyA, companyB] } });
    await SearchCampaign.deleteMany({ companyId: { $in: [companyA, companyB] }, name: new RegExp(TAG) });
    await mongoose.disconnect();
});

describe('Checkpoint 2A — MongoDB unique index', () => {
    it('creates supported partial unique index and enforces active uniqueness', async () => {
        const indexes = await SearchQuery.collection.indexes();
        const uniq = indexes.find((i) => i.name === SEARCH_QUERY_UNIQUE_INDEX_NAME);
        assert.ok(uniq, 'unique index must exist');
        assert.equal(uniq.unique, true);
        assert.deepEqual(uniq.key, { companyId: 1, campaignId: 1, queryNormalized: 1 });
        assert.ok(uniq.partialFilterExpression);
        assert.ok(uniq.partialFilterExpression.status);
        assert.ok(uniq.partialFilterExpression.status.$in);
        assert.deepEqual(
            [...uniq.partialFilterExpression.status.$in].sort(),
            [...SEARCH_QUERY_ACTIVE_STATUSES].sort(),
        );
        assert.equal(Object.prototype.hasOwnProperty.call(uniq.partialFilterExpression.status, '$ne'), false);

        const norm = normalizeQueryKey(`index probe ${TAG}`);
        const base = {
            companyId: companyA,
            campaignId: campaignA._id,
            queryText: `Index Probe ${TAG}`,
            queryNormalized: norm,
            sourceHint: 'google',
            queryType: 'manual',
            status: 'draft',
            generationMethod: 'manual',
            searchUrl: buildSearchUrl('google', `Index Probe ${TAG}`),
            createdBy: userId,
            updatedBy: userId,
        };

        const a = await SearchQuery.create(base);
        await assert.rejects(() => SearchQuery.create({ ...base }), (err) => err.code === 11000);

        await SearchQuery.findByIdAndUpdate(a._id, {
            $set: { status: 'archived', archivedAt: new Date(), archivedBy: userId },
        });

        const b = await SearchQuery.create({
            ...base,
            queryText: `Index Probe Recreate ${TAG}`,
            status: 'generated',
        });
        assert.notEqual(String(b._id), String(a._id));
        assert.equal(b.status, 'generated');
        const stillA = await SearchQuery.findById(a._id).lean();
        assert.equal(stillA.status, 'archived');
        assert.equal(stillA.queryNormalized, norm);

        // Second archived with same norm does not block active uniqueness after archive of B
        await SearchQuery.findByIdAndUpdate(b._id, { $set: { status: 'archived' } });
        const c = await SearchQuery.create({ ...base, status: 'approved' });
        assert.equal(c.status, 'approved');

        // Cross-campaign same norm allowed
        await SearchQuery.create({
            ...base,
            campaignId: campaignA2._id,
            status: 'draft',
        });

        // Cross-company same campaign-shaped ids: different company allowed
        await SearchQuery.create({
            ...base,
            companyId: companyB,
            campaignId: campaignB._id,
            status: 'draft',
        });
    });
});

describe('Checkpoint 2A — archive and recreate lifecycle', () => {
    it('allows recreation after archive without mutating archived history', async () => {
        const text = `recreate lifecycle ${TAG}`;
        const q1 = await createManualSearchQuery({
            companyId: companyA, user: fullUser, campaignId: campaignA._id,
            body: { queryText: text, sourceHint: 'google' },
        });
        await assert.rejects(
            () => createManualSearchQuery({
                companyId: companyA, user: fullUser, campaignId: campaignA._id,
                body: { queryText: text, sourceHint: 'google' },
            }),
            (err) => err.statusCode === 409,
        );
        await archiveSearchQuery({
            companyId: companyA, user: fullUser, campaignId: campaignA._id, queryId: q1._id,
        });
        const q2 = await createManualSearchQuery({
            companyId: companyA, user: fullUser, campaignId: campaignA._id,
            body: { queryText: text, sourceHint: 'web', notes: 'recreated' },
        });
        assert.notEqual(String(q2._id), String(q1._id));
        assert.equal(q2.status, 'draft');
        assert.equal(q2.notes, 'recreated');
        const archived = await getSearchQuery({
            companyId: companyA, user: fullUser, campaignId: campaignA._id, queryId: q1._id,
        });
        assert.equal(archived.status, 'archived');
        assert.equal(archived.sourceHint, 'google');
        const normal = await listSearchQueries({
            companyId: companyA, user: fullUser, campaignId: campaignA._id, query: { limit: 100 },
        });
        assert.ok(!normal.items.some((i) => String(i._id) === String(q1._id)));
        const withArchived = await listSearchQueries({
            companyId: companyA, user: fullUser, campaignId: campaignA._id,
            query: { includeArchived: true, limit: 100 },
        });
        assert.ok(withArchived.items.some((i) => String(i._id) === String(q1._id)));
    });
});

describe('Checkpoint 2A — generation concurrency', () => {
    it('parallel generate does not create duplicate actives or 500s', async () => {
        const camp = await SearchCampaign.create(haCampaign({
            name: `Conc ${TAG}`,
            nameNormalized: `conc ${TAG}`,
        }));
        const [r1, r2] = await Promise.all([
            generateSearchQueries({
                companyId: companyA, user: fullUser, campaignId: camp._id,
                body: { requestedLimit: 20 },
            }),
            generateSearchQueries({
                companyId: companyA, user: fullUser, campaignId: camp._id,
                body: { requestedLimit: 20 },
            }),
        ]);
        assert.ok(r1.stats.generationGroupId);
        assert.ok(r2.stats.generationGroupId);
        assert.notEqual(r1.stats.generationGroupId, r2.stats.generationGroupId);
        assert.ok(r1.stats.inserted + r2.stats.inserted >= 1);
        assert.ok(
            r1.stats.exactDuplicatesSkipped + r1.stats.nearDuplicatesSkipped
            + r2.stats.exactDuplicatesSkipped + r2.stats.nearDuplicatesSkipped >= 0,
        );
        const rows = await SearchQuery.find({
            companyId: companyA, campaignId: camp._id, status: { $ne: 'archived' },
        }).lean();
        const norms = rows.map((r) => r.queryNormalized);
        assert.equal(norms.length, new Set(norms).size);
        assert.ok(rows.every((r) => String(r.companyId) === String(companyA)));
        assert.ok(rows.every((r) => String(r.campaignId) === String(camp._id)));

        // Manual duplicate concurrency
        const text = `manual conc ${TAG}`;
        const results = await Promise.allSettled([
            createManualSearchQuery({
                companyId: companyA, user: fullUser, campaignId: camp._id,
                body: { queryText: text, sourceHint: 'google' },
            }),
            createManualSearchQuery({
                companyId: companyA, user: fullUser, campaignId: camp._id,
                body: { queryText: text, sourceHint: 'google' },
            }),
        ]);
        const fulfilled = results.filter((r) => r.status === 'fulfilled');
        const rejected = results.filter((r) => r.status === 'rejected');
        assert.equal(fulfilled.length, 1);
        assert.equal(rejected.length, 1);
        assert.equal(rejected[0].reason.statusCode, 409);
        assert.doesNotMatch(String(rejected[0].reason.message || ''), /E11000|MongoServerError/i);
    });
});

describe('Checkpoint 2A — approved/opened derived edit', () => {
    it('meaning edit derives draft; notes-only does not; duplicate derive blocked', async () => {
        const q = await createManualSearchQuery({
            companyId: companyA, user: fullUser, campaignId: campaignA._id,
            body: { queryText: `derive base ${TAG}`, sourceHint: 'google', notes: 'orig' },
        });
        const approved = await approveSearchQuery({
            companyId: companyA, user: fullUser, campaignId: campaignA._id, queryId: q._id,
        });
        assert.equal(approved.status, 'approved');
        const approvedAt = approved.approvedAt;
        const approvedBy = String(approved.approvedBy);

        const notesOnly = await updateSearchQuery({
            companyId: companyA, user: editorUser, campaignId: campaignA._id, queryId: q._id,
            body: { notes: 'metadata only' },
        });
        assert.equal(notesOnly.derived, false);
        assert.equal(notesOnly.query.notes, 'metadata only');
        assert.equal(notesOnly.query.queryText, `derive base ${TAG}`);
        assert.equal(notesOnly.query.status, 'approved');
        assert.equal(String(notesOnly.query.approvedBy), approvedBy);
        assert.equal(String(notesOnly.query.approvedAt), String(approvedAt));

        const derived = await updateSearchQuery({
            companyId: companyA, user: editorUser, campaignId: campaignA._id, queryId: q._id,
            body: { queryText: `derive changed ${TAG}`, sourceHint: 'web' },
        });
        assert.equal(derived.derived, true);
        assert.equal(derived.query.status, 'draft');
        assert.equal(String(derived.query.parentQueryId), String(q._id));
        assert.equal(String(derived.query.createdBy), String(editorId));
        assert.notEqual(derived.query.queryNormalized, normalizeQueryKey(`derive base ${TAG}`));

        const original = await getSearchQuery({
            companyId: companyA, user: fullUser, campaignId: campaignA._id, queryId: q._id,
        });
        assert.equal(original.queryText, `derive base ${TAG}`);
        assert.equal(original.status, 'approved');
        assert.equal(original.sourceHint, 'google');
        assert.equal(String(original.approvedBy), approvedBy);

        await assert.rejects(
            () => updateSearchQuery({
                companyId: companyA, user: editorUser, campaignId: campaignA._id, queryId: q._id,
                body: { queryText: `derive changed ${TAG}` },
            }),
            (err) => err.statusCode === 409,
        );

        // Opened follows same rule
        const q2 = await createManualSearchQuery({
            companyId: companyA, user: fullUser, campaignId: campaignA._id,
            body: { queryText: `opened derive ${TAG}`, sourceHint: 'google' },
        });
        await approveSearchQuery({
            companyId: companyA, user: fullUser, campaignId: campaignA._id, queryId: q2._id,
        });
        await openSearchQuery({
            companyId: companyA, user: fullUser, campaignId: campaignA._id, queryId: q2._id,
        });
        // queryType-only on opened shares queryNormalized → in-place (cannot derive duplicate active).
        const typeOnly = await updateSearchQuery({
            companyId: companyA, user: editorUser, campaignId: campaignA._id, queryId: q2._id,
            body: { queryType: 'technical' },
        });
        assert.equal(typeOnly.derived, false);
        assert.equal(typeOnly.query.status, 'opened');
        assert.equal(typeOnly.query.queryType, 'technical');

        const d2 = await updateSearchQuery({
            companyId: companyA, user: editorUser, campaignId: campaignA._id, queryId: q2._id,
            body: { queryText: `opened derive changed ${TAG}`, sourceHint: 'web' },
        });
        assert.equal(d2.derived, true);
        assert.equal(d2.query.status, 'draft');
        assert.equal(String(d2.query.parentQueryId), String(q2._id));
        const orig2 = await getSearchQuery({
            companyId: companyA, user: fullUser, campaignId: campaignA._id, queryId: q2._id,
        });
        assert.equal(orig2.status, 'opened');
        assert.equal(orig2.queryText, `opened derive ${TAG}`);
    });
});

describe('Checkpoint 2A — search URL safety', () => {
    it('encodes special/Unicode characters and rejects executable schemes', () => {
        const special = 'home & automation? "DALI" #1 भारत ગુજરાત';
        const url = buildGoogleSearchUrl(special);
        assert.ok(url.startsWith('https://www.google.com/search?q='));
        assert.ok(!url.includes(' '));
        assert.ok(url.includes(encodeURIComponent('&')));
        assert.ok(url.includes(encodeURIComponent('#')));
        assert.ok(url.includes(encodeURIComponent('भारत')));
        assert.ok(url.includes(encodeURIComponent('ગુજરાત')));
        assert.equal(buildSearchUrl('facebook', special), '');
        assert.equal(buildSearchUrl('indiamart', special), '');
        assert.throws(() => buildSearchUrl('google', 'javascript:alert(1)'), (err) => err.statusCode === 400);
        assert.throws(() => buildSearchUrl('google', 'data:text/html,hi'), (err) => err.statusCode === 400);
    });
});

describe('Checkpoint 2A — Home Automation full batch quality', () => {
    it('emits commercially useful first batch without blank geography or FB/IM negatives', () => {
        const { items, stats } = generateQueryCandidates(haCampaign(), { requestedLimit: 30 });
        assert.equal(items.length, 30);
        assert.equal(stats.generated, 30);

        const report = items.map((item, i) => ({
            sequence: i + 1,
            queryText: item.queryText,
            queryNormalized: item.queryNormalized,
            sourceHint: item.sourceHint,
            queryType: item.queryType,
            priorityScore: item.priorityScore,
            generatedFrom: item.generatedFrom,
            searchUrlAvailable: Boolean(buildSearchUrl(item.sourceHint, item.queryText)),
            negativeKeywordsApplied: /-\w+/.test(item.queryText),
        }));

        // Persist report artifact for Checkpoint 2A review (local docs only)
        // eslint-disable-next-line no-console
        console.log('HA_BATCH_JSON_START');
        console.log(JSON.stringify({ stats, queries: report }, null, 2));
        console.log('HA_BATCH_JSON_END');

        const blob = items.map((i) => i.queryText.toLowerCase()).join('\n');
        assert.ok(/manufacturer/.test(blob));
        assert.ok(/oem/.test(blob));
        assert.ok(/dealer|distributor/.test(blob));
        assert.ok(/integrator/.test(blob));
        assert.ok(/consultant/.test(blob));
        const products = ['smart switch', 'touch switch', 'dali', 'sensor', 'gateway', 'smart driver', 'scene controller'];
        const productHits = products.filter((prod) => {
            const singular = prod.replace(/s$/, '');
            return blob.includes(prod) || blob.includes(singular) || blob.includes(`${prod}s`);
        });
        assert.ok(productHits.length >= 5, `expected >=5 product intents, got ${productHits.join(',')}`);
        assert.ok(items.some((i) => i.sourceHint === 'indiamart'));
        assert.ok(items.some((i) => i.sourceHint === 'facebook'));
        assert.ok(items.some((i) => i.sourceHint === 'official_website'));
        for (const i of items) {
            assert.doesNotMatch(i.queryText, /\s{2,}/);
            assert.doesNotMatch(i.queryText, /\s$/);
            if (i.sourceHint === 'facebook' || i.sourceHint === 'indiamart') {
                assert.doesNotMatch(i.queryText, /-\w+/);
            }
        }

        const emptyGeo = generateQueryCandidates(haCampaign({ country: '', state: '', city: '' }), { requestedLimit: 20 });
        for (const i of emptyGeo.items) {
            assert.doesNotMatch(i.queryText, /\bIndia\b/i);
        }
    });
});
