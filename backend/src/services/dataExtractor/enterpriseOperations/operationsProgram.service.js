import { ApiError } from '../../../utils/ApiError.js';
import { OperationsProgram } from '../../../models/operationsProgram.model.js';
import { ReleasePackage } from '../../../models/releasePackage.model.js';
import { ProductionReadinessCertification } from '../../../models/productionReadinessCertification.model.js';
import { PilotProgram } from '../../../models/pilotProgram.model.js';
import { OpsRisk } from '../../../models/opsRisk.model.js';
import { OpsRollbackPlan } from '../../../models/opsRollbackPlan.model.js';
import { OpsContinuityPlan } from '../../../models/opsContinuityPlan.model.js';
import { OpsMaintenanceWindow } from '../../../models/opsMaintenanceWindow.model.js';
import {
    ALLOWED_TRANSITIONS, DEFAULT_OPS_CHECKLIST, DEFAULT_GOLIVE_CHECKLIST, PERMS,
} from './constants.js';
import { assertView, assertPerm, isClientAdminOnly } from './permissions.util.js';
import {
    rejectTenantOverrides, assertNoSecrets, assertSafeText, assertPayloadSafe,
    notDeleted, forceSimulationOnly, assertSafeEnvironment, assertSafeStatus, stripUnsafeWriteFields,
} from './normalize.util.js';
import { writeAudit } from './audit.util.js';
import { getSettings } from './settings.service.js';

function assertTransition(from, to) {
    const allowed = ALLOWED_TRANSITIONS[from] || [];
    if (!allowed.includes(to)) throw new ApiError(400, `Invalid operations transition ${from} -> ${to}`);
}

export async function loadScopedProgram(companyId, id) {
    const doc = await OperationsProgram.findOne({ _id: id, ...notDeleted() });
    if (!doc) throw new ApiError(404, 'Operations program not found');
    if (!doc.platformScoped && String(doc.companyId) !== String(companyId)) {
        throw new ApiError(404, 'Operations program not found');
    }
    return doc;
}

async function verifyLinks(companyId, releasePackageId, readinessCertificationId, pilotProgramId) {
    if (!releasePackageId) throw new ApiError(400, 'Phase 23 releasePackageId is required');
    if (!readinessCertificationId) throw new ApiError(400, 'Phase 24 readinessCertificationId is required');
    if (!pilotProgramId) throw new ApiError(400, 'Phase 25 pilotProgramId is required');

    const release = await ReleasePackage.findOne({ _id: releasePackageId, isDeleted: { $ne: true } }).lean();
    if (!release) throw new ApiError(400, 'Phase 23 release package not found');
    if (release.companyId && String(release.companyId) !== String(companyId) && !release.platformScoped) {
        throw new ApiError(403, 'Release package company scope mismatch');
    }

    const cert = await ProductionReadinessCertification.findOne({ _id: readinessCertificationId, isDeleted: { $ne: true } }).lean();
    if (!cert) throw new ApiError(400, 'Phase 24 readiness certification not found');
    if (cert.companyId && String(cert.companyId) !== String(companyId) && !cert.platformScoped) {
        throw new ApiError(403, 'Certification company scope mismatch');
    }
    if (['REJECTED', 'EXPIRED', 'ARCHIVED'].includes(cert.status)) {
        throw new ApiError(400, 'Invalid/expired Phase 24 certification');
    }

    const pilot = await PilotProgram.findOne({ _id: pilotProgramId, isDeleted: { $ne: true } }).lean();
    if (!pilot) throw new ApiError(400, 'Phase 25 pilot program not found');
    if (pilot.companyId && String(pilot.companyId) !== String(companyId) && !pilot.platformScoped) {
        throw new ApiError(403, 'Pilot program company scope mismatch');
    }
    if (!['READY_FOR_PHASE_26_REVIEW', 'PILOT_CLOSURE_RECOMMENDED', 'UAT_COMPLETED', 'ARCHIVED'].includes(pilot.status)
        && pilot.recommendation !== 'READY_FOR_PHASE_26_REVIEW') {
        // allow if pilot closed/recommended; otherwise soft-require closure status
        if (!['READY_FOR_PHASE_26_REVIEW', 'PILOT_CLOSURE_RECOMMENDED'].includes(pilot.status)) {
            throw new ApiError(400, 'Phase 25 pilot closure/recommendation required');
        }
    }
    return { release, cert, pilot };
}

