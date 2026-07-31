/**
 * Checkpoint 1 - SearchCampaign foundation tests (localhost/crm_test only).
 * Does not implement SearchQuery / RawCapture / enrichment / AI.
 */
import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import fs from 'node:fs';
import path from 'path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { SearchCampaign } from '../../src/models/searchCampaign.model.js';
import {
    archiveSearchCampaign,
    changeSearchCampaignStatus,
    createSearchCampaign,
    getSearchCampaign,
    listSearchCampaigns,
    searchCampaignHardDeleteSupported,
    updateSearchCampaign,
} from '../../src/services/dataExtractor/searchCampaign/searchCampaign.service.js';
import { PERM_MANAGE, PERM_VIEW } from '../../src/services/dataExtractor/searchCampaign/constants.js';
import { checkUserPermission } from '../../src/utils/permissionUtils.js';

const MONGO_URI = process.env.SC_MONGO_URI || process.env.MONGODB_URL || 'mongodb://127.0.0.1:27017/crm_test';
const TAG = `SC1-${Date.now()}`;
const companyA = new mongoose.Types.ObjectId();
const companyB = new mongoose.Types.ObjectId();
const userAId = new mongoose.Types.ObjectId();
const userBId = new mongoose.Types.ObjectId();

const manageUser = {
    _id: userAId,
    id: userAId,
    roleName: 'admin',
    additionalPermissions: {
        data_extractor: { search_campaign: { view: true, manage: true } },
    },
};
const viewUser = {
    _id: userAId,
    id: userAId,
    roleName: 'staff',
    additionalPermissions: {
        data_extractor: { search_campaign: { view: true, manage: false } },
    },
};
const noPermUser = {
    _id: userBId,
    id: userBId,
    roleName: 'viewer',
    additionalPermissions: {},
};

function baseBody(overrides = {}) {
    return {
        name: `Home Automation ${TAG}`,
        description: 'Checkpoint 1 campaign',
        targetIndustry: 'Home Automation',
        relatedIndustries: ['Smart Home', 'Lighting Automation', ''],
        targetProducts: ['Smart Switch', 'smart switch', 'DALI'],
        businessTypes: ['Manufacturer', 'OEM'],
        country: 'India',
        state: 'Maharashtra',
        city: 'Mumbai',
        includeKeywords: ['home automation', ''],
        excludeKeywords: ['job', 'course'],
        sources: ['google', 'manual_url'],
        minimumQualificationScore: 70,
        requiredContactFields: ['company_name', 'website', 'email'],
        ...overrides,
    };
}

let createdId;

before(async () => {
    assert.match(MONGO_URI, /crm_test/);
    assert.doesNotMatch(MONGO_URI, /prod|atlas|mongodb\.net/i);
    await mongoose.connect(MONGO_URI);
});

after(async () => {
    await SearchCampaign.deleteMany({
        companyId: { $in: [companyA, companyB] },
        name: new RegExp(TAG),
    });
    await mongoose.disconnect();
});

describe('SearchCampaign permissions catalogue', () => {
    it('registers view/manage permission keys', () => {
        const manage = {
            roleName: 'staff',
            additionalPermissions: { data_extractor: { search_campaign: { view: true, manage: true } } },
        };
        const viewOnly = {
            roleName: 'staff',
            additionalPermissions: { data_extractor: { search_campaign: { view: true, manage: false } } },
        };
        assert.equal(checkUserPermission(manage, PERM_VIEW), true);
        assert.equal(checkUserPermission(manage, PERM_MANAGE), true);
        assert.equal(checkUserPermission(viewOnly, PERM_VIEW), true);
        assert.equal(checkUserPermission(viewOnly, PERM_MANAGE), false);
        assert.equal(checkUserPermission(noPermUser, PERM_VIEW), false);
    });
});

