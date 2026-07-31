import { ApiError } from '../../../utils/ApiError.js';
import { OpsChangeRequest, CHANGE_TYPES, CHANGE_STATUSES } from '../../../models/opsChangeRequest.model.js';
import { PERMS } from './constants.js';
import { assertView, assertPerm, isClientAdminOnly } from './permissions.util.js';
import {
    rejectTenantOverrides, assertSafeText, assertPayloadSafe, notDeleted,
    forceSimulationOnly, stripUnsafeWriteFields, assertSafeStatus,
} from './normalize.util.js';
import { writeAudit } from './audit.util.js';
import { loadScopedProgram } from './operationsProgram.service.js';

export async function listChanges(companyId, query = {}, user = null) {
    assertView(user);
    rejectTenantOverrides(query);
    const q = { ...notDeleted(), companyId };
    if (query.operationsProgramId) q.operationsProgramId = query.operationsProgramId;
    if (query.changeType) q.changeType = query.changeType;
    const items = await OpsChangeRequest.find(q).sort({ createdAt: -1 }).limit(200).lean();
    return { items: items.map((d) => forceSimulationOnly({ ...d, id: String(d._id) })) };
}

export async function createChange(companyId, userId, body = {}, user = null) {
    const type = String(body.changeType || 'NORMAL');
    assertPerm(user, type === 'EMERGENCY_PLANNING_ONLY' ? PERMS.emergency_change : PERMS.change_manage);
    rejectTenantOverrides(body);
    assertPayloadSafe(body);
    if (!CHANGE_TYPES.includes(type)) throw new ApiError(400, 'Invalid change type');
    const safe = stripUnsafeWriteFields(body);
    if (isClientAdminOnly(user) && type === 'EMERGENCY_PLANNING_ONLY' && safe.platformLevel) {
        throw new ApiError(403, 'Client Admin cannot approve platform-wide emergency changes');
    }
    let programId = null;
    if (safe.operationsProgramId) {
        const program = await loadScopedProgram(companyId, safe.operationsProgramId);
        programId = program._id;
    }
    const doc = await OpsChangeRequest.create({
        companyId,
        operationsProgramId: programId,
        changeCode: String(safe.changeCode || `CHG-${Date.now()}`).slice(0, 80),
        title: assertSafeText(safe.title || 'Change', 'title'),
        description: assertSafeText(safe.description || '', 'description'),
        reason: assertSafeText(safe.reason || '', 'reason'),
        changeType: type,
        businessImpact: safe.businessImpact || 'MEDIUM',
        technicalImpact: safe.technicalImpact || 'MEDIUM',
        dataImpact: safe.dataImpact || 'NONE',
        affectedModules: safe.affectedModules || [],
        affectedCompanies: safe.affectedCompanies || [],
        affectedIndustries: safe.affectedIndustries || [],
        risk: safe.risk || 'MEDIUM',
        implementationPlan: assertSafeText(safe.implementationPlan || '', 'implementationPlan'),
        validationPlan: assertSafeText(safe.validationPlan || '', 'validationPlan'),
        rollbackPlan: assertSafeText(safe.rollbackPlan || '', 'rollbackPlan'),
        communicationPlan: assertSafeText(safe.communicationPlan || '', 'communicationPlan'),
        ownerUserId: userId,
        status: 'DRAFT',
        history: [{ at: new Date().toISOString(), status: 'DRAFT', by: String(userId) }],
        simulationOnly: true,
        deploymentExecuted: false,
        productionActivated: false,
        createdBy: userId,
        updatedBy: userId,
    });
    await writeAudit(companyId, userId, 'CHANGE_CREATE', 'OpsChangeRequest', doc._id, { changeType: type }, { operationsProgramId: programId });
    return forceSimulationOnly({ ...doc.toObject(), id: String(doc._id) });
}

export async function transitionChange(companyId, userId, id, body = {}, user = null) {
    assertPerm(user, PERMS.change_manage);
    rejectTenantOverrides(body);
    const doc = await OpsChangeRequest.findOne({ _id: id, companyId, ...notDeleted() });
    if (!doc) throw new ApiError(404, 'Change request not found');
    const next = assertSafeStatus(String(body.status || ''));
    if (!CHANGE_STATUSES.includes(next)) throw new ApiError(400, 'Invalid change status');
    if (['APPROVED_AS_PLAN', 'READY_FOR_PHASE_27_REVIEW'].includes(next) && String(doc.ownerUserId) === String(userId) && (doc.risk === 'CRITICAL' || doc.changeType === 'EMERGENCY_PLANNING_ONLY')) {
        if (!body.reviewedBy || String(body.reviewedBy) === String(userId)) {
            throw new ApiError(403, 'Critical/emergency change requires separate reviewer');
        }
    }
    doc.history = [...(doc.history || []), { at: new Date().toISOString(), from: doc.status, to: next, by: String(userId) }];
    doc.status = next;
    doc.reviewerUserId = body.reviewedBy || doc.reviewerUserId || userId;
    doc.deploymentExecuted = false;
    doc.productionActivated = false;
    doc.updatedBy = userId;
    await doc.save();
    await writeAudit(companyId, userId, 'CHANGE_TRANSITION', 'OpsChangeRequest', doc._id, { status: next }, { operationsProgramId: doc.operationsProgramId });
    return forceSimulationOnly({ ...doc.toObject(), id: String(doc._id) });
}