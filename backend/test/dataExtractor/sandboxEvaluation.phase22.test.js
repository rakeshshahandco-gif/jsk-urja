/**
 * Phase 22 — Sandbox Evaluation / Historical Simulation / A/B (non-mutating).
 */
import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import mongoose from 'mongoose';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { IntelligenceConfigurationFamily } from '../../src/models/intelligenceConfigurationFamily.model.js';
import { IntelligenceConfigurationVersion } from '../../src/models/intelligenceConfigurationVersion.model.js';
import { SandboxEvaluationRun } from '../../src/models/sandboxEvaluationRun.model.js';
import { SandboxEvaluationResult } from '../../src/models/sandboxEvaluationResult.model.js';
import { SandboxEvaluationMetric } from '../../src/models/sandboxEvaluationMetric.model.js';
import { SandboxEvaluationIssue } from '../../src/models/sandboxEvaluationIssue.model.js';
import { SandboxEvaluationRecommendation } from '../../src/models/sandboxEvaluationRecommendation.model.js';
import { SandboxEvaluationAudit } from '../../src/models/sandboxEvaluationAudit.model.js';
import { SandboxEvaluationSavedView } from '../../src/models/sandboxEvaluationSavedView.model.js';
import { AiLearningEvaluationDataset } from '../../src/models/aiLearningEvaluationDataset.model.js';
import { ensureDefaultFamilies } from '../../src/services/dataExtractor/configurationManager/family.service.js';
import {
    createRun, validateRun, startRun, cancelRun, listResults, getResult,
    getMetrics, getCompare, getRecommendation, exportRun, listRuns,
} from '../../src/services/dataExtractor/sandboxEvaluation/run.service.js';
import { rejectTenantOverrides, assertConfigSafe } from '../../src/services/dataExtractor/sandboxEvaluation/normalize.util.js';
import { isFamilySupported, evaluateRecord } from '../../src/services/dataExtractor/sandboxEvaluation/adapters.service.js';
import { saveSettings } from '../../src/services/dataExtractor/sandboxEvaluation/settings.service.js';
import dataExtractorRoutes from '../../src/routes/v1/dataExtractor.routes.js';

const MONGO_URI = process.env.P22_MONGO_URI || process.env.MONGODB_URL || 'mongodb://127.0.0.1:27017/crm_test';
const TAG = `p22-${Date.now()}`;
const companyA = new mongoose.Types.ObjectId();
const companyB = new mongoose.Types.ObjectId();
const userId = new mongoose.Types.ObjectId();
const userOther = new mongoose.Types.ObjectId();

const ALL = [
    'data_extractor.sandbox_evaluation.view',
    'data_extractor.sandbox_evaluation.create',
    'data_extractor.sandbox_evaluation.validate',
    'data_extractor.sandbox_evaluation.run',
    'data_extractor.sandbox_evaluation.cancel',
    'data_extractor.sandbox_evaluation.view_results',
    'data_extractor.sandbox_evaluation.view_row_detail',
    'data_extractor.sandbox_evaluation.compare',
    'data_extractor.sandbox_evaluation.export',
    'data_extractor.sandbox_evaluation.saved_views',
    'data_extractor.sandbox_evaluation.audit',
    'data_extractor.sandbox_evaluation.settings',
    'data_extractor.sandbox_evaluation.manage',
    'data_extractor.configuration_manager.view',
];

const fullUser = { id: userId, _id: userId, roleName: 'staff', permissions: ALL };
const aggregateOnly = {
    id: userOther, _id: userOther, roleName: 'staff',
    permissions: ['data_extractor.sandbox_evaluation.view'],
};

const FP_ELIG = '66B7BA1E4F6E914714076ACC23968EE43559E456C523A27449221E6A61735F96';
const FP_CRM = '08D6BB214E943BA67DC19808BFAB4875549A99D256C190492609560A33DE8E55';

function shaFile(rel) {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
    return createHash('sha256').update(fs.readFileSync(path.join(root, rel))).digest('hex').toUpperCase();
}

function stackRoutes(layer, out = []) {
    if (!layer) return out;
    if (layer.route?.path) {
        const methods = Object.keys(layer.route.methods || {}).join(',').toUpperCase();
        out.push(`${methods} ${layer.route.path}`);
    }
    if (layer.name === 'router' && layer.handle?.stack) {
        for (const l of layer.handle.stack) stackRoutes(l, out);
    }
    return out;
}

