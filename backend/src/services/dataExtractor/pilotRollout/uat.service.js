import { ApiError } from '../../../utils/ApiError.js';
import { UatPlan } from '../../../models/uatPlan.model.js';
import { UatTestCase } from '../../../models/uatTestCase.model.js';
import { UatCycle } from '../../../models/uatCycle.model.js';
import { UatExecution, UAT_RESULT_STATUSES } from '../../../models/uatExecution.model.js';
import { PilotDefect } from '../../../models/pilotDefect.model.js';
import { PERMS } from './constants.js';
import { assertView, assertPerm } from './permissions.util.js';
import {
    rejectTenantOverrides, assertSafeText, assertPayloadSafe, notDeleted,
    forceSimulationOnly, stripUnsafeWriteFields,
} from './normalize.util.js';
import { writeAudit } from './audit.util.js';
import { loadScopedProgram, verifyLinks } from './pilotProgram.service.js';

export async function createUatPlan(companyId, userId, body = {}, user = null) {
    assertPerm(user, PERMS.uat_manage);
    rejectTenantOverrides(body);
    assertPayloadSafe(body);
    const safe = stripUnsafeWriteFields(body);
    const program = await loadScopedProgram(companyId, safe.pilotProgramId);
    await verifyLinks(companyId, program.releasePackageId, program.readinessCertificationId);
    const entryCriteria = [
        { key: 'PHASE23_LINK', met: !!program.releasePackageId },
        { key: 'PHASE24_CERT', met: !!program.readinessCertificationId },
        { key: 'ISOLATION_CHECKS', met: true },
        { key: 'ROLLBACK_DOCUMENTED', met: !!program.rollbackPlanRequired },
        { key: 'SUCCESS_CRITERIA', met: (program.successCriteria || []).length > 0 },
        { key: 'FAILURE_CRITERIA', met: (program.failureCriteria || []).length > 0 },
    ];
    if (entryCriteria.some((c) => !c.met)) throw new ApiError(400, 'UAT entry criteria not met');
    const doc = await UatPlan.create({
        companyId,
        pilotProgramId: program._id,
        releasePackageId: program.releasePackageId,
        readinessCertificationId: program.readinessCertificationId,
        uatPlanCode: String(safe.uatPlanCode || `UAT-${Date.now()}`).slice(0, 80),
        title: assertSafeText(safe.title || 'UAT Plan', 'title'),
        businessObjective: assertSafeText(safe.businessObjective || '', 'businessObjective'),
        scope: assertSafeText(safe.scope || '', 'scope'),
        outOfScope: assertSafeText(safe.outOfScope || '', 'outOfScope'),
        industries: safe.industries || program.industryScope || [],
        modules: safe.modules || ['data_extractor'],
        features: safe.features || [],
        entryCriteria,
        exitCriteria: safe.exitCriteria || [],
        successCriteria: program.successCriteria || [],
        failureCriteria: program.failureCriteria || [],
        evidenceRequirements: safe.evidenceRequirements || ['screenshot reference'],
        status: 'DRAFT',
        simulationOnly: true,
        productionExecutionAllowed: false,
        createdBy: userId,
        updatedBy: userId,
    });
    await writeAudit(companyId, userId, 'UAT_PLAN_CREATE', 'UatPlan', doc._id, {}, { pilotProgramId: program._id });
    return forceSimulationOnly({ ...doc.toObject(), id: String(doc._id) });
}

export async function listUatPlans(companyId, query = {}, user = null) {
    assertView(user);
    rejectTenantOverrides(query);
    const q = { ...notDeleted(), companyId };
    if (query.pilotProgramId) q.pilotProgramId = query.pilotProgramId;
    const items = await UatPlan.find(q).sort({ createdAt: -1 }).limit(100).lean();
    return { items: items.map((d) => forceSimulationOnly({ ...d, id: String(d._id) })) };
}

export async function createTestCase(companyId, userId, body = {}, user = null) {
    assertPerm(user, PERMS.uat_manage);
    rejectTenantOverrides(body);
    assertPayloadSafe(body);
    const safe = stripUnsafeWriteFields(body);
    const code = String(safe.testCaseCode || `TC-${Date.now()}`).slice(0, 80);
    const latest = await UatTestCase.findOne({ companyId, testCaseCode: code, ...notDeleted() }).sort({ version: -1 });
    const version = latest ? latest.version + 1 : 1;
    const doc = await UatTestCase.create({
        companyId,
        pilotProgramId: safe.pilotProgramId || null,
        testCaseCode: code,
        title: assertSafeText(safe.title || code, 'title'),
        objective: assertSafeText(safe.objective || '', 'objective'),
        module: safe.module || 'data_extractor',
        feature: safe.feature || '',
        industry: safe.industry || '',
        userRole: safe.userRole || 'UAT_TESTER',
        category: safe.category || 'Regression',
        priority: safe.priority || 'MEDIUM',
        risk: safe.risk || 'MEDIUM',
        preconditions: safe.preconditions || [],
        steps: safe.steps || [],
        expectedResult: assertSafeText(safe.expectedResult || '', 'expectedResult'),
        evidenceRequired: safe.evidenceRequired !== false,
        automationEligible: false,
        manualOnly: true,
        version,
        status: 'ACTIVE',
        simulationOnly: true,
        createdBy: userId,
        updatedBy: userId,
    });
    await writeAudit(companyId, userId, 'UAT_TESTCASE_CREATE', 'UatTestCase', doc._id, { version });
    return forceSimulationOnly({ ...doc.toObject(), id: String(doc._id) });
}

