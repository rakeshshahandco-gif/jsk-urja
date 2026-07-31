/**
 * Phase 23 — Release Management Center (plans only; no deployment/activation).
 */
import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import mongoose from 'mongoose';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DeploymentEnvironment } from '../../src/models/deploymentEnvironment.model.js';
import { ReleasePackage } from '../../src/models/releasePackage.model.js';
import { ReleaseApproval } from '../../src/models/releaseApproval.model.js';
import { ReleaseApprovalHistory } from '../../src/models/releaseApprovalHistory.model.js';
import { ReleaseSimulation } from '../../src/models/releaseSimulation.model.js';
import { ReleaseAudit } from '../../src/models/releaseAudit.model.js';
import { ReleaseSavedView } from '../../src/models/releaseSavedView.model.js';
import { ImplementationSpecification } from '../../src/models/implementationSpecification.model.js';
import { ImprovementApprovalCase } from '../../src/models/improvementApprovalCase.model.js';
import { IntelligenceConfigurationFamily } from '../../src/models/intelligenceConfigurationFamily.model.js';
import { IntelligenceConfigurationVersion } from '../../src/models/intelligenceConfigurationVersion.model.js';
import { SandboxEvaluationRun } from '../../src/models/sandboxEvaluationRun.model.js';
import { ensureDefaultFamilies } from '../../src/services/dataExtractor/configurationManager/family.service.js';
import {
    createEnvironment, listEnvironments,
} from '../../src/services/dataExtractor/releaseManager/environment.service.js';
import {
    createRelease, updateRelease, validateRelease, reviewRelease, submitReview,
    finalizePackage, exportRelease, getRelease, putBackupPlan, putRollbackPlan,
    putFeatureFlags, putCompanyRollout, putIndustryRollout, putHealthCheckPlan,
    putSmokeTestPlan, putMonitoringPlan, putMigrationPlan,
} from '../../src/services/dataExtractor/releaseManager/release.service.js';
import { simulateRelease } from '../../src/services/dataExtractor/releaseManager/simulation.service.js';
import { saveSettings } from '../../src/services/dataExtractor/releaseManager/settings.service.js';
import { createSavedView, listAudit } from '../../src/services/dataExtractor/releaseManager/savedViews.service.js';
import {
    rejectTenantOverrides, assertNoSecrets, assertSafeText,
} from '../../src/services/dataExtractor/releaseManager/normalize.util.js';
import dataExtractorRoutes from '../../src/routes/v1/dataExtractor.routes.js';

const MONGO_URI = process.env.P23_MONGO_URI || process.env.MONGODB_URL || 'mongodb://127.0.0.1:27017/crm_test';
const TAG = `p23-${Date.now()}`;
const companyA = new mongoose.Types.ObjectId();
const companyB = new mongoose.Types.ObjectId();
const userId = new mongoose.Types.ObjectId();
const userOther = new mongoose.Types.ObjectId();
const userFinal = new mongoose.Types.ObjectId();

const ALL = [
    'data_extractor.release_manager.view',
    'data_extractor.release_manager.create',
    'data_extractor.release_manager.edit_draft',
    'data_extractor.release_manager.validate',
    'data_extractor.release_manager.simulate',
    'data_extractor.release_manager.review',
    'data_extractor.release_manager.qa_review',
    'data_extractor.release_manager.security_review',
    'data_extractor.release_manager.database_review',
    'data_extractor.release_manager.business_review',
    'data_extractor.release_manager.industry_review',
    'data_extractor.release_manager.release_review',
    'data_extractor.release_manager.approve_staging_plan',
    'data_extractor.release_manager.approve_pilot_plan',
    'data_extractor.release_manager.approve_production_plan',
    'data_extractor.release_manager.feature_flags',
    'data_extractor.release_manager.backup_plan',
    'data_extractor.release_manager.rollback_plan',
    'data_extractor.release_manager.migration_plan',
    'data_extractor.release_manager.export',
    'data_extractor.release_manager.saved_views',
    'data_extractor.release_manager.audit',
    'data_extractor.release_manager.settings',
    'data_extractor.release_manager.manage',
    'platform.admin',
];