describe('SearchCampaign create + validation', () => {
    it('1. authorized campaign creation', async () => {
        const doc = await createSearchCampaign({ companyId: companyA, user: manageUser, body: baseBody() });
        createdId = doc._id;
        assert.equal(doc.companyId.toString(), companyA.toString());
        assert.equal(doc.status, 'draft');
        assert.equal(doc.createdBy.toString(), userAId.toString());
        assert.equal(doc.nameNormalized, doc.name.toLowerCase());
    });

    it('2. required-field validation', async () => {
        await assert.rejects(
            () => createSearchCampaign({ companyId: companyA, user: manageUser, body: { targetIndustry: 'X' } }),
            /name is required/i,
        );
        await assert.rejects(
            () => createSearchCampaign({ companyId: companyA, user: manageUser, body: { name: 'Only name' } }),
            /targetIndustry is required/i,
        );
    });

    it('3. score below 0 rejected', async () => {
        await assert.rejects(
            () => createSearchCampaign({ companyId: companyA, user: manageUser, body: baseBody({ name: `Low ${TAG}`, minimumQualificationScore: -1 }) }),
            /between 0 and 100/i,
        );
    });

    it('4. score above 100 rejected', async () => {
        await assert.rejects(
            () => createSearchCampaign({ companyId: companyA, user: manageUser, body: baseBody({ name: `High ${TAG}`, minimumQualificationScore: 101 }) }),
            /between 0 and 100/i,
        );
    });

    it('5. invalid source rejected', async () => {
        await assert.rejects(
            () => createSearchCampaign({ companyId: companyA, user: manageUser, body: baseBody({ name: `Src ${TAG}`, sources: ['serp_api_paid'] }) }),
            /Unsupported sources/i,
        );
    });

    it('6. invalid contact field rejected', async () => {
        await assert.rejects(
            () => createSearchCampaign({ companyId: companyA, user: manageUser, body: baseBody({ name: `CF ${TAG}`, requiredContactFields: ['gstin'] }) }),
            /Unsupported requiredContactFields/i,
        );
    });

    it('7. invalid status rejected', async () => {
        await assert.rejects(
            () => changeSearchCampaignStatus({ companyId: companyA, user: manageUser, campaignId: createdId, body: { status: 'running' } }),
            /Unsupported status/i,
        );
    });

    it('8-9. blank and case-insensitive duplicate array values removed', async () => {
        const doc = await createSearchCampaign({
            companyId: companyA,
            user: manageUser,
            body: baseBody({
                name: `Dedup ${TAG}`,
                targetProducts: ['Smart Switch', '', 'smart switch', 'DALI'],
                includeKeywords: ['Home Automation', 'home automation', '  '],
            }),
        });
        assert.deepEqual(doc.targetProducts, ['Smart Switch', 'DALI']);
        assert.deepEqual(doc.includeKeywords, ['Home Automation']);
        assert.ok(!doc.relatedIndustries.includes(''));
    });

    it('10. body companyId rejected', async () => {
        await assert.rejects(
            () => createSearchCampaign({
                companyId: companyA,
                user: manageUser,
                body: { ...baseBody({ name: `Cid ${TAG}` }), companyId: String(companyB) },
            }),
            /companyId/i,
        );
    });

    it('11. body audit fields rejected', async () => {
        await assert.rejects(
            () => createSearchCampaign({
                companyId: companyA,
                user: manageUser,
                body: { ...baseBody({ name: `Audit ${TAG}` }), createdBy: String(userBId), archivedAt: new Date().toISOString() },
            }),
            /createdBy|archivedAt|audit/i,
        );
    });
});

