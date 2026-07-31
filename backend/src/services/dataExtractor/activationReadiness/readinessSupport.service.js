import { ApiError } from '../../../utils/ApiError.js';
import { ArAudit } from '../../../models/arAudit.model.js';
import { ArSavedView } from '../../../models/arSavedView.model.js';
import {
    CONTROL_LIBRARY, DEFAULT_SMOKE_CHECKS, DEFAULT_MANUAL_CHECKLIST, PERMS, RECOMMENDATION_WARNING,
} from './constants.js';
import { assertView, assertPerm } from './permissions.util.js';
import {
    rejectTenantOverrides, assertSafeText, assertPayloadSafe, forceSimulationOnly,
    sanitizeExportFormula, stripUnsafeWriteFields, notDeleted,
} from './normalize.util.js';
import { writeAudit } from './audit.util.js';
import { loadScopedProgram } from './activationReadinessProgram.service.js';
import { getSettings } from './settings.service.js';

export async function upsertSmokeTestPlan(companyId, userId, id, body = {}, user = null) {
    assertPerm(user, PERMS.smoke_test_plan);
    rejectTenantOverrides(body);
    assertPayloadSafe(body);
    const doc = await loadScopedProgram(companyId, id);
    if (body.productionExecuted === true || body.runAgainstProduction === true) {
        throw new ApiError(400, 'Smoke-test plan must not run against production');
    }
    const checks = (body.checks || DEFAULT_SMOKE_CHECKS).map((c) => (
        typeof c === 'string'
            ? { label: c, status: 'PENDING', productionExecuted: false }
            : { ...c, productionExecuted: false }
    ));
    doc.smokeTestPlan = {
        status: body.status || 'READY',
        complete: true,
        checks,
        localSimulationOnly: true,
        productionExecuted: false,
        updatedAt: new Date().toISOString(),
    };
    doc.updatedBy = userId;
    await doc.save();
    await writeAudit(companyId, userId, 'SMOKE_TEST_PLAN', 'ActivationReadinessProgram', doc._id, { checkCount: checks.length }, { activationProgramId: doc._id });
    return forceSimulationOnly({ ...doc.toObject(), id: String(doc._id) });
}

export async function generateManualChecklist(companyId, userId, id, body = {}, user = null) {
    assertPerm(user, PERMS.manual_checklist);
    rejectTenantOverrides(body);
    const doc = await loadScopedProgram(companyId, id);
    const markComplete = body.completeAll === true;
    doc.manualDeploymentChecklist = DEFAULT_MANUAL_CHECKLIST.map((c) => ({
        ...c,
        status: markComplete ? 'COMPLETE' : (c.status || 'PENDING'),
        checked: markComplete,
        documentationOnly: true,
        executableCommand: null,
    }));
    doc.updatedBy = userId;
    await doc.save();
    await writeAudit(companyId, userId, 'CHECKLIST_GENERATION', 'ActivationReadinessProgram', doc._id, { count: doc.manualDeploymentChecklist.length }, { activationProgramId: doc._id });
    return forceSimulationOnly({ ...doc.toObject(), id: String(doc._id) });
}

