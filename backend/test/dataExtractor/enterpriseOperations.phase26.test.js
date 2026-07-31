/**
 * Phase 26 - Enterprise Operations Center (localhost/crm_test only).
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
import { createProgram, getProgram, transitionLifecycle, getRecommendation } from '../../src/services/dataExtractor/enterpriseOperations/operationsProgram.service.js';
import { upsertEnvironment, createMaintenanceWindow, createRollbackPlan, simulateRollbackDecision, createContinuityPlan, runLocalHealthCheck, releaseBoardReview } from '../../src/services/dataExtractor/enterpriseOperations/opsPlanning.service.js';
import { createChange, transitionChange } from '../../src/services/dataExtractor/enterpriseOperations/opsChange.service.js';
import { createIncident, transitionIncident, createProblem } from '../../src/services/dataExtractor/enterpriseOperations/opsIncident.service.js';
import { createRisk, acceptRisk, createException } from '../../src/services/dataExtractor/enterpriseOperations/opsRisk.service.js';
import { createSavedView, listAudit, exportReport, healthDashboard, completeChecklistsForTests } from '../../src/services/dataExtractor/enterpriseOperations/opsSupport.service.js';
import { saveSettings } from '../../src/services/dataExtractor/enterpriseOperations/settings.service.js';
import { rejectTenantOverrides, assertSafeEnvironment, forceSimulationOnly, assertLocalTarget } from '../../src/services/dataExtractor/enterpriseOperations/normalize.util.js';

const MONGO_URI = process.env.P26_MONGO_URI || process.env.MONGODB_URL || 'mongodb://127.0.0.1:27017/crm_test';
const TAG = `P26-${Date.now()}`;
const companyA = new mongoose.Types.ObjectId();
const companyB = new mongoose.Types.ObjectId();
const userId = new mongoose.Types.ObjectId();
const userOther = new mongoose.Types.ObjectId();
const userFinal = new mongoose.Types.ObjectId();

const ALL = [
    'data_extractor.operations.view', 'data_extractor.operations.create', 'data_extractor.operations.update',
    'data_extractor.operations.manage', 'data_extractor.operations.review', 'data_extractor.operations.final_review',
    'data_extractor.operations.release_board', 'data_extractor.operations.production_plan',
    'data_extractor.operations.environment_inventory', 'data_extractor.operations.release_calendar',
    'data_extractor.operations.maintenance_window', 'data_extractor.operations.change.view',
    'data_extractor.operations.change.manage', 'data_extractor.operations.emergency_change',
    'data_extractor.operations.checklist.view', 'data_extractor.operations.checklist.manage',
    'data_extractor.operations.monitoring.view', 'data_extractor.operations.monitoring.manage',
    'data_extractor.operations.incident.view', 'data_extractor.operations.incident.manage',
    'data_extractor.operations.problem.view', 'data_extractor.operations.problem.manage',
    'data_extractor.operations.risk.view', 'data_extractor.operations.risk.manage', 'data_extractor.operations.accept_risk',
    'data_extractor.operations.backup_plan', 'data_extractor.operations.restore_plan', 'data_extractor.operations.dr_plan',
    'data_extractor.operations.rollback_plan', 'data_extractor.operations.communication',
    'data_extractor.operations.release_notes', 'data_extractor.operations.phase27_recommendation',
    'data_extractor.operations.audit', 'data_extractor.operations.export', 'data_extractor.operations.saved_views',
    'data_extractor.operations.settings', 'platform.admin',
];
const fullUser = { id: userId, _id: userId, roleName: 'platform_admin', permissions: ALL };
const finalUser = { id: userFinal, _id: userFinal, roleName: 'platform_admin', permissions: ALL };
const clientOnly = { id: userOther, _id: userOther, roleName: 'client_admin', permissions: ['data_extractor.operations.view', 'data_extractor.operations.accept_risk'] };
const noPerm = { id: userOther, _id: userOther, roleName: 'viewer', permissions: [] };
const FP_ELIG = '66B7BA1E4F6E914714076ACC23968EE43559E456C523A27449221E6A61735F96';
const FP_CRM = '08D6BB214E943BA67DC19808BFAB4875549A99D256C190492609560A33DE8E55';
function shaFile(rel) {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
    return createHash('sha256').update(fs.readFileSync(path.join(root, rel))).digest('hex').toUpperCase();
}
let releaseId; let certId; let pilotId; let programId; let baselineLeads;

before(async () => {
    assert.match(MONGO_URI, /crm_test/);
    assert.doesNotMatch(MONGO_URI, /prod|atlas|mongodb\.net/i);
    await mongoose.connect(MONGO_URI);
    baselineLeads = await mongoose.connection.db.collection('leads').countDocuments({});
    await saveSettings(companyA, userId, {
        requireIndependentFinalReviewer: true, requireRollbackPlan: true, requireBackupVerificationPlan: true,
        requireRestoreVerificationPlan: true, requireDrPlan: true, requireMonitoringPlan: true,
        requireCommunicationPlan: true, requireHypercarePlan: true, requireMaintenanceWindow: true,
        requireOperationalChecklist: true, requireGoLiveChecklist: true,
    }, fullUser);
    const release = await ReleasePackage.create({
        companyId: companyA, releaseNumber: `REL-${TAG}`, releaseName: 'P26 Release',
        sourceEnvironment: 'LOCALHOST', targetEnvironment: 'STAGING', status: 'RELEASE_PACKAGE_FINALIZED',
        checksum: 'abc123checksum', executable: false, deploymentExecuted: false, productionActivated: false,
        backupPlan: { environment: 'STAGING', databaseAlias: 'crm_test_alias', backupExecuted: false },
        rollbackPlan: { rollbackTargetApplicationVersion: 'prev', rollbackExecuted: false },
        monitoringPlan: { metrics: ['api_error_rate'], productionMonitoringConnected: false },
        healthCheckPlan: { checks: ['/api/v1/health'], productionEndpointsCalled: false },
        smokeTestPlan: { checks: ['Login'], productionSmokeExecuted: false },
        migrationPlan: { migrationRequired: false, migrationExecuted: false }, knownLimitations: ['plan only'], createdBy: userId,
    });
    releaseId = release._id;
    const cert = await ProductionReadinessCertification.create({
        companyId: companyA, certificationNumber: `CERT-${TAG}`, certificationName: 'P26 Cert',
        releasePackageId: releaseId, releasePackageVersion: '0.26.0', releasePackageChecksum: 'abc123checksum',
        targetEnvironment: 'STAGING', status: 'READY_FOR_CONTROLLED_PILOT_REVIEW',
        overallReadiness: 'READY_FOR_CONTROLLED_PILOT_REVIEW', executable: false, deploymentAuthorized: false,
        productionApproved: false, createdBy: userId,
    });
    certId = cert._id;
    const pilot = await PilotProgram.create({
        companyId: companyA, pilotCode: `PILOT-${TAG}`, pilotName: 'P26 Pilot', releasePackageId: releaseId,
        readinessCertificationId: certId, environmentType: 'STAGING_SIMULATION', status: 'READY_FOR_PHASE_26_REVIEW',
        recommendation: 'READY_FOR_PHASE_26_REVIEW', simulationOnly: true, productionExecutionAllowed: false,
        deploymentExecuted: false, productionActivated: false, createdBy: userId,
    });
    pilotId = pilot._id;
});
after(async () => { await mongoose.disconnect(); });

describe('Phase 26 Enterprise Operations Center', () => {
    it('A. preflight safety + fingerprints + no forbidden endpoints', () => {
        assert.equal(shaFile('src/services/dataExtractor/salesWorkflow/eligibility.service.js'), FP_ELIG);
        assert.equal(shaFile('src/services/dataExtractor/salesWorkflow/crmAdapter.service.js'), FP_CRM);
        assert.throws(() => assertSafeEnvironment('PRODUCTION'), /Unsafe environment/);
        assert.throws(() => assertLocalTarget('https://api.render.com'), /rejected/);
        assert.throws(() => rejectTenantOverrides({ companyId: 'x' }), /companyId\/tenantId/);
        const forced = forceSimulationOnly({ productionActivated: true, rollbackExecuted: true });
        assert.equal(forced.simulationOnly, true);
        assert.equal(forced.productionActivated, false);
        assert.equal(forced.rollbackExecuted, false);
        assert.equal(forced.phase27Authorized, false);
        const routes = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src/routes/v1/dataExtractor.routes.js'), 'utf8');
        assert.match(routes, /enterprise-operations/);
        for (const bad of ['activate-production', 'deploy-now', 'go-live', 'execute-release', 'rollback-now', 'backup-now', 'restore-now', 'run-migration', 'render-deploy', 'git-commit', 'git-push']) {
            assert.equal(routes.includes(bad), false, bad);
        }
        assert.equal(fs.existsSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../docs/data-extractor/phase-27-implementation.md')), false);
    });

    it('B. permissions missing rejected', async () => {
        await assert.rejects(() => createProgram(companyA, userId, {
            programCode: `${TAG}-X`, programName: 'x', releasePackageId: releaseId, readinessCertificationId: certId, pilotProgramId: pilotId,
        }, noPerm), /permission/i);
    });

    it('C/D. create program isolation defaults unsafe env', async () => {
        const doc = await createProgram(companyA, userId, {
            programCode: `${TAG}-P1`, programName: 'Ops One', releasePackageId: releaseId,
            readinessCertificationId: certId, pilotProgramId: pilotId, proposedEnvironment: 'PRODUCTION_PLANNING_ONLY',
        }, fullUser);
        programId = doc.id || doc._id;
        assert.equal(doc.simulationOnly, true);
        assert.equal(doc.productionExecutionAllowed, false);
        assert.equal(doc.deploymentExecuted, false);
        assert.equal(doc.productionActivated, false);
        assert.equal(doc.rollbackExecuted, false);
        assert.equal(doc.backupExecuted, false);
        assert.equal(doc.restoreExecuted, false);
        assert.equal(doc.migrationExecuted, false);
        await assert.rejects(() => createProgram(companyA, userId, {
            programCode: `${TAG}-BAD`, programName: 'bad', releasePackageId: releaseId, readinessCertificationId: certId,
            pilotProgramId: pilotId, proposedEnvironment: 'PRODUCTION',
        }, fullUser), /Unsafe environment|not allowed/i);
        await assert.rejects(() => getProgram(companyB, programId, fullUser), /not found/i);
        await assert.rejects(() => createProgram(companyA, userId, {
            programCode: `${TAG}-OV`, programName: 'ov', releasePackageId: releaseId, readinessCertificationId: certId,
            pilotProgramId: pilotId, companyId: String(companyB),
        }, fullUser), /companyId\/tenantId/);
    });

    it('E/F. board client blocked; env secrets rejected; freeze conflict', async () => {
        await assert.rejects(() => releaseBoardReview(companyA, userOther, programId, { outcome: 'READY_FOR_OPERATIONAL_REVIEW' }, clientOnly), /Client Admin|permission/i);
        await assert.rejects(() => upsertEnvironment(companyA, userId, { environmentName: 'Prod', password: 'secret' }, fullUser), /Secret fields|secret/i);
        const env = await upsertEnvironment(companyA, userId, { environmentName: 'Local', environmentType: 'Local' }, fullUser);
        assert.equal(env.liveCallsMade, false);
        await createMaintenanceWindow(companyA, userId, {
            operationsProgramId: programId, windowCode: `${TAG}-FZ`, title: 'Freeze',
            plannedStart: new Date(Date.now() + 86400000).toISOString(), plannedEnd: new Date(Date.now() + 2 * 86400000).toISOString(), isChangeFreeze: true,
        }, fullUser);
        const conflict = await createMaintenanceWindow(companyA, userId, {
            operationsProgramId: programId, windowCode: `${TAG}-MW`, title: 'Overlap',
            plannedStart: new Date(Date.now() + 86400000 + 3600000).toISOString(), plannedEnd: new Date(Date.now() + 2 * 86400000 - 3600000).toISOString(),
        }, fullUser);
        assert.equal(conflict.conflictStatus, 'CHANGE_FREEZE_CONFLICT');
        assert.equal(conflict.scheduledExecution, false);
    });

    it('G. changes emergency no deploy', async () => {
        const em = await createChange(companyA, userId, {
            operationsProgramId: programId, changeCode: `${TAG}-E1`, title: 'Emergency plan', changeType: 'EMERGENCY_PLANNING_ONLY', risk: 'CRITICAL',
        }, fullUser);
        assert.equal(em.deploymentExecuted, false);
        await assert.rejects(() => transitionChange(companyA, userId, em.id, { status: 'APPROVED_AS_PLAN' }, fullUser), /separate reviewer/i);
        await transitionChange(companyA, userId, em.id, { status: 'APPROVED_AS_PLAN', reviewedBy: String(userFinal) }, fullUser);
    });

    it('H/I. checklists local health production URL rejected', async () => {
        await completeChecklistsForTests(companyA, userId, programId, fullUser);
        const health = await runLocalHealthCheck(companyA, userId, { targetUrl: 'localhost' }, fullUser);
        assert.equal(health.productionUrlUsed, false);
        await assert.rejects(() => runLocalHealthCheck(companyA, userId, { targetUrl: 'https://prod.example.com' }, fullUser), /rejected|allowlist/i);
        const dash = await healthDashboard(companyA, { operationsProgramId: programId }, fullUser);
        assert.ok(dash.forbiddenActions.includes('Deploy'));
    });

    it('J. incidents SEV1 review + problems', async () => {
        const inc = await createIncident(companyA, userId, {
            operationsProgramId: programId, incidentCode: `${TAG}-I1`, title: 'Sim SEV1', severity: 'SEV1',
        }, fullUser);
        assert.equal(inc.externalNotificationSent, false);
        await assert.rejects(() => transitionIncident(companyA, userId, inc.id, { status: 'CLOSED_AS_SIMULATION' }, fullUser), /separate reviewer/i);
        await transitionIncident(companyA, userId, inc.id, { status: 'CLOSED_AS_SIMULATION', reviewedBy: String(userFinal) }, fullUser);
        const prb = await createProblem(companyA, userId, { operationsProgramId: programId, problemCode: `${TAG}-PR1`, title: 'Known', symptoms: 'x' }, fullUser);
        assert.equal(prb.simulationOnly, true);
    });

    it('L/M. backup restore DR rollback non-executing', async () => {
        assert.equal((await createContinuityPlan(companyA, userId, { operationsProgramId: programId, planType: 'BACKUP_VERIFICATION', title: 'B' }, fullUser)).backupExecuted, false);
        assert.equal((await createContinuityPlan(companyA, userId, { operationsProgramId: programId, planType: 'RESTORE_VERIFICATION', title: 'R' }, fullUser)).restoreExecuted, false);
        assert.equal((await createContinuityPlan(companyA, userId, { operationsProgramId: programId, planType: 'DISASTER_RECOVERY', title: 'D' }, fullUser)).migrationExecuted, false);
        const rb = await createRollbackPlan(companyA, userId, { operationsProgramId: programId, rollbackTrigger: 'Critical', status: 'APPROVED_AS_PLAN' }, fullUser);
        assert.equal(rb.rollbackExecuted, false);
        const decision = await simulateRollbackDecision(companyA, userId, rb.id, { trigger: 'COMPANY_ISOLATION_FAILURE' }, fullUser);
        assert.equal(decision.automaticRollback, false);
        assert.equal(decision.outcome, 'RECOMMEND_ROLLBACK_REVIEW');
        await createMaintenanceWindow(companyA, userId, {
            operationsProgramId: programId, windowCode: `${TAG}-OK`, title: 'Clean',
            plannedStart: new Date(Date.now() + 10 * 86400000).toISOString(), plannedEnd: new Date(Date.now() + 11 * 86400000).toISOString(),
        }, fullUser);
    });

    it('N/O. risks exceptions phase27 recommendation only', async () => {
        const risk = await createRisk(companyA, userId, {
            operationsProgramId: programId, riskCode: `${TAG}-R1`, title: 'Critical risk', likelihood: 5, impact: 5, platformLevel: true,
        }, fullUser);
        assert.equal(risk.inherentScore, 25);
        await assert.rejects(() => acceptRisk(companyA, userOther, risk.id, { reason: 'x', expiry: new Date(Date.now() + 86400000).toISOString() }, clientOnly), /Client Admin|Platform Admin/i);
        await acceptRisk(companyA, userFinal, risk.id, { reason: 'temporary', expiry: new Date(Date.now() + 7 * 86400000).toISOString() }, finalUser);
        await assert.rejects(() => createException(companyA, userId, {
            operationsProgramId: programId, reason: 'bypass', bypassesCriticalIsolation: true, expiry: new Date(Date.now() + 86400000).toISOString(),
        }, fullUser), /cannot be excepted/i);
        await createException(companyA, userId, {
            operationsProgramId: programId, reason: 'doc gap', exceptionType: 'DOCUMENTATION_GAP',
            expiry: new Date(Date.now() + 86400000).toISOString(), compensatingControl: 'manual',
        }, fullUser);
        for (const status of ['PLANNING', 'PENDING_REVIEW', 'READY_FOR_OPERATIONAL_REVIEW', 'READY_FOR_RELEASE_BOARD_REVIEW', 'READY_FOR_MAINTENANCE_WINDOW_REVIEW']) {
            try { await transitionLifecycle(companyA, userId, programId, { status }, fullUser); } catch { /* continue */ }
        }
        const rec = await getRecommendation(companyA, programId, fullUser);
        assert.equal(rec.phase27Authorized, false);
        const closed = await transitionLifecycle(companyA, userFinal, programId, {
            status: 'READY_FOR_PHASE_27_REVIEW', reason: 'Gates met for Phase 27 review only',
        }, finalUser);
        assert.equal(closed.status, 'READY_FOR_PHASE_27_REVIEW');
        assert.equal(closed.phase27Authorized, false);
        assert.equal(closed.phase27Started, false);
        assert.equal(closed.productionActivated, false);
    });

    it('P. audit views export CRM unchanged fingerprints', async () => {
        const view = await createSavedView(companyA, userId, { name: 'Ready P27', viewKey: 'ready_phase27', filters: { status: 'READY_FOR_PHASE_27_REVIEW' } }, fullUser);
        assert.equal(String(view.userId), String(userId));
        const audit = await listAudit(companyA, { operationsProgramId: programId }, fullUser);
        assert.equal(audit.appendOnly, true);
        const report = await exportReport(companyA, userId, { operationsProgramId: programId }, fullUser);
        assert.equal(report.secretsExcluded, true);
        assert.equal(report.deploymentPackageIncluded, false);
        assert.equal(await mongoose.connection.db.collection('leads').countDocuments({}), baselineLeads);
        assert.equal(shaFile('src/services/dataExtractor/salesWorkflow/eligibility.service.js'), FP_ELIG);
        assert.equal(shaFile('src/services/dataExtractor/salesWorkflow/crmAdapter.service.js'), FP_CRM);
    });
});