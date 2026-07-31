import { ApiError } from '../../../utils/ApiError.js';
import { PilotProgram } from '../../../models/pilotProgram.model.js';
import { PilotDefect } from '../../../models/pilotDefect.model.js';
import { PilotFeedback } from '../../../models/pilotFeedback.model.js';
import { PilotRisk } from '../../../models/pilotRisk.model.js';
import { PilotRollbackPlan } from '../../../models/pilotRollbackPlan.model.js';
import { UatExecution } from '../../../models/uatExecution.model.js';
import { UatCycle } from '../../../models/uatCycle.model.js';
import { StagingSimulation } from '../../../models/stagingSimulation.model.js';
import { DEFAULT_SUCCESS_CRITERIA, DEFAULT_FAILURE_CRITERIA, PERMS, CONTROL_LIBRARY } from './constants.js';
import { assertView, assertPerm } from './permissions.util.js';
import { rejectTenantOverrides, assertSafeText, notDeleted, forceSimulationOnly } from './normalize.util.js';
import { writeAudit } from './audit.util.js';
import { loadScopedProgram, evaluatePhase26Gates } from './pilotProgram.service.js';

export async function evaluateCriteria(companyId, pilotProgramId, user = null) {
    assertView(user);
    const program = await loadScopedProgram(companyId, pilotProgramId);
    const openCritical = await PilotDefect.countDocuments({
        pilotProgramId: program._id, severity: 'CRITICAL',
        status: { $nin: ['CLOSED', 'REJECTED', 'RETEST_PASSED'] }, isDeleted: { $ne: true },
    });
    const rb = await PilotRollbackPlan.findOne({ pilotProgramId: program._id, isDeleted: { $ne: true } }).lean();
    const sims = await StagingSimulation.find({ pilotProgramId: program._id, isDeleted: { $ne: true } }).lean();
    const isolationFail = sims.some((s) => s.actualLocalResult?.companyIsolation === 'FAIL' || s.actualLocalResult?.industryIsolation === 'FAIL');
    const executions = await UatExecution.find({ pilotProgramId: program._id, isDeleted: { $ne: true } }).lean();
    const criticalCases = executions.filter((e) => e.resultStatus !== 'NOT_RUN');
    const success = (program.successCriteria?.length ? program.successCriteria : DEFAULT_SUCCESS_CRITERIA).map((c) => {
        let passed = true;
        if (c.key === 'NO_OPEN_CRITICAL_DEFECTS') passed = openCritical === 0;
        if (c.key === 'ROLLBACK_REVIEWED') passed = !!rb && ['SIMULATION_PASSED', 'READY_FOR_PILOT_REVIEW', 'READY_FOR_SIMULATION'].includes(rb.readinessStatus);
        if (c.key === 'COMPANY_ISOLATION_PASS' || c.key === 'INDUSTRY_ISOLATION_PASS' || c.key === 'TENANT_ISOLATION_PASS') passed = !isolationFail;
        if (c.key === 'CRITICAL_UAT_EXECUTED') passed = criticalCases.length > 0 || executions.length === 0;
        if (c.key === 'EVIDENCE_COMPLETE') passed = !executions.some((e) => ['PASSED', 'RETEST_PASSED'].includes(e.resultStatus) && !(e.evidenceRefs || []).length);
        return { ...c, status: passed ? 'MET' : 'NOT_MET', passed };
    });
    const failure = (program.failureCriteria?.length ? program.failureCriteria : DEFAULT_FAILURE_CRITERIA).map((c) => {
        let triggered = false;
        if (c.key === 'OPEN_CRITICAL_DEFECT') triggered = openCritical > 0;
        if (c.key === 'FAILED_ROLLBACK_SIMULATION') triggered = rb?.readinessStatus === 'SIMULATION_FAILED';
        if (c.key === 'COMPANY_DATA_LEAKAGE' || c.key === 'TENANT_DATA_LEAKAGE' || c.key === 'INDUSTRY_DATA_LEAKAGE') triggered = isolationFail;
        return { ...c, status: triggered ? 'TRIGGERED' : 'CLEAR', triggered };
    });
    return forceSimulationOnly({
        pilotProgramId: String(program._id),
        successCriteria: success,
        failureCriteria: failure,
        allSuccessMet: success.every((s) => s.passed),
        anyFailureTriggered: failure.some((f) => f.triggered),
    });
}

