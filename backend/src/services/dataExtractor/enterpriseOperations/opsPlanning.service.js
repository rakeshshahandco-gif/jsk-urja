import { ApiError } from '../../../utils/ApiError.js';
import { OpsMaintenanceWindow } from '../../../models/opsMaintenanceWindow.model.js';
import { PERMS, ROLLBACK_TRIGGERS } from './constants.js';
import { assertView, assertPerm, isClientAdminOnly, isPlatformAdmin } from './permissions.util.js';
import {
    rejectTenantOverrides, assertSafeText, assertPayloadSafe, notDeleted,
    forceSimulationOnly, stripUnsafeWriteFields, assertNoSecrets, assertLocalTarget, assertSafeStatus,
} from './normalize.util.js';
import { writeAudit } from './audit.util.js';
import { loadScopedProgram } from './operationsProgram.service.js';
import { OpsRollbackPlan } from '../../../models/opsRollbackPlan.model.js';
import { OpsContinuityPlan } from '../../../models/opsContinuityPlan.model.js';

const environmentStore = new Map(); // in-memory supplement; also persist on program when needed

export async function upsertEnvironment(companyId, userId, body = {}, user = null) {
    assertPerm(user, PERMS.environment_inventory);
    rejectTenantOverrides(body);
    assertPayloadSafe(body);
    assertNoSecrets(body);
    const safe = stripUnsafeWriteFields(body);
    if (safe.password || safe.token || safe.apiKey || safe.mongoUri || safe.credentials) {
        throw new ApiError(400, 'Secret fields rejected in environment inventory');
    }
    const record = {
        companyId: String(companyId),
        environmentName: assertSafeText(safe.environmentName || 'Local', 'environmentName'),
        environmentType: safe.environmentType || 'Local',
        applicationVersion: safe.applicationVersion || '',
        backendVersion: safe.backendVersion || '',
        frontendVersion: safe.frontendVersion || '',
        databaseType: safe.databaseType || 'MongoDB',
        databaseVersionMetadata: safe.databaseVersionMetadata || '',
        owner: String(userId),
        risk: safe.risk || 'LOW',
        lastReviewDate: new Date().toISOString(),
        simulationOnly: true,
        liveCallsMade: false,
    };
    const key = `${companyId}:${record.environmentName}`;
    environmentStore.set(key, record);
    await writeAudit(companyId, userId, 'ENVIRONMENT_UPSERT', 'EnvironmentInventory', null, { environmentName: record.environmentName });
    return forceSimulationOnly({ ...record, id: key });
}

export async function listEnvironments(companyId, query = {}, user = null) {
    assertView(user);
    rejectTenantOverrides(query);
    const items = [...environmentStore.values()].filter((e) => e.companyId === String(companyId));
    return { items: items.map((d) => forceSimulationOnly(d)) };
}

