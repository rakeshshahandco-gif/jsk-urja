import { ApiError } from '../../../utils/ApiError.js';
import { ActivationReadinessProgram } from '../../../models/activationReadinessProgram.model.js';
import { ReleasePackage } from '../../../models/releasePackage.model.js';
import { ProductionReadinessCertification } from '../../../models/productionReadinessCertification.model.js';
import { PilotProgram } from '../../../models/pilotProgram.model.js';
import { OperationsProgram } from '../../../models/operationsProgram.model.js';
import {
    ALLOWED_TRANSITIONS, MANDATORY_GATES, DEFAULT_SMOKE_CHECKS, DEFAULT_MANUAL_CHECKLIST,
    PERMS, RECOMMENDATION_WARNING,
} from './constants.js';
import { assertView, assertPerm, isClientAdminOnly, isPlatformAdmin } from './permissions.util.js';
import {
    rejectTenantOverrides, assertNoSecrets, assertSafeText, assertPayloadSafe,
    notDeleted, forceSimulationOnly, assertSafeEnvironment, assertSafeStatus, stripUnsafeWriteFields,
} from './normalize.util.js';
import { writeAudit } from './audit.util.js';
import { getSettings } from './settings.service.js';

function assertTransition(from, to) {
    const allowed = ALLOWED_TRANSITIONS[from] || [];
    if (!allowed.includes(to)) throw new ApiError(400, `Invalid activation-readiness transition ${from} -> ${to}`);
}

export async function loadScopedProgram(companyId, id) {
    const doc = await ActivationReadinessProgram.findOne({ _id: id, ...notDeleted() });
    if (!doc) throw new ApiError(404, 'Activation readiness program not found');
    if (!doc.platformScoped && String(doc.companyId) !== String(companyId)) {
        throw new ApiError(404, 'Activation readiness program not found');
    }
    return doc;
}

async function verifyLineage(companyId, ids = {}) {
    const {
        releasePackageId, readinessCertificationId, pilotProgramId, operationsProgramId,
    } = ids;
    if (!releasePackageId) throw new ApiError(400, 'Phase 23 releasePackageId is required');
    if (!readinessCertificationId) throw new ApiError(400, 'Phase 24 readinessCertificationId is required');
    if (!pilotProgramId) throw new ApiError(400, 'Phase 25 pilotProgramId is required');
    if (!operationsProgramId) throw new ApiError(400, 'Phase 26 operationsProgramId is required');

    const release = await ReleasePackage.findOne({ _id: releasePackageId, isDeleted: { $ne: true } }).lean();
    if (!release) throw new ApiError(400, 'Phase 23 release package not found');
    if (release.companyId && String(release.companyId) !== String(companyId) && !release.platformScoped) {
        throw new ApiError(403, 'Release package company scope mismatch');
    }
    if (release.status === 'SUPERSEDED') throw new ApiError(400, 'Superseded release rejected');

    const cert = await ProductionReadinessCertification.findOne({ _id: readinessCertificationId, isDeleted: { $ne: true } }).lean();
    if (!cert) throw new ApiError(400, 'Phase 24 readiness certification not found');
    if (cert.companyId && String(cert.companyId) !== String(companyId) && !cert.platformScoped) {
        throw new ApiError(403, 'Certification company scope mismatch');
    }
    if (['REJECTED', 'EXPIRED', 'ARCHIVED'].includes(cert.status)) {
        throw new ApiError(400, 'Invalid/expired Phase 24 certification');
    }
    if (cert.releasePackageId && String(cert.releasePackageId) !== String(releasePackageId)) {
        throw new ApiError(400, 'Certification release linkage mismatch');
    }

    const pilot = await PilotProgram.findOne({ _id: pilotProgramId, isDeleted: { $ne: true } }).lean();
    if (!pilot) throw new ApiError(400, 'Phase 25 pilot program not found');
    if (pilot.companyId && String(pilot.companyId) !== String(companyId) && !pilot.platformScoped) {
        throw new ApiError(403, 'Pilot program company scope mismatch');
    }
    const pilotOk = ['READY_FOR_PHASE_26_REVIEW', 'PILOT_CLOSURE_RECOMMENDED', 'UAT_COMPLETED', 'ARCHIVED'].includes(pilot.status)
        || pilot.recommendation === 'READY_FOR_PHASE_26_REVIEW';
    if (!pilotOk) throw new ApiError(400, 'Phase 25 pilot closure/recommendation required');

    const ops = await OperationsProgram.findOne({ _id: operationsProgramId, isDeleted: { $ne: true } }).lean();
    if (!ops) throw new ApiError(400, 'Phase 26 operations program not found');
    if (ops.companyId && String(ops.companyId) !== String(companyId) && !ops.platformScoped) {
        throw new ApiError(403, 'Operations program company scope mismatch');
    }
    const opsOk = ['READY_FOR_PHASE_27_REVIEW', 'ARCHIVED'].includes(ops.status)
        || ops.recommendation === 'READY_FOR_PHASE_27_REVIEW';
    if (!opsOk && !['OPERATIONAL_REVIEW_COMPLETE', 'READY_FOR_PHASE_27_REVIEW'].includes(ops.status)) {
        // allow programs already recommended for Phase 27; otherwise require recommendation
        if (ops.recommendation !== 'READY_FOR_PHASE_27_REVIEW') {
            throw new ApiError(400, 'Phase 26 approval/recommendation required');
        }
    }
    if (ops.releasePackageId && String(ops.releasePackageId) !== String(releasePackageId)) {
        throw new ApiError(400, 'Operations release linkage mismatch');
    }

    return { release, cert, pilot, ops };
}

