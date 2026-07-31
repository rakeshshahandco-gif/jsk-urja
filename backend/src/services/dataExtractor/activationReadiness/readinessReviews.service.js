import { ApiError } from '../../../utils/ApiError.js';
import { PERMS } from './constants.js';
import { assertPerm, isClientAdminOnly } from './permissions.util.js';
import {
    rejectTenantOverrides, assertSafeText, assertPayloadSafe, forceSimulationOnly,
    assertSafeEnvironment, stripUnsafeWriteFields,
} from './normalize.util.js';
import { writeAudit } from './audit.util.js';
import { loadScopedProgram } from './activationReadinessProgram.service.js';

async function saveReview(companyId, userId, id, field, review, auditAction, user, perm) {
    assertPerm(user, perm);
    rejectTenantOverrides(review);
    assertPayloadSafe(review);
    const doc = await loadScopedProgram(companyId, id);
    const safe = stripUnsafeWriteFields(review || {});
    if (safe.productionExecutionAllowed === true || safe.deploymentExecuted === true || safe.executed === true) {
        throw new ApiError(400, 'Unsafe execution fields rejected');
    }
    const payload = {
        ...safe,
        status: safe.status || 'PASS',
        complete: true,
        passed: true,
        reviewedAt: new Date().toISOString(),
        reviewedBy: userId,
        simulationOnly: true,
        executed: false,
        productionExecuted: false,
    };
    doc[field] = payload;
    doc.updatedBy = userId;
    await doc.save();
    await writeAudit(companyId, userId, auditAction, 'ActivationReadinessProgram', doc._id, { field }, { activationProgramId: doc._id });
    return forceSimulationOnly({ ...doc.toObject(), id: String(doc._id) });
}

export async function recordDefectGate(companyId, userId, id, body = {}, user = null) {
    assertPerm(user, PERMS.defect_gate);
    rejectTenantOverrides(body);
    assertPayloadSafe(body);
    const doc = await loadScopedProgram(companyId, id);
    const openCritical = Number(body.openCritical || 0);
    const failedRetest = Number(body.failedCriticalRetest || 0);
    const reopened = Number(body.reopenedCritical || 0);
    const missingClosure = Number(body.missingCriticalClosureEvidence || 0);
    if (body.selfWaiveCritical && String(body.defectOwnerId) === String(userId)) {
        throw new ApiError(403, 'Defect owner cannot independently waive a critical defect');
    }
    const blocked = openCritical > 0 || failedRetest > 0 || reopened > 0 || missingClosure > 0;
    doc.defectGate = {
        status: blocked ? 'FAIL' : 'PASS',
        openCritical,
        failedCriticalRetest: failedRetest,
        reopenedCritical: reopened,
        missingCriticalClosureEvidence: missingClosure,
        highDeferredRequireAcceptedRisk: !!body.highDeferredRequireAcceptedRisk,
        reason: blocked ? 'open or unresolved critical defects' : 'no open critical defects',
        reviewedAt: new Date().toISOString(),
    };
    if (blocked) {
        doc.blockers = [...(doc.blockers || []), { type: 'OPEN_CRITICAL_DEFECT', message: doc.defectGate.reason, createdAt: new Date().toISOString() }];
    }
    doc.updatedBy = userId;
    await doc.save();
    await writeAudit(companyId, userId, 'DEFECT_GATE', 'ActivationReadinessProgram', doc._id, doc.defectGate, { activationProgramId: doc._id });
    return forceSimulationOnly({ ...doc.toObject(), id: String(doc._id) });
}