export async function createMaintenanceWindow(companyId, userId, body = {}, user = null) {
    assertPerm(user, PERMS.maintenance_window);
    rejectTenantOverrides(body);
    assertPayloadSafe(body);
    const safe = stripUnsafeWriteFields(body);
    const program = safe.operationsProgramId ? await loadScopedProgram(companyId, safe.operationsProgramId) : null;
    const plannedStart = new Date(safe.plannedStart || Date.now());
    const plannedEnd = new Date(safe.plannedEnd || Date.now() + 3600000);
    if (plannedEnd <= plannedStart) throw new ApiError(400, 'plannedEnd must be after plannedStart');

    const overlapping = await OpsMaintenanceWindow.find({
        companyId, ...notDeleted(),
        plannedStart: { $lt: plannedEnd },
        plannedEnd: { $gt: plannedStart },
        isBlackout: true,
    }).lean();
    const freeze = await OpsMaintenanceWindow.find({
        companyId, ...notDeleted(),
        isChangeFreeze: true,
        plannedStart: { $lt: plannedEnd },
        plannedEnd: { $gt: plannedStart },
    }).lean();

    let conflictStatus = 'NONE';
    if (overlapping.length) conflictStatus = 'BLACKOUT_CONFLICT';
    if (freeze.length) conflictStatus = 'CHANGE_FREEZE_CONFLICT';

    if (safe.rollbackPlanRequired !== false && program) {
        const rb = await OpsRollbackPlan.findOne({ operationsProgramId: program._id, isDeleted: { $ne: true } });
        if (!rb) conflictStatus = conflictStatus === 'NONE' ? 'MISSING_ROLLBACK_PLAN' : conflictStatus;
    }

    const doc = await OpsMaintenanceWindow.create({
        companyId,
        operationsProgramId: program?._id || null,
        windowCode: String(safe.windowCode || `MW-${Date.now()}`).slice(0, 80),
        title: assertSafeText(safe.title || 'Maintenance window', 'title'),
        plannedStart,
        plannedEnd,
        timezone: safe.timezone || 'Asia/Kolkata',
        expectedDurationMinutes: Number(safe.expectedDurationMinutes || 60),
        affectedModules: safe.affectedModules || [],
        affectedCompanies: safe.affectedCompanies || [],
        affectedIndustries: safe.affectedIndustries || [],
        expectedDowntimeMinutes: Number(safe.expectedDowntimeMinutes || 0),
        expectedDegradation: safe.expectedDegradation || 'NONE',
        ownerUserId: userId,
        backupVerificationRequired: safe.backupVerificationRequired !== false,
        rollbackPlanRequired: safe.rollbackPlanRequired !== false,
        communicationRequired: safe.communicationRequired !== false,
        conflictStatus,
        approvalStatus: 'PENDING',
        readinessResult: conflictStatus === 'NONE' ? 'PENDING' : 'BLOCKED',
        isChangeFreeze: !!safe.isChangeFreeze,
        isBlackout: !!safe.isBlackout,
        simulationOnly: true,
        scheduledExecution: false,
        createdBy: userId,
        updatedBy: userId,
    });
    await writeAudit(companyId, userId, 'MAINTENANCE_WINDOW_CREATE', 'OpsMaintenanceWindow', doc._id, { conflictStatus }, { operationsProgramId: program?._id });
    return forceSimulationOnly({ ...doc.toObject(), id: String(doc._id), scheduledExecution: false });
}

export async function listMaintenanceWindows(companyId, query = {}, user = null) {
    assertView(user);
    rejectTenantOverrides(query);
    const q = { ...notDeleted(), companyId };
    if (query.operationsProgramId) q.operationsProgramId = query.operationsProgramId;
    const items = await OpsMaintenanceWindow.find(q).sort({ plannedStart: 1 }).limit(100).lean();
    return { items: items.map((d) => forceSimulationOnly({ ...d, id: String(d._id) })) };
}

export async function listCalendar(companyId, query = {}, user = null) {
    assertView(user);
    rejectTenantOverrides(query);
    const windows = await OpsMaintenanceWindow.find({ companyId, ...notDeleted() }).sort({ plannedStart: 1 }).limit(100).lean();
    return forceSimulationOnly({
        items: windows.map((w) => ({
            type: w.isChangeFreeze ? 'CHANGE_FREEZE' : (w.isBlackout ? 'BLACKOUT' : 'MAINTENANCE_WINDOW'),
            code: w.windowCode,
            title: w.title,
            start: w.plannedStart,
            end: w.plannedEnd,
            conflictStatus: w.conflictStatus,
            planningOnly: true,
        })),
        scheduledJobs: 0,
    });
}

