/**
 * Phase 11 — Final AI Lead Scoring and Priority Engine tests.
 */
import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import mongoose from 'mongoose';
import { scoreLeadRecord } from '../../src/services/dataExtractor/leadScoring/scoringEngine.service.js';
import { runLeadScoring } from '../../src/services/dataExtractor/leadScoring/score.service.js';
import { validateAiAdjustment, applyAiAdjustment } from '../../src/services/dataExtractor/leadScoring/aiAdapter.js';
import { normalizeScoringSettings } from '../../src/services/dataExtractor/leadScoring/settings.service.js';
import { DEFAULT_SCORING_SETTINGS } from '../../src/services/dataExtractor/leadScoring/constants.js';
import {
    scoreOne,
    overrideScore,
    lockScore,
    getScore,
    getScoreHistory,
    exportApprovedScores,
    applyOutdatedFromUpstream,
} from '../../src/services/dataExtractor/leadScoring/scoreStore.service.js';
import {
    createScoreBatch,
    controlScoreBatch,
    processScoreBatchChunk,
    getScoreBatch,
} from '../../src/services/dataExtractor/leadScoring/batch.service.js';
import { AiLeadScore } from '../../src/models/aiLeadScore.model.js';
import { AiLeadScoreBatchJob } from '../../src/models/aiLeadScoreBatchJob.model.js';
import { ExtractedLead } from '../../src/models/extractedLead.model.js';
import { ExtractorSettings } from '../../src/models/extractorSettings.model.js';
import { checkUserPermission } from '../../src/utils/permissionUtils.js';
import dataExtractorRouter from '../../src/routes/v1/dataExtractor.routes.js';

const MONGO_URI = process.env.P11_MONGO_URI || 'mongodb://127.0.0.1:27017/crm_test';
const TAG = `P11-${Date.now()}`;
const companyA = new mongoose.Types.ObjectId();
const companyB = new mongoose.Types.ObjectId();
const userA = new mongoose.Types.ObjectId();
const created = { scores: [], batches: [], leads: [] };

function strongInputs(extra = {}) {
    return {
        record: {
            companyName: `${TAG} Strong OEM`,
            website: 'https://strong-oem.test',
            businessDescription: 'OEM industrial sensor manufacturer',
            city: 'Pune',
            country: 'India',
            email: 'purchase@strong-oem.test',
            phone: '+91 9876543210',
            ...extra.record,
        },
        classification: {
            status: 'CLASSIFIED',
            parentIndustry: 'Electronics',
            subIndustry: 'OEM Components',
            customerType: 'OEM',
            confidenceScore: 90,
            evidenceSnippets: ['industrial sensor'],
            updatedAt: new Date('2026-01-01'),
            ...extra.classification,
        },
        relevance: {
            status: 'RELEVANT',
            relevanceScore: 85,
            evidenceSnippets: ['OEM fit'],
            updatedAt: new Date('2026-01-02'),
            ...extra.relevance,
        },
        recommendation: {
            status: 'RECOMMENDED',
            confidence: 82,
            opportunityScore: 80,
            recommendedSalesStrategy: 'High Priority OEM',
            primaryRecommendation: { productName: 'Industrial Sensor Kit', opportunityScore: 80, reason: 'OEM match' },
            updatedAt: new Date('2026-01-03'),
            ...extra.recommendation,
        },
        contact: {
            status: 'CONTACT_FOUND',
            confidence: 80,
            decisionMakerScore: 75,
            primaryContact: {
                contactKey: 'email:purchase@strong-oem.test',
                contactName: 'Purchase Head',
                email: 'purchase@strong-oem.test',
                phone: '+91 9876543210',
                contactRoleCategory: 'Purchase',
                isDecisionMakerCandidate: true,
                verificationStatus: 'MULTIPLE_SOURCE_CONFIRMED',
                sourceUrl: 'https://strong-oem.test/contact',
            },
            contacts: [{ verificationStatus: 'MULTIPLE_SOURCE_CONFIRMED' }],
            updatedAt: new Date('2026-01-04'),
            ...extra.contact,
        },
        profile: {
            status: 'GENERATED',
            confidence: 80,
            missingInformation: ['Public brochure not available'],
            sourceUrls: ['https://strong-oem.test', 'https://strong-oem.test/about'],
            updatedAt: new Date('2026-01-05'),
            ...extra.profile,
        },
        settings: extra.settings || DEFAULT_SCORING_SETTINGS,
        searchContext: extra.searchContext || { searchKeyword: 'sensor OEM' },
    };
}