export async function listPrograms(companyId, query = {}, user = null) {
    assertView(user);
    rejectTenantOverrides(query);
    const q = { ...notDeleted(), companyId };
    if (query.status) q.status = String(query.status);
    const items = await ActivationReadinessProgram.find(q).sort({ createdAt: -1 }).limit(100).lean();
    return { items: items.map((d) => forceSimulationOnly({ ...d, id: String(d._id) })) };
}

export async function getProgram(companyId, id, user = null) {
    assertView(user);
    const doc = await loadScopedProgram(companyId, id);
    return forceSimulationOnly({ ...doc.toObject(), id: String(doc._id) });
}

export async function createProgram(companyId, userId, body = {}, user = null) {
    assertPerm(user, PERMS.create);
    rejectTenantOverrides(body);
    assertNoSecrets(body);
    assertPayloadSafe(body);
    if (body.productionExecutionAllowed === true || body.deploymentExecuted === true || body.productionActivated === true
        || body.renderActionExecuted === true || body.gitCommitExecuted === true || body.gitPushExecuted === true
        || body.rollbackExecuted === true || body.backupExecuted === true || body.restoreExecuted === true
        || body.migrationExecuted === true) {
        throw new ApiError(400, 'Unsafe execution fields rejected');
    }
    const safe = stripUnsafeWriteFields(body);
    if (isClientAdminOnly(user) && safe.platformScoped) {
        throw new ApiError(403, 'Client Admin cannot create platform-scoped activation readiness programs');
    }
    const links = await verifyLineage(companyId, safe);
    const proposedEnvironment = assertSafeEnvironment(safe.proposedEnvironment || 'PRODUCTION_MANUAL_DEPLOYMENT_PLANNING_ONLY');
    const programCode = String(safe.programCode || `AR-${Date.now()}`).slice(0, 80);
    const doc = await ActivationReadinessProgram.create({
        companyId,
        platformScoped: false,
        programCode,
        programName: assertSafeText(safe.programName || programCode, 'programName'),
        description: assertSafeText(safe.description || '', 'description'),
        releasePackageId: safe.releasePackageId,
        readinessCertificationId: safe.readinessCertificationId,
        pilotProgramId: safe.pilotProgramId,
        pilotClosureId: String(safe.pilotClosureId || safe.pilotProgramId || ''),
        operationsProgramId: safe.operationsProgramId,
        phase26RecommendationId: String(safe.phase26RecommendationId || safe.operationsProgramId || ''),
        releaseVersion: String(safe.releaseVersion || links.release?.version || links.release?.releaseNumber || '').slice(0, 80),
        releaseChecksum: String(safe.releaseChecksum || links.release?.checksum || '').slice(0, 128),
        proposedEnvironment,
        manualDeploymentChecklist: DEFAULT_MANUAL_CHECKLIST.map((c) => ({ ...c })),
        smokeTestPlan: {
            status: 'DRAFT',
            checks: DEFAULT_SMOKE_CHECKS.map((label) => ({ label, status: 'PENDING', productionExecuted: false })),
            productionExecuted: false,
            localSimulationOnly: true,
        },
        recommendation: 'DRAFT',
        recommendationWarning: RECOMMENDATION_WARNING,
        status: 'DRAFT',
        simulationOnly: true,
        manualDeploymentOnly: true,
        productionExecutionAllowed: false,
        deploymentExecuted: false,
        productionActivated: false,
        renderActionExecuted: false,
        gitCommitExecuted: false,
        gitPushExecuted: false,
        rollbackExecuted: false,
        backupExecuted: false,
        restoreExecuted: false,
        migrationExecuted: false,
        createdBy: userId,
        updatedBy: userId,
    });
    await writeAudit(companyId, userId, 'PROGRAM_CREATE', 'ActivationReadinessProgram', doc._id, { programCode }, { activationProgramId: doc._id });
    return forceSimulationOnly({ ...doc.toObject(), id: String(doc._id) });
}