export async function listPrograms(companyId, query = {}, user = null) {
    assertView(user);
    rejectTenantOverrides(query);
    const q = { ...notDeleted(), companyId };
    if (query.status) q.status = String(query.status);
    const items = await OperationsProgram.find(q).sort({ createdAt: -1 }).limit(100).lean();
    return { items: items.map((d) => forceSimulationOnly({ ...d, id: String(d._id) })) };
}

export async function getProgram(companyId, id, user = null) {
    assertView(user);
    const doc = await loadScopedProgram(companyId, id);
    return forceSimulationOnly({ ...doc.toObject(), id: String(doc._id) });
}

export async function createProgram(companyId, userId, body = {}, user = null) {
    assertPerm(user, PERMS.create);
    rejectTenantOverrides(body);
    assertNoSecrets(body);
    assertPayloadSafe(body);
    const safe = stripUnsafeWriteFields(body);
    if (isClientAdminOnly(user) && safe.platformScoped) {
        throw new ApiError(403, 'Client Admin cannot create platform-scoped operations programs');
    }
    await verifyLinks(companyId, safe.releasePackageId, safe.readinessCertificationId, safe.pilotProgramId);
    const proposedEnvironment = assertSafeEnvironment(safe.proposedEnvironment || 'PRODUCTION_PLANNING_ONLY');
    const programCode = String(safe.programCode || `OPS-${Date.now()}`).slice(0, 80);
    const doc = await OperationsProgram.create({
        companyId,
        platformScoped: false,
        programCode,
        programName: assertSafeText(safe.programName || programCode, 'programName'),
        description: assertSafeText(safe.description || '', 'description'),
        releasePackageId: safe.releasePackageId,
        readinessCertificationId: safe.readinessCertificationId,
        pilotProgramId: safe.pilotProgramId,
        pilotClosureId: String(safe.pilotClosureId || safe.pilotProgramId || ''),
        proposedEnvironment,
        releaseVersion: String(safe.releaseVersion || '').slice(0, 80),
        releaseType: safe.releaseType || 'FEATURE_RELEASE',
        riskLevel: safe.riskLevel || 'MEDIUM',
        businessCriticality: safe.businessCriticality || 'MEDIUM',
        plannedWindowStart: safe.plannedWindowStart || null,
        plannedWindowEnd: safe.plannedWindowEnd || null,
        expectedDurationHours: Number(safe.expectedDurationHours || 4),
        expectedDowntimeMinutes: Number(safe.expectedDowntimeMinutes || 0),
        expectedCustomerImpact: safe.expectedCustomerImpact || 'LOW',
        ownerUserId: userId,
        technicalOwnerUserId: safe.technicalOwnerUserId || userId,
        businessOwnerUserId: safe.businessOwnerUserId || userId,
        operationalChecklist: DEFAULT_OPS_CHECKLIST.map((c) => ({ ...c, status: 'PENDING', passed: false })),
        goLiveChecklist: DEFAULT_GOLIVE_CHECKLIST.map((c) => ({ ...c, status: 'PENDING', passed: false })),
        recommendation: 'NOT_READY',
        status: 'DRAFT',
        simulationOnly: true,
        productionExecutionAllowed: false,
        deploymentExecuted: false,
        productionActivated: false,
        rollbackExecuted: false,
        backupExecuted: false,
        restoreExecuted: false,
        migrationExecuted: false,
        createdBy: userId,
        updatedBy: userId,
    });
    await writeAudit(companyId, userId, 'PROGRAM_CREATE', 'OperationsProgram', doc._id, { programCode }, { operationsProgramId: doc._id });
    return forceSimulationOnly({ ...doc.toObject(), id: String(doc._id) });
}

