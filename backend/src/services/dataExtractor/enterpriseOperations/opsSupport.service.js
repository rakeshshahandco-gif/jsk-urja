import { ApiError } from '../../../utils/ApiError.js';
import { OpsSavedView } from '../../../models/opsSavedView.model.js';
import { OpsAudit } from '../../../models/opsAudit.model.js';
import { OpsRisk } from '../../../models/opsRisk.model.js';
import { OpsIncident } from '../../../models/opsIncident.model.js';
import { OpsRollbackPlan } from '../../../models/opsRollbackPlan.model.js';
import { OpsContinuityPlan } from '../../../models/opsContinuityPlan.model.js';
import { PERMS, CONTROL_LIBRARY } from './constants.js';
import { assertView, assertPerm } from './permissions.util.js';
import {
    rejectTenantOverrides, assertSafeText, assertPayloadSafe, notDeleted,
    forceSimulationOnly, stripUnsafeWriteFields, rejectUnsafeFilters, assertNoSecrets, sanitizeExportFormula,
} from './normalize.util.js';
import { writeAudit } from './audit.util.js';
import { getSettings } from './settings.service.js';
import { loadScopedProgram, evaluatePhase27Gates, getRecommendation } from './operationsProgram.service.js';

export async function healthDashboard(companyId, query = {}, user = null) {
    assertView(user);
    rejectTenantOverrides(query);
    const { OperationsProgram } = await import('../../../models/operationsProgram.model.js');
    const programs = await OperationsProgram.find(
        query.operationsProgramId
            ? { _id: query.operationsProgramId, companyId, isDeleted: { $ne: true } }
            : { companyId, isDeleted: { $ne: true } },
    ).limit(20).lean();
    const ids = programs.map((p) => p._id);
    const [risks, incidents, rollbacks, continuity] = await Promise.all([
        OpsRisk.find({ companyId, operationsProgramId: { $in: ids }, isDeleted: { $ne: true } }).lean(),
        OpsIncident.find({ companyId, operationsProgramId: { $in: ids }, isDeleted: { $ne: true } }).lean(),
        OpsRollbackPlan.find({ companyId, operationsProgramId: { $in: ids }, isDeleted: { $ne: true } }).lean(),
        OpsContinuityPlan.find({ companyId, operationsProgramId: { $in: ids }, isDeleted: { $ne: true } }).lean(),
    ]);
    return forceSimulationOnly({
        programSummary: programs.map((p) => ({ id: String(p._id), code: p.programCode, status: p.status, recommendation: p.recommendation })),
        riskSummary: { total: risks.length, openCritical: risks.filter((r) => r.inherentScore >= 20 && r.status === 'OPEN').length },
        incidentSummary: { total: incidents.length, sev1: incidents.filter((i) => i.severity === 'SEV1').length },
        rollbackPlans: rollbacks.length,
        continuityPlans: continuity.length,
        actions: ['Record plan', 'Submit for review', 'Approve as plan', 'Run local validation', 'Simulate decision', 'Recommend Phase 27 review'],
        forbiddenActions: ['Deploy', 'Go Live', 'Activate Production', 'Execute Rollback', 'Backup Now', 'Restore Now', 'Run Migration'],
        productionTelemetry: false,
    });
}

export async function listSavedViews(companyId, userId, user = null) {
    assertPerm(user, PERMS.saved_views);
    const items = await OpsSavedView.find({ companyId, userId, ...notDeleted() }).sort({ updatedAt: -1 }).limit(50).lean();
    return { items: items.map((d) => forceSimulationOnly({ ...d, id: String(d._id) })) };
}

export async function createSavedView(companyId, userId, body = {}, user = null) {
    assertPerm(user, PERMS.saved_views);
    rejectTenantOverrides(body);
    assertPayloadSafe(body);
    const safe = stripUnsafeWriteFields(body);
    rejectUnsafeFilters(safe.filters || {});
    const doc = await OpsSavedView.create({
        companyId, userId,
        name: assertSafeText(safe.name || 'View', 'name'),
        viewKey: safe.viewKey || '',
        filters: safe.filters || {},
        sort: safe.sort || {},
        simulationOnly: true,
    });
    await writeAudit(companyId, userId, 'SAVED_VIEW_CREATE', 'OpsSavedView', doc._id, {});
    return forceSimulationOnly({ ...doc.toObject(), id: String(doc._id) });
}