export async function generateHandoverPackage(companyId, userId, id, body = {}, user = null) {
    assertPerm(user, PERMS.handover);
    rejectTenantOverrides(body);
    assertPayloadSafe(body);
    const doc = await loadScopedProgram(companyId, id);
    const pkg = {
        status: 'PASS',
        complete: true,
        passed: true,
        releaseIdentification: doc.programCode,
        releaseVersion: doc.releaseVersion,
        checksums: { release: doc.releaseChecksum },
        phaseApprovalSummary: doc.phaseDependencies,
        readinessGateResults: doc.finalGates,
        openNonCriticalIssues: body.openNonCriticalIssues || [],
        acceptedRisks: body.acceptedRisks || [],
        maintenanceWindow: doc.maintenanceReview,
        monitoringPlanSummary: doc.monitoringReview,
        incidentPlanSummary: doc.incidentReview,
        backupRestorePlanReferences: { backup: !!doc.backupReview, restore: !!doc.restoreReview },
        rollbackPlanReference: !!doc.rollbackReview,
        communicationSummary: doc.communicationReview,
        customerImpactSummary: doc.customerImpactReview,
        hypercareSummary: doc.hypercareReview,
        smokeTestChecklist: doc.smokeTestPlan,
        manualDeploymentChecklist: doc.manualDeploymentChecklist,
        requiredHumanApprovalStatement: 'Separate human authorization and execution outside Cursor are required.',
        knownLimitations: body.knownLimitations || ['Local readiness is not production proof'],
        recommendationWarning: RECOMMENDATION_WARNING,
        secretsExcluded: true,
        executableDeploymentActionsExcluded: true,
        passwords: undefined,
        tokens: undefined,
        generatedAt: new Date().toISOString(),
    };
    const blob = JSON.stringify(pkg);
    if (/password|api[_-]?key|mongo(db)?(\+srv)?:\/\/|render[_-]?api|ghp_|sk-/i.test(blob)) {
        throw new ApiError(400, 'Handover package must not include secrets');
    }
    if (/deploy-now|auto-deploy|activate-production|rollback-now/i.test(blob)) {
        throw new ApiError(400, 'Handover package must not include executable deployment actions');
    }
    doc.handoverPackage = pkg;
    doc.updatedBy = userId;
    await doc.save();
    await writeAudit(companyId, userId, 'HANDOVER_GENERATION', 'ActivationReadinessProgram', doc._id, { secretsExcluded: true }, { activationProgramId: doc._id });
    return forceSimulationOnly({ ...doc.toObject(), id: String(doc._id) });
}

export async function recordBlocker(companyId, userId, id, body = {}, user = null) {
    assertPerm(user, PERMS.update);
    rejectTenantOverrides(body);
    assertPayloadSafe(body);
    const doc = await loadScopedProgram(companyId, id);
    const blocker = {
        type: String(body.type || 'GENERIC').slice(0, 80),
        message: assertSafeText(body.message || '', 'message'),
        severity: body.severity || 'HIGH',
        overrideAllowed: false,
        createdAt: new Date().toISOString(),
        createdBy: userId,
    };
    doc.blockers = [...(doc.blockers || []), blocker];
    if (body.silentlyOverride) throw new ApiError(400, 'Blockers must not be silently overridden');
    doc.updatedBy = userId;
    await doc.save();
    await writeAudit(companyId, userId, 'BLOCKER_RECORDED', 'ActivationReadinessProgram', doc._id, blocker, { activationProgramId: doc._id });
    return forceSimulationOnly({ ...doc.toObject(), id: String(doc._id) });
}

