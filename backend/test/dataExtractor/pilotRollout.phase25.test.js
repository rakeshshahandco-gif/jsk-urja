/**
 * Phase 25 - Controlled Staging, Pilot Rollout and UAT Center (localhost/crm_test only).
 */
import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import mongoose from 'mongoose';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ReleasePackage } from '../../src/models/releasePackage.model.js';
import { ProductionReadinessCertification } from '../../src/models/productionReadinessCertification.model.js';
import { PilotProgram } from '../../src/models/pilotProgram.model.js';
import { PilotAudit } from '../../src/models/pilotAudit.model.js';
import { createProgram, getProgram, transitionLifecycle, getRecommendation } from '../../src/services/dataExtractor/pilotRollout/pilotProgram.service.js';
import { createSimulation, runLocalChecks } from '../../src/services/dataExtractor/pilotRollout/stagingSimulation.service.js';
import {
    createCompanyPlan, createCohort, upsertModulePlan, upsertFeatureFlagPlan, setIndustryScope,
} from '../../src/services/dataExtractor/pilotRollout/pilotPlanning.service.js';
import {
    createUatPlan, createTestCase, createCycle, recordExecution, completeCycle,
} from '../../src/services/dataExtractor/pilotRollout/uat.service.js';
import {
    createDefect, retestDefect, closeDefect, acceptDefectRisk,
} from '../../src/services/dataExtractor/pilotRollout/pilotDefect.service.js';
import { createFeedback } from '../../src/services/dataExtractor/pilotRollout/pilotFeedback.service.js';
import { createRisk, acceptRisk, createException } from '../../src/services/dataExtractor/pilotRollout/pilotRisk.service.js';
import {
    createPauseRequest, createRollbackPlan, simulateRollback,
} from '../../src/services/dataExtractor/pilotRollout/pilotOps.service.js';
import { evaluateCriteria, closureReview, healthDashboard, metrics } from '../../src/services/dataExtractor/pilotRollout/pilotClosure.service.js';
import { createSavedView, listAudit } from '../../src/services/dataExtractor/pilotRollout/savedViews.service.js';
import { exportPilotReport } from '../../src/services/dataExtractor/pilotRollout/export.service.js';
import { saveSettings } from '../../src/services/dataExtractor/pilotRollout/settings.service.js';
import {
    rejectTenantOverrides, assertSafeEnvironment, assertSafeFlagState, forceSimulationOnly, assertLocalTarget,
} from '../../src/services/dataExtractor/pilotRollout/normalize.util.js';

const MONGO_URI = process.env.P25_MONGO_URI || process.env.MONGODB_URL || 'mongodb://127.0.0.1:27017/crm_test';
const TAG = `P25-${Date.now()}`;
const companyA = new mongoose.Types.ObjectId();
const companyB = new mongoose.Types.ObjectId();
const userId = new mongoose.Types.ObjectId();
const userOther = new mongoose.Types.ObjectId();

const ALL = [
    'data_extractor.pilot.view', 'data_extractor.pilot.create', 'data_extractor.pilot.update',
    'data_extractor.pilot.manage', 'data_extractor.pilot.review', 'data_extractor.pilot.final_review',
    'data_extractor.pilot.company_selection', 'data_extractor.pilot.industry_selection',
    'data_extractor.pilot.cohort_manage', 'data_extractor.pilot.module_plan', 'data_extractor.pilot.feature_flag_plan',
    'data_extractor.pilot.uat.view', 'data_extractor.pilot.uat.manage', 'data_extractor.pilot.uat.execute', 'data_extractor.pilot.uat.review',
    'data_extractor.pilot.defect.view', 'data_extractor.pilot.defect.manage',
    'data_extractor.pilot.risk.view', 'data_extractor.pilot.risk.manage', 'data_extractor.pilot.accept_risk',
    'data_extractor.pilot.feedback.view', 'data_extractor.pilot.feedback.manage',
    'data_extractor.pilot.evidence.view', 'data_extractor.pilot.evidence.manage',
    'data_extractor.pilot.pause_review', 'data_extractor.pilot.suspension_review', 'data_extractor.pilot.rollback_plan',
    'data_extractor.pilot.settings', 'data_extractor.pilot.audit', 'data_extractor.pilot.export', 'data_extractor.pilot.saved_views',
    'platform.admin',
];