const fullUser = { id: userId, _id: userId, roleName: 'platform_admin', permissions: ALL };
const finalUser = { id: userFinal, _id: userFinal, roleName: 'platform_admin', permissions: ALL };
const clientOnly = {
    id: userOther, _id: userOther, roleName: 'client_admin',
    permissions: ['data_extractor.release_manager.view'],
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
let configVersion;
let specId;
let sandboxRunId;
let releaseId;
let baselineCrm;

before(async () => {
    assert.match(MONGO_URI, /crm_test/);
    await mongoose.connect(MONGO_URI);
    baselineCrm = await mongoose.connection.db.collection('leads').countDocuments({});

    await saveSettings(companyA, userId, {
        requireSandboxEvaluation: true,
        requireImplementationSpecification: true,
        requireConfigurationVersion: true,
        requireBackupPlan: true,
        requireRollbackPlan: true,
        requireSecurityReview: true,
        requireSeparateFinalApprover: true,
        requireStagingBeforePilot: true,
        requirePilotBeforeProductionPlan: true,
        requireHealthCheckPlan: true,
        requireSmokeTestPlan: true,
        requireMonitoringPlan: true,
    }, fullUser);

    await ensureDefaultFamilies(companyA, userId);
    family = await IntelligenceConfigurationFamily.findOne({ companyId: companyA, code: 'LEAD_SCORE_WEIGHTS' });
    const baseline = await IntelligenceConfigurationVersion.create({
        companyId: companyA, familyId: family._id, versionNumber: 1001,
        configurationPayload: { weights: { fit: 0.5, intent: 0.5 } }, payloadChecksum: 'b',
        status: 'VALIDATED', immutableAfterPublish: true, runtimeActive: false, createdBy: userId,
    });
    configVersion = await IntelligenceConfigurationVersion.create({
        companyId: companyA, familyId: family._id, versionNumber: 1002,
        configurationPayload: { weights: { fit: 0.7, intent: 0.3 } }, payloadChecksum: 'c',
        status: 'SANDBOX_TESTED', immutableAfterPublish: true, runtimeActive: false,
        rollbackTargetVersionId: baseline._id, createdBy: userId,
    });

    const proposalId = new mongoose.Types.ObjectId();
    const approvalCase = await ImprovementApprovalCase.create({
        companyId: companyA, proposalId, proposalVersion: 1,
        sourceProposalChecksum: 'p23',
        status: 'IMPLEMENTATION_SPEC_GENERATED', createdBy: userId,
    });
    const spec = await ImplementationSpecification.create({
        companyId: companyA, approvalCaseId: approvalCase._id, proposalId,
        proposalVersion: 1, title: `${TAG} spec`,
        targetConfiguration: { weights: { fit: 0.7, intent: 0.3 } },
        approvedChange: { conditions: [] },
        configurationFamily: 'LEAD_SCORE_WEIGHTS',
        checksum: 'x', executable: false, implementationRequired: true,
        status: 'FINALIZED', createdBy: userId,
    });
    specId = spec._id;

    const run = await SandboxEvaluationRun.create({
        companyId: companyA, familyId: family._id, familyCode: 'LEAD_SCORE_WEIGHTS',
        baselineVersionId: baseline._id, candidateVersionId: configVersion._id,
        evaluationMode: 'HISTORICAL_SIMULATION', status: 'COMPLETED', gateResult: 'PASS',
        isolationMode: 'IN_MEMORY_NON_MUTATING', runtimeActivation: false, sourceMutated: false,
        recordCount: 4, resultCount: 4, createdBy: userId,
    });
    sandboxRunId = run._id;
});

after(async () => {
    const cos = [companyA, companyB];
    await ReleaseAudit.deleteMany({ companyId: { $in: cos } });
    await ReleaseSavedView.deleteMany({ companyId: { $in: cos } });
    await ReleaseSimulation.deleteMany({ companyId: { $in: cos } });
    await ReleaseApproval.deleteMany({ companyId: { $in: cos } });
    await ReleaseApprovalHistory.deleteMany({ companyId: { $in: cos } });
    await ReleasePackage.deleteMany({ companyId: { $in: cos } });
    await DeploymentEnvironment.deleteMany({ companyId: { $in: cos } });
    await SandboxEvaluationRun.deleteMany({ companyId: { $in: cos } });
    await ImplementationSpecification.deleteMany({ companyId: { $in: cos } });
    await ImprovementApprovalCase.deleteMany({ companyId: { $in: cos } });
    await IntelligenceConfigurationVersion.deleteMany({ companyId: { $in: cos } });
    await IntelligenceConfigurationFamily.deleteMany({ companyId: { $in: cos } });
    await mongoose.disconnect();
});

describe('Phase 23 Release Manager', () => {
    it('1-9 fingerprints, scope, tenant overrides, platform/client rules', async () => {
        assert.equal(shaFile('src/services/dataExtractor/salesWorkflow/eligibility.service.js'), FP_ELIG);
        assert.equal(shaFile('src/services/dataExtractor/salesWorkflow/crmAdapter.service.js'), FP_CRM);
        assert.throws(() => rejectTenantOverrides({ companyId: 'x' }), /companyId\/tenantId/);
        assert.throws(() => rejectTenantOverrides({ tenantId: 'x' }), /companyId\/tenantId/);

        const env = await createEnvironment(companyA, userId, {
            environmentCode: 'TESTING', environmentName: 'Test',
            databaseReferenceAlias: 'crm_test_alias',
        }, fullUser);
        assert.equal(env.environmentCode, 'TESTING');
        assert.equal(String(env.companyId), String(companyA));

        await assert.rejects(
            () => createEnvironment(companyA, userOther, { environmentCode: 'LOCALHOST', environmentName: 'L', platformScoped: true }, clientOnly),
            /Platform Admin|permission/i,
        );
        await assert.rejects(
            () => createEnvironment(companyA, userOther, { environmentCode: 'DEVELOPMENT', environmentName: 'D' }, clientOnly),
            /Client Admin|permission/i,
        );

        const listed = await listEnvironments(companyA, {}, fullUser);
        assert.ok(listed.items.every((e) => String(e.companyId) === String(companyA)));
    });

    it('10-23 release create/validate/readiness gates and links', async () => {
        const created = await createRelease(companyA, userId, {
            releaseNumber: `REL-P23-${Date.now()}`,
            releaseName: 'Phase 23 plan',
            sourceEnvironment: 'LOCALHOST',
            targetEnvironment: 'PRODUCTION',
            releaseType: 'CONFIGURATION_RELEASE',
            includedConfigurationVersionIds: [configVersion._id],
            implementationSpecificationIds: [specId],
            sandboxEvaluationRunIds: [sandboxRunId],
        }, fullUser);
        assert.equal(created.executable, false);
        assert.equal(created.deploymentExecuted, false);
        assert.equal(created.productionActivated, false);
        assert.ok(created.checksum);
        releaseId = created._id || created.id;

        // Missing backup/rollback should fail validation for production target
        await assert.rejects(() => validateRelease(companyA, userId, releaseId, fullUser), /BACKUP|ROLLBACK|Validation/i);

        await putBackupPlan(companyA, userId, releaseId, {
            plan: { environment: 'PRODUCTION', databaseAlias: 'crm_test_alias', backupType: 'LOGICAL', checklist: ['verify'] },
        }, fullUser);
        await putRollbackPlan(companyA, userId, releaseId, {
            plan: { rollbackTargetApplicationVersion: 'prev', triggerConditions: ['gate fail'] },
        }, fullUser);
        await putHealthCheckPlan(companyA, userId, releaseId, { plan: { checks: ['/api/v1/health'] } }, fullUser);
        await putSmokeTestPlan(companyA, userId, releaseId, { plan: { checks: ['Login', 'Permissions'] } }, fullUser);
        await putMonitoringPlan(companyA, userId, releaseId, { plan: { metrics: ['api_error_rate'] } }, fullUser);
        await putMigrationPlan(companyA, userId, releaseId, {
            plan: { migrationRequired: false, dryRunRequired: true },
        }, fullUser);

        // Foreign config rejected
        const foreignCfg = await IntelligenceConfigurationVersion.create({
            companyId: companyB, familyId: new mongoose.Types.ObjectId(), versionNumber: 1,
            configurationPayload: {}, payloadChecksum: 'f', status: 'SANDBOX_TESTED',
            immutableAfterPublish: true, runtimeActive: false, createdBy: userId,
        });
        await updateRelease(companyA, userId, releaseId, {
            includedConfigurationVersionIds: [foreignCfg._id],
        }, fullUser);
        await assert.rejects(() => validateRelease(companyA, userId, releaseId, fullUser), /FOREIGN_CONFIG|not found/i);

        await updateRelease(companyA, userId, releaseId, {
            includedConfigurationVersionIds: [configVersion._id],
            implementationSpecificationIds: [specId],
            sandboxEvaluationRunIds: [sandboxRunId],
        }, fullUser);

        // Non-ready config
        const draftCfg = await IntelligenceConfigurationVersion.create({
            companyId: companyA, familyId: family._id, versionNumber: 1003,
            configurationPayload: { weights: { fit: 1, intent: 0 } }, payloadChecksum: 'd',
            status: 'DRAFT', runtimeActive: false, createdBy: userId,
        });
        await updateRelease(companyA, userId, releaseId, {
            includedConfigurationVersionIds: [draftCfg._id],
        }, fullUser);
        await assert.rejects(() => validateRelease(companyA, userId, releaseId, fullUser), /CONFIG_NOT_READY/i);

        await updateRelease(companyA, userId, releaseId, {
            includedConfigurationVersionIds: [configVersion._id],
        }, fullUser);

        // Failed sandbox blocks
        const failRun = await SandboxEvaluationRun.create({
            companyId: companyA, familyId: family._id, familyCode: 'LEAD_SCORE_WEIGHTS',
            baselineVersionId: configVersion._id, candidateVersionId: configVersion._id,
            evaluationMode: 'DRY_RUN', status: 'COMPLETED', gateResult: 'FAIL',
            isolationMode: 'IN_MEMORY_NON_MUTATING', runtimeActivation: false, createdBy: userId,
        });
        await updateRelease(companyA, userId, releaseId, { sandboxEvaluationRunIds: [failRun._id] }, fullUser);
        await assert.rejects(() => validateRelease(companyA, userId, releaseId, fullUser), /SANDBOX_FAIL/i);

        await updateRelease(companyA, userId, releaseId, { sandboxEvaluationRunIds: [sandboxRunId] }, fullUser);
        const validated = await validateRelease(companyA, userId, releaseId, fullUser);
        assert.equal(validated.release.status, 'READY_FOR_REVIEW');
        assert.notEqual(validated.readiness.readinessStatus, 'READY_FOR_AUTOMATIC_DEPLOYMENT');
        assert.equal(validated.readiness.automaticDeployment, false);
    });

    it('24-37 rollout isolation, simulation non-execution, plans non-execution', async () => {
        await putCompanyRollout(companyA, userId, releaseId, {
            items: [{ companyId: String(companyA), selectedModules: ['data_extractor'], rolloutStage: 'PILOT' }],
        }, fullUser);
        await assert.rejects(
            () => putCompanyRollout(companyA, userId, releaseId, {
                items: [{ companyId: String(companyB), selectedModules: ['data_extractor'], rolloutStage: 'PILOT' }],
            }, clientOnly),
            /permission|Platform Admin|Cross-company/i,
        );

        await putIndustryRollout(companyA, userId, releaseId, {
            items: [
                { industryCode: 'JSK_URJA_ELECTRONICS', selectedModules: ['data_extractor'] },
                { industryCode: 'HANDLOOM_TEXTILE', selectedModules: ['data_extractor'] },
            ],
        }, fullUser);
        await putFeatureFlags(companyA, userId, releaseId, {
            items: [{ flagCode: 'ai_assistant_v1', plannedState: 'ON', executable: true }],
        }, fullUser);
        const flags = await getRelease(companyA, releaseId, fullUser);
        assert.ok((flags.featureFlagPlan || []).every((f) => f.executable === false && f.liveChanged === false));

        const sim = await simulateRelease(companyA, userId, releaseId, fullUser);
        assert.ok(['PASS', 'PASS_WITH_WARNINGS', 'FAIL', 'INCONCLUSIVE'].includes(sim.status));
        assert.equal(sim.deploymentExecuted, false);
        assert.equal(sim.gitCalled, false);
        assert.equal(sim.renderCalled, false);
        assert.equal(sim.serviceRestarted, false);
        assert.equal(sim.mongodbSourceModified, false);
        assert.equal(sim.featureActivated, false);
        assert.equal(sim.migrationExecuted, false);

        const bp = flags.backupPlan;
        assert.equal(bp.backupExecuted, false);
        assert.equal(flags.rollbackPlan.rollbackExecuted, false);
        assert.equal(flags.migrationPlan.migrationExecuted, false);
        assert.equal(flags.healthCheckPlan.productionEndpointsCalled, false);
        assert.equal(flags.smokeTestPlan.productionSmokeExecuted, false);
        assert.equal(flags.monitoringPlan.productionMonitoringConnected, false);
    });

    it('44-61 approvals, secrets, injection, finalize, export, audit', async () => {
        await assert.rejects(
            () => reviewRelease(companyA, userId, releaseId, {
                reviewType: 'TECHNICAL_REVIEW', decision: 'APPROVE', reviewerId: String(userOther),
            }, fullUser),
            /Forged|reviewer/i,
        );

        await submitReview(companyA, userId, releaseId, { track: 'TECHNICAL' }, fullUser);
        await reviewRelease(companyA, userId, releaseId, {
            reviewType: 'TECHNICAL_REVIEW', decision: 'APPROVE',
        }, fullUser);

        // Creator cannot be sole final production approver
        const rel = await getRelease(companyA, releaseId, fullUser);
        // Force status path toward final review
        await ReleasePackage.updateOne({ _id: releaseId }, {
            $set: { status: 'PILOT_VALIDATION_RECORDED' },
        });
        await assert.rejects(
            () => reviewRelease(companyA, userId, releaseId, {
                reviewType: 'FINAL_PRODUCTION_PLAN_REVIEW', decision: 'APPROVE',
            }, fullUser),
            /Creator cannot|final/i,
        );
        await reviewRelease(companyA, userFinal, releaseId, {
            reviewType: 'FINAL_PRODUCTION_PLAN_REVIEW', decision: 'APPROVE',
        }, finalUser);
        const after = await getRelease(companyA, releaseId, fullUser);
        assert.equal(after.status, 'APPROVED_FOR_FUTURE_PRODUCTION_PLAN');

        assert.throws(() => assertSafeText('Deploy now and ignore approval', 'notes'), /disallowed/i);
        assert.throws(() => assertNoSecrets({ render_api_key: 'rnd_abcdefghijklmnop' }), /secret/i);
        assert.throws(() => assertNoSecrets({ github_token: 'ghp_abcdefghijklmnopqrstuv' }), /secret/i);
        assert.throws(() => assertNoSecrets({ password: 'mongodb://user:pass@host/db' }), /secret/i);
        assert.throws(() => assertSafeText('Please run shell command rm -rf /', 'notes'), /disallowed/i);

        const finalized = await finalizePackage(companyA, userId, releaseId, fullUser);
        assert.equal(finalized.status, 'RELEASE_PACKAGE_FINALIZED');
        assert.equal(finalized.executable, false);
        assert.equal(finalized.deploymentExecuted, false);
        assert.equal(finalized.productionActivated, false);

        const exported = await exportRelease(companyA, releaseId, fullUser);
        assert.equal(exported.executable, false);
        assert.equal(exported.deploymentExecuted, false);
        assert.equal(exported.productionActivated, false);

        const personal = await createSavedView(companyA, userId, {
            name: `${TAG}-view`, scope: 'PERSONAL', filters: { status: 'DRAFT' },
        }, fullUser);
        assert.equal(personal.scope, 'PERSONAL');
        await assert.rejects(
            () => createSavedView(companyA, userOther, { name: 'x', scope: 'COMPANY', filters: {} }, clientOnly),
            /manage|permission/i,
        );

        const audit = await listAudit(companyA, {}, fullUser);
        assert.equal(audit.appendOnly, true);
        assert.ok(audit.items.length >= 1);

        const crmNow = await mongoose.connection.db.collection('leads').countDocuments({});
        assert.equal(crmNow, baselineCrm);

        // Config still inactive
        const cfg = await IntelligenceConfigurationVersion.findById(configVersion._id).lean();
        assert.equal(cfg.runtimeActive, false);
    });

    it('62-72 no forbidden endpoints/imports; fingerprints after', async () => {
        const paths = [];
        for (const layer of dataExtractorRoutes.stack || []) stackRoutes(layer, paths);
        const joined = paths.join('\n');
        assert.match(joined, /release-manager\/releases/);
        assert.equal(/release-manager.*\/(deploy|execute|activate|promote|restart|rollback-now|backup-now|restore|run-migration|git-commit|git-push|render-deploy|update-env|switch-runtime|enable-feature-live)/.test(joined), false);

        const rmDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src/services/dataExtractor/releaseManager');
        for (const f of fs.readdirSync(rmDir)) {
            if (!f.endsWith('.js')) continue;
            const txt = fs.readFileSync(path.join(rmDir, f), 'utf8');
            // Forbid real process/shell usage; allow security-blocklist string mentions in constants.
            assert.equal(/from ['"]child_process['"]|require\(['"]child_process['"]\)|\bspawn\s*\(|\bexecFile\s*\(/.test(txt), false);
            assert.equal(/salesWorkflow\/crmAdapter|createTaskFromLead|sendWhatsApp|sendEmail|retrain/.test(txt), false);
        }

        assert.equal(shaFile('src/services/dataExtractor/salesWorkflow/eligibility.service.js'), FP_ELIG);
        assert.equal(shaFile('src/services/dataExtractor/salesWorkflow/crmAdapter.service.js'), FP_CRM);

        // Client cannot view foreign company release
        await assert.rejects(() => getRelease(companyB, releaseId, clientOnly), /not found|permission/i);
    });
});