export async function createRollbackPlan(companyId, userId, body = {}, user = null) {
    assertPerm(user, PERMS.rollback_plan);
    rejectTenantOverrides(body);
    assertPayloadSafe(body);
    const safe = stripUnsafeWriteFields(body);
    const program = await loadScopedProgram(companyId, safe.operationsProgramId);
    const doc = await OpsRollbackPlan.create({
        companyId,
        operationsProgramId: program._id,
        rollbackTrigger: assertSafeText(safe.rollbackTrigger || 'Critical failure', 'rollbackTrigger'),
        decisionAuthority: safe.decisionAuthority || 'PLATFORM_ADMIN',
        requiredApprovals: safe.requiredApprovals || ['PLATFORM_ADMIN'],
        affectedCompanies: safe.affectedCompanies || [],
        affectedIndustries: safe.affectedIndustries || [],
        affectedModules: safe.affectedModules || [],
        dataImpact: assertSafeText(safe.dataImpact || '', 'dataImpact'),
        expectedDurationHours: Number(safe.expectedDurationHours || 4),
        validationChecklist: safe.validationChecklist || [],
        communicationPlan: assertSafeText(safe.communicationPlan || '', 'communicationPlan'),
        postRollbackChecks: safe.postRollbackChecks || [],
        linkedReleaseVersion: safe.linkedReleaseVersion || '',
        targetRollbackVersion: safe.targetRollbackVersion || '',
        decisionMatrix: ROLLBACK_TRIGGERS.map((t) => ({
            trigger: t,
            outcome: ['TENANT_ISOLATION_FAILURE', 'COMPANY_ISOLATION_FAILURE', 'INDUSTRY_ISOLATION_FAILURE', 'CRITICAL_SECURITY_FAILURE'].includes(t)
                ? 'RECOMMEND_ROLLBACK_REVIEW' : 'CONTINUE_MONITORING',
        })),
        status: ['DRAFT','UNDER_REVIEW','APPROVED_AS_PLAN'].includes(safe.status) ? safe.status : 'DRAFT',
        simulationOnly: true,
        rollbackExecuted: false,
        createdBy: userId,
        updatedBy: userId,
    });
    await writeAudit(companyId, userId, 'ROLLBACK_PLAN_CREATE', 'OpsRollbackPlan', doc._id, {}, { operationsProgramId: program._id });
    return forceSimulationOnly({ ...doc.toObject(), id: String(doc._id) });
}

export async function simulateRollbackDecision(companyId, userId, id, body = {}, user = null) {
    assertPerm(user, PERMS.rollback_plan);
    rejectTenantOverrides(body);
    const doc = await OpsRollbackPlan.findOne({ _id: id, companyId, ...notDeleted() });
    if (!doc) throw new ApiError(404, 'Rollback plan not found');
    const trigger = String(body.trigger || 'CRITICAL_SECURITY_FAILURE');
    const row = (doc.decisionMatrix || []).find((r) => r.trigger === trigger);
    const outcome = row?.outcome || 'REQUIRE_EMERGENCY_REVIEW';
    doc.status = 'UNDER_REVIEW';
    doc.rollbackExecuted = false;
    doc.updatedBy = userId;
    await doc.save();
    await writeAudit(companyId, userId, 'ROLLBACK_DECISION_SIMULATE', 'OpsRollbackPlan', doc._id, { trigger, outcome }, { operationsProgramId: doc.operationsProgramId });
    return forceSimulationOnly({
        id: String(doc._id),
        trigger,
        outcome,
        automaticRollback: false,
        rollbackExecuted: false,
        note: 'Simulation only — no rollback executed',
    });
}

export async function createContinuityPlan(companyId, userId, body = {}, user = null) {
    const type = String(body.planType || '');
    const permMap = {
        BACKUP_VERIFICATION: PERMS.backup_plan,
        RESTORE_VERIFICATION: PERMS.restore_plan,
        DISASTER_RECOVERY: PERMS.dr_plan,
        BUSINESS_CONTINUITY: PERMS.dr_plan,
        EMERGENCY_STOP: PERMS.rollback_plan,
    };
    assertPerm(user, permMap[type] || PERMS.manage);
    rejectTenantOverrides(body);
    assertPayloadSafe(body);
    const safe = stripUnsafeWriteFields(body);
    if (!permMap[type]) throw new ApiError(400, 'Invalid continuity plan type');
    const program = await loadScopedProgram(companyId, safe.operationsProgramId);
    const doc = await OpsContinuityPlan.create({
        companyId,
        operationsProgramId: program._id,
        planType: type,
        title: assertSafeText(safe.title || type, 'title'),
        description: assertSafeText(safe.description || '', 'description'),
        scope: assertSafeText(safe.scope || '', 'scope'),
        rto: safe.rto || '',
        rpo: safe.rpo || '',
        steps: safe.steps || [],
        validationChecklist: safe.validationChecklist || [],
        ownerUserId: userId,
        status: 'DRAFT',
        simulationOnly: true,
        backupExecuted: false,
        restoreExecuted: false,
        migrationExecuted: false,
        rollbackExecuted: false,
        createdBy: userId,
        updatedBy: userId,
    });
    await writeAudit(companyId, userId, 'CONTINUITY_PLAN_CREATE', 'OpsContinuityPlan', doc._id, { planType: type }, { operationsProgramId: program._id });
    return forceSimulationOnly({ ...doc.toObject(), id: String(doc._id) });
}