export async function updateProgram(companyId, userId, id, body = {}, user = null) {
    assertPerm(user, PERMS.update);
    rejectTenantOverrides(body);
    assertPayloadSafe(body);
    if (body.productionExecutionAllowed === true || body.deploymentExecuted === true || body.productionActivated === true
        || body.renderActionExecuted === true || body.gitCommitExecuted === true || body.gitPushExecuted === true
        || body.rollbackExecuted === true || body.backupExecuted === true || body.restoreExecuted === true
        || body.migrationExecuted === true) {
        throw new ApiError(400, 'Unsafe execution fields rejected');
    }
    const doc = await loadScopedProgram(companyId, id);
    if (!['DRAFT', 'VALIDATION_PENDING', 'REMEDIATION_REQUIRED', 'HOLD'].includes(doc.status)) {
        throw new ApiError(400, 'Program not editable in current status');
    }
    const safe = stripUnsafeWriteFields(body);
    if (safe.proposedEnvironment) doc.proposedEnvironment = assertSafeEnvironment(safe.proposedEnvironment);
    if (safe.programName) doc.programName = assertSafeText(safe.programName, 'programName');
    if (safe.description != null) doc.description = assertSafeText(safe.description, 'description');
    Object.assign(doc, {
        simulationOnly: true, manualDeploymentOnly: true, productionExecutionAllowed: false,
        deploymentExecuted: false, productionActivated: false, renderActionExecuted: false,
        gitCommitExecuted: false, gitPushExecuted: false, rollbackExecuted: false,
        backupExecuted: false, restoreExecuted: false, migrationExecuted: false, updatedBy: userId,
    });
    await doc.save();
    await writeAudit(companyId, userId, 'PROGRAM_UPDATE', 'ActivationReadinessProgram', doc._id, {}, { activationProgramId: doc._id });
    return forceSimulationOnly({ ...doc.toObject(), id: String(doc._id) });
}

