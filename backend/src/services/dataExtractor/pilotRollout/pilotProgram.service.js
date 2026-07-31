import { ApiError } from '../../../utils/ApiError.js';
import { PilotProgram } from '../../../models/pilotProgram.model.js';
import { ReleasePackage } from '../../../models/releasePackage.model.js';
import { ProductionReadinessCertification } from '../../../models/productionReadinessCertification.model.js';
import { PilotDefect } from '../../../models/pilotDefect.model.js';
import { PilotRollbackPlan } from '../../../models/pilotRollbackPlan.model.js';
import { ALLOWED_TRANSITIONS, DEFAULT_SUCCESS_CRITERIA, DEFAULT_FAILURE_CRITERIA, PERMS } from './constants.js';
import { assertView, assertPerm, isPlatformAdmin, isClientAdminOnly } from './permissions.util.js';
import {
    rejectTenantOverrides, assertNoSecrets, assertSafeText, assertPayloadSafe,
    snapshotHash, notDeleted, forceSimulationOnly, assertSafeEnvironment, assertSafeStatus,
    stripUnsafeWriteFields,
} from './normalize.util.js';
import { writeAudit } from './audit.util.js';
import { getSettings } from './settings.service.js';

function assertTransition(from, to) {
    const allowed = ALLOWED_TRANSITIONS[from] || [];
    if (!allowed.includes(to)) throw new ApiError(400, `Invalid pilot transition ${from} -> ${to}`);
}

async function loadScopedProgram(companyId, id) {
    const doc = await PilotProgram.findOne({ _id: id, ...notDeleted() });
    if (!doc) throw new ApiError(404, 'Pilot program not found');
    if (!doc.platformScoped && String(doc.companyId) !== String(companyId)) {
        throw new ApiError(404, 'Pilot program not found');
    }
    return doc;
}

async function verifyLinks(companyId, releasePackageId, readinessCertificationId) {
    if (!releasePackageId) throw new ApiError(400, 'Phase 23 releasePackageId is required');
    if (!readinessCertificationId) throw new ApiError(400, 'Phase 24 readinessCertificationId is required');
    const release = await ReleasePackage.findOne({ _id: releasePackageId, isDeleted: { $ne: true } }).lean();
    if (!release) throw new ApiError(400, 'Phase 23 release package not found');
    if (release.companyId && String(release.companyId) !== String(companyId) && !release.platformScoped) {
        throw new ApiError(403, 'Release package company scope mismatch');
    }
    const cert = await ProductionReadinessCertification.findOne({ _id: readinessCertificationId, isDeleted: { $ne: true } }).lean();
    if (!cert) throw new ApiError(400, 'Phase 24 readiness certification not found');
    if (cert.companyId && String(cert.companyId) !== String(companyId) && !cert.platformScoped) {
        throw new ApiError(403, 'Certification company scope mismatch');
    }
    if (['REJECTED', 'EXPIRED', 'ARCHIVED'].includes(cert.status)) {
        throw new ApiError(400, 'Invalid/expired Phase 24 certification');
    }
    return { release, cert };
}

