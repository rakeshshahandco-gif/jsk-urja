/**
 * Checkpoint 5B — Simple Lead Search orchestration tests (crm_test).
 */
import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { SearchCampaign } from '../../src/models/searchCampaign.model.js';
import { SearchQuery } from '../../src/models/searchQuery.model.js';
import { AssistedCaptureSession } from '../../src/models/assistedCaptureSession.model.js';
import { DiscoveryAgentJob } from '../../src/models/discoveryAgentJob.model.js';
import { ExtractedLead } from '../../src/models/extractedLead.model.js';
import { Lead } from '../../src/models/lead.model.js';
import { buildSimpleQueries } from '../../src/services/dataExtractor/searchCampaign/simpleLeadSearch/queryBuilder.util.js';
import {
    startSimpleLeadSearch,
} from '../../src/services/dataExtractor/searchCampaign/simpleLeadSearch/simpleLeadSearch.service.js';
import {
    pollQueuedSessionId,
    requestCaptureVisibleResults,
} from '../../src/services/dataExtractor/searchCampaign/assistedCapture/index.js';
import {
    createSearchCampaign,
    updateSearchCampaign,
    archiveSearchCampaign,
} from '../../src/services/dataExtractor/searchCampaign/searchCampaign.service.js';
import {
    createManualSearchQuery,
} from '../../src/services/dataExtractor/searchCampaign/searchQuery/searchQuery.service.js';
import { normalizeQueryKey } from '../../src/services/dataExtractor/searchCampaign/searchQuery/normalize.util.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MONGO_URI = process.env.SC_MONGO_URI || process.env.MONGODB_URL || 'mongodb://127.0.0.1:27017/crm_test';
const TAG = `SLS5B-${Date.now()}`;
const companyA = new mongoose.Types.ObjectId();
const companyB = new mongoose.Types.ObjectId();
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

/** SLS workflow perms without campaign.manage or query.manage */
const slsOnlyUser = {
    _id: new mongoose.Types.ObjectId(),
    id: null,
    roleName: 'staff',
    additionalPermissions: {
        data_extractor: {
            search_campaign: { view: true, manage: false },
            search_query: {
                view: true, manage: false, open: true, review: true, generate: true,
            },
            raw_capture: { view: true, ingest: true, manage: false },
            assisted_capture: { view: true, start: true, manage: false },
        },
    },
};

const userB = {
    _id: new mongoose.Types.ObjectId(),
    id: null,
    roleName: 'staff',
    additionalPermissions: fullUser.additionalPermissions,
};

let leadsBefore;
let crmBefore;
let keyN = 0;

function nextKey(prefix) {
    keyN += 1;
    return `${prefix}-${TAG}-${keyN}`;
}

before(async () => {
    assert.match(MONGO_URI, /crm_test/);
    assert.doesNotMatch(MONGO_URI, /prod|atlas|mongodb\.net/i);
    await mongoose.connect(MONGO_URI);
    leadsBefore = await ExtractedLead.countDocuments({}).catch(() => 0);
    crmBefore = await Lead.countDocuments({}).catch(() => 0);
});

after(async () => {
    await AssistedCaptureSession.deleteMany({ companyId: { $in: [companyA, companyB] } }).catch(() => null);
    await DiscoveryAgentJob.deleteMany({ companyId: { $in: [companyA, companyB] } }).catch(() => null);
    await SearchQuery.deleteMany({ companyId: { $in: [companyA, companyB] } }).catch(() => null);
    await SearchCampaign.deleteMany({ companyId: { $in: [companyA, companyB] } }).catch(() => null);
    const leadsAfter = await ExtractedLead.countDocuments({}).catch(() => 0);
    const crmAfter = await Lead.countDocuments({}).catch(() => 0);
    assert.equal(leadsAfter, leadsBefore, 'ExtractedLead count must not change');
    assert.equal(crmAfter, crmBefore, 'CRM Lead count must not change');
    await mongoose.disconnect();
});

describe('CP5B queryBuilder', () => {
    it('manufacturers query ranked first for Home Automation + Mumbai', () => {
        const queries = buildSimpleQueries({ product: 'Home Automation', city: 'Mumbai' });
        assert.ok(queries.length >= 7);
        assert.equal(
            queries[0].queryText,
            'home automation manufacturers Mumbai -jobs -course -training',
        );
        assert.ok(queries[0].priorityScore >= queries[1].priorityScore);
    });

    it('does not invent country in query text when country omitted', () => {
        const queries = buildSimpleQueries({ product: 'Home Automation', city: 'Mumbai' });
        for (const q of queries) {
            assert.doesNotMatch(q.queryText, /\bindia\b/i);
        }
    });
});