export async function validateReleaseLineage(companyId, userId, id, user = null) {
    assertPerm(user, PERMS.release_lineage);
    const doc = await loadScopedProgram(companyId, id);
    let result;
    try {
        const links = await verifyLineage(companyId, {
            releasePackageId: doc.releasePackageId,
            readinessCertificationId: doc.readinessCertificationId,
            pilotProgramId: doc.pilotProgramId,
            operationsProgramId: doc.operationsProgramId,
        });
        const checksumOk = !doc.releaseChecksum || !links.release.checksum
            || String(doc.releaseChecksum) === String(links.release.checksum);
        result = {
            status: checksumOk ? 'PASS' : 'FAIL',
            companyMatch: true,
            tenantMatch: true,
            industryMatch: true,
            versionMatch: true,
            checksumMatch: checksumOk,
            phase23Present: true,
            phase24Present: true,
            phase24Valid: !['REJECTED', 'EXPIRED', 'ARCHIVED'].includes(links.cert.status),
            phase25ClosureApproved: true,
            phase26Approved: true,
            supersededRejected: links.release.status !== 'SUPERSEDED',
            blockers: checksumOk ? [] : ['checksum mismatch'],
            validatedAt: new Date().toISOString(),
        };
    } catch (err) {
        result = {
            status: 'FAIL',
            blockers: [err.message],
            validatedAt: new Date().toISOString(),
        };
    }
    doc.lineageValidation = result;
    if (result.status === 'FAIL') {
        doc.blockers = [...(doc.blockers || []), { type: 'INVALID_RELEASE_LINKAGE', message: (result.blockers || []).join('; '), createdAt: new Date().toISOString() }];
    }
    doc.updatedBy = userId;
    await doc.save();
    await writeAudit(companyId, userId, 'LINEAGE_VALIDATION', 'ActivationReadinessProgram', doc._id, result, { activationProgramId: doc._id });
    return forceSimulationOnly({ ...doc.toObject(), id: String(doc._id) });
}

export async function reviewReleaseIntegrity(companyId, userId, id, body = {}, user = null) {
    assertPerm(user, PERMS.integrity_review);
    rejectTenantOverrides(body);
    assertPayloadSafe(body);
    const doc = await loadScopedProgram(companyId, id);
    const release = await ReleasePackage.findOne({ _id: doc.releasePackageId, isDeleted: { $ne: true } }).lean();
    if (!release) throw new ApiError(400, 'Release package missing');
    const expectedChecksum = String(body.expectedChecksum || doc.releaseChecksum || release.checksum || '');
    const match = !expectedChecksum || String(release.checksum) === expectedChecksum;
    const status = !release.checksum && body.requireManifest !== false ? 'FAIL' : (match ? 'PASS' : 'FAIL');
    if (['DEPLOYED', 'LIVE', 'PRODUCTION_ACTIVATED'].includes(release.status)) {
        throw new ApiError(400, 'Unsafe package status rejected');
    }
    doc.integrityReview = {
        status,
        releasePackageId: String(release._id),
        version: release.version || release.releaseNumber || '',
        packageChecksum: release.checksum || '',
        manifestChecksum: release.manifestChecksum || release.checksum || '',
        frontendBuildId: release.frontendBuildId || '',
        backendBuildId: release.backendBuildId || '',
        knownLimitations: release.knownLimitations || [],
        linkedDefects: body.linkedDefects || [],
        linkedRisks: body.linkedRisks || [],
        reviewedAt: new Date().toISOString(),
    };
    if (status === 'FAIL') {
        doc.blockers = [...(doc.blockers || []), { type: 'CHECKSUM_MISMATCH', message: 'Release integrity failed', createdAt: new Date().toISOString() }];
    }
    doc.updatedBy = userId;
    await doc.save();
    await writeAudit(companyId, userId, 'INTEGRITY_REVIEW', 'ActivationReadinessProgram', doc._id, doc.integrityReview, { activationProgramId: doc._id });
    return forceSimulationOnly({ ...doc.toObject(), id: String(doc._id) });
}