export async function updateProgram(companyId, userId, id, body = {}, user = null) {
    assertPerm(user, PERMS.update);
    rejectTenantOverrides(body);
    assertPayloadSafe(body);
    const doc = await loadScopedProgram(companyId, id);
    if (!['DRAFT', 'PLANNING', 'CHANGES_REQUIRED', 'PENDING_REVIEW'].includes(doc.status)) {
        throw new ApiError(400, 'Program not editable in current status');
    }
    const safe = stripUnsafeWriteFields(body);
    if (safe.proposedEnvironment) doc.proposedEnvironment = assertSafeEnvironment(safe.proposedEnvironment);
    if (safe.programName) doc.programName = assertSafeText(safe.programName, 'programName');
    if (safe.description != null) doc.description = assertSafeText(safe.description, 'description');
    if (safe.riskLevel) doc.riskLevel = safe.riskLevel;
    if (safe.productionControlPlan) {
        const plan = { ...safe.productionControlPlan };
        if (['EXECUTING', 'EXECUTED', 'DEPLOYED', 'ACTIVATED', 'LIVE'].includes(plan.status)) {
            throw new ApiError(400, 'Production control plan cannot be EXECUTING/DEPLOYED');
        }
        plan.status = plan.status || 'PLANNED';
        doc.productionControlPlan = plan;
    }
    if (safe.monitoringPlan) doc.monitoringPlan = safe.monitoringPlan;
    if (safe.hypercarePlan) doc.hypercarePlan = safe.hypercarePlan;
    if (safe.communicationPlan) doc.communicationPlan = safe.communicationPlan;
    doc.simulationOnly = true;
    doc.productionExecutionAllowed = false;
    doc.deploymentExecuted = false;
    doc.productionActivated = false;
    doc.rollbackExecuted = false;
    doc.backupExecuted = false;
    doc.restoreExecuted = false;
    doc.migrationExecuted = false;
    doc.updatedBy = userId;
    await doc.save();
    await writeAudit(companyId, userId, 'PROGRAM_UPDATE', 'OperationsProgram', doc._id, {}, { operationsProgramId: doc._id });
    return forceSimulationOnly({ ...doc.toObject(), id: String(doc._id) });
}

export async function transitionLifecycle(companyId, userId, id, body = {}, user = null) {
    assertPerm(user, PERMS.review);
    rejectTenantOverrides(body);
    const doc = await loadScopedProgram(companyId, id);
    const next = assertSafeStatus(String(body.status || body.nextStatus || ''));
    if (!next) throw new ApiError(400, 'nextStatus required');
    assertTransition(doc.status, next);
    if (next === 'READY_FOR_PHASE_27_REVIEW') {
        assertPerm(user, PERMS.final_review);
        if (String(doc.createdBy) === String(userId) && (await getSettings(companyId, user)).settings.requireIndependentFinalReviewer) {
            throw new ApiError(403, 'Requestor cannot final-approve own release when segregation required');
        }
        const gates = await evaluatePhase27Gates(companyId, doc);
        if (!gates.eligible) throw new ApiError(400, `Phase 27 review blocked: ${gates.blockers.join('; ')}`);
        doc.recommendation = 'READY_FOR_PHASE_27_REVIEW';
        doc.recommendationReason = assertSafeText(body.reason || 'Operational gates satisfied for Phase 27 consideration only', 'reason');
    }
    const prev = doc.status;
    doc.status = next;
    doc.simulationOnly = true;
    doc.productionExecutionAllowed = false;
    doc.deploymentExecuted = false;
    doc.productionActivated = false;
    doc.rollbackExecuted = false;
    doc.backupExecuted = false;
    doc.restoreExecuted = false;
    doc.migrationExecuted = false;
    doc.updatedBy = userId;
    await doc.save();
    await writeAudit(companyId, userId, 'LIFECYCLE_TRANSITION', 'OperationsProgram', doc._id, { from: prev, to: next }, { operationsProgramId: doc._id, reason: body.reason || '' });
    return forceSimulationOnly({ ...doc.toObject(), id: String(doc._id), phase27Authorized: false, phase27Started: false });
}