export async function listPrograms(companyId, query = {}, user = null) {
    assertView(user);
    rejectTenantOverrides(query);
    const q = { ...notDeleted(), companyId };
    if (query.status) q.status = String(query.status);
    const items = await PilotProgram.find(q).sort({ createdAt: -1 }).limit(100).lean();
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
    const safe = stripUnsafeWriteFields(body);
    if (isClientAdminOnly(user) && safe.platformScoped) {
        throw new ApiError(403, 'Client Admin cannot create platform-scoped pilots');
    }
    await verifyLinks(companyId, safe.releasePackageId, safe.readinessCertificationId);
    const environmentType = assertSafeEnvironment(safe.environmentType || 'STAGING_SIMULATION');
    const pilotCode = String(safe.pilotCode || `PILOT-${Date.now()}`).slice(0, 80);
    const payload = {
        companyId,
        platformScoped: false,
        pilotCode,
        pilotName: assertSafeText(safe.pilotName || pilotCode, 'pilotName'),
        description: assertSafeText(safe.description || '', 'description'),
        releasePackageId: safe.releasePackageId,
        readinessCertificationId: safe.readinessCertificationId,
        programType: safe.programType || 'CONTROLLED_PILOT',
        environmentType,
        startDatePlanned: safe.startDatePlanned || null,
        endDatePlanned: safe.endDatePlanned || null,
        pilotDurationDays: Number(safe.pilotDurationDays || 14),
        ownerUserId: userId,
        companySelectionMode: safe.companySelectionMode || 'SELECTED_COMPANIES',
        industrySelectionMode: safe.industrySelectionMode || 'SELECTED_INDUSTRIES',
        userSelectionMode: safe.userSelectionMode || 'SELECTED_COHORTS',
        rolloutStrategy: safe.rolloutStrategy || 'INTERNAL_THEN_SELECTED',
        riskLevel: safe.riskLevel || 'MEDIUM',
        uatRequired: safe.uatRequired !== false,
        rollbackPlanRequired: safe.rollbackPlanRequired !== false,
        monitoringRequired: safe.monitoringRequired !== false,
        dataMigrationRequired: false,
        dataMigrationAllowed: false,
        externalIntegrationRequired: false,
        externalIntegrationAllowed: false,
        industryScope: safe.industryScope || [],
        modulePlans: [],
        featureFlagPlans: [],
        successCriteria: safe.successCriteria || DEFAULT_SUCCESS_CRITERIA,
        failureCriteria: safe.failureCriteria || DEFAULT_FAILURE_CRITERIA,
        recommendation: 'PENDING',
        recommendationReason: '',
        status: 'DRAFT',
        simulationOnly: true,
        productionExecutionAllowed: false,
        deploymentExecuted: false,
        productionActivated: false,
        createdBy: userId,
        updatedBy: userId,
    };
    payload.checksum = snapshotHash({ pilotCode, environmentType, releasePackageId: String(safe.releasePackageId) });
    const doc = await PilotProgram.create(payload);
    await writeAudit(companyId, userId, 'PROGRAM_CREATE', 'PilotProgram', doc._id, { pilotCode }, { pilotProgramId: doc._id });
    return forceSimulationOnly({ ...doc.toObject(), id: String(doc._id) });
}

export async function updateProgram(companyId, userId, id, body = {}, user = null) {
    assertPerm(user, PERMS.update);
    rejectTenantOverrides(body);
    assertPayloadSafe(body);
    const doc = await loadScopedProgram(companyId, id);
    if (!['DRAFT', 'PLANNING', 'PENDING_REVIEW'].includes(doc.status)) {
        throw new ApiError(400, 'Only draft/planning programs can be updated');
    }
    const safe = stripUnsafeWriteFields(body);
    if (safe.environmentType) doc.environmentType = assertSafeEnvironment(safe.environmentType);
    if (safe.pilotName) doc.pilotName = assertSafeText(safe.pilotName, 'pilotName');
    if (safe.description != null) doc.description = assertSafeText(safe.description, 'description');
    if (safe.riskLevel) doc.riskLevel = safe.riskLevel;
    if (safe.industryScope) doc.industryScope = safe.industryScope;
    if (safe.pilotDurationDays) doc.pilotDurationDays = Number(safe.pilotDurationDays);
    doc.simulationOnly = true;
    doc.productionExecutionAllowed = false;
    doc.deploymentExecuted = false;
    doc.productionActivated = false;
    doc.updatedBy = userId;
    await doc.save();
    await writeAudit(companyId, userId, 'PROGRAM_UPDATE', 'PilotProgram', doc._id, { status: doc.status }, { pilotProgramId: doc._id });
    return forceSimulationOnly({ ...doc.toObject(), id: String(doc._id) });
}