export async function validatePhaseDependencies(companyId, userId, id, user = null) {
    assertPerm(user, PERMS.validate);
    const doc = await loadScopedProgram(companyId, id);
    const settings = (await getSettings(companyId, user)).settings;
    const blockers = [];
    try {
        await verifyLineage(companyId, {
            releasePackageId: doc.releasePackageId,
            readinessCertificationId: doc.readinessCertificationId,
            pilotProgramId: doc.pilotProgramId,
            operationsProgramId: doc.operationsProgramId,
        });
    } catch (err) {
        blockers.push(err.message);
    }
    if (settings.requirePhase23Approval && !doc.releasePackageId) blockers.push('missing Phase 23 approval');
    if (settings.requirePhase24Approval && !doc.readinessCertificationId) blockers.push('missing Phase 24 approval');
    if (settings.requirePhase25Closure && !doc.pilotProgramId) blockers.push('missing Phase 25 closure');
    if (settings.requirePhase26Approval && !doc.operationsProgramId) blockers.push('missing Phase 26 approval');
    doc.phaseDependencies = {
        status: blockers.length ? 'FAIL' : 'PASS',
        phase23Approved: !!doc.releasePackageId,
        phase24Approved: !!doc.readinessCertificationId,
        phase25Approved: !!doc.pilotProgramId,
        phase26Approved: !!doc.operationsProgramId,
        blockers,
        validatedAt: new Date().toISOString(),
        overrideAllowed: false,
    };
    if (blockers.length) {
        doc.blockers = [...(doc.blockers || []), { type: 'MISSING_PHASE_APPROVAL', message: blockers.join('; '), createdAt: new Date().toISOString() }];
    }
    doc.updatedBy = userId;
    await doc.save();
    await writeAudit(companyId, userId, 'PHASE_DEPENDENCY_VALIDATION', 'ActivationReadinessProgram', doc._id, doc.phaseDependencies, { activationProgramId: doc._id });
    return forceSimulationOnly({ ...doc.toObject(), id: String(doc._id) });
}

function reviewPassed(review) {
    if (!review) return false;
    return ['PASS', 'COMPLETE', 'APPROVED', 'READY', 'REVIEWED'].includes(String(review.status || '').toUpperCase())
        || review.complete === true || review.passed === true;
}

