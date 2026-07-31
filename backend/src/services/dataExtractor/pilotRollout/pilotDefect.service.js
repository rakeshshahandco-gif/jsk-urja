import { ApiError } from '../../../utils/ApiError.js';
import { PilotDefect, DEFECT_SEVERITIES, DEFECT_STATUSES } from '../../../models/pilotDefect.model.js';
import { PERMS } from './constants.js';
import { assertView, assertPerm, isPlatformAdmin, isClientAdminOnly } from './permissions.util.js';
import {
    rejectTenantOverrides, assertSafeText, assertPayloadSafe, notDeleted,
    forceSimulationOnly, stripUnsafeWriteFields,
} from './normalize.util.js';
import { writeAudit } from './audit.util.js';
import { loadScopedProgram } from './pilotProgram.service.js';

export async function listDefects(companyId, query = {}, user = null) {
    assertView(user);
    rejectTenantOverrides(query);
    const q = { ...notDeleted(), companyId };
    if (query.pilotProgramId) q.pilotProgramId = query.pilotProgramId;
    if (query.severity) q.severity = query.severity;
    if (query.status) q.status = query.status;
    const items = await PilotDefect.find(q).sort({ createdAt: -1 }).limit(200).lean();
    return { items: items.map((d) => forceSimulationOnly({ ...d, id: String(d._id) })) };
}

export async function createDefect(companyId, userId, body = {}, user = null) {
    assertPerm(user, PERMS.defect_manage);
    rejectTenantOverrides(body);
    assertPayloadSafe(body);
    const safe = stripUnsafeWriteFields(body);
    const program = await loadScopedProgram(companyId, safe.pilotProgramId);
    const severity = String(safe.severity || 'MEDIUM').toUpperCase();
    if (!DEFECT_SEVERITIES.includes(severity)) throw new ApiError(400, 'Invalid severity');
    const doc = await PilotDefect.create({
        companyId,
        pilotProgramId: program._id,
        uatCycleId: safe.uatCycleId || null,
        executionId: safe.executionId || null,
        defectCode: String(safe.defectCode || `DEF-${Date.now()}`).slice(0, 80),
        title: assertSafeText(safe.title || 'Defect', 'title'),
        description: assertSafeText(safe.description || '', 'description'),
        industry: safe.industry || '',
        module: safe.module || 'data_extractor',
        feature: safe.feature || '',
        severity,
        priority: safe.priority || severity,
        category: safe.category || 'Functional',
        reproducibility: safe.reproducibility || 'ALWAYS',
        stepsToReproduce: safe.stepsToReproduce || [],
        expected: assertSafeText(safe.expected || '', 'expected'),
        actual: assertSafeText(safe.actual || '', 'actual'),
        evidenceRefs: safe.evidenceRefs || [],
        assignedOwnerUserId: safe.assignedOwnerUserId || null,
        status: 'NEW',
        platformLevel: !!safe.platformLevel,
        history: [{ at: new Date().toISOString(), status: 'NEW', by: String(userId) }],
        simulationOnly: true,
        createdBy: userId,
        updatedBy: userId,
    });
    await writeAudit(companyId, userId, 'DEFECT_CREATE', 'PilotDefect', doc._id, { severity }, { pilotProgramId: program._id });
    return forceSimulationOnly({ ...doc.toObject(), id: String(doc._id) });
}

export async function transitionDefect(companyId, userId, id, body = {}, user = null) {
    assertPerm(user, PERMS.defect_manage);
    rejectTenantOverrides(body);
    const doc = await PilotDefect.findOne({ _id: id, companyId, ...notDeleted() });
    if (!doc) throw new ApiError(404, 'Defect not found');
    const next = String(body.status || '');
    if (!DEFECT_STATUSES.includes(next)) throw new ApiError(400, 'Invalid defect status');
    doc.history = [...(doc.history || []), { at: new Date().toISOString(), from: doc.status, to: next, by: String(userId), note: body.note || '' }];
    doc.status = next;
    if (body.rootCause) doc.rootCause = assertSafeText(body.rootCause, 'rootCause');
    if (body.proposedRemediation) doc.proposedRemediation = assertSafeText(body.proposedRemediation, 'proposedRemediation');
    doc.updatedBy = userId;
    await doc.save();
    await writeAudit(companyId, userId, 'DEFECT_TRANSITION', 'PilotDefect', doc._id, { status: next }, { pilotProgramId: doc.pilotProgramId });
    return forceSimulationOnly({ ...doc.toObject(), id: String(doc._id) });
}

