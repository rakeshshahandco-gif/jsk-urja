import { ApiError } from '../../../utils/ApiError.js';
import { PilotPauseRequest } from '../../../models/pilotPauseRequest.model.js';
import { PilotRollbackPlan } from '../../../models/pilotRollbackPlan.model.js';
import { PERMS } from './constants.js';
import { assertView, assertPerm } from './permissions.util.js';
import {
    rejectTenantOverrides, assertSafeText, assertPayloadSafe, notDeleted,
    forceSimulationOnly, stripUnsafeWriteFields,
} from './normalize.util.js';
import { writeAudit } from './audit.util.js';
import { loadScopedProgram } from './pilotProgram.service.js';

export async function createPauseRequest(companyId, userId, body = {}, user = null) {
    assertPerm(user, PERMS.pause_review);
    rejectTenantOverrides(body);
    assertPayloadSafe(body);
    const safe = stripUnsafeWriteFields(body);
    const program = await loadScopedProgram(companyId, safe.pilotProgramId);
    const doc = await PilotPauseRequest.create({
        companyId,
        pilotProgramId: program._id,
        requestType: safe.requestType === 'SUSPENSION' ? 'SUSPENSION' : 'PAUSE',
        reason: assertSafeText(safe.reason || '', 'reason'),
        reasonCategory: safe.reasonCategory || 'CRITICAL_DEFECT',
        status: 'REQUESTED',
        simulationOnly: true,
        runtimeActionExecuted: false,
        createdBy: userId,
        updatedBy: userId,
    });
    await writeAudit(companyId, userId, 'PAUSE_REQUEST', 'PilotPauseRequest', doc._id, {}, { pilotProgramId: program._id });
    return forceSimulationOnly({ ...doc.toObject(), id: String(doc._id), runtimeActionExecuted: false });
}

export async function reviewPauseRequest(companyId, userId, id, body = {}, user = null) {
    const perm = body.requestType === 'SUSPENSION' || body.asSuspension ? PERMS.suspension_review : PERMS.pause_review;
    assertPerm(user, perm);
    rejectTenantOverrides(body);
    const doc = await PilotPauseRequest.findOne({ _id: id, companyId, ...notDeleted() });
    if (!doc) throw new ApiError(404, 'Pause/suspension request not found');
    const next = body.approve === false ? 'REJECTED' : (doc.requestType === 'SUSPENSION' ? 'SUSPENSION_PLAN_RECORDED' : 'SIMULATED_PAUSE');
    doc.status = next;
    doc.reviewNotes = assertSafeText(body.reviewNotes || '', 'reviewNotes');
    doc.reviewedBy = userId;
    doc.runtimeActionExecuted = false;
    doc.simulationOnly = true;
    doc.updatedBy = userId;
    await doc.save();
    await writeAudit(companyId, userId, 'PAUSE_REVIEW', 'PilotPauseRequest', doc._id, { status: next }, { pilotProgramId: doc.pilotProgramId });
    return forceSimulationOnly({ ...doc.toObject(), id: String(doc._id), runtimeActionExecuted: false });
}

export async function listPauseRequests(companyId, query = {}, user = null) {
    assertView(user);
    rejectTenantOverrides(query);
    const q = { ...notDeleted(), companyId };
    if (query.pilotProgramId) q.pilotProgramId = query.pilotProgramId;
    const items = await PilotPauseRequest.find(q).sort({ createdAt: -1 }).limit(100).lean();
    return { items: items.map((d) => forceSimulationOnly({ ...d, id: String(d._id) })) };
}

export async function createRollbackPlan(companyId, userId, body = {}, user = null) {
    assertPerm(user, PERMS.rollback_plan);
    rejectTenantOverrides(body);
    assertPayloadSafe(body);
    const safe = stripUnsafeWriteFields(body);
    const program = await loadScopedProgram(companyId, safe.pilotProgramId);
    const doc = await PilotRollbackPlan.create({
        companyId,
        pilotProgramId: program._id,
        rollbackTrigger: assertSafeText(safe.rollbackTrigger || 'Critical pilot failure', 'rollbackTrigger'),
        rollbackOwnerUserId: userId,
        decisionAuthority: safe.decisionAuthority || 'PLATFORM_ADMIN',
        affectedCompanies: safe.affectedCompanies || [],
        affectedIndustries: safe.affectedIndustries || [],
        affectedModules: safe.affectedModules || [],
        affectedFeatures: safe.affectedFeatures || [],
        dataImpact: assertSafeText(safe.dataImpact || '', 'dataImpact'),
        configurationImpact: assertSafeText(safe.configurationImpact || '', 'configurationImpact'),
        estimatedDurationHours: Number(safe.estimatedDurationHours || 4),
        recoveryPointObjective: safe.recoveryPointObjective || '',
        recoveryTimeObjective: safe.recoveryTimeObjective || '',
        backupDependency: safe.backupDependency !== false,
        migrationDependency: false,
        validationChecklist: safe.validationChecklist || [],
        communicationPlan: assertSafeText(safe.communicationPlan || '', 'communicationPlan'),
        postRollbackVerification: safe.postRollbackVerification || [],
        readinessStatus: 'DRAFT',
        readinessScore: 0,
        simulationOnly: true,
        rollbackExecuted: false,
        productionRestored: false,
        createdBy: userId,
        updatedBy: userId,
    });
    await writeAudit(companyId, userId, 'ROLLBACK_PLAN_CREATE', 'PilotRollbackPlan', doc._id, {}, { pilotProgramId: program._id });
    return forceSimulationOnly({ ...doc.toObject(), id: String(doc._id) });
}

export async function simulateRollback(companyId, userId, id, body = {}, user = null) {
    assertPerm(user, PERMS.rollback_plan);
    rejectTenantOverrides(body);
    const doc = await PilotRollbackPlan.findOne({ _id: id, companyId, ...notDeleted() });
    if (!doc) throw new ApiError(404, 'Rollback plan not found');
    const failed = body.forceFail === true;
    doc.simulationResult = {
        ranAt: new Date().toISOString(),
        passed: !failed,
        notes: 'Simulation only — no rollback executed',
        rollbackExecuted: false,
        productionRestored: false,
    };
    doc.readinessStatus = failed ? 'SIMULATION_FAILED' : 'SIMULATION_PASSED';
    doc.readinessScore = failed ? 20 : 85;
    doc.rollbackExecuted = false;
    doc.productionRestored = false;
    doc.simulationOnly = true;
    doc.updatedBy = userId;
    await doc.save();
    await writeAudit(companyId, userId, 'ROLLBACK_SIMULATE', 'PilotRollbackPlan', doc._id, { failed }, { pilotProgramId: doc.pilotProgramId });
    return forceSimulationOnly({ ...doc.toObject(), id: String(doc._id), rollbackExecuted: false });
}

export async function listRollbackPlans(companyId, query = {}, user = null) {
    assertView(user);
    rejectTenantOverrides(query);
    const q = { ...notDeleted(), companyId };
    if (query.pilotProgramId) q.pilotProgramId = query.pilotProgramId;
    const items = await PilotRollbackPlan.find(q).sort({ createdAt: -1 }).limit(50).lean();
    return { items: items.map((d) => forceSimulationOnly({ ...d, id: String(d._id) })) };
}