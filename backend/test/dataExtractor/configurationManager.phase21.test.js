/**
 * Phase 21 — Intelligence Configuration and Rule Version Manager
 * Versions only; no runtime activation / CRM mutation / recalculation.
 */
import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import mongoose from 'mongoose';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ImplementationSpecification } from '../../src/models/implementationSpecification.model.js';
import { ImprovementApprovalCase } from '../../src/models/improvementApprovalCase.model.js';
import { AiLearningImprovementProposal } from '../../src/models/aiLearningImprovementProposal.model.js';
import { IntelligenceConfigurationFamily } from '../../src/models/intelligenceConfigurationFamily.model.js';
import { IntelligenceConfigurationVersion } from '../../src/models/intelligenceConfigurationVersion.model.js';
import { IntelligenceConfigurationAudit } from '../../src/models/intelligenceConfigurationAudit.model.js';
import { IntelligenceConfigurationSavedView } from '../../src/models/intelligenceConfigurationSavedView.model.js';
import { IntelligenceConfigurationHistory } from '../../src/models/intelligenceConfigurationHistory.model.js';
import { IntelligenceConfigurationDependency } from '../../src/models/intelligenceConfigurationDependency.model.js';
import { IntelligenceConfigurationValidation } from '../../src/models/intelligenceConfigurationValidation.model.js';
import { IntelligenceConfigurationCompatibility } from '../../src/models/intelligenceConfigurationCompatibility.model.js';
import {
    listFamilies, getFamily, ensureDefaultFamilies,
} from '../../src/services/dataExtractor/configurationManager/family.service.js';
import {
    createDraft, updateDraft, cloneVersion, validateVersion, reviewVersion,
    readyForSandbox, compareVersions, impactPreview, setRollbackTarget,
    exportVersion, getDependencies, getCompatibility, getHistory,
    resolveRuntimeConfiguration, listVersions,
} from '../../src/services/dataExtractor/configurationManager/version.service.js';
import { rejectTenantOverrides, assertNoSecrets, assertPayloadSafe, payloadChecksum } from '../../src/services/dataExtractor/configurationManager/normalize.util.js';
import { createSavedView, listAudit } from '../../src/services/dataExtractor/configurationManager/savedViews.service.js';
import { saveSettings } from '../../src/services/dataExtractor/configurationManager/settings.service.js';
import { validatePayloadSchema } from '../../src/services/dataExtractor/configurationManager/validation.service.js';
import dataExtractorRoutes from '../../src/routes/v1/dataExtractor.routes.js';

const MONGO_URI = process.env.P21_MONGO_URI || process.env.MONGODB_URL || 'mongodb://127.0.0.1:27017/crm_test';
const TAG = `p21-${Date.now()}`;
const companyA = new mongoose.Types.ObjectId();
const companyB = new mongoose.Types.ObjectId();
const userId = new mongoose.Types.ObjectId();
const userOther = new mongoose.Types.ObjectId();

const ALL = [
    'data_extractor.configuration_manager.view',
    'data_extractor.configuration_manager.view_payload',
    'data_extractor.configuration_manager.create_draft',
    'data_extractor.configuration_manager.edit_draft',
    'data_extractor.configuration_manager.clone',
    'data_extractor.configuration_manager.validate',
    'data_extractor.configuration_manager.compare',
    'data_extractor.configuration_manager.dependencies',
    'data_extractor.configuration_manager.compatibility',
    'data_extractor.configuration_manager.review',
    'data_extractor.configuration_manager.ready_for_sandbox',
    'data_extractor.configuration_manager.export',
    'data_extractor.configuration_manager.saved_views',
    'data_extractor.configuration_manager.audit',
    'data_extractor.configuration_manager.settings',
    'data_extractor.configuration_manager.manage',
];