describe('SearchCampaign company isolation', () => {
    it('12. company A can list its campaigns', async () => {
        const data = await listSearchCampaigns({ companyId: companyA, user: manageUser, query: { q: TAG } });
        assert.ok(data.items.length >= 1);
        assert.ok(data.items.every((c) => String(c.companyId) === String(companyA)));
    });

    it('13. company A cannot list company B campaigns', async () => {
        const b = await createSearchCampaign({
            companyId: companyB,
            user: { ...manageUser, _id: userBId, id: userBId },
            body: baseBody({ name: `B-Only ${TAG}` }),
        });
        const data = await listSearchCampaigns({ companyId: companyA, user: manageUser, query: { q: TAG, includeArchived: true } });
        assert.ok(!data.items.some((c) => String(c._id) === String(b._id)));
    });

    it('14. company A cannot read company B campaign', async () => {
        const b = await SearchCampaign.findOne({ companyId: companyB, name: new RegExp(TAG) }).lean();
        assert.ok(b);
        await assert.rejects(
            () => getSearchCampaign({ companyId: companyA, user: manageUser, campaignId: b._id }),
            (err) => err.statusCode === 404,
        );
    });

    it('15. company A cannot update company B campaign', async () => {
        const b = await SearchCampaign.findOne({ companyId: companyB, name: new RegExp(TAG) }).lean();
        await assert.rejects(
            () => updateSearchCampaign({
                companyId: companyA,
                user: manageUser,
                campaignId: b._id,
                body: { description: 'hacked' },
            }),
            (err) => err.statusCode === 404,
        );
        const again = await SearchCampaign.findById(b._id).lean();
        assert.notEqual(again.description, 'hacked');
        assert.equal(String(again.companyId), String(companyB));
    });
});

describe('SearchCampaign permission enforcement', () => {
    it('16. user without view cannot list/read', async () => {
        await assert.rejects(
            () => listSearchCampaigns({ companyId: companyA, user: noPermUser, query: {} }),
            /Permission denied/i,
        );
        await assert.rejects(
            () => getSearchCampaign({ companyId: companyA, user: noPermUser, campaignId: createdId }),
            /Permission denied/i,
        );
    });

    it('17. user without manage cannot create/update/archive', async () => {
        await assert.rejects(
            () => createSearchCampaign({ companyId: companyA, user: viewUser, body: baseBody({ name: `NoManage ${TAG}` }) }),
            /Permission denied/i,
        );
        await assert.rejects(
            () => updateSearchCampaign({ companyId: companyA, user: viewUser, campaignId: createdId, body: { description: 'x' } }),
            /Permission denied/i,
        );
        await assert.rejects(
            () => archiveSearchCampaign({ companyId: companyA, user: viewUser, campaignId: createdId }),
            /Permission denied/i,
        );
    });

    it('18. campaign update preserves company ownership', async () => {
        const updated = await updateSearchCampaign({
            companyId: companyA,
            user: manageUser,
            campaignId: createdId,
            body: { description: 'updated desc', city: 'Pune' },
        });
        assert.equal(String(updated.companyId), String(companyA));
        assert.equal(updated.description, 'updated desc');
        assert.equal(updated.city, 'Pune');
        assert.equal(String(updated.updatedBy), String(userAId));
    });
});

describe('SearchCampaign status + archive', () => {
    it('19. valid status transitions succeed', async () => {
        let doc = await changeSearchCampaignStatus({
            companyId: companyA, user: manageUser, campaignId: createdId, body: { status: 'active' },
        });
        assert.equal(doc.status, 'active');
        doc = await changeSearchCampaignStatus({
            companyId: companyA, user: manageUser, campaignId: createdId, body: { status: 'paused' },
        });
        assert.equal(doc.status, 'paused');
        doc = await changeSearchCampaignStatus({
            companyId: companyA, user: manageUser, campaignId: createdId, body: { status: 'active' },
        });
        assert.equal(doc.status, 'active');
    });

    it('20. invalid status transitions fail', async () => {
        await assert.rejects(
            () => changeSearchCampaignStatus({
                companyId: companyA, user: manageUser, campaignId: createdId, body: { status: 'draft' },
            }),
            /Invalid status transition/i,
        );
    });

    it('21. archive records archivedAt and archivedBy', async () => {
        const doc = await archiveSearchCampaign({ companyId: companyA, user: manageUser, campaignId: createdId });
        assert.equal(doc.status, 'archived');
        assert.ok(doc.archivedAt);
        assert.equal(String(doc.archivedBy), String(userAId));
    });

    it('22. archived campaigns excluded from default list', async () => {
        const data = await listSearchCampaigns({ companyId: companyA, user: manageUser, query: { q: TAG } });
        assert.ok(!data.items.some((c) => String(c._id) === String(createdId)));
    });

    it('23. archived included only with includeArchived', async () => {
        const data = await listSearchCampaigns({
            companyId: companyA,
            user: manageUser,
            query: { q: TAG, includeArchived: 'true' },
        });
        assert.ok(data.items.some((c) => String(c._id) === String(createdId) && c.status === 'archived'));
    });

    it('archived cannot be reactivated in Checkpoint 1', async () => {
        await assert.rejects(
            () => changeSearchCampaignStatus({
                companyId: companyA, user: manageUser, campaignId: createdId, body: { status: 'active' },
            }),
            /Invalid status transition/i,
        );
    });
});