export async function listTestCases(companyId, query = {}, user = null) {
    assertView(user);
    rejectTenantOverrides(query);
    const q = { ...notDeleted(), companyId };
    if (query.module) q.module = query.module;
    const items = await UatTestCase.find(q).sort({ createdAt: -1 }).limit(200).lean();
    return { items: items.map((d) => forceSimulationOnly({ ...d, id: String(d._id) })) };
}

export async function createCycle(companyId, userId, body = {}, user = null) {
    assertPerm(user, PERMS.uat_manage);
    rejectTenantOverrides(body);
    const safe = stripUnsafeWriteFields(body);
    const program = await loadScopedProgram(companyId, safe.pilotProgramId);
    const plan = await UatPlan.findOne({ _id: safe.uatPlanId, companyId, ...notDeleted() });
    if (!plan) throw new ApiError(404, 'UAT plan not found');
    const doc = await UatCycle.create({
        companyId,
        pilotProgramId: program._id,
        uatPlanId: plan._id,
        cycleName: assertSafeText(safe.cycleName || 'UAT Cycle 1', 'cycleName'),
        cycleType: safe.cycleType || 'UAT_CYCLE_1',
        plannedStart: safe.plannedStart || null,
        plannedEnd: safe.plannedEnd || null,
        assignedTesters: safe.assignedTesters || [],
        testCaseIds: safe.testCaseIds || [],
        status: 'PLANNED',
        simulationOnly: true,
        createdBy: userId,
        updatedBy: userId,
    });
    await writeAudit(companyId, userId, 'UAT_CYCLE_CREATE', 'UatCycle', doc._id, {}, { pilotProgramId: program._id });
    return forceSimulationOnly({ ...doc.toObject(), id: String(doc._id) });
}

export async function recordExecution(companyId, userId, body = {}, user = null) {
    assertPerm(user, PERMS.uat_execute);
    rejectTenantOverrides(body);
    assertPayloadSafe(body);
    const safe = stripUnsafeWriteFields(body);
    const resultStatus = String(safe.resultStatus || 'NOT_RUN');
    if (!UAT_RESULT_STATUSES.includes(resultStatus)) throw new ApiError(400, 'Invalid result status');
    const cycle = await UatCycle.findOne({ _id: safe.uatCycleId, companyId, ...notDeleted() });
    if (!cycle) throw new ApiError(404, 'UAT cycle not found');
    const evidenceRefs = Array.isArray(safe.evidenceRefs) ? safe.evidenceRefs : [];
    if (safe.evidenceBase64) throw new ApiError(400, 'Base64 evidence blobs are not stored; use metadata references only');
    const tc = await UatTestCase.findOne({ _id: safe.testCaseId, ...notDeleted() });
    if (tc?.evidenceRequired && ['PASSED', 'RETEST_PASSED'].includes(resultStatus) && evidenceRefs.length === 0) {
        throw new ApiError(400, 'Evidence required for passing execution');
    }
    const historyEntry = {
        at: new Date().toISOString(),
        by: String(userId),
        resultStatus,
        actualResult: assertSafeText(safe.actualResult || '', 'actualResult'),
        evidenceRefs,
    };
    const doc = await UatExecution.create({
        companyId,
        pilotProgramId: cycle.pilotProgramId,
        uatCycleId: cycle._id,
        testCaseId: safe.testCaseId,
        testerUserId: userId,
        industry: safe.industry || '',
        role: safe.role || 'UAT_TESTER',
        executedAt: new Date(),
        testInput: safe.testInput || null,
        expectedResult: assertSafeText(safe.expectedResult || tc?.expectedResult || '', 'expectedResult'),
        actualResult: assertSafeText(safe.actualResult || '', 'actualResult'),
        resultStatus,
        evidenceRefs,
        notes: assertSafeText(safe.notes || '', 'notes'),
        retestRequired: resultStatus === 'FAILED' || resultStatus === 'RETEST_REQUIRED',
        history: [historyEntry],
        simulationOnly: true,
        createdBy: userId,
        updatedBy: userId,
    });
    const counts = { PASSED: 'passCount', FAILED: 'failCount', BLOCKED: 'blockedCount', DEFERRED: 'deferredCount', NOT_RUN: 'notRunCount' };
    if (counts[resultStatus]) cycle[counts[resultStatus]] = (cycle[counts[resultStatus]] || 0) + 1;
    await cycle.save();
    await writeAudit(companyId, userId, 'UAT_EXECUTION', 'UatExecution', doc._id, { resultStatus }, { pilotProgramId: cycle.pilotProgramId });
    return forceSimulationOnly({ ...doc.toObject(), id: String(doc._id) });
}

