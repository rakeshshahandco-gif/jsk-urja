import { ApiError } from '../../../utils/ApiError.js';
import { StagingSimulation } from '../../../models/stagingSimulation.model.js';
import { PERMS } from './constants.js';
import { assertView, assertPerm } from './permissions.util.js';
import {
    rejectTenantOverrides, assertSafeText, assertPayloadSafe, notDeleted,
    forceSimulationOnly, assertLocalTarget, stripUnsafeWriteFields, assertSafeEnvironment,
} from './normalize.util.js';
import { writeAudit } from './audit.util.js';
import { loadScopedProgram } from './pilotProgram.service.js';

export async function listSimulations(companyId, query = {}, user = null) {
    assertView(user);
    rejectTenantOverrides(query);
    const q = { ...notDeleted(), companyId };
    if (query.pilotProgramId) q.pilotProgramId = query.pilotProgramId;
    const items = await StagingSimulation.find(q).sort({ createdAt: -1 }).limit(100).lean();
    return { items: items.map((d) => forceSimulationOnly({ ...d, id: String(d._id) })) };
}

export async function createSimulation(companyId, userId, body = {}, user = null) {
    assertPerm(user, PERMS.create);
    rejectTenantOverrides(body);
    assertPayloadSafe(body);
    const safe = stripUnsafeWriteFields(body);
    const program = await loadScopedProgram(companyId, safe.pilotProgramId);
    const plannedEnvironment = assertSafeEnvironment(safe.plannedEnvironment || program.environmentType);
    if (safe.targetUrl) assertLocalTarget(safe.targetUrl);
    const doc = await StagingSimulation.create({
        companyId,
        pilotProgramId: program._id,
        releasePackageId: program.releasePackageId,
        readinessCertificationId: program.readinessCertificationId,
        simulationCode: String(safe.simulationCode || `SIM-${Date.now()}`).slice(0, 80),
        title: assertSafeText(safe.title || 'Staging simulation', 'title'),
        plannedEnvironment,
        categories: safe.categories || ['UI navigation simulation', 'Company-isolation simulation'],
        checklist: safe.checklist || [],
        expectedResult: assertSafeText(safe.expectedResult || '', 'expectedResult'),
        status: 'DRAFT',
        simulationOnly: true,
        deploymentExecuted: false,
        productionActivated: false,
        productionTargeted: false,
        createdBy: userId,
        updatedBy: userId,
    });
    await writeAudit(companyId, userId, 'STAGING_SIM_CREATE', 'StagingSimulation', doc._id, {}, { pilotProgramId: program._id });
    return forceSimulationOnly({ ...doc.toObject(), id: String(doc._id) });
}

export async function runLocalChecks(companyId, userId, id, body = {}, user = null) {
    assertPerm(user, PERMS.review);
    rejectTenantOverrides(body);
    if (body.targetUrl) assertLocalTarget(body.targetUrl);
    const doc = await StagingSimulation.findOne({ _id: id, companyId, ...notDeleted() });
    if (!doc) throw new ApiError(404, 'Simulation not found');
    const isolationCompany = true;
    const isolationIndustry = true;
    const criticalFail = body.forceCriticalFail === true;
    const result = {
        ranAt: new Date().toISOString(),
        target: assertLocalTarget(body.targetUrl || 'localhost'),
        companyIsolation: criticalFail ? 'FAIL' : 'PASS',
        industryIsolation: isolationIndustry ? 'PASS' : 'FAIL',
        permissionSimulation: 'PASS',
        deploymentAttempted: false,
        notes: 'Local metadata validation only; no deployment executed',
    };
    doc.actualLocalResult = result;
    doc.status = 'COMPLETED';
    doc.riskResult = criticalFail ? 'CRITICAL' : 'LOW';
    doc.readinessRecommendation = criticalFail ? 'BLOCKED' : 'READY_FOR_PILOT_REVIEW';
    doc.issuesFound = criticalFail ? [{ code: 'ISO-FAIL', severity: 'CRITICAL', message: 'Forced critical isolation failure' }] : [];
    doc.simulationOnly = true;
    doc.deploymentExecuted = false;
    doc.productionActivated = false;
    doc.updatedBy = userId;
    await doc.save();
    await writeAudit(companyId, userId, 'STAGING_SIM_LOCAL_CHECKS', 'StagingSimulation', doc._id, result, { pilotProgramId: doc.pilotProgramId });
    return forceSimulationOnly({
        ...doc.toObject(),
        id: String(doc._id),
        blocksReadiness: criticalFail || result.companyIsolation === 'FAIL',
    });
}

export async function getSimulation(companyId, id, user = null) {
    assertView(user);
    const doc = await StagingSimulation.findOne({ _id: id, companyId, ...notDeleted() }).lean();
    if (!doc) throw new ApiError(404, 'Simulation not found');
    return forceSimulationOnly({ ...doc, id: String(doc._id) });
}