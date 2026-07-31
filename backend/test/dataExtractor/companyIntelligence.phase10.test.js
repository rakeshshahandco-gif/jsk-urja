/**
 * Phase 10 — AI Company Summary / Business Intelligence Profile tests.
 */
import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import mongoose from 'mongoose';
import { buildRuleBasedProfile } from '../../src/services/dataExtractor/companyIntelligence/ruleSummary.service.js';
import { generateCompanyProfile } from '../../src/services/dataExtractor/companyIntelligence/generate.service.js';
import { validateAiProfileOutput, applyHybridWording, enrichProfileWithAi } from '../../src/services/dataExtractor/companyIntelligence/aiAdapter.js';
import {
    generateOne,
    editProfile,
    lockProfile,
    getProfile,
    getProfileHistory,
    exportApprovedProfiles,
    applyOutdatedFromUpstream,
} from '../../src/services/dataExtractor/companyIntelligence/profileStore.service.js';
import {
    createProfileBatch,
    controlProfileBatch,
    processProfileBatchChunk,
    getProfileBatch,
} from '../../src/services/dataExtractor/companyIntelligence/batch.service.js';
import { AiCompanyIntelligenceProfile } from '../../src/models/aiCompanyIntelligenceProfile.model.js';
import { AiCompanyIntelligenceBatchJob } from '../../src/models/aiCompanyIntelligenceBatchJob.model.js';
import { ExtractedLead } from '../../src/models/extractedLead.model.js';
import { checkUserPermission } from '../../src/utils/permissionUtils.js';
import dataExtractorRouter from '../../src/routes/v1/dataExtractor.routes.js';

const MONGO_URI = process.env.P10_MONGO_URI || 'mongodb://127.0.0.1:27017/crm_test';
const TAG = `P10-${Date.now()}`;
const companyA = new mongoose.Types.ObjectId();
const companyB = new mongoose.Types.ObjectId();
const userA = new mongoose.Types.ObjectId();
const created = { profiles: [], batches: [], leads: [] };

function fixtures() {
    return {
        record: {
            companyName: `${TAG} Sensor OEM`,
            website: 'https://sensor-oem.test',
            businessDescription: 'Public OEM manufacturer of industrial sensor modules',
            city: 'Pune',
            country: 'India',
            productCategories: ['industrial sensors'],
            sourceUrl: 'https://sensor-oem.test/about',
        },
        classification: {
            status: 'CLASSIFIED',
            parentIndustry: 'Electronics',
            subIndustry: 'OEM Components',
            customerType: 'OEM',
            confidenceScore: 82,
            evidenceSnippets: ['industrial sensor modules'],
            productSignals: ['sensors'],
            updatedAt: new Date('2026-01-01'),
        },
        relevance: {
            status: 'RELEVANT',
            relevanceScore: 78,
            whyRelevant: 'OEM electronics fit target market',
            evidenceSnippets: ['OEM manufacturer'],
            updatedAt: new Date('2026-01-02'),
        },
        recommendation: {
            status: 'RECOMMENDED',
            confidence: 74,
            recommendedSalesStrategy: 'OEM / Technical',
            primaryRecommendation: {
                productName: 'Industrial Sensor Kit',
                brochureUrl: 'https://example.test/brochure.pdf',
                salesStrategy: 'OEM / Technical',
            },
            updatedAt: new Date('2026-01-03'),
        },
        contact: {
            status: 'CONTACT_FOUND',
            confidence: 70,
            decisionMakerScore: 72,
            primaryContact: {
                contactKey: 'email:purchase@sensor-oem.test',
                contactName: 'Purchase Desk',
                email: 'purchase@sensor-oem.test',
                contactRoleCategory: 'Purchase',
                isDecisionMakerCandidate: true,
                sourceUrl: 'https://sensor-oem.test/contact',
            },
            secondaryContacts: [],
            contacts: [{ contactKey: 'email:purchase@sensor-oem.test', email: 'purchase@sensor-oem.test' }],
            updatedAt: new Date('2026-01-04'),
        },
    };
}