export async function deleteSavedView(companyId, userId, id, user = null) {
    assertPerm(user, PERMS.saved_views);
    const doc = await OpsSavedView.findOne({ _id: id, companyId, userId, ...notDeleted() });
    if (!doc) throw new ApiError(404, 'Saved view not found');
    doc.isDeleted = true;
    await doc.save();
    return forceSimulationOnly({ id: String(doc._id), deleted: true });
}

export async function listAudit(companyId, query = {}, user = null) {
    assertPerm(user, PERMS.audit);
    rejectTenantOverrides(query);
    const q = { companyId };
    if (query.operationsProgramId) q.operationsProgramId = query.operationsProgramId;
    const items = await OpsAudit.find(q).sort({ createdAt: -1 }).limit(200).lean();
    return { items: items.map((d) => forceSimulationOnly({ ...d, id: String(d._id) })), appendOnly: true };
}

export async function exportReport(companyId, userId, query = {}, user = null) {
    assertPerm(user, PERMS.export);
    rejectTenantOverrides(query);
    const settings = await getSettings(companyId, user);
    const limit = Math.min(Number(query.limit || settings.settings.maximumExportRows || 500), settings.settings.maximumExportRows || 500);
    const program = await loadScopedProgram(companyId, query.operationsProgramId);
    const [risks, incidents] = await Promise.all([
        OpsRisk.find({ companyId, operationsProgramId: program._id, isDeleted: { $ne: true } }).limit(limit).lean(),
        OpsIncident.find({ companyId, operationsProgramId: program._id, isDeleted: { $ne: true } }).limit(limit).lean(),
    ]);
    const report = {
        type: query.type || 'operations_summary',
        program: { code: sanitizeExportFormula(program.programCode), status: program.status, recommendation: program.recommendation },
        risks: risks.map((r) => ({ code: r.riskCode, title: sanitizeExportFormula(r.title), score: r.inherentScore, status: r.status })),
        incidents: incidents.map((i) => ({ code: i.incidentCode, severity: i.severity, status: i.status })),
        secretsExcluded: true,
        deploymentPackageIncluded: false,
        simulationOnly: true,
    };
    assertNoSecrets(report);
    await writeAudit(companyId, userId, 'EXPORT', 'OperationsProgram', program._id, { type: report.type }, { operationsProgramId: program._id });
    return forceSimulationOnly(report);
}

export function listControls(user = null) {
    assertView(user);
    return forceSimulationOnly({ items: CONTROL_LIBRARY });
}

export async function phase27Recommendation(companyId, id, user = null) {
    assertPerm(user, PERMS.phase27_recommendation);
    return getRecommendation(companyId, id, user);
}

export async function completeChecklistsForTests(companyId, userId, id, user = null) {
    assertPerm(user, PERMS.checklist_manage);
    const doc = await loadScopedProgram(companyId, id);
    doc.operationalChecklist = (doc.operationalChecklist || []).map((c) => ({ ...c, status: 'PASS', passed: true }));
    doc.goLiveChecklist = (doc.goLiveChecklist || []).map((c) => ({ ...c, status: 'PASS', passed: true }));
    doc.monitoringPlan = { enabled: true, areas: ['Backend health', 'API error rate'], productionTelemetry: false };
    doc.hypercarePlan = { durationDays: 14, owners: [String(userId)] };
    doc.communicationPlan = { audiences: ['Platform Admin'], events: ['Release review'], messagesSent: false };
    doc.updatedBy = userId;
    await doc.save();
    return forceSimulationOnly({ id: String(doc._id), checklistsComplete: true });
}

export { evaluatePhase27Gates };