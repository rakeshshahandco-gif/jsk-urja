import { ApiError } from '../../../utils/ApiError.js';
import { OpsIncident, INCIDENT_SEVERITIES, INCIDENT_STATUSES } from '../../../models/opsIncident.model.js';
import { PERMS } from './constants.js';
import { assertView, assertPerm } from './permissions.util.js';
import {
    rejectTenantOverrides, assertSafeText, assertPayloadSafe, notDeleted,
    forceSimulationOnly, stripUnsafeWriteFields, assertSafeStatus,
} from './normalize.util.js';
import { writeAudit } from './audit.util.js';
import { loadScopedProgram } from './operationsProgram.service.js';

export async function listIncidents(companyId, query = {}, user = null) {
    assertView(user);
    rejectTenantOverrides(query);
    const q = { ...notDeleted(), companyId };
    if (query.operationsProgramId) q.operationsProgramId = query.operationsProgramId;
    if (query.severity) q.severity = query.severity;
    const items = await OpsIncident.find(q).sort({ createdAt: -1 }).limit(200).lean();
    return { items: items.map((d) => forceSimulationOnly({ ...d, id: String(d._id) })) };
}

export async function createIncident(companyId, userId, body = {}, user = null) {
    assertPerm(user, PERMS.incident_manage);
    rejectTenantOverrides(body);
    assertPayloadSafe(body);
    const safe = stripUnsafeWriteFields(body);
    const severity = String(safe.severity || 'SEV3');
    if (!INCIDENT_SEVERITIES.includes(severity)) throw new ApiError(400, 'Invalid severity');
    let programId = null;
    if (safe.operationsProgramId) {
        const program = await loadScopedProgram(companyId, safe.operationsProgramId);
        programId = program._id;
    }
    const doc = await OpsIncident.create({
        companyId,
        operationsProgramId: programId,
        incidentCode: String(safe.incidentCode || `INC-${Date.now()}`).slice(0, 80),
        title: assertSafeText(safe.title || 'Incident simulation', 'title'),
        description: assertSafeText(safe.description || '', 'description'),
        affectedService: safe.affectedService || 'data_extractor',
        industry: safe.industry || '',
        impact: safe.impact || 'MEDIUM',
        severity,
        detectionSource: 'LOCAL_SIMULATION',
        detectedAt: new Date(),
        ownerUserId: userId,
        responders: safe.responders || [],
        timeline: [{ at: new Date().toISOString(), event: 'CREATED', by: String(userId) }],
        containmentPlan: assertSafeText(safe.containmentPlan || '', 'containmentPlan'),
        recoveryPlan: assertSafeText(safe.recoveryPlan || '', 'recoveryPlan'),
        rollbackRecommendation: assertSafeText(safe.rollbackRecommendation || '', 'rollbackRecommendation'),
        communicationPlan: assertSafeText(safe.communicationPlan || '', 'communicationPlan'),
        rootCauseRequired: severity === 'SEV1' || severity === 'SEV2',
        status: 'SIMULATED',
        simulationOnly: true,
        createdBy: userId,
        updatedBy: userId,
    });
    await writeAudit(companyId, userId, 'INCIDENT_CREATE', 'OpsIncident', doc._id, { severity }, { operationsProgramId: programId });
    return forceSimulationOnly({ ...doc.toObject(), id: String(doc._id), externalNotificationSent: false });
}

export async function transitionIncident(companyId, userId, id, body = {}, user = null) {
    assertPerm(user, PERMS.incident_manage);
    rejectTenantOverrides(body);
    const doc = await OpsIncident.findOne({ _id: id, companyId, ...notDeleted() });
    if (!doc) throw new ApiError(404, 'Incident not found');
    const next = assertSafeStatus(String(body.status || ''));
    if (!INCIDENT_STATUSES.includes(next)) throw new ApiError(400, 'Invalid incident status');
    if (next === 'CLOSED_AS_SIMULATION' && doc.severity === 'SEV1') {
        if (!body.reviewedBy || String(body.reviewedBy) === String(doc.ownerUserId)) {
            throw new ApiError(403, 'SEV1 closure requires separate reviewer');
        }
        doc.reviewerUserId = body.reviewedBy;
    }
    doc.timeline = [...(doc.timeline || []), { at: new Date().toISOString(), from: doc.status, to: next, by: String(userId) }];
    doc.status = next;
    if (next === 'CLOSED_AS_SIMULATION') doc.closedBy = userId;
    doc.updatedBy = userId;
    await doc.save();
    await writeAudit(companyId, userId, 'INCIDENT_TRANSITION', 'OpsIncident', doc._id, { status: next }, { operationsProgramId: doc.operationsProgramId });
    return forceSimulationOnly({ ...doc.toObject(), id: String(doc._id) });
}

export async function createProblem(companyId, userId, body = {}, user = null) {
    assertPerm(user, PERMS.problem_manage);
    rejectTenantOverrides(body);
    assertPayloadSafe(body);
    const safe = stripUnsafeWriteFields(body);
    // store problem as Mixed on incident-linked record via OpsIncident extension field using dedicated lean create into continuity? Use OpsIncident with INFORMATIONAL + problem metadata via separate collection-less approach:
    // Persist as OpsContinuityPlan BUSINESS_CONTINUITY subtype? Better: use OpsChangeRequest DOCUMENTATION as problem registry alternative.
    // Use OpsIncident with status DRAFT and severity INFORMATIONAL labeled as problem in description prefix.
    const doc = await OpsIncident.create({
        companyId,
        operationsProgramId: safe.operationsProgramId || null,
        incidentCode: String(safe.problemCode || `PRB-${Date.now()}`).slice(0, 80),
        title: assertSafeText(safe.title || 'Problem record', 'title'),
        description: `PROBLEM_RECORD: ${assertSafeText(safe.symptoms || safe.description || '', 'description')}`,
        severity: 'INFORMATIONAL',
        impact: safe.impact || 'MEDIUM',
        detectionSource: 'PROBLEM_MANAGEMENT',
        ownerUserId: userId,
        containmentPlan: assertSafeText(safe.workaround || '', 'workaround'),
        recoveryPlan: assertSafeText(safe.permanentFixProposal || '', 'permanentFixProposal'),
        status: 'DRAFT',
        simulationOnly: true,
        createdBy: userId,
        updatedBy: userId,
    });
    await writeAudit(companyId, userId, 'PROBLEM_CREATE', 'OpsProblem', doc._id, {});
    return forceSimulationOnly({
        id: String(doc._id),
        problemCode: doc.incidentCode,
        title: doc.title,
        status: 'OPEN',
        workaround: doc.containmentPlan,
        simulationOnly: true,
    });
}