describe('Phase 10 rule-based summaries and anti-hallucination', () => {
    it('1-3 short/standard/detailed profiles from Phase 6-9 outputs', () => {
        const f = fixtures();
        const out = buildRuleBasedProfile(f);
        assert.ok(out.shortSummary.length >= 40 && out.shortSummary.length <= 480);
        assert.ok(out.standardSummary.includes(f.record.companyName));
        assert.ok(out.detailedSummary.includes('Industry:'));
        assert.equal(out.structuredSections.primaryIndustry, 'Electronics');
        assert.equal(out.recommendationSnapshot.productName, 'Industrial Sensor Kit');
        assert.ok(out.contactSnapshot.primaryContact.email);
        assert.ok(out.recommendedNextAction);
        assert.ok(out.nextActionReason);
    });

    it('4-8 does not invent revenue/employees/certifications/export/contacts', () => {
        const out = buildRuleBasedProfile({
            record: { companyName: 'Sparse Co' },
            classification: { status: 'CLASSIFIED', parentIndustry: 'Textile', customerType: 'Manufacturer', confidenceScore: 50 },
        });
        const blob = JSON.stringify(out).toLowerCase();
        assert.equal(/\$\d|\brevenue\b|\bturnover\b/.test(blob) && blob.includes('revenue of'), false);
        assert.equal(blob.includes('employees:'), false);
        assert.equal(blob.includes('iso 9001'), false);
        assert.equal(blob.includes('exports to germany'), false);
        assert.ok(!out.contactSnapshot?.primaryContact);
        assert.ok((out.missingInformation || []).length >= 1);
    });

    it('9-11 missing info, evidence and source URLs retained', () => {
        const f = fixtures();
        const out = buildRuleBasedProfile(f);
        assert.ok(Array.isArray(out.missingInformation));
        assert.ok((out.evidenceReferences || []).length >= 1);
        assert.ok((out.sourceUrls || []).includes('https://sensor-oem.test'));
    });

    it('12 AI unsupported fact rejected', () => {
        const bad = validateAiProfileOutput({
            companyName: `${TAG} Sensor OEM`,
            shortSummary: 'Company has revenue of $50M and 500 employees with ISO 9001',
            primaryIndustry: 'Electronics',
        }, { companyName: `${TAG} Sensor OEM`, industries: ['Electronics'] });
        assert.equal(bad.ok, false);
        assert.match(bad.reason, /unsupported_claim/);
    });

    it('13 malformed AI falls back via validation', () => {
        assert.equal(validateAiProfileOutput(null).ok, false);
        assert.equal(validateAiProfileOutput('x').ok, false);
    });

    it('14 AI unavailable falls back to rules', async () => {
        const f = fixtures();
        const out = await generateCompanyProfile({ ...f, mode: 'ai' });
        assert.equal(out.fallbackUsed, true);
        assert.ok(String(out.engineUsed).includes('fallback') || out.engineUsed === 'rule_based');
        assert.ok(out.shortSummary);
    });

    it('15 hybrid cannot add unsupported facts', () => {
        const f = fixtures();
        const rule = buildRuleBasedProfile(f);
        const hybrid = applyHybridWording(rule, {
            shortSummary: `${rule.companyName} secretly has revenue of $99M and 2000 employees`,
            standardSummary: `${rule.companyName} turnover is huge`,
        });
        // forbidden claims rejected by applyHybridWording (keeps original)
        assert.equal(hybrid.shortSummary.includes('revenue of'), false);
        assert.ok(hybrid.shortSummary.includes(rule.companyName) || hybrid.shortSummary === rule.shortSummary);
    });

    it('16 low-confidence input requires review / low confidence status', () => {
        const out = buildRuleBasedProfile({
            record: { companyName: 'Low Co' },
            classification: { status: 'LOW_CONFIDENCE', parentIndustry: 'Unknown', confidenceScore: 20 },
            relevance: { status: 'MANUAL_REVIEW', relevanceScore: 20 },
        });
        assert.ok(['LOW_CONFIDENCE', 'MANUAL_REVIEW_REQUIRED'].includes(out.status));
    });

    it('25 recommended next action is explainable', () => {
        const out = buildRuleBasedProfile(fixtures());
        assert.ok(out.recommendedNextAction);
        assert.ok(out.nextActionReason);
    });

    it('26-27 no auto email/WhatsApp or Lead/Customer/Task creation flags', () => {
        const out = buildRuleBasedProfile(fixtures());
        assert.equal(out.noAutoCommunications, true);
        assert.equal(out.noAutoCrmCreate, true);
    });

    it('37 secrets are not returned', async () => {
        const out = await generateCompanyProfile({ ...fixtures(), mode: 'rule_based' });
        const blob = JSON.stringify(out).toLowerCase();
        assert.equal(blob.includes('password'), false);
        assert.equal(blob.includes('cookie'), false);
        assert.equal(blob.includes('sk-'), false);
        assert.equal(blob.includes('openai_api_key'), false);
    });
});