describe('CP5B startSimpleLeadSearch', () => {
    it('product required', async () => {
        await assert.rejects(
            () => startSimpleLeadSearch({ companyId: companyA, user: fullUser, body: { city: 'Mumbai' } }),
            (err) => err.statusCode === 400 && /product is required/i.test(err.message),
        );
    });

    it('no silent country inference (omit country → campaign.country empty)', async () => {
        const data = await startSimpleLeadSearch({
            companyId: companyA,
            user: fullUser,
            body: {
                product: `Home Automation ${TAG}`,
                city: 'Mumbai',
                idempotencyKey: nextKey('sls-country'),
            },
        });
        assert.equal(data.campaign.country, '');
        assert.equal(data.campaignAction, 'created');
        assert.ok(data.session);
        assert.equal(data.session.status, 'queued');
        assert.ok(!data.session.tokenHash);
    });

    it('campaign create then reuse', async () => {
        const product = `Reuse Product ${TAG}`;
        const first = await startSimpleLeadSearch({
            companyId: companyA,
            user: fullUser,
            body: { product, city: 'Pune', idempotencyKey: nextKey('sls-reuse-1') },
        });
        assert.equal(first.campaignAction, 'created');

        const second = await startSimpleLeadSearch({
            companyId: companyA,
            user: fullUser,
            body: { product, city: 'Pune', idempotencyKey: nextKey('sls-reuse-2') },
        });
        assert.equal(second.campaignAction, 'reused');
        assert.equal(String(second.campaign._id), String(first.campaign._id));
    });

    it('manufacturers recommended first on start', async () => {
        const data = await startSimpleLeadSearch({
            companyId: companyA,
            user: fullUser,
            body: {
                product: `HA Rank ${TAG}`,
                city: 'Mumbai',
                idempotencyKey: nextKey('sls-rank'),
            },
        });
        assert.ok(data.queries[0].recommended);
        assert.match(data.queries[0].queryText, /manufacturers/i);
        assert.match(data.selectedQuery.queryText, /manufacturers/i);
    });

    it('company isolation on start', async () => {
        const product = `Iso Product ${TAG}`;
        const a = await startSimpleLeadSearch({
            companyId: companyA,
            user: fullUser,
            body: { product, city: 'Delhi', idempotencyKey: nextKey('sls-iso-a') },
        });
        const b = await startSimpleLeadSearch({
            companyId: companyB,
            user: userB,
            body: { product, city: 'Delhi', idempotencyKey: nextKey('sls-iso-b') },
        });
        assert.notEqual(String(a.campaign._id), String(b.campaign._id));
        assert.equal(String(a.campaign.companyId), String(companyA));
        assert.equal(String(b.campaign.companyId), String(companyB));

        const leaked = await SearchCampaign.findOne({
            _id: a.campaign._id,
            companyId: companyB,
        }).lean();
        assert.equal(leaked, null);
    });

    it('agent poll returns queued session', async () => {
        const data = await startSimpleLeadSearch({
            companyId: companyA,
            user: fullUser,
            body: {
                product: `Poll Product ${TAG}`,
                city: 'Surat',
                idempotencyKey: nextKey('sls-poll'),
            },
        });
        assert.equal(data.session.status, 'queued');
        const queued = await pollQueuedSessionId(companyA);
        assert.ok(queued);
        assert.equal(queued.status, 'queued');
        assert.ok(queued._id);
        assert.ok(!Object.prototype.hasOwnProperty.call(queued, 'tokenHash'));
        assert.equal(typeof queued.searchUrlHost, 'string');
    });

    it('capture request idempotent for browser-open session', async () => {
        const data = await startSimpleLeadSearch({
            companyId: companyA,
            user: fullUser,
            body: {
                product: `CapReq ${TAG}`,
                city: 'Jaipur',
                idempotencyKey: nextKey('sls-cap-session'),
            },
        });
        const session = await AssistedCaptureSession.findOne({ _id: data.session._id, companyId: companyA });
        session.status = 'awaiting_user';
        await session.save();

        const key = nextKey('cap-req');
        const first = await requestCaptureVisibleResults({
            companyId: companyA,
            user: fullUser,
            campaignId: data.campaign._id,
            queryId: data.selectedQuery.id,
            sessionId: session._id,
            body: { idempotencyKey: key },
        });
        assert.equal(first.idempotentReplay, false);
        assert.equal(first.pendingCapture.pendingCaptureStatus, 'pending');

        const second = await requestCaptureVisibleResults({
            companyId: companyA,
            user: fullUser,
            campaignId: data.campaign._id,
            queryId: data.selectedQuery.id,
            sessionId: session._id,
            body: { idempotencyKey: key },
        });
        assert.equal(second.idempotentReplay, true);
    });
});