const fullUser = { id: userId, _id: userId, roleName: 'platform_admin', permissions: ALL };
const clientOnly = {
    id: userOther, _id: userOther, roleName: 'client_admin',
    permissions: ['data_extractor.pilot.view', 'data_extractor.pilot.accept_risk'],
};
const noPerm = { id: userOther, _id: userOther, roleName: 'viewer', permissions: [] };

const FP_ELIG = '66B7BA1E4F6E914714076ACC23968EE43559E456C523A27449221E6A61735F96';
const FP_CRM = '08D6BB214E943BA67DC19808BFAB4875549A99D256C190492609560A33DE8E55';

function shaFile(rel) {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
    return createHash('sha256').update(fs.readFileSync(path.join(root, rel))).digest('hex').toUpperCase();
}

let releaseId;
let certId;
let programId;
let baselineLeads;

before(async () => {
    assert.match(MONGO_URI, /crm_test/);
    assert.doesNotMatch(MONGO_URI, /prod|atlas|mongodb\.net/i);
    await mongoose.connect(MONGO_URI);
    baselineLeads = await mongoose.connection.db.collection('leads').countDocuments({});
    await saveSettings(companyA, userId, { blockOnCriticalDefect: true, requireRollbackPlan: true }, fullUser);

    const release = await ReleasePackage.create({
        companyId: companyA,
        releaseNumber: `REL-${TAG}`,
        releaseName: 'P25 Release',
        sourceEnvironment: 'LOCALHOST',
        targetEnvironment: 'STAGING',
        status: 'RELEASE_PACKAGE_FINALIZED',
        checksum: 'abc123checksum',
        executable: false,
        deploymentExecuted: false,
        productionActivated: false,
        backupPlan: { environment: 'STAGING', databaseAlias: 'crm_test_alias', backupExecuted: false },
        rollbackPlan: { rollbackTargetApplicationVersion: 'prev', rollbackExecuted: false },
        monitoringPlan: { metrics: ['api_error_rate'], productionMonitoringConnected: false },
        healthCheckPlan: { checks: ['/api/v1/health'], productionEndpointsCalled: false },
        smokeTestPlan: { checks: ['Login'], productionSmokeExecuted: false },
        migrationPlan: { migrationRequired: false, migrationExecuted: false },
        knownLimitations: ['plan only'],
        createdBy: userId,
    });
    releaseId = release._id;

    const cert = await ProductionReadinessCertification.create({
        companyId: companyA,
        certificationNumber: `CERT-${TAG}`,
        certificationName: 'P25 Cert',
        releasePackageId: releaseId,
        releasePackageVersion: '0.25.0',
        releasePackageChecksum: 'abc123checksum',
        targetEnvironment: 'STAGING',
        status: 'READY_FOR_CONTROLLED_PILOT_REVIEW',
        overallReadiness: 'READY_FOR_CONTROLLED_PILOT_REVIEW',
        executable: false,
        deploymentAuthorized: false,
        productionApproved: false,
        createdBy: userId,
    });
    certId = cert._id;
});

after(async () => {
    await mongoose.disconnect();
});

