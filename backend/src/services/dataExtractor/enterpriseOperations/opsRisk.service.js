import { ApiError } from '../../../utils/ApiError.js';
import { OpsRisk } from '../../../models/opsRisk.model.js';
import { OpsException } from '../../../models/opsException.model.js';
import { PERMS } from './constants.js';
import { assertView, assertPerm, isPlatformAdmin, isClientAdminOnly } from './permissions.util.js';
import {
    rejectTenantOverrides, assertSafeText, assertPayloadSafe, notDeleted,
    forceSimulationOnly, stripUnsafeWriteFields,
} from './normalize.util.js';
import { writeAudit } from './audit.util.js';
import { loadScopedProgram } from './operationsProgram.service.js';

export async function listRisks(companyId, query = {}, user = null) {
    assertView(user);
    rejectTenantOverrides(query);
    const q = { ...notDeleted(), companyId };
    if (query.operationsProgramId) q.operationsProgramId = query.operationsProgramId;
    const items = await OpsRisk.find(q).sort({ createdAt: -1 }).limit(200).lean();
    return { items: items.map((d) => forceSimulationOnly({ ...d, id: String(d._id) })) };
}

export async function createRisk(companyId, userId, body = {}, user = null) {
    assertPerm(user, PERMS.risk_manage);
    rejectTenantOverrides(body);
    assertPayloadSafe(body);
    const safe = stripUnsafeWriteFields(body);
    const program = await loadScopedProgram(companyId, safe.operationsProgramId);
    const likelihood = Math.min(5, Math.max(1, Number(safe.likelihood || 3)));
    const impact = Math.min(5, Math.max(1, Number(safe.impact || 3)));
    const inherentScore = likelihood * impact;
    const doc = await OpsRisk.create({
        companyId,
        operationsProgramId: program._id,
        riskCode: String(safe.riskCode || `RSK-${Date.now()}`).slice(0, 80),
        title: assertSafeText(safe.title || 'Risk', 'title'),
        description: assertSafeText(safe.description || '', 'description'),
        category: safe.category || 'Operational',
        likelihood,
        impact,
        inherentScore,
        residualScore: Number(safe.residualScore || inherentScore),
        mitigation: assertSafeText(safe.mitigation || '', 'mitigation'),
        status: 'OPEN',
        platformLevel: !!safe.platformLevel,
        criticalUnmitigated: inherentScore >= 20 && !safe.mitigation,
        simulationOnly: true,
        createdBy: userId,
        updatedBy: userId,
    });
    await writeAudit(companyId, userId, 'RISK_CREATE', 'OpsRisk', doc._id, { inherentScore }, { operationsProgramId: program._id });
    return forceSimulationOnly({ ...doc.toObject(), id: String(doc._id) });
}

export async function acceptRisk(companyId, userId, id, body = {}, user = null) {
    assertPerm(user, PERMS.accept_risk);
    rejectTenantOverrides(body);
    const doc = await OpsRisk.findOne({ _id: id, companyId, ...notDeleted() });
    if (!doc) throw new ApiError(404, 'Risk not found');
    if (!body.reason) throw new ApiError(400, 'Accepted risk requires justification');
    if (!body.expiry) throw new ApiError(400, 'Accepted risk requires expiry');
    if (String(doc.createdBy) === String(userId) && doc.inherentScore >= 20) {
        throw new ApiError(403, 'Risk owner cannot accept own critical risk');
    }
    if (doc.platformLevel && doc.inherentScore >= 20 && isClientAdminOnly(user)) {
        throw new ApiError(403, 'Client Admin cannot accept platform-wide critical risk');
    }
    if (doc.platformLevel && !isPlatformAdmin(user)) {
        throw new ApiError(403, 'Platform Admin required for platform risk acceptance');
    }
    doc.acceptedRisk = true;
    doc.acceptedBy = userId;
    doc.acceptanceExpiry = new Date(body.expiry);
    doc.acceptanceReason = assertSafeText(body.reason, 'reason');
    doc.status = 'ACCEPTED';
    doc.criticalUnmitigated = false;
    doc.updatedBy = userId;
    await doc.save();
    await writeAudit(companyId, userId, 'RISK_ACCEPT', 'OpsRisk', doc._id, { expiry: body.expiry }, { operationsProgramId: doc.operationsProgramId });
    return forceSimulationOnly({ ...doc.toObject(), id: String(doc._id) });
}

export async function createException(companyId, userId, body = {}, user = null) {
    assertPerm(user, PERMS.risk_manage);
    rejectTenantOverrides(body);
    assertPayloadSafe(body);
    const safe = stripUnsafeWriteFields(body);
    if (!safe.expiry) throw new ApiError(400, 'Exception expiry required');
    if (safe.bypassesCriticalIsolation) throw new ApiError(400, 'Critical isolation failure cannot be excepted');
    const program = await loadScopedProgram(companyId, safe.operationsProgramId);
    const doc = await OpsException.create({
        companyId,
        operationsProgramId: program._id,
        exceptionType: safe.exceptionType || 'DEFERRED_NON_CRITICAL_CHECK',
        reason: assertSafeText(safe.reason || '', 'reason'),
        scope: assertSafeText(safe.scope || '', 'scope'),
        ownerUserId: userId,
        approverUserId: safe.approverUserId || null,
        expiry: new Date(safe.expiry),
        compensatingControl: assertSafeText(safe.compensatingControl || '', 'compensatingControl'),
        riskLevel: safe.riskLevel || 'MEDIUM',
        status: 'OPEN',
        bypassesCriticalIsolation: false,
        simulationOnly: true,
        createdBy: userId,
        updatedBy: userId,
    });
    await writeAudit(companyId, userId, 'EXCEPTION_CREATE', 'OpsException', doc._id, {}, { operationsProgramId: program._id });
    return forceSimulationOnly({ ...doc.toObject(), id: String(doc._id) });
}

export async function listExceptions(companyId, query = {}, user = null) {
    assertView(user);
    rejectTenantOverrides(query);
    const q = { ...notDeleted(), companyId };
    if (query.operationsProgramId) q.operationsProgramId = query.operationsProgramId;
    const items = await OpsException.find(q).sort({ createdAt: -1 }).limit(100).lean();
    return { items: items.map((d) => forceSimulationOnly({ ...d, id: String(d._id) })) };
}