export async function recordRiskGate(companyId, userId, id, body = {}, user = null) {
    assertPerm(user, PERMS.risk_gate);
    rejectTenantOverrides(body);
    assertPayloadSafe(body);
    const doc = await loadScopedProgram(companyId, id);
    if (body.acceptOwnCritical && String(body.riskOwnerId || doc.createdBy) === String(userId)) {
        throw new ApiError(403, 'Critical risk self-acceptance blocked');
    }
    if (isClientAdminOnly(user) && body.platformCriticalAcceptance) {
        throw new ApiError(403, 'Client Admin cannot accept platform-level critical risk');
    }
    const openCritical = Number(body.openCritical || 0);
    const acceptedExpired = Number(body.acceptedRiskExpiredCount || 0);
    const isolationFailure = !!(body.tenantIsolationRisk || body.companyIsolationRisk || body.industryIsolationRisk);
    const blocked = openCritical > 0 || acceptedExpired > 0 || isolationFailure;
    doc.riskGate = {
        status: blocked ? 'FAIL' : 'PASS',
        openCritical,
        acceptedRiskExpired: acceptedExpired > 0,
        acceptedRiskExpiredCount: acceptedExpired,
        isolationFailure,
        reason: blocked ? 'open critical/expired/isolation risk' : 'no blocking critical risks',
        reviewedAt: new Date().toISOString(),
    };
    if (blocked) {
        doc.blockers = [...(doc.blockers || []), { type: 'OPEN_CRITICAL_RISK', message: doc.riskGate.reason, createdAt: new Date().toISOString() }];
    }
    doc.updatedBy = userId;
    await doc.save();
    await writeAudit(companyId, userId, 'RISK_GATE', 'ActivationReadinessProgram', doc._id, doc.riskGate, { activationProgramId: doc._id });
    return forceSimulationOnly({ ...doc.toObject(), id: String(doc._id) });
}

export async function recordApprovalReview(companyId, userId, id, body = {}, user = null) {
    assertPerm(user, PERMS.approvals);
    rejectTenantOverrides(body);
    assertPayloadSafe(body);
    const doc = await loadScopedProgram(companyId, id);
    if (body.finalApprove && String(doc.createdBy) === String(userId)) {
        throw new ApiError(403, 'Requestor cannot final-approve own readiness program');
    }
    if (isClientAdminOnly(user) && (body.platformWide || body.approveOtherCompany)) {
        throw new ApiError(403, 'Client Admin cannot approve platform-wide readiness or another company');
    }
    const roles = body.approvals || body.requiredRoles || [];
    const missing = (Array.isArray(roles) ? roles : []).filter((r) => !r.approved);
    const withdrawn = !!body.withdraw;
    if (withdrawn) {
        doc.approvalReview = {
            status: 'FAIL',
            complete: false,
            withdrawn: true,
            reason: assertSafeText(body.reason || 'approval withdrawn', 'reason'),
            reviewedAt: new Date().toISOString(),
        };
        await writeAudit(companyId, userId, 'APPROVAL_WITHDRAWAL', 'ActivationReadinessProgram', doc._id, { reason: body.reason }, { activationProgramId: doc._id });
    } else {
        doc.approvalReview = {
            status: missing.length ? 'FAIL' : 'PASS',
            complete: missing.length === 0,
            passed: missing.length === 0,
            approvals: roles,
            missing: missing.map((m) => m.role || m.name),
            reason: assertSafeText(body.reason || '', 'reason'),
            evidenceRef: body.evidenceRef || '',
            reviewedAt: new Date().toISOString(),
            reviewedBy: userId,
        };
        await writeAudit(companyId, userId, 'APPROVAL', 'ActivationReadinessProgram', doc._id, doc.approvalReview, { activationProgramId: doc._id });
    }
    if (missing.length && !withdrawn) {
        doc.blockers = [...(doc.blockers || []), { type: 'MISSING_APPROVAL', message: missing.map((m) => m.role || m.name).join(','), createdAt: new Date().toISOString() }];
    }
    doc.updatedBy = userId;
    await doc.save();
    return forceSimulationOnly({ ...doc.toObject(), id: String(doc._id) });
}

