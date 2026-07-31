/**
 * Phase 27 - Production Activation Readiness Orchestrator (localhost/crm_test only).
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
import { OperationsProgram } from '../../src/models/operationsProgram.model.js';
import {
    createProgram, getProgram, transitionLifecycle, getRecommendation, validateReleaseLineage,
    reviewReleaseIntegrity, validatePhaseDependencies, evaluateFinalGates, updateProgram,
} from '../../src/services/dataExtractor/activationReadiness/activationReadinessProgram.service.js';
import {
    recordDefectGate, recordRiskGate, recordApprovalReview, recordEnvironmentReview,
    recordMaintenanceReview, recordMonitoringReview, recordIncidentReview, recordEscalationReview,
    recordBackupReview, recordRestoreReview, recordRollbackReview, recordDrReview,
    recordBusinessContinuityReview, recordCommunicationReview, recordCustomerImpactReview,
    recordHypercareReview,
} from '../../src/services/dataExtractor/activationReadiness/readinessReviews.service.js';
import {
    upsertSmokeTestPlan, generateManualChecklist, generateHandoverPackage, recordBlocker,
    recordException, completeAllReviewsForTests, createSavedView, listAudit, exportReport, listControls,
} from '../../src/services/dataExtractor/activationReadiness/readinessSupport.service.js';
import { saveSettings } from '../../src/services/dataExtractor/activationReadiness/settings.service.js';
import {
    rejectTenantOverrides, assertSafeEnvironment, forceSimulationOnly, assertLocalTarget,
} from '../../src/services/dataExtractor/activationReadiness/normalize.util.js';

const MONGO_URI = process.env.P27_MONGO_URI || process.env.MONGODB_URL || 'mongodb://127.0.0.1:27017/crm_test';
const TAG = `P27-${Date.now()}`;
const companyA = new mongoose.Types.ObjectId();
const companyB = new mongoose.Types.ObjectId();
const userId = new mongoose.Types.ObjectId();
const userOther = new mongoose.Types.ObjectId();
const userFinal = new mongoose.Types.ObjectId();

const ALL = [
    'data_extractor.activation_readiness.view', 'data_extractor.activation_readiness.create',
    'data_extractor.activation_readiness.update', 'data_extractor.activation_readiness.manage',
    'data_extractor.activation_readiness.validate', 'data_extractor.activation_readiness.review',
    'data_extractor.activation_readiness.final_review', 'data_extractor.activation_readiness.release_lineage',
    'data_extractor.activation_readiness.integrity_review', 'data_extractor.activation_readiness.defect_gate',
    'data_extractor.activation_readiness.risk_gate', 'data_extractor.activation_readiness.approvals',
    'data_extractor.activation_readiness.environment_review', 'data_extractor.activation_readiness.maintenance_review',
    'data_extractor.activation_readiness.monitoring_review', 'data_extractor.activation_readiness.incident_review',
    'data_extractor.activation_readiness.backup_review', 'data_extractor.activation_readiness.restore_review',
    'data_extractor.activation_readiness.rollback_review', 'data_extractor.activation_readiness.dr_review',
    'data_extractor.activation_readiness.communication_review', 'data_extractor.activation_readiness.customer_impact',
    'data_extractor.activation_readiness.hypercare', 'data_extractor.activation_readiness.smoke_test_plan',
    'data_extractor.activation_readiness.manual_checklist', 'data_extractor.activation_readiness.handover',
    'data_extractor.activation_readiness.exceptions', 'data_extractor.activation_readiness.recommendation',
    'data_extractor.activation_readiness.audit', 'data_extractor.activation_readiness.export',
    'data_extractor.activation_readiness.saved_views', 'data_extractor.activation_readiness.settings',
    'platform.admin',
];
const fullUser = { id: userId, _id: userId, roleName: 'platform_admin', permissions: ALL };
const finalUser = { id: userFinal, _id: userFinal, roleName: 'platform_admin', permissions: ALL };
const clientOnly = {
    id: userOther, _id: userOther, roleName: 'client_admin',
    permissions: ['data_extractor.activation_readiness.view', 'data_extractor.activation_readiness.risk_gate'],
};
const noPerm = { id: userOther, _id: userOther, roleName: 'viewer', permissions: [] };
const FP_ELIG = '66B7BA1E4F6E914714076ACC23968EE43559E456C523A27449221E6A61735F96';
const FP_CRM = '08D6BB214E943BA67DC19808BFAB4875549A99D256C190492609560A33DE8E55';
function shaFile(rel) {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
    return createHash('sha256').update(fs.readFileSync(path.join(root, rel))).digest('hex').toUpperCase();
}

let releaseId; let certId; let pilotId; let opsId; let programId; let baselineLeads;

before(async () => {
    assert.match(MONGO_URI, /crm_test/);
    assert.doesNotMatch(MONGO_URI, /prod|atlas|mongodb\.net/i);
    await mongoose.connect(MONGO_URI);
    baselineLeads = await mongoose.connection.db.collection('leads').countDocuments({});
    await saveSettings(companyA, userId, {
        requireIndependentFinalReviewer: true,
        requireMaintenanceWindowReview: true,
        requireMonitoringReview: true,
        requireIncidentReview: true,
        requireBackupReview: true,
        requireRestoreReview: true,
        requireRollbackReview: true,
        requireDrReview: true,
        requireCommunicationReview: true,
        requireCustomerImpactReview: true,
        requireHypercareReview: true,
        requireSmokeTestPlan: true,
        requireManualChecklist: true,
        requireHandoverPackage: true,
        requireNoOpenCriticalDefects: true,
        requireNoOpenCriticalRisks: true,
    }, fullUser);
    const release = await ReleasePackage.create({
        companyId: companyA, releaseNumber: `REL-${TAG}`, releaseName: 'P27 Release',
        sourceEnvironment: 'LOCALHOST', targetEnvironment: 'STAGING', status: 'RELEASE_PACKAGE_FINALIZED',
        checksum: 'p27checksumabc', executable: false, deploymentExecuted: false, productionActivated: false,
        knownLimitations: ['plan only'], createdBy: userId,
    });
    releaseId = release._id;
    const cert = await ProductionReadinessCertification.create({
        companyId: companyA, certificationNumber: `CERT-${TAG}`, certificationName: 'P27 Cert',
        releasePackageId: releaseId, releasePackageVersion: '0.27.0', releasePackageChecksum: 'p27checksumabc',
        targetEnvironment: 'STAGING', status: 'READY_FOR_CONTROLLED_PILOT_REVIEW',
        overallReadiness: 'READY_FOR_CONTROLLED_PILOT_REVIEW', executable: false, deploymentAuthorized: false,
        productionApproved: false, createdBy: userId,
    });
    certId = cert._id;
    const pilot = await PilotProgram.create({
        companyId: companyA, pilotCode: `PILOT-${TAG}`, pilotName: 'P27 Pilot', releasePackageId: releaseId,
        readinessCertificationId: certId, environmentType: 'STAGING_SIMULATION', status: 'READY_FOR_PHASE_26_REVIEW',
        recommendation: 'READY_FOR_PHASE_26_REVIEW', simulationOnly: true, productionExecutionAllowed: false,
        deploymentExecuted: false, productionActivated: false, createdBy: userId,
    });
    pilotId = pilot._id;
    const ops = await OperationsProgram.create({
        companyId: companyA, programCode: `OPS-${TAG}`, programName: 'P27 Ops',
        releasePackageId: releaseId, readinessCertificationId: certId, pilotProgramId: pilotId,
        proposedEnvironment: 'PRODUCTION_PLANNING_ONLY', status: 'READY_FOR_PHASE_27_REVIEW',
        recommendation: 'READY_FOR_PHASE_27_REVIEW', simulationOnly: true, productionExecutionAllowed: false,
        deploymentExecuted: false, productionActivated: false, createdBy: userId,
    });
    opsId = ops._id;
});
after(async () => { await mongoose.disconnect(); });

describe('Phase 27 Production Activation Readiness', () => {
    it('A. safety preflight fingerprints no forbidden endpoints', () => {
        assert.equal(shaFile('src/services/dataExtractor/salesWorkflow/eligibility.service.js'), FP_ELIG);
        assert.equal(shaFile('src/services/dataExtractor/salesWorkflow/crmAdapter.service.js'), FP_CRM);
        assert.throws(() => assertSafeEnvironment('LIVE_EXECUTION'), /Unsafe|not allowed/i);
        assert.throws(() => assertSafeEnvironment('AUTO_DEPLOY'), /Unsafe|not allowed/i);
        assert.throws(() => assertLocalTarget('https://api.render.com'), /rejected/);
        assert.throws(() => rejectTenantOverrides({ companyId: 'x' }), /companyId\/tenantId/);
        const forced = forceSimulationOnly({
            productionActivated: true, deploymentExecuted: true, renderActionExecuted: true,
            gitCommitExecuted: true, gitPushExecuted: true, rollbackExecuted: true,
            backupExecuted: true, restoreExecuted: true, migrationExecuted: true,
        });
        assert.equal(forced.simulationOnly, true);
        assert.equal(forced.manualDeploymentOnly, true);
        assert.equal(forced.productionExecutionAllowed, false);
        assert.equal(forced.deploymentExecuted, false);
        assert.equal(forced.productionActivated, false);
        assert.equal(forced.renderActionExecuted, false);
        assert.equal(forced.gitCommitExecuted, false);
        assert.equal(forced.gitPushExecuted, false);
        assert.equal(forced.rollbackExecuted, false);
        assert.equal(forced.backupExecuted, false);
        assert.equal(forced.restoreExecuted, false);
        assert.equal(forced.migrationExecuted, false);
        const routes = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src/routes/v1/dataExtractor.routes.js'), 'utf8');
        assert.match(routes, /activation-readiness/);
        for (const bad of [
            'activate-production', 'deploy-now', 'go-live', 'render-deploy', 'git-commit', 'git-push',
            'rollback-now', 'backup-now', 'restore-now', 'run-migration', 'auto-deploy',
        ]) {
            assert.equal(routes.includes(bad), false, bad);
        }
        assert.equal(fs.existsSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../docs/data-extractor/phase-28-implementation.md')), false);
        assert.ok(listControls(fullUser).items.length > 0);
    });

    it('B. auth permissions client admin limits', async () => {
        await assert.rejects(() => createProgram(companyA, userId, {
            programCode: `${TAG}-X`, programName: 'x', releasePackageId: releaseId,
            readinessCertificationId: certId, pilotProgramId: pilotId, operationsProgramId: opsId,
        }, noPerm), /permission/i);
        await assert.rejects(() => recordRiskGate(companyA, userOther, '000000000000000000000000', {
            platformCriticalAcceptance: true, openCritical: 0,
        }, clientOnly), /not found|Client Admin|permission/i);
    });

    it('C/D. create program lineage isolation unsafe fields', async () => {
        const doc = await createProgram(companyA, userId, {
            programCode: `${TAG}-P1`, programName: 'AR One', releasePackageId: releaseId,
            readinessCertificationId: certId, pilotProgramId: pilotId, operationsProgramId: opsId,
            releaseChecksum: 'p27checksumabc',
            proposedEnvironment: 'PRODUCTION_MANUAL_DEPLOYMENT_PLANNING_ONLY',
        }, fullUser);
        programId = doc.id || doc._id;
        assert.equal(doc.simulationOnly, true);
        assert.equal(doc.manualDeploymentOnly, true);
        assert.equal(doc.productionExecutionAllowed, false);
        assert.equal(doc.deploymentExecuted, false);
        assert.equal(doc.productionActivated, false);
        assert.equal(doc.renderActionExecuted, false);
        assert.equal(doc.gitCommitExecuted, false);
        assert.equal(doc.gitPushExecuted, false);
        await assert.rejects(() => createProgram(companyA, userId, {
            programCode: `${TAG}-BAD`, programName: 'bad', releasePackageId: releaseId,
            readinessCertificationId: certId, pilotProgramId: pilotId, operationsProgramId: opsId,
            proposedEnvironment: 'PRODUCTION_ACTIVATION',
        }, fullUser), /Unsafe|not allowed/i);
        await assert.rejects(() => createProgram(companyA, userId, {
            programCode: `${TAG}-UF`, programName: 'uf', releasePackageId: releaseId,
            readinessCertificationId: certId, pilotProgramId: pilotId, operationsProgramId: opsId,
            productionActivated: true,
        }, fullUser), /Unsafe execution/i);
        await assert.rejects(() => getProgram(companyB, programId, fullUser), /not found/i);
        await assert.rejects(() => createProgram(companyA, userId, {
            programCode: `${TAG}-OV`, programName: 'ov', releasePackageId: releaseId,
            readinessCertificationId: certId, pilotProgramId: pilotId, operationsProgramId: opsId,
            companyId: String(companyB),
        }, fullUser), /companyId\/tenantId/);
        const foreignRelease = await ReleasePackage.create({
            companyId: companyB, releaseNumber: `REL-B-${TAG}`, releaseName: 'Foreign',
            sourceEnvironment: 'LOCALHOST', targetEnvironment: 'STAGING', status: 'RELEASE_PACKAGE_FINALIZED',
            checksum: 'other', executable: false, createdBy: userId,
        });
        await assert.rejects(() => createProgram(companyA, userId, {
            programCode: `${TAG}-XC`, programName: 'xc', releasePackageId: foreignRelease._id,
            readinessCertificationId: certId, pilotProgramId: pilotId, operationsProgramId: opsId,
        }, fullUser), /scope mismatch|not found|linkage/i);
    });

    it('E. lineage integrity phase dependencies', async () => {
        const lineage = await validateReleaseLineage(companyA, userId, programId, fullUser);
        assert.equal(lineage.lineageValidation.status, 'PASS');
        const integrity = await reviewReleaseIntegrity(companyA, userId, programId, { expectedChecksum: 'p27checksumabc' }, fullUser);
        assert.equal(integrity.integrityReview.status, 'PASS');
        const bad = await createProgram(companyA, userId, {
            programCode: `${TAG}-CM`, programName: 'cm', releasePackageId: releaseId,
            readinessCertificationId: certId, pilotProgramId: pilotId, operationsProgramId: opsId,
            releaseChecksum: 'wrong-checksum',
        }, fullUser);
        const mismatch = await reviewReleaseIntegrity(companyA, userId, bad.id, { expectedChecksum: 'definitely-wrong' }, fullUser);
        assert.equal(mismatch.integrityReview.status, 'FAIL');
        const deps = await validatePhaseDependencies(companyA, userId, programId, fullUser);
        assert.equal(deps.phaseDependencies.status, 'PASS');
    });

    it('F. defect and risk gates', async () => {
        await assert.rejects(() => recordRiskGate(companyA, userId, programId, {
            openCritical: 0, acceptOwnCritical: true, riskOwnerId: String(userId),
        }, fullUser), /self-acceptance/i);
        await assert.rejects(() => recordRiskGate(companyA, userOther, programId, {
            openCritical: 0, platformCriticalAcceptance: true,
        }, clientOnly), /Client Admin/i);
        const dFail = await recordDefectGate(companyA, userId, programId, { openCritical: 1 }, fullUser);
        assert.equal(dFail.defectGate.status, 'FAIL');
        const dPass = await recordDefectGate(companyA, userId, programId, { openCritical: 0 }, fullUser);
        assert.equal(dPass.defectGate.status, 'PASS');
        const rFail = await recordRiskGate(companyA, userId, programId, { openCritical: 1 }, fullUser);
        assert.equal(rFail.riskGate.status, 'FAIL');
        const rExp = await recordRiskGate(companyA, userId, programId, { openCritical: 0, acceptedRiskExpiredCount: 1 }, fullUser);
        assert.equal(rExp.riskGate.status, 'FAIL');
        const rPass = await recordRiskGate(companyA, userId, programId, { openCritical: 0, acceptedRiskExpiredCount: 0 }, fullUser);
        assert.equal(rPass.riskGate.status, 'PASS');
    });

    it('G. approvals operational reviews', async () => {
        await assert.rejects(() => recordApprovalReview(companyA, userId, programId, {
            finalApprove: true, approvals: [{ role: 'final', approved: true }],
        }, fullUser), /Requestor cannot final-approve/i);
        const appr = await recordApprovalReview(companyA, userFinal, programId, {
            approvals: [
                { role: 'release_owner', approved: true },
                { role: 'technical', approved: true },
                { role: 'security', approved: true },
                { role: 'operations', approved: true },
                { role: 'final', approved: true },
            ],
            reason: 'complete',
            evidenceRef: 'ev-1',
        }, finalUser);
        assert.equal(appr.approvalReview.status, 'PASS');
        await recordApprovalReview(companyA, userFinal, programId, { withdraw: true, reason: 'temp withdraw' }, finalUser);
        await recordApprovalReview(companyA, userFinal, programId, {
            approvals: [{ role: 'final', approved: true }], reason: 're-approve', evidenceRef: 'ev-2',
        }, finalUser);
        await recordEnvironmentReview(companyA, userId, programId, { environmentName: 'Prod planning metadata' }, fullUser);
        await recordMaintenanceReview(companyA, userId, programId, { plannedDate: new Date().toISOString(), timezone: 'Asia/Kolkata' }, fullUser);
        await recordMonitoringReview(companyA, userId, programId, { frontendHealth: true, backendHealth: true }, fullUser);
        await recordIncidentReview(companyA, userId, programId, { sev1Process: true }, fullUser);
        await recordEscalationReview(companyA, userId, programId, { onCallPlan: true }, fullUser);
        await recordBackupReview(companyA, userId, programId, { scope: 'full', rpo: '24h' }, fullUser);
        await recordRestoreReview(companyA, userId, programId, { target: 'crm_test' }, fullUser);
        await recordRollbackReview(companyA, userId, programId, { trigger: 'sev1', authority: 'platform' }, fullUser);
        await recordDrReview(companyA, userId, programId, { rto: '4h', rpo: '24h' }, fullUser);
        await recordBusinessContinuityReview(companyA, userId, programId, { fallback: 'manual' }, fullUser);
        await recordCommunicationReview(companyA, userId, programId, { stakeholderRoles: ['ops'] }, fullUser);
        await recordCustomerImpactReview(companyA, userId, programId, { expectedDowntime: '0' }, fullUser);
        await recordHypercareReview(companyA, userId, programId, { durationDays: 7 }, fullUser);
    });

    it('H. smoke checklist handover secrets excluded', async () => {
        const smoke = await upsertSmokeTestPlan(companyA, userId, programId, { status: 'READY' }, fullUser);
        assert.equal(smoke.smokeTestPlan.productionExecuted, false);
        await assert.rejects(() => upsertSmokeTestPlan(companyA, userId, programId, { productionExecuted: true }, fullUser), /must not run against production/i);
        const checklist = await generateManualChecklist(companyA, userId, programId, { completeAll: true }, fullUser);
        assert.ok(checklist.manualDeploymentChecklist.every((c) => c.documentationOnly && !c.executableCommand));
        const hand = await generateHandoverPackage(companyA, userId, programId, { knownLimitations: ['local only'] }, fullUser);
        assert.equal(hand.handoverPackage.secretsExcluded, true);
        assert.equal(hand.handoverPackage.executableDeploymentActionsExcluded, true);
        const blob = JSON.stringify(hand.handoverPackage);
        assert.doesNotMatch(blob, /password|ghp_|sk-/i);
    });

    it('I. final recommendation gates no deploy', async () => {
        await completeAllReviewsForTests(companyA, userId, programId, fullUser);
        const gates = await evaluateFinalGates(companyA, userId, programId, fullUser);
        assert.equal(gates.eligible, true);
        await assert.rejects(() => transitionLifecycle(companyA, userId, programId, {
            status: 'READY_FOR_MANUAL_PRODUCTION_DEPLOYMENT', reason: 'self',
        }, fullUser), /Requestor cannot final-approve/i);
        const rec = await transitionLifecycle(companyA, userFinal, programId, {
            status: 'READY_FOR_MANUAL_PRODUCTION_DEPLOYMENT',
            reason: 'All gates passed for manual deployment consideration only',
        }, finalUser);
        assert.equal(rec.recommendation, 'READY_FOR_MANUAL_PRODUCTION_DEPLOYMENT');
        assert.equal(rec.deploymentExecuted, false);
        assert.equal(rec.productionActivated, false);
        assert.equal(rec.renderActionExecuted, false);
        assert.equal(rec.gitCommitExecuted, false);
        assert.equal(rec.gitPushExecuted, false);
        assert.equal(rec.rollbackExecuted, false);
        assert.equal(rec.backupExecuted, false);
        assert.equal(rec.restoreExecuted, false);
        assert.equal(rec.migrationExecuted, false);
        assert.match(rec.recommendationWarning || '', /Manual deployment has not been performed/i);
        const view = await getRecommendation(companyA, programId, fullUser);
        assert.equal(view.doesNotDeploy, true);
        assert.equal(view.doesNotActivateProduction, true);
        assert.equal(view.deploymentExecuted, false);
        assert.equal(view.productionActivated, false);
        await assert.rejects(() => updateProgram(companyA, userId, programId, { deploymentExecuted: true }, fullUser), /Unsafe execution|not editable/i);
    });

    it('J. blockers exceptions audit export views', async () => {
        const blockedProg = await createProgram(companyA, userId, {
            programCode: `${TAG}-BLK`, programName: 'Blocked', releasePackageId: releaseId,
            readinessCertificationId: certId, pilotProgramId: pilotId, operationsProgramId: opsId,
        }, fullUser);
        await recordBlocker(companyA, userId, blockedProg.id, { type: 'MISSING_MONITORING', message: 'incomplete' }, fullUser);
        await assert.rejects(() => recordBlocker(companyA, userId, blockedProg.id, {
            type: 'X', message: 'y', silentlyOverride: true,
        }, fullUser), /silently overridden/i);
        await assert.rejects(() => recordException(companyA, userId, blockedProg.id, {
            bypassType: 'CRITICAL_DEFECT', reason: 'no', owner: String(userId), approver: String(userFinal), expiry: new Date().toISOString(),
        }, fullUser), /cannot bypass/i);
        await recordException(companyA, userId, blockedProg.id, {
            reason: 'non-critical deferral', scope: 'docs', owner: String(userId), approver: String(userFinal),
            compensatingControl: 'manual check', expiry: new Date(Date.now() + 86400000).toISOString(), risk: 'LOW',
        }, fullUser);
        const view = await createSavedView(companyA, userId, { name: 'My readiness programs', viewKey: 'my_programs' }, fullUser);
        assert.equal(String(view.userId), String(userId));
        await assert.rejects(() => exportReport(companyA, userId, {}, noPerm), /permission/i);
        const exp = await exportReport(companyA, userId, { type: 'summary' }, fullUser);
        assert.equal(exp.secretsExcluded, true);
        const audit = await listAudit(companyA, { activationProgramId: programId }, fullUser);
        assert.ok(audit.items.length > 0);
        assert.equal(audit.items[0].immutable, true);
        const leadsNow = await mongoose.connection.db.collection('leads').countDocuments({});
        assert.equal(leadsNow, baselineLeads);
    });

    it('K. missing gates block recommendation', async () => {
        const incomplete = await createProgram(companyA, userId, {
            programCode: `${TAG}-INC`, programName: 'Incomplete', releasePackageId: releaseId,
            readinessCertificationId: certId, pilotProgramId: pilotId, operationsProgramId: opsId,
        }, fullUser);
        await transitionLifecycle(companyA, userId, incomplete.id, { status: 'VALIDATION_PENDING' }, fullUser);
        await transitionLifecycle(companyA, userId, incomplete.id, { status: 'VALIDATION_IN_PROGRESS' }, fullUser);
        await transitionLifecycle(companyA, userId, incomplete.id, { status: 'READY_FOR_FINAL_REVIEW' }, fullUser);
        await assert.rejects(() => transitionLifecycle(companyA, userFinal, incomplete.id, {
            status: 'READY_FOR_MANUAL_PRODUCTION_DEPLOYMENT', reason: 'premature',
        }, finalUser), /blocked/i);
    });
});