export async function completeCycle(companyId, userId, id, body = {}, user = null) {
    assertPerm(user, PERMS.uat_review);
    rejectTenantOverrides(body);
    const cycle = await UatCycle.findOne({ _id: id, companyId, ...notDeleted() });
    if (!cycle) throw new ApiError(404, 'UAT cycle not found');
    if (cycle.cycleType === 'FINAL_UAT_REVIEW') {
        const openCritical = await PilotDefect.countDocuments({
            pilotProgramId: cycle.pilotProgramId, severity: 'CRITICAL',
            status: { $nin: ['CLOSED', 'REJECTED', 'RETEST_PASSED'] }, isDeleted: { $ne: true },
        });
        if (openCritical > 0) throw new ApiError(400, 'Critical defects block final UAT completion');
        const missingEvidence = await UatExecution.countDocuments({
            uatCycleId: cycle._id, resultStatus: { $in: ['PASSED', 'RETEST_PASSED'] },
            evidenceRefs: { $size: 0 }, isDeleted: { $ne: true },
        });
        // Only block if there are passed executions that required evidence - simplified: if any PASSED with empty evidence
        const passed = await UatExecution.find({ uatCycleId: cycle._id, resultStatus: { $in: ['PASSED', 'RETEST_PASSED'] }, isDeleted: { $ne: true } }).lean();
        if (passed.some((e) => !e.evidenceRefs?.length)) {
            throw new ApiError(400, 'Missing evidence blocks final UAT completion');
        }
        if (body.isolationFailed === true) throw new ApiError(400, 'Isolation tests fail — final UAT blocked');
    }
    cycle.status = 'COMPLETED';
    cycle.actualEnd = new Date();
    cycle.recommendation = body.recommendation || 'PASS';
    cycle.updatedBy = userId;
    await cycle.save();
    await writeAudit(companyId, userId, 'UAT_CYCLE_COMPLETE', 'UatCycle', cycle._id, {}, { pilotProgramId: cycle.pilotProgramId });
    return forceSimulationOnly({ ...cycle.toObject(), id: String(cycle._id) });
}

export async function addEvidence(companyId, userId, body = {}, user = null) {
    assertPerm(user, PERMS.evidence_manage);
    rejectTenantOverrides(body);
    if (body.contentBase64 || body.base64) throw new ApiError(400, 'Do not store large binary evidence as base64');
    const safe = stripUnsafeWriteFields(body);
    const exec = await UatExecution.findOne({ _id: safe.executionId, companyId, ...notDeleted() });
    if (!exec) throw new ApiError(404, 'Execution not found');
    const ref = {
        type: safe.type || 'screenshot_reference',
        reference: assertSafeText(safe.reference || '', 'reference'),
        note: assertSafeText(safe.note || '', 'note'),
        version: (exec.evidenceRefs?.length || 0) + 1,
        addedAt: new Date().toISOString(),
        addedBy: String(userId),
    };
    exec.evidenceRefs = [...(exec.evidenceRefs || []), ref];
    exec.history = [...(exec.history || []), { at: ref.addedAt, action: 'EVIDENCE_ADDED', ref }];
    exec.updatedBy = userId;
    await exec.save();
    await writeAudit(companyId, userId, 'UAT_EVIDENCE_ADD', 'UatExecution', exec._id, { ref }, { pilotProgramId: exec.pilotProgramId });
    return forceSimulationOnly({ executionId: String(exec._id), evidenceRefs: exec.evidenceRefs });
}

export async function listExecutions(companyId, query = {}, user = null) {
    assertView(user);
    rejectTenantOverrides(query);
    const q = { ...notDeleted(), companyId };
    if (query.uatCycleId) q.uatCycleId = query.uatCycleId;
    const items = await UatExecution.find(q).sort({ createdAt: -1 }).limit(200).lean();
    return { items: items.map((d) => forceSimulationOnly({ ...d, id: String(d._id) })) };
}

export async function listCycles(companyId, query = {}, user = null) {
    assertView(user);
    rejectTenantOverrides(query);
    const q = { ...notDeleted(), companyId };
    if (query.pilotProgramId) q.pilotProgramId = query.pilotProgramId;
    const items = await UatCycle.find(q).sort({ createdAt: -1 }).limit(100).lean();
    return { items: items.map((d) => forceSimulationOnly({ ...d, id: String(d._id) })) };
}