describe('Phase 10 permissions and routes', () => {
    it('34 view-only cannot generate/edit/approve/lock/export', () => {
        const viewOnly = { roleName: 'staff', permissions: ['data_extractor.company_intelligence.view'] };
        for (const p of [
            'data_extractor.company_intelligence.generate',
            'data_extractor.company_intelligence.edit',
            'data_extractor.company_intelligence.approve',
            'data_extractor.company_intelligence.lock',
            'data_extractor.company_intelligence.export',
        ]) {
            assert.equal(checkUserPermission(viewOnly, p), false);
        }
    });

    it('35 generate-only cannot approve or lock', () => {
        const genOnly = {
            roleName: 'staff',
            permissions: ['data_extractor.company_intelligence.view', 'data_extractor.company_intelligence.generate'],
        };
        assert.equal(checkUserPermission(genOnly, 'data_extractor.company_intelligence.approve'), false);
        assert.equal(checkUserPermission(genOnly, 'data_extractor.company_intelligence.lock'), false);
    });

    it('36 export requires exact export permission', () => {
        const noExport = { roleName: 'staff', permissions: ['data_extractor.company_intelligence.view', 'data_extractor.company_intelligence.generate'] };
        assert.equal(checkUserPermission(noExport, 'data_extractor.company_intelligence.export'), false);
        assert.equal(checkUserPermission({ roleName: 'staff', permissions: ['data_extractor.company_intelligence.export'] }, 'data_extractor.company_intelligence.export'), true);
    });

    it('24 unlock requires exact lock permission (route matrix)', () => {
        const paths = dataExtractorRouter.stack.filter((l) => l.route).map((l) => l.route.path);
        assert.ok(paths.includes('/ai-lead-intelligence/profiles/:id/lock'));
        const viewOnly = { roleName: 'staff', permissions: ['data_extractor.company_intelligence.view'] };
        assert.equal(checkUserPermission(viewOnly, 'data_extractor.company_intelligence.lock'), false);
    });

    it('registers company intelligence routes', () => {
        const expected = [
            '/ai-lead-intelligence/profiles',
            '/ai-lead-intelligence/profiles/generate',
            '/ai-lead-intelligence/profiles/:id/edit',
            '/ai-lead-intelligence/profiles/:id/approve',
            '/ai-lead-intelligence/profiles/:id/lock',
            '/ai-lead-intelligence/profiles/export',
            '/ai-lead-intelligence/profile-batches',
        ];
        const paths = dataExtractorRouter.stack.filter((l) => l.route).map((l) => l.route.path);
        for (const p of expected) assert.ok(paths.includes(p), `missing ${p}`);
    });
});