export async function evaluatePhase27Gates(companyId, program) {
    const settings = await getSettings(companyId, { permissions: [PERMS.view, PERMS.manage], roleName: 'platform_admin' });
    const s = settings.settings;
    const blockers = [];
    if (!program.releasePackageId) blockers.push('missing Phase 23 linkage');
    if (!program.readinessCertificationId) blockers.push('missing Phase 24 linkage');
    if (!program.pilotProgramId) blockers.push('missing Phase 25 linkage');

    const openCriticalRisks = await OpsRisk.countDocuments({
        operationsProgramId: program._id, isDeleted: { $ne: true },
        $or: [
            { inherentScore: { $gte: 20 }, status: { $nin: ['CLOSED', 'ACCEPTED', 'MITIGATED'] } },
            { criticalUnmitigated: true, status: { $nin: ['CLOSED', 'ACCEPTED', 'MITIGATED'] } },
        ],
    });
    if (openCriticalRisks > 0) blockers.push('open critical risks');

    const expiredAccepted = await OpsRisk.countDocuments({
        operationsProgramId: program._id, acceptedRisk: true, acceptanceExpiry: { $lt: new Date() }, isDeleted: { $ne: true },
    });
    if (expiredAccepted > 0) blockers.push('expired accepted risks');

    if (s.requireRollbackPlan) {
        const rb = await OpsRollbackPlan.findOne({ operationsProgramId: program._id, isDeleted: { $ne: true } }).lean();
        if (!rb || !['APPROVED_AS_PLAN', 'READY_FOR_PHASE_27_REVIEW', 'UNDER_REVIEW'].includes(rb.status)) {
            if (!rb || rb.status === 'DRAFT' || rb.status === 'REJECTED') blockers.push('missing rollback plan');
        }
        if (rb && rb.rollbackExecuted) blockers.push('rollback execution flag must remain false');
    }
    if (s.requireBackupVerificationPlan) {
        const b = await OpsContinuityPlan.findOne({ operationsProgramId: program._id, planType: 'BACKUP_VERIFICATION', isDeleted: { $ne: true } }).lean();
        if (!b) blockers.push('missing backup verification plan');
    }
    if (s.requireRestoreVerificationPlan) {
        const r = await OpsContinuityPlan.findOne({ operationsProgramId: program._id, planType: 'RESTORE_VERIFICATION', isDeleted: { $ne: true } }).lean();
        if (!r) blockers.push('missing restore verification plan');
    }
    if (s.requireDrPlan) {
        const d = await OpsContinuityPlan.findOne({ operationsProgramId: program._id, planType: 'DISASTER_RECOVERY', isDeleted: { $ne: true } }).lean();
        if (!d) blockers.push('missing DR plan');
    }
    if (s.requireMonitoringPlan && !program.monitoringPlan) blockers.push('missing monitoring plan');
    if (s.requireCommunicationPlan && !program.communicationPlan) blockers.push('missing communication plan');
    if (s.requireHypercarePlan && !program.hypercarePlan) blockers.push('missing hypercare plan');
    if (s.requireMaintenanceWindow) {
        const w = await OpsMaintenanceWindow.findOne({ operationsProgramId: program._id, isDeleted: { $ne: true } }).lean();
        if (!w) blockers.push('missing maintenance window');
    }
    if (s.requireOperationalChecklist) {
        const failed = (program.operationalChecklist || []).filter((c) => c.critical && c.status === 'FAIL');
        if (failed.length) blockers.push('operational checklist critical failures');
        const pendingCritical = (program.operationalChecklist || []).filter((c) => c.critical && !['PASS', 'NOT_APPLICABLE'].includes(c.status));
        if (pendingCritical.length) blockers.push('operational checklist incomplete');
    }
    if (s.requireGoLiveChecklist) {
        const pendingCritical = (program.goLiveChecklist || []).filter((c) => c.critical && !['PASS', 'NOT_APPLICABLE'].includes(c.status));
        if (pendingCritical.length) blockers.push('go-live checklist incomplete');
    }

    return {
        eligible: blockers.length === 0,
        blockers,
        phase27Authorized: false,
        phase27Started: false,
        note: 'READY_FOR_PHASE_27_REVIEW is recommendation only; not deployment or Phase 27 authorization',
    };
}

export async function getSummary(companyId, id, user = null) {
    assertView(user);
    const doc = await loadScopedProgram(companyId, id);
    const gates = await evaluatePhase27Gates(companyId, doc);
    return forceSimulationOnly({
        id: String(doc._id),
        programCode: doc.programCode,
        status: doc.status,
        recommendation: doc.recommendation,
        gates,
        simulationOnly: true,
        productionActivated: false,
        deploymentExecuted: false,
    });
}

export async function getRecommendation(companyId, id, user = null) {
    assertView(user);
    const doc = await loadScopedProgram(companyId, id);
    const gates = await evaluatePhase27Gates(companyId, doc);
    return forceSimulationOnly({
        operationsProgramId: String(doc._id),
        recommendation: doc.recommendation,
        recommendationReason: doc.recommendationReason,
        status: doc.status,
        gates,
        phase27Authorized: false,
        phase27Started: false,
        note: 'READY_FOR_PHASE_27_REVIEW is recommendation only. It is not deployment authorization, production activation, or permission to execute Git, Render, backup, restore, migration or rollback.',
    });
}