describe('Phase 11 scoring scenarios', () => {
    it('1 strong industry/relevance/product/contact scores high', () => {
        const out = scoreLeadRecord(strongInputs());
        assert.ok(out.finalScore >= 75);
        assert.ok(['HIGH', 'CRITICAL'].includes(out.priority));
        assert.ok(out.finalScore >= 0 && out.finalScore <= 100);
        assert.ok((out.dimensionScores || []).length >= 5);
        assert.ok(out.recommendationReason);
    });

    it('2 relevant company with generic contact scores lower', () => {
        const strong = scoreLeadRecord(strongInputs());
        const generic = scoreLeadRecord(strongInputs({
            contact: {
                status: 'GENERIC_CONTACT_ONLY',
                confidence: 50,
                primaryContact: null,
                genericFallbackContact: { email: 'info@strong-oem.test', isGenericCompanyContact: true },
                contacts: [],
            },
        }));
        assert.ok(generic.finalScore < strong.finalScore);
        assert.ok(generic.negativeSignals.some((s) => /generic/i.test(s)));
    });

    it('3 no-contact company receives configured penalty', () => {
        const out = scoreLeadRecord(strongInputs({
            record: { email: '', phone: '' },
            contact: { status: 'NO_PUBLIC_CONTACT', primaryContact: null, contacts: [] },
        }));
        assert.ok(out.penalties.some((p) => p.type === 'no_contact'));
        assert.ok(out.finalScore < scoreLeadRecord(strongInputs()).finalScore);
    });

    it('4-5 low-relevance / irrelevant scored low but not deleted', () => {
        const low = scoreLeadRecord(strongInputs({ relevance: { status: 'POSSIBLY_RELEVANT', relevanceScore: 30 } }));
        assert.ok(low.finalScore < scoreLeadRecord(strongInputs()).finalScore);
        const irr = scoreLeadRecord(strongInputs({ relevance: { status: 'IRRELEVANT', relevanceScore: 5 } }));
        assert.ok(irr.finalScore <= 25);
        assert.ok(irr.companyName);
        assert.ok(irr.negativeSignals.some((s) => /not deleted/i.test(s)));
    });

    it('6-8 product opportunity, decision-maker, multi-source increase score', () => {
        const base = scoreLeadRecord(strongInputs({
            recommendation: { status: 'LOW_CONFIDENCE', primaryRecommendation: null, confidence: 20 },
            contact: {
                status: 'CONTACT_FOUND',
                confidence: 50,
                decisionMakerScore: 20,
                primaryContact: { email: 'a@x.test', isDecisionMakerCandidate: false, verificationStatus: 'PUBLIC_UNVERIFIED' },
                contacts: [],
            },
        }));
        const boosted = scoreLeadRecord(strongInputs());
        assert.ok(boosted.finalScore > base.finalScore);
        assert.ok(boosted.positiveSignals.some((s) => /product opportunity/i.test(s)));
        assert.ok(boosted.positiveSignals.some((s) => /decision-maker/i.test(s)));
        const multiDim = (boosted.dimensionScores || []).find((d) => d.id === 'multi_source');
        assert.ok(multiDim && multiDim.score > 0);
        assert.ok(boosted.positiveSignals.some((s) => /multi[- ]source|verified public contact/i.test(s)));
    });

    it('9-12 duplicate, exclusion, outdated profile, missing data reduce score', () => {
        const strong = scoreLeadRecord(strongInputs());
        const dup = scoreLeadRecord(strongInputs({ record: { duplicateStatus: 'POSSIBLE_DUPLICATE' } }));
        assert.ok(dup.finalScore < strong.finalScore);
        assert.ok(dup.penalties.some((p) => p.type === 'duplicate' && p.reason));

        const excl = scoreLeadRecord(strongInputs({
            classification: { matchedExclusionTerms: ['hospital only'], status: 'CLASSIFIED', parentIndustry: 'Electronics', confidenceScore: 80, customerType: 'OEM' },
        }));
        assert.ok(excl.penalties.some((p) => p.type === 'exclusion'));

        const outdated = scoreLeadRecord(strongInputs({ profile: { status: 'OUTDATED', confidence: 80, missingInformation: [] } }));
        assert.ok(outdated.penalties.some((p) => p.type === 'outdated_profile'));

        const missing = scoreLeadRecord(strongInputs({
            profile: { status: 'GENERATED', confidence: 50, missingInformation: ['a', 'b', 'c', 'd', 'e'] },
        }));
        assert.ok(missing.negativeSignals.some((s) => /missing information/i.test(s)));
    });

    it('13 score remains between 0 and 100', () => {
        const out = scoreLeadRecord(strongInputs({
            record: { duplicateStatus: 'EXACT_DUPLICATE', stale: true },
            relevance: { status: 'IRRELEVANT', relevanceScore: 0 },
            contact: { status: 'NO_PUBLIC_CONTACT' },
            profile: { status: 'OUTDATED', confidence: 10, missingInformation: Array.from({ length: 20 }, (_, i) => `m${i}`) },
            classification: { status: 'MULTIPLE_POSSIBILITIES', matchedExclusionTerms: ['x'], confidenceScore: 10 },
        }));
        assert.ok(out.finalScore >= 0 && out.finalScore <= 100);
    });

    it('14-15 dimensions configurable; inactive excluded', () => {
        const settings = normalizeScoringSettings({
            dimensions: [
                { id: 'industry_fit', label: 'Industry Fit', weight: 50, maxScore: 50, active: true },
                { id: 'target_market_fit', label: 'Target-Market Fit', weight: 50, maxScore: 50, active: true },
                { id: 'product_opportunity', label: 'Product', weight: 20, maxScore: 20, active: false },
            ],
        });
        const out = scoreLeadRecord(strongInputs({ settings }));
        assert.ok(out.dimensionScores.every((d) => d.id !== 'product_opportunity'));
        assert.ok(out.dimensionScores.some((d) => d.id === 'industry_fit' && d.maxScore === 50));
    });

    it('16-17 thresholds assign priority and grade', () => {
        const high = scoreLeadRecord(strongInputs());
        assert.ok(['CRITICAL', 'HIGH', 'MEDIUM'].includes(high.priority));
        assert.ok(['A+', 'A', 'B', 'C'].includes(high.grade));
        const low = scoreLeadRecord(strongInputs({
            relevance: { status: 'IRRELEVANT', relevanceScore: 0 },
            recommendation: { primaryRecommendation: null },
            contact: { status: 'NO_PUBLIC_CONTACT' },
        }));
        assert.ok(['LOW', 'NO_PRIORITY', 'MANUAL_REVIEW_REQUIRED', 'MEDIUM'].includes(low.priority));
    });

    it('18-19 rule-only works; AI unavailable falls back', async () => {
        const rule = await runLeadScoring({ ...strongInputs(), mode: 'rule_based' });
        assert.equal(rule.engineUsed, 'rule_based');
        const ai = await runLeadScoring({ ...strongInputs(), mode: 'ai' });
        assert.equal(ai.fallbackUsed, true);
        assert.ok(String(ai.engineUsed).includes('fallback') || ai.engineUsed === 'rule_based');
    });

    it('20-22 AI adjustment validation safety', () => {
        const rule = scoreLeadRecord(strongInputs());
        assert.equal(validateAiAdjustment(null).ok, false);
        assert.equal(validateAiAdjustment({ delta: 99, explanation: 'x', evidenceReferences: ['a'] }, { maxAiAdjustment: 5 }, rule).ok, false);
        assert.equal(validateAiAdjustment({ delta: 2, explanation: '', evidenceReferences: ['a'] }, { maxAiAdjustment: 5 }, rule).ok, false);
        assert.equal(validateAiAdjustment({ delta: 2, explanation: 'ok', evidenceReferences: [] }, { maxAiAdjustment: 5 }, rule).ok, false);
        assert.equal(validateAiAdjustment({ delta: 2, explanation: 'has revenue boost', evidenceReferences: ['x'] }, { maxAiAdjustment: 5 }, rule).ok, false);
        const ok = validateAiAdjustment({ delta: 3, explanation: 'Strong multi-source', evidenceReferences: ['multi_source'] }, { maxAiAdjustment: 5 }, rule);
        assert.equal(ok.ok, true);
        const applied = applyAiAdjustment(rule, { delta: 3, explanation: 'Strong multi-source', evidenceReferences: ['multi_source'] }, { maxAiAdjustment: 5 });
        assert.equal(applied.finalScore, Math.min(100, rule.finalScore + 3));
        assert.equal(applied.preAiScore, rule.finalScore);
    });

    it('38-39 secrets not returned; no auto CRM/comms', () => {
        const out = scoreLeadRecord(strongInputs());
        const blob = JSON.stringify(out).toLowerCase();
        assert.equal(blob.includes('password'), false);
        assert.equal(blob.includes('cookie'), false);
        assert.equal(blob.includes('sk-'), false);
        assert.equal(out.noAutoCrmCreate, true);
        assert.equal(out.noAutoCommunications, true);
    });
});