export async function closureReview(companyId, userId, id, body = {}, user = null) {
    assertPerm(user, PERMS.final_review);
    rejectTenantOverrides(body);
    const program = await loadScopedProgram(companyId, id);
    const criteria = await evaluateCriteria(companyId, id, user);
    if (criteria.anyFailureTriggered || !criteria.allSuccessMet) {
        throw new ApiError(400, 'Closure blocked by unmet success criteria or triggered failure criteria');
    }
    const gates = await evaluatePhase26Gates(companyId, program);
    if (!gates.eligible) throw new ApiError(400, `Closure blocked: ${gates.blockers.join('; ')}`);
    const outcome = body.outcome || 'PILOT_CLOSURE_RECOMMENDED';
    program.status = outcome === 'READY_FOR_PHASE_26_REVIEW' ? 'READY_FOR_PHASE_26_REVIEW' : 'PILOT_CLOSURE_RECOMMENDED';
    program.recommendation = program.status;
    program.recommendationReason = assertSafeText(body.reason || 'Pilot closure review completed (recommendation only)', 'reason');
    program.simulationOnly = true;
    program.productionExecutionAllowed = false;
    program.deploymentExecuted = false;
    program.productionActivated = false;
    program.updatedBy = userId;
    await program.save();
    await writeAudit(companyId, userId, 'CLOSURE_REVIEW', 'PilotProgram', program._id, { outcome: program.status }, { pilotProgramId: program._id });
    return forceSimulationOnly({
        ...program.toObject(),
        id: String(program._id),
        criteria,
        phase26Authorized: false,
        phase26Started: false,
    });
}

export async function healthDashboard(companyId, query = {}, user = null) {
    assertView(user);
    rejectTenantOverrides(query);
    const q = { companyId, isDeleted: { $ne: true } };
    const programs = await PilotProgram.find(query.pilotProgramId ? { _id: query.pilotProgramId, companyId, isDeleted: { $ne: true } } : q).limit(20).lean();
    const programIds = programs.map((p) => p._id);
    const [defects, feedback, risks, cycles, rollbacks] = await Promise.all([
        PilotDefect.find({ companyId, pilotProgramId: { $in: programIds }, isDeleted: { $ne: true } }).lean(),
        PilotFeedback.find({ companyId, pilotProgramId: { $in: programIds }, isDeleted: { $ne: true } }).lean(),
        PilotRisk.find({ companyId, pilotProgramId: { $in: programIds }, isDeleted: { $ne: true } }).lean(),
        UatCycle.find({ companyId, pilotProgramId: { $in: programIds }, isDeleted: { $ne: true } }).lean(),
        PilotRollbackPlan.find({ companyId, pilotProgramId: { $in: programIds }, isDeleted: { $ne: true } }).lean(),
    ]);
    return forceSimulationOnly({
        pilotSummary: programs.map((p) => ({ id: String(p._id), code: p.pilotCode, status: p.status, recommendation: p.recommendation })),
        defectSummary: {
            total: defects.length,
            critical: defects.filter((d) => d.severity === 'CRITICAL').length,
            open: defects.filter((d) => !['CLOSED', 'REJECTED'].includes(d.status)).length,
        },
        feedbackSummary: { total: feedback.length, negative: feedback.filter((f) => f.sentiment === 'NEGATIVE').length },
        riskSummary: { total: risks.length, open: risks.filter((r) => r.status === 'OPEN').length },
        uatSummary: cycles.map((c) => ({ id: String(c._id), name: c.cycleName, pass: c.passCount, fail: c.failCount, status: c.status })),
        rollbackReadiness: rollbacks.map((r) => ({ id: String(r._id), status: r.readinessStatus, score: r.readinessScore })),
        actions: ['Record plan', 'Run local validation', 'Simulate', 'Submit for review', 'Recommend Phase 26 review'],
        forbiddenActions: ['Deploy Now', 'Activate Production', 'Execute Rollback', 'Run Migration'],
        productionTelemetry: false,
    });
}

export async function metrics(companyId, query = {}, user = null) {
    assertView(user);
    rejectTenantOverrides(query);
    const pilotProgramId = query.pilotProgramId;
    if (!pilotProgramId) throw new ApiError(400, 'pilotProgramId required');
    await loadScopedProgram(companyId, pilotProgramId);
    const executions = await UatExecution.find({ companyId, pilotProgramId, isDeleted: { $ne: true } }).lean();
    const total = executions.length || 1;
    const passed = executions.filter((e) => ['PASSED', 'RETEST_PASSED'].includes(e.resultStatus)).length;
    const failed = executions.filter((e) => ['FAILED', 'RETEST_FAILED'].includes(e.resultStatus)).length;
    const blocked = executions.filter((e) => e.resultStatus === 'BLOCKED').length;
    const defects = await PilotDefect.find({ companyId, pilotProgramId, isDeleted: { $ne: true } }).lean();
    return forceSimulationOnly({
        pilotProgramId: String(pilotProgramId),
        uatCompletionPct: Math.round((executions.filter((e) => e.resultStatus !== 'NOT_RUN').length / total) * 100),
        testPassRate: Math.round((passed / total) * 100),
        testFailRate: Math.round((failed / total) * 100),
        blockedTestRate: Math.round((blocked / total) * 100),
        criticalDefectCount: defects.filter((d) => d.severity === 'CRITICAL' && !['CLOSED', 'REJECTED'].includes(d.status)).length,
        highDefectCount: defects.filter((d) => d.severity === 'HIGH' && !['CLOSED', 'REJECTED'].includes(d.status)).length,
        productionTelemetryUsed: false,
    });
}

export function listControls(user = null) {
    assertView(user);
    return forceSimulationOnly({ items: CONTROL_LIBRARY, simulationOnly: true });
}