export async function listContinuityPlans(companyId, query = {}, user = null) {
    assertView(user);
    rejectTenantOverrides(query);
    const q = { ...notDeleted(), companyId };
    if (query.operationsProgramId) q.operationsProgramId = query.operationsProgramId;
    if (query.planType) q.planType = query.planType;
    const items = await OpsContinuityPlan.find(q).sort({ createdAt: -1 }).limit(100).lean();
    return { items: items.map((d) => forceSimulationOnly({ ...d, id: String(d._id) })) };
}

export async function listRollbackPlans(companyId, query = {}, user = null) {
    assertView(user);
    rejectTenantOverrides(query);
    const q = { ...notDeleted(), companyId };
    if (query.operationsProgramId) q.operationsProgramId = query.operationsProgramId;
    const items = await OpsRollbackPlan.find(q).sort({ createdAt: -1 }).limit(50).lean();
    return { items: items.map((d) => forceSimulationOnly({ ...d, id: String(d._id) })) };
}

export async function runLocalHealthCheck(companyId, userId, body = {}, user = null) {
    assertPerm(user, PERMS.monitoring_manage);
    rejectTenantOverrides(body);
    const target = assertLocalTarget(body.targetUrl || 'localhost');
    return forceSimulationOnly({
        target,
        result: 'PASS',
        checkedAt: new Date().toISOString(),
        notes: 'Localhost metadata health check only',
        productionUrlUsed: false,
    });
}

export async function updateChecklist(companyId, userId, id, body = {}, user = null) {
    assertPerm(user, PERMS.checklist_manage);
    rejectTenantOverrides(body);
    const doc = await loadScopedProgram(companyId, id);
    const safe = stripUnsafeWriteFields(body);
    const kind = safe.kind === 'goLive' ? 'goLiveChecklist' : 'operationalChecklist';
    const items = Array.isArray(safe.items) ? safe.items : doc[kind];
    for (const item of items) {
        if (item.status === 'FAIL' && item.critical) {
            // allowed, will block recommendation
        }
    }
    doc[kind] = items.map((i) => ({
        ...i,
        passed: i.status === 'PASS' || i.status === 'NOT_APPLICABLE',
    }));
    doc.updatedBy = userId;
    await doc.save();
    await writeAudit(companyId, userId, 'CHECKLIST_UPDATE', 'OperationsProgram', doc._id, { kind }, { operationsProgramId: doc._id });
    return forceSimulationOnly({ id: String(doc._id), [kind]: doc[kind] });
}

export async function releaseBoardReview(companyId, userId, id, body = {}, user = null) {
    assertPerm(user, PERMS.release_board);
    rejectTenantOverrides(body);
    if (isClientAdminOnly(user) && !isPlatformAdmin(user)) {
        throw new ApiError(403, 'Client Admin cannot approve platform release board');
    }
    const doc = await loadScopedProgram(companyId, id);
    if (String(doc.createdBy) === String(userId) && body.outcome === 'READY_FOR_PHASE_27_REVIEW') {
        throw new ApiError(403, 'Self-approval blocked for final board outcome');
    }
    const outcome = assertSafeStatus(String(body.outcome || 'READY_FOR_OPERATIONAL_REVIEW'));
    const allowed = ['CHANGES_REQUIRED', 'HOLD', 'REJECTED', 'READY_FOR_OPERATIONAL_REVIEW', 'READY_FOR_PHASE_27_REVIEW'];
    if (!allowed.includes(outcome)) throw new ApiError(400, 'Invalid board outcome');
    // store board notes on communicationPlan metadata
    doc.communicationPlan = {
        ...(doc.communicationPlan || {}),
        boardReview: {
            outcome,
            notes: assertSafeText(body.notes || '', 'notes'),
            reviewedBy: String(userId),
            at: new Date().toISOString(),
        },
    };
    doc.updatedBy = userId;
    await doc.save();
    await writeAudit(companyId, userId, 'RELEASE_BOARD_REVIEW', 'OperationsProgram', doc._id, { outcome }, { operationsProgramId: doc._id });
    return forceSimulationOnly({ id: String(doc._id), boardOutcome: outcome, productionActivated: false });
}