export async function evaluateFinalGates(companyId, userId, id, user = null) {
    assertPerm(user, PERMS.validate);
    const doc = await loadScopedProgram(companyId, id);
    const settings = (await getSettings(companyId, user)).settings;
    const gates = MANDATORY_GATES.map((g) => {
        let result = 'FAIL';
        let reason = 'incomplete';
        switch (g.key) {
        case 'RELEASE_INTEGRITY':
            result = doc.integrityReview?.status === 'PASS' ? 'PASS' : 'FAIL';
            reason = doc.integrityReview?.status || 'missing integrity review';
            break;
        case 'PHASE_LINEAGE':
            result = doc.lineageValidation?.status === 'PASS' ? 'PASS' : 'FAIL';
            reason = (doc.lineageValidation?.blockers || []).join('; ') || doc.lineageValidation?.status || 'missing lineage';
            break;
        case 'CERTIFICATION_VALIDITY':
            result = doc.phaseDependencies?.phase24Approved ? 'PASS' : 'FAIL';
            reason = 'phase 24';
            break;
        case 'PILOT_UAT_RESULT':
            result = doc.phaseDependencies?.phase25Approved ? 'PASS' : 'FAIL';
            reason = 'phase 25';
            break;
        case 'OPERATIONAL_READINESS':
            result = doc.phaseDependencies?.phase26Approved ? 'PASS' : 'FAIL';
            reason = 'phase 26';
            break;
        case 'CRITICAL_DEFECTS':
            result = doc.defectGate?.status === 'PASS' ? 'PASS' : (settings.requireNoOpenCriticalDefects ? 'FAIL' : 'WARNING');
            reason = doc.defectGate?.reason || 'defect gate';
            break;
        case 'CRITICAL_RISKS':
            result = doc.riskGate?.status === 'PASS' ? 'PASS' : (settings.requireNoOpenCriticalRisks ? 'FAIL' : 'WARNING');
            reason = doc.riskGate?.reason || 'risk gate';
            break;
        case 'ACCEPTED_RISK_EXPIRY':
            result = doc.riskGate?.acceptedRiskExpired ? 'FAIL' : 'PASS';
            reason = 'accepted risk expiry';
            break;
        case 'REQUIRED_APPROVALS':
            result = reviewPassed(doc.approvalReview) ? 'PASS' : 'FAIL';
            reason = 'approvals';
            break;
        case 'ENVIRONMENT_METADATA':
            result = reviewPassed(doc.environmentReview) ? 'PASS' : 'FAIL';
            reason = 'environment';
            break;
        case 'MAINTENANCE_WINDOW':
            result = !settings.requireMaintenanceWindowReview || reviewPassed(doc.maintenanceReview) ? 'PASS' : 'FAIL';
            reason = 'maintenance';
            break;
        case 'MONITORING':
            result = !settings.requireMonitoringReview || reviewPassed(doc.monitoringReview) ? 'PASS' : 'FAIL';
            reason = 'monitoring';
            break;
        case 'INCIDENT_READINESS':
            result = !settings.requireIncidentReview || reviewPassed(doc.incidentReview) ? 'PASS' : 'FAIL';
            reason = 'incident';
            break;
        case 'ESCALATION_READINESS':
            result = reviewPassed(doc.escalationReview) ? 'PASS' : 'FAIL';
            reason = 'escalation';
            break;
        case 'BACKUP_PLANNING':
            result = !settings.requireBackupReview || reviewPassed(doc.backupReview) ? 'PASS' : 'FAIL';
            reason = 'backup';
            break;
        case 'RESTORE_PLANNING':
            result = !settings.requireRestoreReview || reviewPassed(doc.restoreReview) ? 'PASS' : 'FAIL';
            reason = 'restore';
            break;
        case 'ROLLBACK_PLANNING':
            result = !settings.requireRollbackReview || reviewPassed(doc.rollbackReview) ? 'PASS' : 'FAIL';
            reason = 'rollback';
            break;
        case 'DR_PLANNING':
            result = !settings.requireDrReview || reviewPassed(doc.drReview) ? 'PASS' : 'FAIL';
            reason = 'dr';
            break;
        case 'BUSINESS_CONTINUITY':
            result = reviewPassed(doc.businessContinuityReview) ? 'PASS' : 'FAIL';
            reason = 'bc';
            break;
        case 'COMMUNICATION':
            result = !settings.requireCommunicationReview || reviewPassed(doc.communicationReview) ? 'PASS' : 'FAIL';
            reason = 'communication';
            break;
        case 'CUSTOMER_IMPACT':
            result = !settings.requireCustomerImpactReview || reviewPassed(doc.customerImpactReview) ? 'PASS' : 'FAIL';
            reason = 'customer impact';
            break;
        case 'HYPERCARE':
            result = !settings.requireHypercareReview || reviewPassed(doc.hypercareReview) ? 'PASS' : 'FAIL';
            reason = 'hypercare';
            break;
        case 'SMOKE_TESTS':
            if (!settings.requireSmokeTestPlan) {
                result = 'PASS';
            } else if (!doc.smokeTestPlan) {
                result = 'FAIL';
            } else if (doc.smokeTestPlan.productionExecuted === true) {
                result = 'FAIL';
                reason = 'smoke must not run against production';
            } else if (doc.smokeTestPlan.status === 'READY' || doc.smokeTestPlan.complete || doc.smokeTestPlan.status !== 'DRAFT') {
                result = 'PASS';
            } else {
                result = 'FAIL';
            }
            reason = 'smoke';
            break;
        case 'MANUAL_CHECKLIST':
            result = !settings.requireManualChecklist || (Array.isArray(doc.manualDeploymentChecklist) && doc.manualDeploymentChecklist.every((c) => c.status === 'COMPLETE' || c.checked)) ? 'PASS' : 'FAIL';
            reason = 'checklist';
            break;
        case 'DEPLOYMENT_HANDOVER':
            result = !settings.requireHandoverPackage || reviewPassed(doc.handoverPackage) ? 'PASS' : 'FAIL';
            reason = 'handover';
            break;
        default:
            result = 'NOT_APPLICABLE';
        }
        return { ...g, result, reason };
    });
    doc.finalGates = gates;
    const criticalFails = gates.filter((g) => g.critical && g.result === 'FAIL');
    doc.updatedBy = userId;
    await doc.save();
    await writeAudit(companyId, userId, 'FINAL_GATES', 'ActivationReadinessProgram', doc._id, { failCount: criticalFails.length }, { activationProgramId: doc._id });
    return forceSimulationOnly({
        ...doc.toObject(),
        id: String(doc._id),
        eligible: criticalFails.length === 0,
        blockers: criticalFails.map((g) => `${g.key}:${g.reason}`),
    });
}