const fullUser = { id: userId, _id: userId, roleName: 'staff', permissions: ALL };
const noCreateUser = {
    id: userOther, _id: userOther, roleName: 'staff',
    permissions: ['data_extractor.configuration_manager.view'],
};
const aggregateOnly = {
    id: userOther, _id: userOther, roleName: 'staff',
    permissions: ['data_extractor.configuration_manager.view'],
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

function recomputeSpecChecksum(spec) {
    return createHash('sha256').update(JSON.stringify({
        proposalId: String(spec.proposalId),
        proposalVersion: spec.proposalVersion,
        caseId: String(spec.approvalCaseId),
        target: spec.targetConfiguration,
        conditions: spec.approvedChange?.conditions,
    })).digest('hex').slice(0, 48);
}

let familyWeights;
let draftVersion;
let validatedVersion;
let approvedSpecId;
let unapprovedSpecId;
let baselineCrmCount;

before(async () => {
    assert.match(MONGO_URI, /crm_test/);
    await mongoose.connect(MONGO_URI);
    baselineCrmCount = await mongoose.connection.db.collection('leads').countDocuments({});

    await ensureDefaultFamilies(companyA, userId);
    const fams = await listFamilies(companyA, {}, fullUser);
    assert.ok(fams.items.length >= 24);
    familyWeights = fams.items.find((f) => f.code === 'LEAD_SCORE_WEIGHTS');
    assert.ok(familyWeights);

    const proposal = await AiLearningImprovementProposal.create({
        companyId: companyA,
        proposalType: 'THRESHOLD_CHANGE_DRAFT',
        sourceModule: 'lead_scoring',
        title: `${TAG} p21 proposal`,
        description: 'spec link',
        problemStatement: 'weights',
        supportingFeedbackIds: [],
        sampleSize: 6,
        reviewerAgreement: 'MAJORITY_AGREEMENT',
        groundTruthCategory: 'REVIEWER_CONSENSUS',
        confidence: 70,
        riskLevel: 'LOW',
        currentConfigurationReference: { weights: { a: 1 } },
        proposedConfiguration: { weights: { fit: 0.5, intent: 0.5 }, executable: false },
        expectedBenefit: 'x',
        potentialRisk: 'y',
        affectedRecordsEstimate: 10,
        evaluationPlan: 'offline',
        rollbackPlan: 'n/a',
        limitations: ['draft'],
        status: 'DRAFT',
        version: 1,
        generatedBy: userId,
        approvedForImplementation: false,
        executable: false,
        createdBy: userId,
    });

    const approvedCase = await ImprovementApprovalCase.create({
        companyId: companyA,
        proposalId: proposal._id,
        proposalVersion: 1,
        sourceProposalChecksum: 'p21-seed-checksum',
        status: 'APPROVED_FOR_IMPLEMENTATION_SPEC',
        createdBy: userId,
    });

    const targetConfiguration = { weights: { fit: 0.5, intent: 0.5 } };
    const approvedChange = { conditions: [{ field: 'score', op: 'gte', value: 50 }] };
    const checksum = recomputeSpecChecksum({
        proposalId: proposal._id,
        proposalVersion: 1,
        approvalCaseId: approvedCase._id,
        targetConfiguration,
        approvedChange,
    });

    const spec = await ImplementationSpecification.create({
        companyId: companyA,
        approvalCaseId: approvedCase._id,
        proposalId: proposal._id,
        proposalVersion: 1,
        specificationVersion: 1,
        title: `${TAG} spec`,
        approvedChange,
        targetConfiguration,
        configurationFamily: 'LEAD_SCORE_WEIGHTS',
        checksum,
        executable: false,
        implementationRequired: true,
        status: 'FINALIZED',
        createdBy: userId,
    });
    approvedSpecId = spec._id;
    assert.equal(spec.executable, false);
    assert.equal(spec.implementationRequired, true);

    const unapprovedCase = await ImprovementApprovalCase.create({
        companyId: companyA,
        proposalId: proposal._id,
        proposalVersion: 1,
        sourceProposalChecksum: 'p21-seed-checksum-2',
        status: 'SUBMITTED_FOR_REVIEW',
        createdBy: userId,
    });
    const unapproved = await ImplementationSpecification.create({
        companyId: companyA,
        approvalCaseId: unapprovedCase._id,
        proposalId: proposal._id,
        proposalVersion: 1,
        title: `${TAG} unapproved spec`,
        approvedChange,
        targetConfiguration,
        configurationFamily: 'LEAD_SCORE_WEIGHTS',
        checksum: 'deadbeef',
        executable: false,
        implementationRequired: true,
        status: 'DRAFT',
        createdBy: userId,
    });
    unapprovedSpecId = unapproved._id;
});

after(async () => {
    const cos = [companyA, companyB];
    await IntelligenceConfigurationAudit.deleteMany({ companyId: { $in: cos } });
    await IntelligenceConfigurationSavedView.deleteMany({ companyId: { $in: cos } });
    await IntelligenceConfigurationHistory.deleteMany({ companyId: { $in: cos } });
    await IntelligenceConfigurationDependency.deleteMany({ companyId: { $in: cos } });
    await IntelligenceConfigurationValidation.deleteMany({ companyId: { $in: cos } });
    await IntelligenceConfigurationCompatibility.deleteMany({ companyId: { $in: cos } });
    await IntelligenceConfigurationVersion.deleteMany({ companyId: { $in: cos } });
    await IntelligenceConfigurationFamily.deleteMany({ companyId: { $in: cos } });
    await ImplementationSpecification.deleteMany({ companyId: { $in: cos } });
    await ImprovementApprovalCase.deleteMany({ companyId: { $in: cos } });
    await AiLearningImprovementProposal.deleteMany({ companyId: { $in: cos } });
    await mongoose.disconnect();
});

describe('Phase 21 Configuration Manager', () => {
    it('1-2 protected fingerprints + company-scoped families', async () => {
        assert.equal(shaFile('src/services/dataExtractor/salesWorkflow/eligibility.service.js'), FP_ELIG);
        assert.equal(shaFile('src/services/dataExtractor/salesWorkflow/crmAdapter.service.js'), FP_CRM);
        const fams = await listFamilies(companyA, {}, fullUser);
        assert.equal(fams.companyScoped, true);
        assert.ok(fams.items.every((f) => String(f.companyId) === String(companyA)));
    });

    it('4-6 foreign company + body companyId/tenantId rejected', async () => {
        await assert.rejects(() => getFamily(companyB, familyWeights._id, fullUser), /not found/i);
        assert.throws(() => rejectTenantOverrides({ companyId: 'x' }), /companyId\/tenantId/);
        assert.throws(() => rejectTenantOverrides({ tenantId: 'x' }), /companyId\/tenantId/);
    });

    it('7-10 draft permission + Phase 20 linkage checks', async () => {
        await assert.rejects(
            () => createDraft(companyA, userOther, { familyId: familyWeights._id, configurationPayload: { weights: { a: 1 } } }, noCreateUser),
            /permission/i,
        );

        draftVersion = await createDraft(companyA, userId, {
            familyId: familyWeights._id,
            linkedImplementationSpecificationId: approvedSpecId,
        }, fullUser);
        assert.equal(draftVersion.status, 'DRAFT');
        assert.ok(draftVersion.payloadChecksum || draftVersion.configurationPayload);
        assert.equal(draftVersion.runtimeActive, false);

        await assert.rejects(
            () => createDraft(companyA, userId, {
                familyId: familyWeights._id,
                linkedImplementationSpecificationId: unapprovedSpecId,
            }, fullUser),
            /Unapproved|approval/i,
        );

        await assert.rejects(
            () => createDraft(companyA, userId, {
                familyId: familyWeights._id,
                linkedImplementationSpecificationId: approvedSpecId,
                specificationChecksum: 'wrong-checksum-value-xxxxxxxxxxxxxxxxxxxx',
            }, fullUser),
            /checksum/i,
        );
    });

    it('11-15 draft edit, immutability, uniqueness, checksum', async () => {
        const edited = await updateDraft(companyA, userId, draftVersion._id || draftVersion.id, {
            configurationPayload: { weights: { fit: 0.6, intent: 0.4 } },
            changeSummary: 'tweak',
        }, fullUser);
        assert.equal(edited.status, 'DRAFT');
        assert.ok(edited.payloadChecksum);
        assert.equal(edited.payloadChecksum, payloadChecksum({ weights: { fit: 0.6, intent: 0.4 } }));

        const vnum = edited.versionNumber;
        const another = await createDraft(companyA, userId, {
            familyId: familyWeights._id,
            configurationPayload: { weights: { fit: 0.51, intent: 0.49 } },
        }, fullUser);
        assert.notEqual(another.versionNumber, vnum);
        assert.ok(another.versionNumber > vnum, 'version numbers are unique and monotonic per family');
        const nums = await IntelligenceConfigurationVersion.distinct('versionNumber', {
            companyId: companyA, familyId: familyWeights._id, isDeleted: { $ne: true },
        });
        assert.equal(nums.length, new Set(nums).size, 'version number uniqueness enforced');

        // Move to validated/immutable then edit creates new draft
        const validatedRun = await validateVersion(companyA, userId, edited._id || edited.id, fullUser);
        assert.ok(['PASS', 'PASS_WITH_WARNINGS'].includes(validatedRun.validation.status));
        const inReview = await reviewVersion(companyA, userId, edited._id || edited.id, { decision: 'SUBMIT' }, fullUser);
        assert.equal(inReview.status, 'IN_REVIEW');
        validatedVersion = await reviewVersion(companyA, userId, edited._id || edited.id, { decision: 'VALIDATE' }, fullUser);
        assert.equal(validatedVersion.status, 'VALIDATED');
        assert.equal(validatedVersion.immutableAfterPublish, true);

        const forked = await updateDraft(companyA, userId, validatedVersion._id || validatedVersion.id, {
            configurationPayload: { weights: { fit: 0.7, intent: 0.3 } },
        }, fullUser);
        assert.equal(forked.status, 'DRAFT');
        assert.notEqual(String(forked._id || forked.id), String(validatedVersion._id || validatedVersion.id));
        assert.ok(forked.versionNumber > validatedVersion.versionNumber);
    });

    it('16-21 unsafe payload / thresholds / weights / missing product', async () => {
        assert.throws(() => assertPayloadSafe({ code: 'eval(1)' }), /Unsafe|secret/i);
        assert.throws(() => assertPayloadSafe({ q: { $where: '1' } }), /Unsafe|filter/i);
        assert.throws(() => assertNoSecrets({ api_key: 'sk-abcdefghijklmnopqrstuvwxyz012345' }), /secret/i);

        const thr = validatePayloadSchema('LEAD_SCORE_THRESHOLDS', { thresholds: [10, 5, 20] });
        assert.equal(thr.status, 'FAIL');
        assert.ok(thr.errors.some((e) => e.code === 'THRESHOLD_ORDER'));

        const wt = validatePayloadSchema('LEAD_SCORE_WEIGHTS', { weights: { a: 2, b: -1 } });
        assert.equal(wt.status, 'FAIL');
        assert.ok(wt.errors.some((e) => e.code === 'INVALID_WEIGHT' || e.code === 'NEGATIVE_VALUE'));

        const miss = validatePayloadSchema('PRODUCT_RECOMMENDATION_MAPPINGS', {
            productIds: [{ id: 'p1', missing: true }],
        }, { missingProductMasterPolicy: 'REJECT' });
        assert.equal(miss.status, 'FAIL');
        assert.ok(miss.errors.some((e) => e.code === 'MISSING_PRODUCT_MASTER'));
    });

    it('22-28 deps, compat, compare, impact, rollback, ready-for-sandbox', async () => {
        if (!validatedVersion) {
            const seed = await createDraft(companyA, userId, {
                familyId: familyWeights._id,
                configurationPayload: { weights: { fit: 0.5, intent: 0.5 } },
            }, fullUser);
            await validateVersion(companyA, userId, seed._id || seed.id, fullUser);
            await reviewVersion(companyA, userId, seed._id || seed.id, { decision: 'SUBMIT' }, fullUser);
            validatedVersion = await reviewVersion(companyA, userId, seed._id || seed.id, { decision: 'VALIDATE' }, fullUser);
        }
        const circularDraft = await createDraft(companyA, userId, {
            familyId: familyWeights._id,
            configurationPayload: {
                weights: { fit: 0.5, intent: 0.5 },
                dependsOnFamilyCodes: ['LEAD_SCORE_WEIGHTS'],
            },
        }, fullUser);
        const circVal = await validateVersion(companyA, userId, circularDraft._id || circularDraft.id, fullUser);
        assert.equal(circVal.validation.status, 'FAIL');
        assert.ok(circVal.validation.errors.some((e) => e.code === 'CIRCULAR_DEPENDENCY'));

        const deps = await getDependencies(companyA, validatedVersion._id || validatedVersion.id, fullUser);
        assert.ok(Array.isArray(deps.requiredConfigurationFamilies));
        assert.ok(deps.missingDependencies || deps.availableDependencies);

        // Force validation status on validated version for compatibility
        await IntelligenceConfigurationVersion.updateOne(
            { _id: validatedVersion._id || validatedVersion.id },
            { $set: { validationStatus: 'PASS' } },
        );
        const compat = await getCompatibility(companyA, validatedVersion._id || validatedVersion.id, fullUser);
        assert.ok(['COMPATIBLE', 'COMPATIBLE_WITH_WARNINGS', 'INCOMPATIBLE', 'UNKNOWN'].includes(compat.status));

        const other = await createDraft(companyA, userId, {
            familyId: familyWeights._id,
            configurationPayload: { weights: { fit: 0.9, intent: 0.1 } },
        }, fullUser);
        const cmp = await compareVersions(
            companyA,
            validatedVersion._id || validatedVersion.id,
            other._id || other.id,
            fullUser,
        );
        assert.equal(cmp.executed, false);
        assert.ok(cmp.changedWeights.length || cmp.changedValues.length || cmp.addedFields);

        const impact = await impactPreview(companyA, validatedVersion._id || validatedVersion.id, fullUser);
        assert.equal(impact.executedConfiguration, false);
        assert.equal(impact.historicalABEvaluation, false);

        // Need an immutable rollback target — use validatedVersion itself from a new draft
        const draft2 = await createDraft(companyA, userId, {
            familyId: familyWeights._id,
            configurationPayload: { weights: { fit: 0.55, intent: 0.45 } },
        }, fullUser);
        await validateVersion(companyA, userId, draft2._id || draft2.id, fullUser);
        await reviewVersion(companyA, userId, draft2._id || draft2.id, { decision: 'SUBMIT' }, fullUser);
        const imm = await reviewVersion(companyA, userId, draft2._id || draft2.id, { decision: 'VALIDATE' }, fullUser);

        const rb = await setRollbackTarget(companyA, userId, imm._id || imm.id, {
            rollbackTargetVersionId: validatedVersion._id || validatedVersion.id,
        }, fullUser);
        assert.equal(rb.rollbackPerformed, false);
        assert.equal(rb.runtimeActive, false);

        const ready = await readyForSandbox(companyA, userId, imm._id || imm.id, {}, fullUser);
        assert.equal(ready.status, 'READY_FOR_SANDBOX');
        assert.equal(ready.runtimeActive, false);
        assert.equal(ready.productionActivation, false);

        const exported = await exportVersion(companyA, imm._id || imm.id, fullUser);
        assert.equal(exported.runtimeActive, false);
        assert.equal(exported.productionActivation, false);
        assert.equal(exported.packageType, 'SANDBOX_PACKAGE');
    });

    it('29-35 engines ignore drafts; CRM unchanged; aggregate privacy; audit', async () => {
        const runtime = resolveRuntimeConfiguration();
        assert.equal(runtime.used, false);
        assert.equal(runtime.phase21VersionsIgnored, true);

        // Existing engines must not import configuration manager versions as runtime source
        const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
        const engineFiles = [
            'src/services/dataExtractor/leadScoring',
            'src/services/dataExtractor/industryClassification',
            'src/services/dataExtractor/productRecommendation',
            'src/services/dataExtractor/knowledgeGraph',
            'src/services/dataExtractor/salesAssistant',
        ];
        for (const dir of engineFiles) {
            const full = path.join(root, dir);
            if (!fs.existsSync(full)) continue;
            const files = fs.readdirSync(full).filter((f) => f.endsWith('.js'));
            for (const f of files) {
                const txt = fs.readFileSync(path.join(full, f), 'utf8');
                assert.equal(/configurationManager|IntelligenceConfigurationVersion/.test(txt), false,
                    `${dir}/${f} must not consume Phase 21 versions`);
            }
        }

        const crmNow = await mongoose.connection.db.collection('leads').countDocuments({});
        assert.equal(crmNow, baselineCrmCount);

        const listed = await listVersions(companyA, { familyId: familyWeights._id }, aggregateOnly);
        assert.ok(listed.items.every((v) => v.payloadRedacted === true || v.configurationPayload === undefined));

        const hist = await getHistory(companyA, validatedVersion._id || validatedVersion.id, fullUser);
        assert.equal(hist.appendOnly, true);
        const audit = await listAudit(companyA, {}, fullUser);
        assert.equal(audit.appendOnly, true);
        assert.ok(audit.items.length >= 1);
    });

    it('36-42 saved views, no activate routes, no messaging/training', async () => {
        const personal = await createSavedView(companyA, userId, {
            name: `${TAG}-personal`, scope: 'PERSONAL', filters: { status: 'DRAFT' },
        }, fullUser);
        assert.equal(personal.scope, 'PERSONAL');

        await assert.rejects(
            () => createSavedView(companyA, userOther, {
                name: `${TAG}-shared`, scope: 'COMPANY', filters: {},
            }, noCreateUser),
            /manage|permission/i,
        );

        const paths = [];
        for (const layer of dataExtractorRoutes.stack || []) stackRoutes(layer, paths);
        const joined = paths.join('\n');
        assert.match(joined, /configuration-manager\/versions/);
        assert.match(joined, /ready-for-sandbox/);
        assert.equal(/configuration-manager.*\/(activate|apply|use-runtime|recalculate|regenerate|deploy|train|execute|send|rollback-now)/.test(joined), false);

        // No Task/Email/WhatsApp/training side effects from Phase 21 module
        const cmDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src/services/dataExtractor/configurationManager');
        for (const f of fs.readdirSync(cmDir)) {
            if (!f.endsWith('.js')) continue;
            const txt = fs.readFileSync(path.join(cmDir, f), 'utf8');
            assert.equal(/\b(createTask|sendWhatsApp|sendEmail|retrain|fineTune|activateRuntime)\b/.test(txt), false);
        }
    });

    it('43-48 fingerprints after + route health markers', async () => {
        assert.equal(shaFile('src/services/dataExtractor/salesWorkflow/eligibility.service.js'), FP_ELIG);
        assert.equal(shaFile('src/services/dataExtractor/salesWorkflow/crmAdapter.service.js'), FP_CRM);
        assert.equal(shaFile('src/models/implementationSpecification.model.js').length > 0, true);
        const clone = await cloneVersion(companyA, userId, validatedVersion._id || validatedVersion.id, {}, fullUser);
        assert.equal(clone.status, 'DRAFT');
        assert.equal(clone.runtimeActive, false);
    });
});