describe('Phase 10 MongoDB workflows', () => {
    before(async () => {
        assert.ok(MONGO_URI.includes('crm_test'));
        await mongoose.connect(MONGO_URI);
    });

    after(async () => {
        try {
            if (created.profiles.length) await AiCompanyIntelligenceProfile.deleteMany({ _id: { $in: created.profiles } });
            if (created.batches.length) await AiCompanyIntelligenceBatchJob.deleteMany({ _id: { $in: created.batches } });
            if (created.leads.length) await ExtractedLead.deleteMany({ _id: { $in: created.leads } });
            await AiCompanyIntelligenceProfile.deleteMany({ companyId: { $in: [companyA, companyB] } });
            await AiCompanyIntelligenceBatchJob.deleteMany({ companyId: { $in: [companyA, companyB] } });
            await ExtractedLead.deleteMany({ companyId: { $in: [companyA, companyB] } });
        } finally {
            await mongoose.disconnect();
        }
    });

    it('17-23 outdated markers, lock, manual edit history, approval', async () => {
        const f = fixtures();
        const out = await generateOne(companyA, userA, {
            adhocKey: `${TAG}-main`,
            mode: 'rule_based',
            record: f.record,
            classification: f.classification,
            relevance: f.relevance,
            recommendation: f.recommendation,
            contact: f.contact,
        });
        assert.equal(out.skipped, false);
        created.profiles.push(out.profile._id);

        const edited = await editProfile(companyA, userA, out.profile._id, {
            action: 'edit',
            standardSummary: `${out.profile.standardSummary} (manual polish)`,
            reason: 'Wording tweak',
        });
        assert.equal(edited.history[edited.history.length - 1].action, 'edit');
        assert.match(edited.standardSummary, /manual polish/);

        const approved = await editProfile(companyA, userA, out.profile._id, { action: 'approve', reason: 'Looks good' });
        assert.equal(approved.status, 'APPROVED');
        assert.equal(approved.manuallyApproved, true);

        // industry/relevance/recommendation/contact updates mark outdated
        for (const [label, hashes] of [
            ['classification', { classificationUpdatedAt: new Date('2026-02-01') }],
            ['relevance', { relevanceUpdatedAt: new Date('2026-02-02') }],
            ['recommendation', { recommendationUpdatedAt: new Date('2026-02-03') }],
            ['contact', { contactUpdatedAt: new Date('2026-02-04') }],
        ]) {
            // re-approve between checks for status path
            await AiCompanyIntelligenceProfile.updateOne({ _id: out.profile._id }, { $set: { status: 'APPROVED', locked: false } });
            const od = await applyOutdatedFromUpstream(companyA, out.profile._id, hashes);
            assert.equal(od.outdated, true, label);
            assert.equal(od.profile.status, 'OUTDATED');
        }

        await AiCompanyIntelligenceProfile.updateOne({ _id: out.profile._id }, { $set: { status: 'APPROVED' } });
        const locked = await lockProfile(companyA, userA, out.profile._id, { action: 'lock', reason: 'Freeze' });
        assert.equal(locked.locked, true);
        const skip = await generateOne(companyA, userA, {
            adhocKey: `${TAG}-main`,
            mode: 'rule_based',
            force: false,
            record: { ...f.record, businessDescription: 'changed' },
            classification: f.classification,
        });
        assert.equal(skip.skipped, true);
        assert.equal(skip.reason, 'locked');

        const hist = await getProfileHistory(companyA, out.profile._id);
        assert.ok(hist.history.some((h) => h.action === 'edit'));
        assert.ok(hist.history.some((h) => h.action === 'approve'));
        assert.ok(hist.history.some((h) => h.action === 'lock'));
    });

    it('28-30 batch pause/resume, fail-continue, idempotency', async () => {
        const lead1 = await ExtractedLead.create({
            companyId: companyA, financialYear: '2025-26', companyName: `${TAG} B1`,
            sourcePlatform: 'web_search', status: 'draft', email: 'a@b1.test',
            businessDescription: 'OEM sensor maker',
        });
        const lead2 = await ExtractedLead.create({
            companyId: companyA, financialYear: '2025-26', companyName: `${TAG} B2`,
            sourcePlatform: 'web_search', status: 'draft', email: 'a@b2.test',
        });
        const lead3 = await ExtractedLead.create({
            companyId: companyA, financialYear: '2025-26', companyName: `${TAG} B3`,
            sourcePlatform: 'web_search', status: 'draft', email: 'a@b3.test',
        });
        created.leads.push(lead1._id, lead2._id, lead3._id);

        const batch = await createProfileBatch(companyA, userA, {
            extractedLeadIds: [lead1._id, lead2._id, lead3._id],
            idempotencyKey: `${TAG}-pbatch`,
            mode: 'rule_based',
        });
        created.batches.push(batch._id);
        const again = await createProfileBatch(companyA, userA, {
            extractedLeadIds: [lead1._id, lead2._id, lead3._id],
            idempotencyKey: `${TAG}-pbatch`,
        });
        assert.equal(String(again._id), String(batch._id));

        await processProfileBatchChunk(companyA, userA, batch._id, { maxItems: 1 });
        let mid = await getProfileBatch(companyA, batch._id);
        assert.equal(mid.cursor, 1);
        await controlProfileBatch(companyA, userA, batch._id, 'pause', { reason: 'Test pause' });
        mid = await getProfileBatch(companyA, batch._id);
        assert.equal(mid.status, 'PAUSED');
        const paused = await processProfileBatchChunk(companyA, userA, batch._id, { maxItems: 5 });
        assert.equal(paused.status, 'PAUSED');
        await controlProfileBatch(companyA, userA, batch._id, 'resume');

        await ExtractedLead.deleteOne({ _id: lead2._id });
        const done = await processProfileBatchChunk(companyA, userA, batch._id, { maxItems: 10 });
        assert.ok(done.failedCount >= 1);
        assert.ok(done.successCount >= 1);
        assert.ok(done.results.some((r) => r.status === 'failed'));
        assert.ok(done.results.some((r) => r.status === 'success'));
    });

    it('31-33 tenant isolation and company override rejected', async () => {
        const f = fixtures();
        const out = await generateOne(companyA, userA, {
            adhocKey: `${TAG}-tenant`,
            record: f.record,
            classification: f.classification,
        });
        created.profiles.push(out.profile._id);
        await assert.rejects(() => getProfile(companyB, out.profile._id), /not found/i);
        await assert.rejects(
            () => generateOne(companyA, userA, { companyId: companyB, record: { companyName: 'x' } }),
            /companyId\/tenantId overrides are rejected/,
        );
        const foreign = await ExtractedLead.create({
            companyId: companyB, financialYear: '2025-26', companyName: `${TAG} Foreign`,
            sourcePlatform: 'web_search', status: 'draft',
        });
        created.leads.push(foreign._id);
        await assert.rejects(
            () => createProfileBatch(companyA, userA, { extractedLeadIds: [foreign._id] }),
            /No owned profile generation targets/,
        );
        const exported = await exportApprovedProfiles(companyA, {});
        assert.ok(!(exported.results || []).some((r) => String(r.companyId) === String(companyB)));
    });
});