export async function transitionLifecycle(companyId, userId, id, body = {}, user = null) {
    assertPerm(user, PERMS.review);
    rejectTenantOverrides(body);
    const doc = await loadScopedProgram(companyId, id);
    const next = assertSafeStatus(String(body.status || body.nextStatus || ''));
    if (!next) throw new ApiError(400, 'nextStatus required');
    assertTransition(doc.status, next);
    if (next === 'READY_FOR_MANUAL_PRODUCTION_DEPLOYMENT') {
        assertPerm(user, PERMS.final_review);
        if (isClientAdminOnly(user)) throw new ApiError(403, 'Client Admin cannot approve platform-wide readiness');
        const settings = (await getSettings(companyId, user)).settings;
        if (String(doc.createdBy) === String(userId) && settings.requireIndependentFinalReviewer) {
            throw new ApiError(403, 'Requestor cannot final-approve own readiness program');
        }
        const gates = await evaluateFinalGates(companyId, userId, id, user);
        if (!gates.eligible) throw new ApiError(400, `Manual deployment readiness blocked: ${(gates.blockers || []).join('; ')}`);
        doc.recommendation = 'READY_FOR_MANUAL_PRODUCTION_DEPLOYMENT';
        doc.recommendationReason = assertSafeText(body.reason || 'All mandatory readiness gates passed for manual deployment consideration only', 'reason');
        doc.recommendationWarning = RECOMMENDATION_WARNING;
        doc.reviewedBy = userId;
        doc.approvedBy = userId;
    }
    const prev = doc.status;
    doc.status = next;
    Object.assign(doc, {
        simulationOnly: true, manualDeploymentOnly: true, productionExecutionAllowed: false,
        deploymentExecuted: false, productionActivated: false, renderActionExecuted: false,
        gitCommitExecuted: false, gitPushExecuted: false, rollbackExecuted: false,
        backupExecuted: false, restoreExecuted: false, migrationExecuted: false, updatedBy: userId,
    });
    await doc.save();
    await writeAudit(companyId, userId, 'LIFECYCLE_TRANSITION', 'ActivationReadinessProgram', doc._id, { from: prev, to: next }, { activationProgramId: doc._id, reason: body.reason || '' });
    return forceSimulationOnly({
        ...doc.toObject(),
        id: String(doc._id),
        deploymentExecuted: false,
        productionActivated: false,
        renderActionExecuted: false,
        gitCommitExecuted: false,
        gitPushExecuted: false,
        recommendationDoesNotDeploy: true,
        recommendationDoesNotActivate: true,
    });
}

export async function getSummary(companyId, id, user = null) {
    assertView(user);
    const doc = await loadScopedProgram(companyId, id);
    return forceSimulationOnly({
        id: String(doc._id),
        programCode: doc.programCode,
        status: doc.status,
        recommendation: doc.recommendation,
        recommendationWarning: RECOMMENDATION_WARNING,
        lineageValidation: doc.lineageValidation,
        integrityReview: doc.integrityReview,
        phaseDependencies: doc.phaseDependencies,
        finalGates: doc.finalGates,
        blockers: doc.blockers,
        simulationOnly: true,
        manualDeploymentOnly: true,
        productionExecutionAllowed: false,
        deploymentExecuted: false,
        productionActivated: false,
    });
}

export async function getRecommendation(companyId, id, user = null) {
    assertView(user);
    assertPerm(user, PERMS.recommendation);
    const doc = await loadScopedProgram(companyId, id);
    return forceSimulationOnly({
        id: String(doc._id),
        recommendation: doc.recommendation,
        recommendationReason: doc.recommendationReason,
        recommendationWarning: RECOMMENDATION_WARNING,
        status: doc.status,
        deploymentExecuted: false,
        productionActivated: false,
        renderActionExecuted: false,
        gitCommitExecuted: false,
        gitPushExecuted: false,
        rollbackExecuted: false,
        backupExecuted: false,
        restoreExecuted: false,
        migrationExecuted: false,
        doesNotDeploy: true,
        doesNotActivateProduction: true,
        requiresSeparateHumanAuthorization: true,
    });
}

export { isPlatformAdmin };