export async function recordEnvironmentReview(companyId, userId, id, body = {}, user = null) {
    assertSafeEnvironment(body.targetType || body.proposedEnvironment || 'PRODUCTION_MANUAL_DEPLOYMENT_PLANNING_ONLY');
    if (body.password || body.apiKey || body.mongoUri || body.renderToken) {
        throw new ApiError(400, 'Credentials must not be stored');
    }
    return saveReview(companyId, userId, id, 'environmentReview', {
        ...body,
        targetType: 'PRODUCTION_MANUAL_DEPLOYMENT_PLANNING_ONLY',
        liveCallsMade: false,
        credentialsStored: false,
    }, 'ENVIRONMENT_REVIEW', user, PERMS.environment_review);
}

export async function recordMaintenanceReview(companyId, userId, id, body = {}, user = null) {
    return saveReview(companyId, userId, id, 'maintenanceReview', {
        ...body,
        scheduledExecution: false,
        deploymentTriggered: false,
    }, 'MAINTENANCE_REVIEW', user, PERMS.maintenance_review);
}

export async function recordMonitoringReview(companyId, userId, id, body = {}, user = null) {
    return saveReview(companyId, userId, id, 'monitoringReview', {
        ...body,
        productionMonitoringConnected: false,
        alertsSent: false,
    }, 'MONITORING_REVIEW', user, PERMS.monitoring_review);
}

export async function recordIncidentReview(companyId, userId, id, body = {}, user = null) {
    return saveReview(companyId, userId, id, 'incidentReview', {
        ...body,
        alertsSent: false,
        usersContacted: false,
    }, 'INCIDENT_REVIEW', user, PERMS.incident_review);
}

export async function recordEscalationReview(companyId, userId, id, body = {}, user = null) {
    return saveReview(companyId, userId, id, 'escalationReview', {
        ...body,
        notificationsSent: false,
    }, 'ESCALATION_REVIEW', user, PERMS.incident_review);
}

export async function recordBackupReview(companyId, userId, id, body = {}, user = null) {
    return saveReview(companyId, userId, id, 'backupReview', {
        ...body,
        backupExecuted: false,
    }, 'BACKUP_REVIEW', user, PERMS.backup_review);
}

export async function recordRestoreReview(companyId, userId, id, body = {}, user = null) {
    return saveReview(companyId, userId, id, 'restoreReview', {
        ...body,
        restoreExecuted: false,
    }, 'RESTORE_REVIEW', user, PERMS.restore_review);
}

export async function recordRollbackReview(companyId, userId, id, body = {}, user = null) {
    return saveReview(companyId, userId, id, 'rollbackReview', {
        ...body,
        rollbackExecuted: false,
    }, 'ROLLBACK_REVIEW', user, PERMS.rollback_review);
}

export async function recordDrReview(companyId, userId, id, body = {}, user = null) {
    return saveReview(companyId, userId, id, 'drReview', {
        ...body,
        drExecuted: false,
    }, 'DR_REVIEW', user, PERMS.dr_review);
}

export async function recordBusinessContinuityReview(companyId, userId, id, body = {}, user = null) {
    return saveReview(companyId, userId, id, 'businessContinuityReview', {
        ...body,
        executed: false,
    }, 'BUSINESS_CONTINUITY_REVIEW', user, PERMS.dr_review);
}

export async function recordCommunicationReview(companyId, userId, id, body = {}, user = null) {
    return saveReview(companyId, userId, id, 'communicationReview', {
        ...body,
        emailSent: false,
        whatsappSent: false,
        templatesOnly: true,
    }, 'COMMUNICATION_REVIEW', user, PERMS.communication_review);
}

export async function recordCustomerImpactReview(companyId, userId, id, body = {}, user = null) {
    return saveReview(companyId, userId, id, 'customerImpactReview', body, 'CUSTOMER_IMPACT_REVIEW', user, PERMS.customer_impact);
}

export async function recordHypercareReview(companyId, userId, id, body = {}, user = null) {
    return saveReview(companyId, userId, id, 'hypercareReview', {
        ...body,
        calendarEventsCreated: false,
        alertsCreated: false,
    }, 'HYPERCARE_REVIEW', user, PERMS.hypercare);
}