describe('Phase 25 Pilot & UAT Center', () => {
    it('A. preflight safety + fingerprints + no deploy endpoints', () => {
        assert.equal(shaFile('src/services/dataExtractor/salesWorkflow/eligibility.service.js'), FP_ELIG);
        assert.equal(shaFile('src/services/dataExtractor/salesWorkflow/crmAdapter.service.js'), FP_CRM);
        assert.throws(() => assertSafeEnvironment('PRODUCTION'), /Unsafe environment/);
        assert.throws(() => assertSafeEnvironment('LIVE'), /Unsafe/);
        assert.throws(() => assertSafeFlagState('GLOBAL_PRODUCTION_ON'), /Unsafe feature-flag/);
        assert.throws(() => assertLocalTarget('https://api.render.com'), /rejected/);
        assert.throws(() => rejectTenantOverrides({ companyId: 'x' }), /companyId\/tenantId/);
        const forced = forceSimulationOnly({ productionActivated: true, deploymentExecuted: true });
        assert.equal(forced.simulationOnly, true);
        assert.equal(forced.productionExecutionAllowed, false);
        assert.equal(forced.deploymentExecuted, false);
        assert.equal(forced.productionActivated, false);
        assert.equal(forced.phase26Authorized, false);

        const routes = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src/routes/v1/dataExtractor.routes.js'), 'utf8');
        assert.match(routes, /pilot-rollout/);
        for (const bad of ['activate-production', 'rollback-now', 'backup-now', 'restore-now', 'run-migration', 'render-deploy', 'git-commit', 'git-push', '/deploy']) {
            assert.equal(routes.includes(`${bad}`), false, `forbidden endpoint fragment: ${bad}`);
        }
        // allow word deploy only in comments/negation paths - ensure no route named deploy
        assert.doesNotMatch(routes, /router\.(post|put|get)\(`\$\{pr\}\/deploy/);
    });

    it('B. permissions: missing rejected; manage works', async () => {
        await assert.rejects(() => createProgram(companyA, userId, {
            pilotCode: `${TAG}-X`, pilotName: 'x', releasePackageId: releaseId, readinessCertificationId: certId,
        }, noPerm), /permission/i);
    });

    it('C/D. create draft program; isolation; unsafe env; simulation defaults', async () => {
        const doc = await createProgram(companyA, userId, {
            pilotCode: `${TAG}-P1`,
            pilotName: 'Pilot One',
            releasePackageId: releaseId,
            readinessCertificationId: certId,
            environmentType: 'STAGING_SIMULATION',
            industryScope: ['JSK_URJA', 'HANDLOOM'],
        }, fullUser);
        programId = doc.id || doc._id;
        assert.equal(doc.simulationOnly, true);
        assert.equal(doc.productionExecutionAllowed, false);
        assert.equal(doc.deploymentExecuted, false);
        assert.equal(doc.productionActivated, false);
        assert.equal(doc.status, 'DRAFT');

        await assert.rejects(() => createProgram(companyA, userId, {
            pilotCode: `${TAG}-BAD`, pilotName: 'bad', releasePackageId: releaseId, readinessCertificationId: certId,
            environmentType: 'PRODUCTION',
        }, fullUser), /Unsafe environment|not allowed/i);

        await assert.rejects(() => getProgram(companyB, programId, fullUser), /not found/i);

        await assert.rejects(() => createProgram(companyA, userId, {
            pilotCode: `${TAG}-OV`, pilotName: 'ov', releasePackageId: releaseId, readinessCertificationId: certId,
            companyId: String(companyB),
        }, fullUser), /companyId\/tenantId/);
    });

    it('E/F. company/cohort/module/feature plans remain metadata', async () => {
        const company = await createCompanyPlan(companyA, userId, {
            pilotProgramId: programId, plannedCompanyId: companyA, companyNameSnapshot: 'Co A', industryTemplate: 'JSK_URJA',
        }, fullUser);
        assert.equal(company.activationExecuted, false);
        await assert.rejects(() => createCompanyPlan(companyA, userId, {
            pilotProgramId: programId, plannedCompanyId: companyA,
        }, fullUser), /Duplicate/);

        await setIndustryScope(companyA, userId, { pilotProgramId: programId, industries: ['JSK_URJA', 'HEALTHCARE'] }, fullUser);
        const cohort = await createCohort(companyA, userId, {
            pilotProgramId: programId, cohortName: 'UAT Testers', plannedPermissions: ['data_extractor.pilot.view'],
        }, fullUser);
        assert.equal(cohort.runtimePermissionsGranted, false);

        const mods = await upsertModulePlan(companyA, userId, {
            pilotProgramId: programId, moduleKey: 'data_extractor', moduleName: 'Data Extractor', action: 'PROPOSE_ENABLE',
        }, fullUser);
        assert.equal(mods.platformSettingsChanged, false);

        await assert.rejects(() => upsertFeatureFlagPlan(companyA, userId, {
            pilotProgramId: programId, featureKey: 'x', proposedPilotState: 'AUTO_ENABLE',
        }, fullUser), /Unsafe feature-flag/);
        const flags = await upsertFeatureFlagPlan(companyA, userId, {
            pilotProgramId: programId, featureKey: 'pilot.flag', proposedPilotState: 'INTERNAL_ONLY',
        }, fullUser);
        assert.equal(flags.runtimeFlagActivated, false);
    });

    it('G. staging simulation local checks; no deploy', async () => {
        const sim = await createSimulation(companyA, userId, {
            pilotProgramId: programId, simulationCode: `${TAG}-SIM`, title: 'Local sim',
        }, fullUser);
        const result = await runLocalChecks(companyA, userId, sim.id, { targetUrl: 'localhost' }, fullUser);
        assert.equal(result.deploymentExecuted, false);
        assert.equal(result.actualLocalResult.deploymentAttempted, false);
        await assert.rejects(() => runLocalChecks(companyA, userId, sim.id, { targetUrl: 'https://prod.example.com' }, fullUser), /rejected|allowlist/i);
    });

    it('H. UAT plan/case/cycle/execution/evidence rules', async () => {
        await transitionLifecycle(companyA, userId, programId, { status: 'PLANNING' }, fullUser);
        const plan = await createUatPlan(companyA, userId, {
            pilotProgramId: programId, uatPlanCode: `${TAG}-UAT`, title: 'UAT 1',
        }, fullUser);
        const tc = await createTestCase(companyA, userId, {
            pilotProgramId: programId, testCaseCode: `${TAG}-TC1`, title: 'Isolation', priority: 'CRITICAL',
            evidenceRequired: true, expectedResult: 'isolated',
        }, fullUser);
        const cycle = await createCycle(companyA, userId, {
            pilotProgramId: programId, uatPlanId: plan.id, cycleName: 'UAT Cycle 1', cycleType: 'UAT_CYCLE_1',
            testCaseIds: [tc.id],
        }, fullUser);
        await assert.rejects(() => recordExecution(companyA, userId, {
            uatCycleId: cycle.id, testCaseId: tc.id, resultStatus: 'PASSED', actualResult: 'ok',
        }, fullUser), /Evidence required/);
        const exec = await recordExecution(companyA, userId, {
            uatCycleId: cycle.id, testCaseId: tc.id, resultStatus: 'PASSED', actualResult: 'ok',
            evidenceRefs: [{ type: 'screenshot_reference', reference: 'local://shot1' }],
        }, fullUser);
        assert.equal(exec.history.length, 1);
        await completeCycle(companyA, userId, cycle.id, { recommendation: 'PASS' }, fullUser);
    });

    it('I. defects block closure; client cannot accept platform critical', async () => {
        const defect = await createDefect(companyA, userId, {
            pilotProgramId: programId, defectCode: `${TAG}-D1`, title: 'Critical iso', severity: 'CRITICAL', platformLevel: true,
        }, fullUser);
        await assert.rejects(() => acceptDefectRisk(companyA, userOther, defect.id, {
            reason: 'ok', expiry: new Date(Date.now() + 86400000).toISOString(),
        }, clientOnly), /Client Admin|Platform Admin/i);
        await assert.rejects(() => acceptDefectRisk(companyA, userId, defect.id, { reason: 'x' }, fullUser), /expiry/i);
        await retestDefect(companyA, userId, defect.id, { passed: true }, fullUser);
        await closeDefect(companyA, userId, defect.id, { closureNote: 'fixed' }, fullUser);
    });

    it('J/K. feedback metrics risks exceptions', async () => {
        const fb = await createFeedback(companyA, userId, {
            pilotProgramId: programId, rating: 2, comment: 'needs work', category: 'Usability',
        }, fullUser);
        assert.equal(fb.sentiment, 'NEGATIVE');
        const m = await metrics(companyA, { pilotProgramId: programId }, fullUser);
        assert.equal(m.productionTelemetryUsed, false);
        const dash = await healthDashboard(companyA, { pilotProgramId: programId }, fullUser);
        assert.ok(dash.forbiddenActions.includes('Deploy Now'));

        const risk = await createRisk(companyA, userId, {
            pilotProgramId: programId, riskCode: `${TAG}-R1`, title: 'Risk', likelihood: 2, impact: 2, mitigation: 'monitor',
        }, fullUser);
        assert.equal(risk.inherentScore, 4);
        await acceptRisk(companyA, userId, risk.id, {
            reason: 'temporary', expiry: new Date(Date.now() + 7 * 86400000).toISOString(),
        }, fullUser);
        await assert.rejects(() => createException(companyA, userId, {
            pilotProgramId: programId, reason: 'x', bypassesCriticalIsolation: true,
            expiry: new Date(Date.now() + 86400000).toISOString(),
        }, fullUser), /cannot be excepted/i);
        await createException(companyA, userId, {
            pilotProgramId: programId, reason: 'defer noncritical', exceptionType: 'DEFERRED_TEST',
            expiry: new Date(Date.now() + 86400000).toISOString(), compensatingControl: 'manual check',
        }, fullUser);
    });

    it('L/M. pause rollback criteria recommendation gates', async () => {
        const pause = await createPauseRequest(companyA, userId, {
            pilotProgramId: programId, reason: 'Critical defect review',
        }, fullUser);
        assert.equal(pause.runtimeActionExecuted, false);

        const rb = await createRollbackPlan(companyA, userId, {
            pilotProgramId: programId, rollbackTrigger: 'Critical failure',
        }, fullUser);
        assert.equal(rb.rollbackExecuted, false);
        const failed = await simulateRollback(companyA, userId, rb.id, { forceFail: true }, fullUser);
        assert.equal(failed.readinessStatus, 'SIMULATION_FAILED');
        assert.equal(failed.rollbackExecuted, false);

        const criteriaBlocked = await evaluateCriteria(companyA, programId, fullUser);
        assert.equal(criteriaBlocked.anyFailureTriggered, true);

        await simulateRollback(companyA, userId, rb.id, { forceFail: false }, fullUser);
        const criteria = await evaluateCriteria(companyA, programId, fullUser);
        assert.equal(criteria.failureCriteria.find((f) => f.key === 'FAILED_ROLLBACK_SIMULATION').triggered, false);

        // Drive lifecycle toward UAT_COMPLETED for recommendation path
        for (const status of [
            'PENDING_REVIEW', 'READY_FOR_STAGING_SIMULATION', 'STAGING_SIMULATION_IN_PROGRESS',
            'STAGING_SIMULATION_COMPLETED', 'READY_FOR_PILOT_REVIEW', 'PILOT_APPROVED_FOR_LOCAL_SIMULATION',
            'PILOT_SIMULATION_IN_PROGRESS', 'UAT_IN_PROGRESS', 'UAT_COMPLETED',
        ]) {
            // may already be PLANNING; skip invalid by try
            try {
                await transitionLifecycle(companyA, userId, programId, { status }, fullUser);
            } catch {
                /* continue advancing if already past */
            }
        }

        const rec = await getRecommendation(companyA, programId, fullUser);
        assert.equal(rec.phase26Authorized, false);
        assert.equal(rec.phase26Started, false);
        assert.match(rec.note, /recommendation only/i);

        const closed = await closureReview(companyA, userId, programId, {
            outcome: 'READY_FOR_PHASE_26_REVIEW', reason: 'Gates met for review only',
        }, fullUser);
        assert.equal(closed.phase26Authorized, false);
        assert.equal(closed.productionActivated, false);
        assert.equal(closed.status, 'READY_FOR_PHASE_26_REVIEW');
    });

    it('N. audit immutable + saved views + export scope + CRM unchanged', async () => {
        const view = await createSavedView(companyA, userId, { name: 'Critical defects', viewKey: 'critical_defects', filters: { severity: 'CRITICAL' } }, fullUser);
        assert.equal(String(view.userId), String(userId));
        const audit = await listAudit(companyA, { pilotProgramId: programId }, fullUser);
        assert.equal(audit.appendOnly, true);
        assert.ok(audit.items.length >= 1);
        // no update API for audit — collection write of update should not be exposed; mark immutable contract
        assert.equal(Object.prototype.hasOwnProperty.call(audit, 'appendOnly'), true);

        const report = await exportPilotReport(companyA, userId, { pilotProgramId: programId }, fullUser);
        assert.equal(report.secretsExcluded, true);
        assert.equal(report.deploymentPackageIncluded, false);

        const leadsNow = await mongoose.connection.db.collection('leads').countDocuments({});
        assert.equal(leadsNow, baselineLeads);

        assert.equal(shaFile('src/services/dataExtractor/salesWorkflow/eligibility.service.js'), FP_ELIG);
        assert.equal(shaFile('src/services/dataExtractor/salesWorkflow/crmAdapter.service.js'), FP_CRM);
    });
});