export async function transitionLifecycle(companyId, userId, id, body = {}, user = null) {
    assertPerm(user, PERMS.review);
    rejectTenantOverrides(body);
    const doc = await loadScopedProgram(companyId, id);
    const next = assertSafeStatus(String(body.status || body.nextStatus || ''));
    if (!next) throw new ApiError(400, 'nextStatus required');
    assertTransition(doc.status, next);
    if (next === 'READY_FOR_PHASE_26_REVIEW') {
        assertPerm(user, PERMS.final_review);
        const gates = await evaluatePhase26Gates(companyId, doc);
        if (!gates.eligible) throw new ApiError(400, `Phase 26 review blocked: ${gates.blockers.join('; ')}`);
        doc.recommendation = 'READY_FOR_PHASE_26_REVIEW';
        doc.recommendationReason = assertSafeText(body.reason || 'Pilot gates satisfied for Phase 26 consideration only', 'reason');
    }
    const prev = doc.status;
    doc.status = next;
    doc.simulationOnly = true;
    doc.productionExecutionAllowed = false;
    doc.deploymentExecuted = false;
    doc.productionActivated = false;
    doc.updatedBy = userId;
    await doc.save();
    await writeAudit(companyId, userId, 'LIFECYCLE_TRANSITION', 'PilotProgram', doc._id, { from: prev, to: next }, { pilotProgramId: doc._id, reason: body.reason || '' });
    return forceSimulationOnly({ ...doc.toObject(), id: String(doc._id), phase26Authorized: false, phase26Started: false });
}

export async function evaluatePhase26Gates(companyId, program) {
    const settings = await getSettings(companyId, { permissions: [PERMS.view, PERMS.manage], roleName: 'platform_admin' });
    const blockers = [];
    const openCritical = await PilotDefect.countDocuments({
        pilotProgramId: program._id, severity: 'CRITICAL',
        status: { $nin: ['CLOSED', 'REJECTED', 'RETEST_PASSED'] }, isDeleted: { $ne: true },
    });
    if (settings.settings.blockOnCriticalDefect && openCritical > 0) blockers.push('open critical defects');
    if (settings.settings.requireRollbackPlan) {
        const rb = await PilotRollbackPlan.findOne({ pilotProgramId: program._id, isDeleted: { $ne: true } }).lean();
        if (!rb || !['SIMULATION_PASSED', 'READY_FOR_PILOT_REVIEW', 'READY_FOR_SIMULATION'].includes(rb.readinessStatus)) {
            if (!rb || rb.readinessStatus === 'SIMULATION_FAILED' || rb.readinessStatus === 'NOT_DEFINED' || rb.readinessStatus === 'DRAFT') {
                blockers.push('rollback readiness incomplete or failed');
            }
        }
    }
    if (!program.releasePackageId || !program.readinessCertificationId) blockers.push('missing Phase 23/24 linkage');
    return { eligible: blockers.length === 0, blockers, phase26Authorized: false, phase26Started: false };
}

export async function getSummary(companyId, id, user = null) {
    assertView(user);
    const doc = await loadScopedProgram(companyId, id);
    const defects = await PilotDefect.find({ pilotProgramId: doc._id, isDeleted: { $ne: true } }).lean();
    const critical = defects.filter((d) => d.severity === 'CRITICAL' && !['CLOSED', 'REJECTED', 'RETEST_PASSED'].includes(d.status)).length;
    return forceSimulationOnly({
        id: String(doc._id),
        pilotCode: doc.pilotCode,
        status: doc.status,
        recommendation: doc.recommendation,
        criticalDefects: critical,
        industryScope: doc.industryScope,
        environmentType: doc.environmentType,
        simulationOnly: true,
        productionActivated: false,
        deploymentExecuted: false,
    });
}

export async function getRecommendation(companyId, id, user = null) {
    assertView(user);
    const doc = await loadScopedProgram(companyId, id);
    const gates = await evaluatePhase26Gates(companyId, doc);
    return forceSimulationOnly({
        pilotProgramId: String(doc._id),
        recommendation: doc.recommendation,
        recommendationReason: doc.recommendationReason,
        status: doc.status,
        gates,
        phase26Authorized: false,
        phase26Started: false,
        note: 'READY_FOR_PHASE_26_REVIEW is recommendation only; not deployment or Phase 26 authorization',
    });
}

export { loadScopedProgram, verifyLinks };