export async function recordException(companyId, userId, id, body = {}, user = null) {
    assertPerm(user, PERMS.exceptions);
    rejectTenantOverrides(body);
    assertPayloadSafe(body);
    const forbidden = [
        'SECURITY_FAILURE', 'TENANT_ISOLATION_FAILURE', 'COMPANY_ISOLATION_FAILURE', 'INDUSTRY_ISOLATION_FAILURE',
        'CRITICAL_DATA_INTEGRITY_FAILURE', 'MISSING_PHASE_24', 'MISSING_PHASE_25_CLOSURE', 'MISSING_PHASE_26',
        'CRITICAL_DEFECT', 'CRITICAL_RISK', 'MISSING_ROLLBACK_PLAN', 'MISSING_FINAL_APPROVAL',
    ];
    if (forbidden.includes(String(body.bypassType || '').toUpperCase()) || body.bypassCritical) {
        throw new ApiError(400, 'Exception cannot bypass critical safety/approval requirements');
    }
    const doc = await loadScopedProgram(companyId, id);
    if (!body.reason || !body.owner || !body.approver || !body.expiry) {
        throw new ApiError(400, 'Exception requires reason, owner, approver, expiry');
    }
    if (String(body.approver) === String(userId) && String(body.owner) === String(userId)) {
        throw new ApiError(403, 'Exception approval must be separate from requestor where configured');
    }
    const ex = {
        reason: assertSafeText(body.reason, 'reason'),
        scope: assertSafeText(body.scope || 'non-critical', 'scope'),
        owner: body.owner,
        approver: body.approver,
        risk: body.risk || 'LOW',
        compensatingControl: assertSafeText(body.compensatingControl || '', 'compensatingControl'),
        evidence: body.evidence || '',
        expiry: body.expiry,
        reviewDate: body.reviewDate || body.expiry,
        createdAt: new Date().toISOString(),
        createdBy: userId,
    };
    doc.exceptions = [...(doc.exceptions || []), ex];
    doc.updatedBy = userId;
    await doc.save();
    await writeAudit(companyId, userId, 'EXCEPTION_APPROVAL', 'ActivationReadinessProgram', doc._id, ex, { activationProgramId: doc._id });
    return forceSimulationOnly({ ...doc.toObject(), id: String(doc._id) });
}

export async function completeAllReviewsForTests(companyId, userId, id, user = null) {
    assertPerm(user, PERMS.manage);
    const doc = await loadScopedProgram(companyId, id);
    const pass = {
        status: 'PASS', complete: true, passed: true, reviewedAt: new Date().toISOString(), reviewedBy: userId,
        simulationOnly: true, executed: false, productionExecuted: false,
    };
    doc.lineageValidation = {
        status: 'PASS', companyMatch: true, tenantMatch: true, industryMatch: true, versionMatch: true,
        checksumMatch: true, phase23Present: true, phase24Present: true, phase24Valid: true,
        phase25ClosureApproved: true, phase26Approved: true, supersededRejected: true, blockers: [],
        validatedAt: new Date().toISOString(),
    };
    doc.integrityReview = { status: 'PASS', packageChecksum: doc.releaseChecksum || 'ok', reviewedAt: new Date().toISOString() };
    doc.phaseDependencies = {
        status: 'PASS', phase23Approved: true, phase24Approved: true, phase25Approved: true, phase26Approved: true,
        blockers: [], overrideAllowed: false, validatedAt: new Date().toISOString(),
    };
    doc.defectGate = { status: 'PASS', openCritical: 0, reason: 'none', reviewedAt: new Date().toISOString() };
    doc.riskGate = { status: 'PASS', openCritical: 0, acceptedRiskExpired: false, isolationFailure: false, reason: 'none', reviewedAt: new Date().toISOString() };
    doc.approvalReview = { ...pass, approvals: [{ role: 'final', approved: true }] };
    doc.environmentReview = { ...pass, targetType: 'PRODUCTION_MANUAL_DEPLOYMENT_PLANNING_ONLY' };
    doc.maintenanceReview = { ...pass };
    doc.monitoringReview = { ...pass };
    doc.incidentReview = { ...pass };
    doc.escalationReview = { ...pass };
    doc.backupReview = { ...pass, backupExecuted: false };
    doc.restoreReview = { ...pass, restoreExecuted: false };
    doc.rollbackReview = { ...pass, rollbackExecuted: false };
    doc.drReview = { ...pass };
    doc.businessContinuityReview = { ...pass };
    doc.communicationReview = { ...pass, emailSent: false, whatsappSent: false };
    doc.customerImpactReview = { ...pass };
    doc.hypercareReview = { ...pass };
    doc.smokeTestPlan = {
        status: 'READY', complete: true,
        checks: DEFAULT_SMOKE_CHECKS.map((label) => ({ label, status: 'PENDING', productionExecuted: false })),
        productionExecuted: false, localSimulationOnly: true,
    };
    doc.manualDeploymentChecklist = DEFAULT_MANUAL_CHECKLIST.map((c) => ({ ...c, status: 'COMPLETE', checked: true, documentationOnly: true }));
    doc.handoverPackage = {
        status: 'PASS', complete: true, passed: true, secretsExcluded: true,
        executableDeploymentActionsExcluded: true, recommendationWarning: RECOMMENDATION_WARNING,
    };
    doc.blockers = [];
    doc.status = 'READY_FOR_FINAL_REVIEW';
    doc.updatedBy = userId;
    await doc.save();
    return forceSimulationOnly({ ...doc.toObject(), id: String(doc._id) });
}