let family;
let baselineVersion;
let candidateVersion;
let foreignCandidate;
let runId;
let baselineCrmCount;
let baselineLeadScoreCount;

before(async () => {
    assert.match(MONGO_URI, /crm_test/);
    await mongoose.connect(MONGO_URI);
    baselineCrmCount = await mongoose.connection.db.collection('leads').countDocuments({});
    try {
        baselineLeadScoreCount = await mongoose.connection.db.collection('lead_scores').countDocuments({});
    } catch {
        baselineLeadScoreCount = 0;
    }

    await saveSettings(companyA, userId, {
        requireRollbackTarget: true,
        requireCandidateReadyForSandbox: true,
        minimumDatasetSize: 3,
        minimumVerifiedGroundTruthRows: 1,
        markSandboxTestedOnComplete: true,
        timeoutMs: 30000,
        maximumResultRows: 5000,
    }, fullUser);

    await ensureDefaultFamilies(companyA, userId);
    family = await IntelligenceConfigurationFamily.findOne({
        companyId: companyA, code: 'LEAD_SCORE_WEIGHTS', isDeleted: { $ne: true },
    });
    assert.ok(family);

    const baselinePayload = { weights: { fit: 0.5, intent: 0.5 }, bands: { high: 80, mid: 50 } };
    baselineVersion = await IntelligenceConfigurationVersion.create({
        companyId: companyA,
        familyId: family._id,
        versionNumber: 1,
        configurationPayload: baselinePayload,
        payloadChecksum: 'base',
        status: 'VALIDATED',
        immutableAfterPublish: true,
        runtimeActive: false,
        createdBy: userId,
    });

    const candidatePayload = { weights: { fit: 0.8, intent: 0.2 }, bands: { high: 70, mid: 40 } };
    candidateVersion = await IntelligenceConfigurationVersion.create({
        companyId: companyA,
        familyId: family._id,
        versionNumber: 2,
        configurationPayload: candidatePayload,
        payloadChecksum: 'cand',
        status: 'READY_FOR_SANDBOX',
        immutableAfterPublish: true,
        runtimeActive: false,
        rollbackTargetVersionId: baselineVersion._id,
        createdBy: userId,
    });

    // Foreign company candidate
    await ensureDefaultFamilies(companyB, userId);
    const famB = await IntelligenceConfigurationFamily.findOne({ companyId: companyB, code: 'LEAD_SCORE_WEIGHTS' });
    foreignCandidate = await IntelligenceConfigurationVersion.create({
        companyId: companyB,
        familyId: famB._id,
        versionNumber: 1,
        configurationPayload: candidatePayload,
        payloadChecksum: 'foreign',
        status: 'READY_FOR_SANDBOX',
        immutableAfterPublish: true,
        runtimeActive: false,
        createdBy: userId,
    });

    assert.equal(candidateVersion.status, 'READY_FOR_SANDBOX');
    assert.equal(candidateVersion.runtimeActive, false);
    assert.ok(candidateVersion.rollbackTargetVersionId);
    assert.ok(baselineVersion);
});

after(async () => {
    const cos = [companyA, companyB];
    await SandboxEvaluationAudit.deleteMany({ companyId: { $in: cos } });
    await SandboxEvaluationSavedView.deleteMany({ companyId: { $in: cos } });
    await SandboxEvaluationRecommendation.deleteMany({ companyId: { $in: cos } });
    await SandboxEvaluationIssue.deleteMany({ companyId: { $in: cos } });
    await SandboxEvaluationMetric.deleteMany({ companyId: { $in: cos } });
    await SandboxEvaluationResult.deleteMany({ companyId: { $in: cos } });
    await SandboxEvaluationRun.deleteMany({ companyId: { $in: cos } });
    await IntelligenceConfigurationVersion.deleteMany({ companyId: { $in: cos } });
    await IntelligenceConfigurationFamily.deleteMany({ companyId: { $in: cos } });
    await AiLearningEvaluationDataset.deleteMany({ companyId: { $in: cos } });
    await mongoose.disconnect();
});