export async function retestDefect(companyId, userId, id, body = {}, user = null) {
    assertPerm(user, PERMS.defect_manage);
    rejectTenantOverrides(body);
    const doc = await PilotDefect.findOne({ _id: id, companyId, ...notDeleted() });
    if (!doc) throw new ApiError(404, 'Defect not found');
    const passed = body.passed === true;
    const next = passed ? 'RETEST_PASSED' : 'RETEST_FAILED';
    doc.history = [...(doc.history || []), { at: new Date().toISOString(), from: doc.status, to: next, by: String(userId) }];
    doc.status = next;
    doc.retestStatus = next;
    doc.updatedBy = userId;
    await doc.save();
    await writeAudit(companyId, userId, 'DEFECT_RETEST', 'PilotDefect', doc._id, { passed }, { pilotProgramId: doc.pilotProgramId });
    return forceSimulationOnly({ ...doc.toObject(), id: String(doc._id) });
}

export async function closeDefect(companyId, userId, id, body = {}, user = null) {
    assertPerm(user, PERMS.defect_manage);
    rejectTenantOverrides(body);
    const doc = await PilotDefect.findOne({ _id: id, companyId, ...notDeleted() });
    if (!doc) throw new ApiError(404, 'Defect not found');
    if (doc.severity === 'CRITICAL' && doc.status !== 'RETEST_PASSED' && !body.forceAfterRetest) {
        if (String(doc.assignedOwnerUserId) === String(userId) && !body.reviewedBy) {
            throw new ApiError(403, 'Critical defect cannot be closed by owner without separate review');
        }
    }
    if (!['RETEST_PASSED', 'REJECTED', 'DEFERRED', 'ACCEPTED_RISK'].includes(doc.status) && doc.severity === 'CRITICAL') {
        throw new ApiError(400, 'Critical defect must be retested or accepted before close');
    }
    doc.history = [...(doc.history || []), { at: new Date().toISOString(), from: doc.status, to: 'CLOSED', by: String(userId) }];
    doc.status = 'CLOSED';
    doc.closedBy = userId;
    doc.closureNote = assertSafeText(body.closureNote || '', 'closureNote');
    doc.updatedBy = userId;
    await doc.save();
    await writeAudit(companyId, userId, 'DEFECT_CLOSE', 'PilotDefect', doc._id, {}, { pilotProgramId: doc.pilotProgramId, reason: doc.closureNote });
    return forceSimulationOnly({ ...doc.toObject(), id: String(doc._id) });
}

export async function acceptDefectRisk(companyId, userId, id, body = {}, user = null) {
    assertPerm(user, PERMS.accept_risk);
    rejectTenantOverrides(body);
    const doc = await PilotDefect.findOne({ _id: id, companyId, ...notDeleted() });
    if (!doc) throw new ApiError(404, 'Defect not found');
    if (!body.reason) throw new ApiError(400, 'Accepted risk requires justification');
    if (!body.expiry) throw new ApiError(400, 'Accepted risk requires expiry');
    if (doc.platformLevel && doc.severity === 'CRITICAL' && isClientAdminOnly(user)) {
        throw new ApiError(403, 'Client Admin cannot accept platform-wide critical risk');
    }
    if (doc.platformLevel && doc.severity === 'CRITICAL' && !isPlatformAdmin(user)) {
        throw new ApiError(403, 'Platform Admin required to accept platform critical risk');
    }
    doc.history = [...(doc.history || []), { at: new Date().toISOString(), from: doc.status, to: 'ACCEPTED_RISK', by: String(userId) }];
    doc.status = 'ACCEPTED_RISK';
    doc.acceptedRiskReason = assertSafeText(body.reason, 'reason');
    doc.acceptedRiskExpiry = new Date(body.expiry);
    doc.updatedBy = userId;
    await doc.save();
    await writeAudit(companyId, userId, 'DEFECT_ACCEPT_RISK', 'PilotDefect', doc._id, { expiry: body.expiry }, { pilotProgramId: doc.pilotProgramId });
    return forceSimulationOnly({ ...doc.toObject(), id: String(doc._id) });
}

export async function countOpenCritical(pilotProgramId) {
    return PilotDefect.countDocuments({
        pilotProgramId,
        severity: 'CRITICAL',
        status: { $nin: ['CLOSED', 'REJECTED', 'RETEST_PASSED'] },
        isDeleted: { $ne: true },
    });
}