describe('Phase 11 permissions and routes', () => {
    it('35 view-only cannot run/override/approve/reject/lock/export', () => {
        const viewOnly = { roleName: 'staff', permissions: ['data_extractor.lead_scoring.view'] };
        for (const p of [
            'data_extractor.lead_scoring.run',
            'data_extractor.lead_scoring.override',
            'data_extractor.lead_scoring.approve',
            'data_extractor.lead_scoring.reject',
            'data_extractor.lead_scoring.lock',
            'data_extractor.lead_scoring.export',
        ]) assert.equal(checkUserPermission(viewOnly, p), false);
    });

    it('36 run-only cannot approve or lock', () => {
        const runOnly = { roleName: 'staff', permissions: ['data_extractor.lead_scoring.view', 'data_extractor.lead_scoring.run'] };
        assert.equal(checkUserPermission(runOnly, 'data_extractor.lead_scoring.approve'), false);
        assert.equal(checkUserPermission(runOnly, 'data_extractor.lead_scoring.lock'), false);
    });

    it('37 export requires exact permission', () => {
        assert.equal(checkUserPermission({ roleName: 'staff', permissions: ['data_extractor.lead_scoring.view'] }, 'data_extractor.lead_scoring.export'), false);
        assert.equal(checkUserPermission({ roleName: 'staff', permissions: ['data_extractor.lead_scoring.export'] }, 'data_extractor.lead_scoring.export'), true);
    });

    it('registers lead scoring routes', () => {
        const expected = [
            '/ai-lead-intelligence/scoring-settings',
            '/ai-lead-intelligence/scores',
            '/ai-lead-intelligence/scores/score',
            '/ai-lead-intelligence/scores/:id/override',
            '/ai-lead-intelligence/scores/:id/approve',
            '/ai-lead-intelligence/scores/:id/reject',
            '/ai-lead-intelligence/scores/:id/lock',
            '/ai-lead-intelligence/scores/export',
            '/ai-lead-intelligence/score-batches',
        ];
        const paths = dataExtractorRouter.stack.filter((l) => l.route).map((l) => l.route.path);
        for (const p of expected) assert.ok(paths.includes(p), `missing ${p}`);
    });
});