describe('SearchCampaign country field (Checkpoint 1A)', () => {
    it('created without country stores empty country', async () => {
        const body = baseBody({ name: `NoCountry ${TAG}` });
        delete body.country;
        const doc = await createSearchCampaign({ companyId: companyA, user: manageUser, body });
        assert.equal(doc.country, '');
    });

    it('created with country India stores India', async () => {
        const doc = await createSearchCampaign({
            companyId: companyA,
            user: manageUser,
            body: baseBody({ name: `IndiaCountry ${TAG}`, country: 'India' }),
        });
        assert.equal(doc.country, 'India');
    });

    it('created with another country stores submitted country', async () => {
        const doc = await createSearchCampaign({
            companyId: companyA,
            user: manageUser,
            body: baseBody({ name: `UAECountry ${TAG}`, country: 'United Arab Emirates' }),
        });
        assert.equal(doc.country, 'United Arab Emirates');
    });

    it('service does not infer or overwrite country on unrelated update', async () => {
        const created = await createSearchCampaign({
            companyId: companyA,
            user: manageUser,
            body: (() => {
                const b = baseBody({ name: `KeepEmptyCountry ${TAG}` });
                delete b.country;
                return b;
            })(),
        });
        assert.equal(created.country, '');
        const updated = await updateSearchCampaign({
            companyId: companyA,
            user: manageUser,
            campaignId: created._id,
            body: { description: 'only description change' },
        });
        assert.equal(updated.country, '');
        assert.equal(updated.description, 'only description change');
    });
});

describe('SearchCampaign routes and list safety', () => {
    it('24. no hard-delete route/API exists', () => {
        assert.equal(searchCampaignHardDeleteSupported(), false);
        const routesPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src/routes/v1/dataExtractor.routes.js');
        const text = fs.readFileSync(routesPath, 'utf8');
        assert.match(text, /\/search-campaigns/);
        assert.match(text, /search-campaigns\/:campaignId\/archive/);
        assert.doesNotMatch(text, /search-campaigns\/:campaignId['"],\s*checkPermission\([^)]+\),\s*searchCampaignController\.(remove|delete|hardDelete)/i);
        assert.equal(/\nrouter\.delete\('\/search-campaigns/.test(text), false);
    });

    it('25. pagination limits are enforced', async () => {
        await assert.rejects(
            () => listSearchCampaigns({ companyId: companyA, user: manageUser, query: { limit: 101 } }),
            /limit may not exceed/i,
        );
        const data = await listSearchCampaigns({ companyId: companyA, user: manageUser, query: { limit: 1, page: 1 } });
        assert.equal(data.pagination.limit, 1);
        assert.ok(data.items.length <= 1);
    });

    it('26. unknown filter/operator injection rejected', async () => {
        await assert.rejects(
            () => listSearchCampaigns({ companyId: companyA, user: manageUser, query: { '$where': '1' } }),
            /Unknown filter|Unsafe filter/i,
        );
        await assert.rejects(
            () => listSearchCampaigns({ companyId: companyA, user: manageUser, query: { companyId: String(companyB) } }),
            /Unknown filter/i,
        );
    });

    it('27. existing Data Extractor discovery routes remain present', () => {
        const routesPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src/routes/v1/dataExtractor.routes.js');
        const text = fs.readFileSync(routesPath, 'utf8');
        assert.match(text, /\/discovery\/jobs/);
        assert.match(text, /\/settings/);
        assert.match(text, /\/records/);
    });
});