describe('CP5B architecture + permission isolation', () => {
    it('SLS service source has no direct SearchQuery/SearchCampaign model writes', () => {
        const servicePath = path.resolve(
            __dirname,
            '../../src/services/dataExtractor/searchCampaign/simpleLeadSearch/simpleLeadSearch.service.js',
        );
        const src = fs.readFileSync(servicePath, 'utf8');
        assert.doesNotMatch(src, /SearchQuery\.create\s*\(/);
        assert.doesNotMatch(src, /SearchCampaign\.create\s*\(/);
        assert.doesNotMatch(src, /new\s+SearchQuery\s*\(/);
        assert.doesNotMatch(src, /insertOne\s*\(/);
        assert.doesNotMatch(src, /bulkWrite\s*\(/);
        assert.match(src, /ensureSimpleLeadSearchQuery/);
        assert.match(src, /ensureSimpleLeadSearchCampaign/);
    });

    it('generated query uses normalization + audit from authenticated user', async () => {
        const data = await startSimpleLeadSearch({
            companyId: companyA,
            user: fullUser,
            body: {
                product: `Norm Audit ${TAG}`,
                city: 'Mumbai',
                idempotencyKey: nextKey('sls-norm'),
            },
        });
        const qid = data.selectedQuery.id;
        const doc = await SearchQuery.findOne({ _id: qid, companyId: companyA }).lean();
        assert.ok(doc);
        assert.equal(doc.queryNormalized, normalizeQueryKey(doc.queryText));
        assert.equal(doc.sourceHint, 'google');
        assert.equal(doc.queryType, 'manual');
        assert.equal(doc.status, 'approved');
        assert.equal(String(doc.createdBy), String(userAId));
        assert.equal(String(doc.updatedBy), String(userAId));
        assert.equal(String(doc.approvedBy), String(userAId));
        assert.ok(doc.approvedAt);
        assert.equal(String(doc.companyId), String(companyA));
    });

    it('duplicate start reuses same campaign and same queryNormalized rows', async () => {
        const product = `Dup Query ${TAG}`;
        const first = await startSimpleLeadSearch({
            companyId: companyA,
            user: fullUser,
            body: { product, city: 'Nashik', idempotencyKey: nextKey('sls-dup-1') },
        });
        const second = await startSimpleLeadSearch({
            companyId: companyA,
            user: fullUser,
            body: { product, city: 'Nashik', idempotencyKey: nextKey('sls-dup-2') },
        });
        assert.equal(second.campaignAction, 'reused');
        assert.equal(String(second.campaign._id), String(first.campaign._id));

        const norms = first.queries.map((q) => normalizeQueryKey(q.queryText)).sort();
        const count = await SearchQuery.countDocuments({
            companyId: companyA,
            campaignId: first.campaign._id,
            status: { $ne: 'archived' },
        });
        assert.equal(count, norms.length);

        const secondIds = new Set(second.queries.map((q) => q.id));
        for (const q of first.queries) {
            assert.ok(secondIds.has(q.id), 'query ids reused on duplicate start');
        }
    });

    it('assisted_capture.start does not permit normal campaign CRUD', async () => {
        await assert.rejects(
            () => createSearchCampaign({
                companyId: companyA,
                user: slsOnlyUser,
                body: {
                    name: `Blocked CRUD ${TAG}`,
                    targetIndustry: 'Blocked',
                },
            }),
            (err) => err.statusCode === 403,
        );
        const seeded = await SearchCampaign.create({
            companyId: companyA,
            name: `Seed CRUD ${TAG}`,
            nameNormalized: `seed crud ${TAG}`.toLowerCase(),
            targetIndustry: 'Seed',
            status: 'draft',
            sources: ['google'],
            minimumQualificationScore: 60,
            createdBy: userAId,
            updatedBy: userAId,
        });
        await assert.rejects(
            () => updateSearchCampaign({
                companyId: companyA,
                user: slsOnlyUser,
                campaignId: seeded._id,
                body: { description: 'hack' },
            }),
            (err) => err.statusCode === 403,
        );
        await assert.rejects(
            () => archiveSearchCampaign({
                companyId: companyA,
                user: slsOnlyUser,
                campaignId: seeded._id,
            }),
            (err) => err.statusCode === 403,
        );
    });

    it('assisted_capture.start does not permit arbitrary manual SearchQuery create', async () => {
        const camp = await SearchCampaign.create({
            companyId: companyA,
            name: `SQ Block ${TAG}`,
            nameNormalized: `sq block ${TAG}`,
            targetIndustry: 'Block',
            status: 'active',
            sources: ['google'],
            minimumQualificationScore: 60,
            createdBy: userAId,
            updatedBy: userAId,
        });
        await assert.rejects(
            () => createManualSearchQuery({
                companyId: companyA,
                user: slsOnlyUser,
                campaignId: camp._id,
                body: { queryText: 'arbitrary manual query text Mumbai', sourceHint: 'google' },
            }),
            (err) => err.statusCode === 403,
        );
    });

    it('slsOnlyUser can start dedicated workflow and gets approved server queries', async () => {
        const data = await startSimpleLeadSearch({
            companyId: companyA,
            user: { ...slsOnlyUser, id: slsOnlyUser._id },
            body: {
                product: `SLS Only ${TAG}`,
                city: 'Indore',
                idempotencyKey: nextKey('sls-only'),
            },
        });
        assert.ok(data.campaign);
        assert.equal(data.campaign.sources[0], 'google');
        assert.equal(data.campaign.status, 'active');
        assert.ok(data.queries.length >= 1);
        assert.equal(data.queries[0].status, 'approved');
        assert.match(data.selectedQuery.queryText, /manufacturers/i);
    });
});