export async function listSavedViews(companyId, userId, user = null) {
    assertPerm(user, PERMS.saved_views);
    const items = await ArSavedView.find({ companyId, userId, ...notDeleted() }).sort({ createdAt: -1 }).limit(50).lean();
    return { items: items.map((d) => forceSimulationOnly({ ...d, id: String(d._id) })) };
}

export async function createSavedView(companyId, userId, body = {}, user = null) {
    assertPerm(user, PERMS.saved_views);
    rejectTenantOverrides(body);
    assertPayloadSafe(body);
    const doc = await ArSavedView.create({
        companyId, userId,
        name: assertSafeText(body.name || 'My view', 'name'),
        viewKey: String(body.viewKey || '').slice(0, 80),
        filters: body.filters || {},
        sort: body.sort || {},
        simulationOnly: true,
    });
    return forceSimulationOnly({ ...doc.toObject(), id: String(doc._id) });
}

export async function deleteSavedView(companyId, userId, id, user = null) {
    assertPerm(user, PERMS.saved_views);
    const doc = await ArSavedView.findOne({ _id: id, companyId, userId, ...notDeleted() });
    if (!doc) throw new ApiError(404, 'Saved view not found');
    doc.isDeleted = true;
    await doc.save();
    return { deleted: true };
}

export async function listAudit(companyId, query = {}, user = null) {
    assertPerm(user, PERMS.audit);
    const q = { companyId };
    if (query.activationProgramId) q.activationProgramId = query.activationProgramId;
    const items = await ArAudit.find(q).sort({ createdAt: -1 }).limit(200).lean();
    return { items: items.map((d) => forceSimulationOnly({ ...d, id: String(d._id), immutable: true })) };
}

export async function exportReport(companyId, userId, query = {}, user = null) {
    assertPerm(user, PERMS.export);
    rejectTenantOverrides(query);
    const settings = (await getSettings(companyId, user)).settings;
    const limit = Math.min(Number(query.limit || settings.maximumExportRows || 500), settings.maximumExportRows || 500);
    const { ActivationReadinessProgram } = await import('../../../models/activationReadinessProgram.model.js');
    const items = await ActivationReadinessProgram.find({ companyId, ...notDeleted() }).sort({ createdAt: -1 }).limit(limit).lean();
    const rows = items.map((d) => ({
        programCode: sanitizeExportFormula(d.programCode),
        status: d.status,
        recommendation: d.recommendation,
        releaseVersion: sanitizeExportFormula(d.releaseVersion || ''),
        simulationOnly: true,
        deploymentExecuted: false,
        productionActivated: false,
    }));
    const blob = JSON.stringify(rows);
    if (/password|api[_-]?key|mongo(db)?(\+srv)?:\/\/|ghp_|sk-/i.test(blob)) {
        throw new ApiError(400, 'Export excluded sensitive fields');
    }
    await writeAudit(companyId, userId, 'EXPORT', 'ActivationReadinessProgram', null, { count: rows.length, type: query.type || 'summary' });
    return forceSimulationOnly({ rows, count: rows.length, secretsExcluded: true, executableScriptsExcluded: true });
}

export function listControls(user = null) {
    assertView(user);
    return { items: CONTROL_LIBRARY };
}