describe('Phase 22 Sandbox Evaluation', () => {
    it('1-2 fingerprints + company scope', async () => {
        assert.equal(shaFile('src/services/dataExtractor/salesWorkflow/eligibility.service.js'), FP_ELIG);
        assert.equal(shaFile('src/services/dataExtractor/salesWorkflow/crmAdapter.service.js'), FP_CRM);
        const runs = await listRuns(companyA, {}, fullUser);
        assert.ok(Array.isArray(runs.items));
    });

    it('4-11 foreign/body/tenant/ready/family/unsafe/unsupported', async () => {
        assert.throws(() => rejectTenantOverrides({ companyId: 'x' }), /companyId\/tenantId/);
        assert.throws(() => rejectTenantOverrides({ tenantId: 'x' }), /companyId\/tenantId/);

        await assert.rejects(
            () => createRun(companyA, userId, {
                familyId: family._id,
                baselineVersionId: baselineVersion._id,
                candidateVersionId: foreignCandidate._id,
                evaluationMode: 'DRY_RUN',
            }, fullUser).then(async (r) => validateRun(companyA, userId, r._id || r.id, {}, fullUser)),
            /not found|CANDIDATE|VALIDATION|FAILED|company/i,
        );

        // Candidate not READY
        const notReady = await IntelligenceConfigurationVersion.create({
            companyId: companyA,
            familyId: family._id,
            versionNumber: 99,
            configurationPayload: { weights: { fit: 0.5, intent: 0.5 } },
            payloadChecksum: 'nr',
            status: 'DRAFT',
            runtimeActive: false,
            createdBy: userId,
        });
        const draftRun = await createRun(companyA, userId, {
            familyId: family._id,
            baselineVersionId: baselineVersion._id,
            candidateVersionId: notReady._id,
            evaluationMode: 'DRY_RUN',
        }, fullUser);
        await assert.rejects(() => validateRun(companyA, userId, draftRun._id || draftRun.id, {}, fullUser), /READY_FOR_SANDBOX|CANDIDATE_NOT_READY|Validation/i);

        assert.throws(() => assertConfigSafe({ code: 'eval(1)' }), /Unsafe/);
        assert.equal(isFamilySupported('INDUSTRY_SYNONYMS'), false);
        const unsupported = evaluateRecord('INDUSTRY_SYNONYMS', {}, {});
        assert.equal(unsupported.code, 'EVALUATION_NOT_SUPPORTED');
    });

    it('8-35 happy path simulation, metrics, gates, privacy', async () => {
        const created = await createRun(companyA, userId, {
            familyId: family._id,
            familyCode: 'LEAD_SCORE_WEIGHTS',
            baselineVersionId: baselineVersion._id,
            candidateVersionId: candidateVersion._id,
            evaluationMode: 'HISTORICAL_SIMULATION',
        }, fullUser);
        assert.equal(created.status, 'DRAFT');
        assert.equal(created.runtimeActivation, false);
        runId = created._id || created.id;

        const validated = await validateRun(companyA, userId, runId, {}, fullUser);
        assert.equal(validated.run.status, 'READY');
        assert.equal(validated.validation.ok, true);

        const started = await startRun(companyA, userId, runId, {}, fullUser);
        assert.ok(['COMPLETED', 'COMPLETED_WITH_WARNINGS'].includes(started.run.status));
        assert.equal(started.isolation.sourceMutated, false);
        assert.equal(started.isolation.runtimeActivation, false);
        assert.equal(started.isolation.crmMutation, false);
        assert.equal(started.recommendation.advisoryOnly, true);
        assert.equal(started.recommendation.productionReady, false);
        assert.equal(started.gate.activatesConfiguration, false);

        const metrics = await getMetrics(companyA, runId, fullUser);
        assert.ok(metrics.sampleSize >= 3);
        assert.equal('sampleSize' in metrics, true);
        if (!metrics.accuracyReported) {
            assert.equal(metrics.accuracy, undefined);
        }
        assert.ok('improvementCount' in metrics);
        assert.ok('regressionCount' in metrics);
        assert.ok('falsePositiveRate' in metrics || metrics.falsePositiveRate === null);
        assert.ok('falseNegativeRate' in metrics || metrics.falseNegativeRate === null);
        assert.ok('meanAbsoluteDifference' in metrics || metrics.meanAbsoluteDifference === null);

        const results = await listResults(companyA, runId, {}, fullUser);
        assert.ok(results.items.length >= 3);
        assert.equal(results.storedIn, 'sandbox_evaluation_results');
        const statuses = new Set(results.items.map((r) => r.comparisonStatus));
        assert.ok([...statuses].some((s) => s === 'IMPROVED' || s === 'REGRESSED' || s === 'UNCHANGED_CORRECT'
            || s === 'UNCHANGED_INCORRECT' || s === 'CHANGED_UNVERIFIED' || s === 'INSUFFICIENT_GROUND_TRUTH'));

        // insufficient ground truth labelled when present
        assert.ok(results.items.some((r) => r.comparisonStatus === 'INSUFFICIENT_GROUND_TRUTH' || r.groundTruthType === 'NONE' || r.groundTruthType));

        const compare = await getCompare(companyA, runId, fullUser);
        assert.equal(compare.runtimeActivation, false);
        assert.ok(compare.sampleSize >= 3);

        const rec = await getRecommendation(companyA, runId, fullUser);
        assert.equal(rec.productionReady, false);
        assert.equal(rec.advisoryOnly, true);
        assert.equal(rec.activatesConfiguration, false);

        // Gate PASS/FAIL does not activate / modify toward production
        const candAfter = await IntelligenceConfigurationVersion.findById(candidateVersion._id).lean();
        assert.equal(candAfter.runtimeActive, false);
        assert.ok(['READY_FOR_SANDBOX', 'SANDBOX_TESTED'].includes(candAfter.status));

        // Aggregate-only cannot see row detail payloads
        const aggResults = await listResults(companyA, runId, {}, aggregateOnly);
        assert.ok(aggResults.items.every((r) => r.rowDetailRedacted === true || r.baselineOutput === undefined));

        await assert.rejects(() => getResult(companyA, runId, results.items[0]._id || results.items[0].id, aggregateOnly), /permission/i);

        const exportUser = {
            id: userOther, _id: userOther, roleName: 'staff',
            permissions: [
                'data_extractor.sandbox_evaluation.view',
                'data_extractor.sandbox_evaluation.export',
                'data_extractor.sandbox_evaluation.compare',
                'data_extractor.sandbox_evaluation.view_results',
            ],
        };
        const exported = await exportRun(companyA, runId, exportUser);
        assert.equal(exported.runtimeActivation, false);
        assert.equal(exported.redacted, true);

        // Source / CRM unchanged
        const crmNow = await mongoose.connection.db.collection('leads').countDocuments({});
        assert.equal(crmNow, baselineCrmCount);
        try {
            const scoresNow = await mongoose.connection.db.collection('lead_scores').countDocuments({});
            assert.equal(scoresNow, baselineLeadScoreCount);
        } catch { /* collection may not exist */ }

        // Adapter isolation flags
        const sample = evaluateRecord('LEAD_SCORE_WEIGHTS', candidateVersion.configurationPayload, { fit: 0.9, intent: 0.8 });
        assert.equal(sample.output.persisted, false);
        assert.equal(sample.output.mutated, false);
    });

    it('11 unsupported family returns EVALUATION_NOT_SUPPORTED on validate', async () => {
        const synFam = await IntelligenceConfigurationFamily.findOne({
            companyId: companyA, code: 'INDUSTRY_SYNONYMS', isDeleted: { $ne: true },
        });
        const b = await IntelligenceConfigurationVersion.create({
            companyId: companyA, familyId: synFam._id, versionNumber: 1,
            configurationPayload: { synonyms: {} }, payloadChecksum: 's1',
            status: 'VALIDATED', immutableAfterPublish: true, runtimeActive: false, createdBy: userId,
        });
        const c = await IntelligenceConfigurationVersion.create({
            companyId: companyA, familyId: synFam._id, versionNumber: 2,
            configurationPayload: { synonyms: { a: 'b' } }, payloadChecksum: 's2',
            status: 'READY_FOR_SANDBOX', immutableAfterPublish: true, runtimeActive: false,
            rollbackTargetVersionId: b._id, createdBy: userId,
        });
        const r = await createRun(companyA, userId, {
            familyId: synFam._id, familyCode: 'INDUSTRY_SYNONYMS',
            baselineVersionId: b._id, candidateVersionId: c._id, evaluationMode: 'DRY_RUN',
        }, fullUser);
        await assert.rejects(() => validateRun(companyA, userId, r._id || r.id, {}, fullUser), /EVALUATION_NOT_SUPPORTED/);
    });

    it('12-13 dataset checksum + foreign dataset', async () => {
        const ds = await AiLearningEvaluationDataset.create({
            companyId: companyA,
            module: 'lead_scoring',
            name: `${TAG}-ds`,
            checksum: 'abc123',
            redactionLevel: 'STRICT',
            status: 'READY',
            rowCount: 3,
            recordCount: 3,
            createdBy: userId,
        });
        const foreignDs = await AiLearningEvaluationDataset.create({
            companyId: companyB,
            module: 'lead_scoring',
            name: `${TAG}-foreign-ds`,
            checksum: 'xyz',
            redactionLevel: 'STRICT',
            status: 'READY',
            createdBy: userId,
        });
        const r = await createRun(companyA, userId, {
            familyId: family._id,
            baselineVersionId: baselineVersion._id,
            candidateVersionId: candidateVersion._id,
            datasetId: foreignDs._id,
            evaluationMode: 'FIXTURE_COMPARISON',
        }, fullUser);
        await assert.rejects(() => validateRun(companyA, userId, r._id || r.id, {}, fullUser), /Dataset|DATASET|not found/i);

        const r2 = await createRun(companyA, userId, {
            familyId: family._id,
            baselineVersionId: baselineVersion._id,
            candidateVersionId: candidateVersion._id,
            datasetId: ds._id,
            evaluationMode: 'FIXTURE_COMPARISON',
        }, fullUser);
        await assert.rejects(
            () => validateRun(companyA, userId, r2._id || r2.id, { expectedDatasetChecksum: 'wrong' }, fullUser),
            /checksum|DATASET_CHECKSUM|Validation/i,
        );
    });

    it('38-46 cancel, routes, no mutation imports, fingerprints', async () => {
        // New candidate for cancel path (previous may be SANDBOX_TESTED)
        const cand2 = await IntelligenceConfigurationVersion.create({
            companyId: companyA,
            familyId: family._id,
            versionNumber: 3,
            configurationPayload: { weights: { fit: 0.6, intent: 0.4 }, bands: { high: 75, mid: 45 } },
            payloadChecksum: 'c3',
            status: 'READY_FOR_SANDBOX',
            immutableAfterPublish: true,
            runtimeActive: false,
            rollbackTargetVersionId: baselineVersion._id,
            createdBy: userId,
        });
        const r = await createRun(companyA, userId, {
            familyId: family._id,
            baselineVersionId: baselineVersion._id,
            candidateVersionId: cand2._id,
            evaluationMode: 'DRY_RUN',
        }, fullUser);
        const cancelled = await cancelRun(companyA, userId, r._id || r.id, fullUser);
        assert.equal(cancelled.status, 'CANCELLED');

        const paths = [];
        for (const layer of dataExtractorRoutes.stack || []) stackRoutes(layer, paths);
        const joined = paths.join('\n');
        assert.match(joined, /sandbox-evaluation\/runs/);
        assert.equal(/sandbox-evaluation.*\/(activate|apply|deploy|promote-production|update-live|recalculate-live|regenerate-live|train|send|create-lead|assign)/.test(joined), false);

        const sbDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src/services/dataExtractor/sandboxEvaluation');
        for (const f of fs.readdirSync(sbDir)) {
            if (!f.endsWith('.js')) continue;
            const txt = fs.readFileSync(path.join(sbDir, f), 'utf8');
            assert.equal(/\b(createTaskFromLead|Task\.create|sendWhatsApp|sendEmail|retrain|fineTune)\b/.test(txt), false);
            assert.equal(/salesWorkflow\/crmAdapter/.test(txt), false);
        }

        assert.equal(shaFile('src/services/dataExtractor/salesWorkflow/eligibility.service.js'), FP_ELIG);
        assert.equal(shaFile('src/services/dataExtractor/salesWorkflow/crmAdapter.service.js'), FP_CRM);

        // Module-specific adapter smoke (no persist)
        for (const code of ['INDUSTRY_CLASSIFICATION_RULES', 'PRODUCT_RECOMMENDATION_MAPPINGS', 'KG_RELATIONSHIP_RULES', 'ASSISTANT_TEMPLATES', 'MARKETING_DRAFT_TEMPLATES', 'DUPLICATE_DETECTION_THRESHOLDS']) {
            const out = evaluateRecord(code, { mappings: [], threshold: 0.5, template: 'Hello {{body}}', minConfidence: 0.5 }, { text: 'x', fit: 0.5, confidence: 0.4 });
            assert.equal(out.supported, true);
            assert.equal(out.output.persisted, false);
            assert.equal(out.output.mutated, false);
            if (out.output.sent != null) assert.equal(out.output.sent, false);
            if (out.output.graphModified != null) assert.equal(out.output.graphModified, false);
        }
    });
});
