import { ApiError } from '../../../utils/ApiError.js';
import { PilotRisk } from '../../../models/pilotRisk.model.js';
import { PilotException } from '../../../models/pilotException.model.js';
import { PERMS } from './constants.js';
import { assertView, assertPerm, isPlatformAdmin, isClientAdminOnly } from './permissions.util.js';
import {
    rejectTenantOverrides, assertSafeText, assertPayloadSafe, notDeleted,
    forceSimulationOnly, stripUnsafeWriteFields,
} from './normalize.util.js';
import { writeAudit } from './audit.util.js';
import { loadScopedProgram } from './pilotProgram.service.js';

export async function listRisks(companyId, query = {}, user = null) {
    assertView(user);
    rejectTenantOverrides(query);
    const q = { ...notDeleted(), companyId };
    if (query.pilotProgramId) q.pilotProgramId = query.pilotProgramId;
    const items = await PilotRisk.find(q).sort({ createdAt: -1 }).limit(200).lean();
    return { items: items.map((d) => forceSimulationOnly({ ...d, id: String(d._id) })) };
}

export async function createRisk(companyId, userId, body = {}, user = null) {
    assertPerm(user, PERMS.risk_manage);
    rejectTenantOverrides(body);
    assertPayloadSafe(body);
    const safe = stripUnsafeWriteFields(body);
    const program = await loadScopedProgram(companyId, safe.pilotProgramId);
    const likelihood = Math.min(5, Math.max(1, Number(safe.likelihood || 3)));
    const impact = Math.min(5, Math.max(1, Number(safe.impact || 3)));
    const inherentScore = likelihood * impact;
    const doc = await PilotRisk.create({
        companyId,
        pilotProgramId: program._id,
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
    await writeAudit(companyId, userId, 'RISK_CREATE', 'PilotRisk', doc._id, { inherentScore }, { pilotProgramId: program._id });
    return forceSimulationOnly({ ...doc.toObject(), id: String(doc._id) });
}

export async function acceptRisk(companyId, userId, id, body = {}, user = null) {
    assertPerm(user, PERMS.accept_risk);
    rejectTenantOverrides(body);
    const doc = await PilotRisk.findOne({ _id: id, companyId, ...notDeleted() });
    if (!doc) throw new ApiError(404, 'Risk not found');
    if (!body.reason) throw new ApiError(400, 'Accepted risk requires justification');
    if (!body.expiry) throw new ApiError(400, 'Accepted risk requires expiry');
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
    doc.updatedBy = userId;
    await doc.save();
    await writeAudit(companyId, userId, 'RISK_ACCEPT', 'PilotRisk', doc._id, { expiry: body.expiry }, { pilotProgramId: doc.pilotProgramId });
    return forceSimulationOnly({ ...doc.toObject(), id: String(doc._id) });
}

export async function createException(companyId, userId, body = {}, user = null) {
    assertPerm(user, PERMS.risk_manage);
    rejectTenantOverrides(body);
    assertPayloadSafe(body);
    const safe = stripUnsafeWriteFields(body);
    if (!safe.expiry) throw new ApiError(400, 'Exception expiry required');
    if (safe.bypassesCriticalIsolation) throw new ApiError(400, 'Critical isolation failure cannot be excepted');
    const program = await loadScopedProgram(companyId, safe.pilotProgramId);
    const doc = await PilotException.create({
        companyId,
        pilotProgramId: program._id,
        exceptionType: safe.exceptionType || 'DEFERRED_TEST',
        reason: assertSafeText(safe.reason || '', 'reason'),
        scope: assertSafeText(safe.scope || '', 'scope'),
        ownerUserId: userId,
        approverUserId: safe.approverUserId || null,
        expiry: new Date(safe.expiry),
        compensatingControl: assertSafeText(safe.compensatingControl || '', 'compensatingControl'),
        riskLevel: safe.riskLevel || 'MEDIUM',
        reviewDate: safe.reviewDate || null,
        status: 'OPEN',
        bypassesCriticalIsolation: false,
        simulationOnly: true,
        createdBy: userId,
        updatedBy: userId,
    });
    await writeAudit(companyId, userId, 'EXCEPTION_CREATE', 'PilotException', doc._id, {}, { pilotProgramId: program._id });
    return forceSimulationOnly({ ...doc.toObject(), id: String(doc._id) });
}

export async function listExceptions(companyId, query = {}, user = null) {
    assertView(user);
    rejectTenantOverrides(query);
    const q = { ...notDeleted(), companyId };
    if (query.pilotProgramId) q.pilotProgramId = query.pilotProgramId;
    const items = await PilotException.find(q).sort({ createdAt: -1 }).limit(100).lean();
    return { items: items.map((d) => forceSimulationOnly({ ...d, id: String(d._id) })) };
}