describe('Phase 11 MongoDB workflows', () => {
    before(async () => {
        assert.ok(MONGO_URI.includes('crm_test'));
        await mongoose.connect(MONGO_URI);
        await ExtractorSettings.findOneAndUpdate(
            { companyId: companyA },
            { $set: { aiLeadIntelligence: { leadScoring: DEFAULT_SCORING_SETTINGS } } },
            { upsert: true },
        );
    });

    after(async () => {
        try {
            if (created.scores.length) await AiLeadScore.deleteMany({ _id: { $in: created.scores } });
            if (created.batches.length) await AiLeadScoreBatchJob.deleteMany({ _id: { $in: created.batches } });
            if (created.leads.length) await ExtractedLead.deleteMany({ _id: { $in: created.leads } });
            await AiLeadScore.deleteMany({ companyId: { $in: [companyA, companyB] } });
            await AiLeadScoreBatchJob.deleteMany({ companyId: { $in: [companyA, companyB] } });
            await ExtractedLead.deleteMany({ companyId: { $in: [companyA, companyB] } });
            await ExtractorSettings.deleteMany({ companyId: { $in: [companyA, companyB] } });
        } finally {
            await mongoose.disconnect();
        }
    });

    it('23-28 manual override history, lock, outdated, re-score', async () => {
        const f = strongInputs();
        const out = await scoreOne(companyA, userA, {
            adhocKey: `${TAG}-main`,
            mode: 'rule_based',
            record: f.record,
            classification: f.classification,
            relevance: f.relevance,
            recommendation: f.recommendation,
            contact: f.contact,
            profile: f.profile,
            searchContext: f.searchContext,
        });
        assert.equal(out.skipped, false);
        created.scores.push(out.score._id);
        assert.ok(out.score.finalScore >= 0 && out.score.finalScore <= 100);

        const overridden = await overrideScore(companyA, userA, out.score._id, {
            action: 'override',
            manualBoost: 2,
            reason: 'Named decision maker confirmed',
        });
        assert.ok(overridden.boosts.some((b) => b.type === 'manual_boost'));
        assert.equal(overridden.history[overridden.history.length - 1].action, 'override');

        const approved = await overrideScore(companyA, userA, out.score._id, { action: 'approve', reason: 'OK' });
        assert.equal(approved.status, 'APPROVED');

        await AiLeadScore.updateOne({ _id: out.score._id }, { $set: { status: 'APPROVED', locked: false } });
        const od = await applyOutdatedFromUpstream(companyA, out.score._id, { classificationUpdatedAt: new Date('2026-03-01') });
        assert.equal(od.outdated, true);

        await AiLeadScore.updateOne({ _id: out.score._id }, { $set: { status: 'APPROVED' } });
        const odSettings = await applyOutdatedFromUpstream(companyA, out.score._id, { settingsVersion: 'changed-settings' });
        assert.equal(odSettings.outdated, true);

        await AiLeadScore.updateOne({ _id: out.score._id }, { $set: { status: 'APPROVED' } });
        const locked = await lockScore(companyA, userA, out.score._id, { action: 'lock' });
        assert.equal(locked.locked, true);
        const skip = await scoreOne(companyA, userA, {
            adhocKey: `${TAG}-main`,
            mode: 'rule_based',
            record: f.record,
            classification: f.classification,
        });
        assert.equal(skip.skipped, true);
        assert.equal(skip.reason, 'locked');

        await lockScore(companyA, userA, out.score._id, { action: 'unlock' });
        const rescored = await scoreOne(companyA, userA, {
            adhocKey: `${TAG}-main`,
            mode: 'rule_based',
            force: true,
            refresh: true,
            reason: 'Force re-score',
            record: f.record,
            classification: f.classification,
            relevance: f.relevance,
            recommendation: f.recommendation,
            contact: f.contact,
            profile: f.profile,
        });
        assert.equal(rescored.skipped, false);
        assert.ok(rescored.score.history.some((h) => h.action === 'rescored'));

        const hist = await getScoreHistory(companyA, out.score._id);
        assert.ok(hist.history.some((h) => h.action === 'override'));
        assert.ok(hist.history.some((h) => h.action === 'lock'));
    });

    it('29-31 batch pause/resume, fail-continue, idempotency', async () => {
        const lead1 = await ExtractedLead.create({
            companyId: companyA, financialYear: '2025-26', companyName: `${TAG} S1`,
            sourcePlatform: 'web_search', status: 'draft', email: 'a@s1.test',
            businessDescription: 'OEM sensor',
        });
        const lead2 = await ExtractedLead.create({
            companyId: companyA, financialYear: '2025-26', companyName: `${TAG} S2`,
            sourcePlatform: 'web_search', status: 'draft', email: 'a@s2.test',
        });
        const lead3 = await ExtractedLead.create({
            companyId: companyA, financialYear: '2025-26', companyName: `${TAG} S3`,
            sourcePlatform: 'web_search', status: 'draft', email: 'a@s3.test',
        });
        created.leads.push(lead1._id, lead2._id, lead3._id);

        const batch = await createScoreBatch(companyA, userA, {
            extractedLeadIds: [lead1._id, lead2._id, lead3._id],
            idempotencyKey: `${TAG}-sbatch`,
            mode: 'rule_based',
        });
        created.batches.push(batch._id);
        const again = await createScoreBatch(companyA, userA, {
            extractedLeadIds: [lead1._id, lead2._id, lead3._id],
            idempotencyKey: `${TAG}-sbatch`,
        });
        assert.equal(String(again._id), String(batch._id));

        await processScoreBatchChunk(companyA, userA, batch._id, { maxItems: 1 });
        let mid = await getScoreBatch(companyA, batch._id);
        assert.equal(mid.cursor, 1);
        await controlScoreBatch(companyA, userA, batch._id, 'pause', { reason: 'Test pause' });
        mid = await getScoreBatch(companyA, batch._id);
        assert.equal(mid.status, 'PAUSED');
        const paused = await processScoreBatchChunk(companyA, userA, batch._id, { maxItems: 5 });
        assert.equal(paused.status, 'PAUSED');
        await controlScoreBatch(companyA, userA, batch._id, 'resume');

        await ExtractedLead.deleteOne({ _id: lead2._id });
        const done = await processScoreBatchChunk(companyA, userA, batch._id, { maxItems: 10 });
        assert.ok(done.failedCount >= 1);
        assert.ok(done.successCount >= 1);
    });

    it('32-34 tenant isolation and company override rejected', async () => {
        const f = strongInputs();
        const out = await scoreOne(companyA, userA, {
            adhocKey: `${TAG}-tenant`,
            record: f.record,
            classification: f.classification,
        });
        created.scores.push(out.score._id);
        await assert.rejects(() => getScore(companyB, out.score._id), /not found/i);
        await assert.rejects(
            () => scoreOne(companyA, userA, { companyId: companyB, record: { companyName: 'x' } }),
            /companyId\/tenantId overrides are rejected/,
        );
        const foreign = await ExtractedLead.create({
            companyId: companyB, financialYear: '2025-26', companyName: `${TAG} Foreign`,
            sourcePlatform: 'web_search', status: 'draft',
        });
        created.leads.push(foreign._id);
        await assert.rejects(
            () => createScoreBatch(companyA, userA, { extractedLeadIds: [foreign._id] }),
            /No owned scoring targets/,
        );
        const exported = await exportApprovedScores(companyA, {});
        assert.ok(!(exported.results || []).some((r) => String(r.companyId) === String(companyB)));
    });
});
