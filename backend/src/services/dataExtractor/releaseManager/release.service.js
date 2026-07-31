import { ApiError } from '../../../utils/ApiError.js';
import { ReleasePackage } from '../../../models/releasePackage.model.js';
import { ReleaseApproval } from '../../../models/releaseApproval.model.js';
import { ReleaseApprovalHistory } from '../../../models/releaseApprovalHistory.model.js';
import { ALLOWED_TRANSITIONS, PERMS, INDUSTRIES } from './constants.js';
import {
    assertView, assertPerm, assertReviewType, isPlatformAdmin, isClientAdminOnly,
} from './permissions.util.js';
import {
    rejectTenantOverrides, assertNoSecrets, assertSafeText, assertPayloadSafe,
    snapshotHash, notDeleted, forceNonExecutable, sanitizeError,
} from './normalize.util.js';
import { writeAudit } from './audit.util.js';
import { getSettings } from './settings.service.js';
import { calculateReadiness } from './readiness.service.js';
import { simulateRelease } from './simulation.service.js';

function assertTransition(from, to) {
    const allowed = ALLOWED_TRANSITIONS[from] || [];
    if (!allowed.includes(to)) throw new ApiError(400, `Invalid release transition ${from} -> ${to}`);
}

function scopeQuery(companyId, user, extra = {}) {
    const q = { ...notDeleted(), ...extra };
    if (isPlatformAdmin(user) && extra.platformScoped === true) {
        q.platformScoped = true;
    } else {
        q.companyId = companyId;
        q.platformScoped = { $ne: true };
    }
    return q;
}

async function writeHistory(companyId, releaseId, action, previousStatus, newStatus, userId, reason = '', metadata = {}) {
    await ReleaseApprovalHistory.create({
        companyId, releaseId, action, previousStatus, newStatus, changedBy: userId, reason, metadata,
    });
}

function buildManifest(release) {
    return {
        releasePackageId: String(release._id),
        releaseNumber: release.releaseNumber,
        sourceEnvironment: release.sourceEnvironment,
        targetEnvironment: release.targetEnvironment,
        branchReference: release.branchReference,
        plannedCommitReference: release.plannedCommitReference,
        applicationComponents: {
            frontendVersion: release.frontendVersion,
            backendVersion: release.backendVersion,
            databaseSchemaVersion: release.databaseSchemaVersion,
            applicationVersion: release.applicationVersion,
        },
        modules: release.includedModules || [],
        excludedModules: release.excludedModules || [],
        configurationVersions: (release.includedConfigurationVersionIds || []).map(String),
        implementationSpecifications: (release.implementationSpecificationIds || []).map(String),
        sandboxEvaluations: (release.sandboxEvaluationRunIds || []).map(String),
        apiChanges: release.dependencySummary?.apiChanges || [],
        modelsCollectionsAffected: release.migrationPlan?.collectionsAffected || [],
        indexAdditions: release.migrationPlan?.indexAdditions || [],
        migrationRequirements: release.migrationPlan || null,
        featureFlags: release.featureFlagPlan || [],
        companyScope: (release.companyRollout || []).map((c) => ({
            companyId: c.companyId, rolloutStage: c.rolloutStage, modules: c.selectedModules,
        })),
        industryScope: (release.industryRollout || []).map((i) => ({
            industryCode: i.industryCode, selectedModules: i.selectedModules,
        })),
        permissionAdditions: release.dependencySummary?.permissionAdditions || [],
        testRequirements: release.preDeploymentChecklist || [],
        backupRequirement: !!release.backupPlan,
        rollbackRequirement: !!release.rollbackPlan,
        healthChecks: release.healthCheckPlan || null,
        smokeTests: release.smokeTestPlan || null,
        knownLimitations: release.knownLimitations || [],
        approvalRequirements: release.approvalStatus,
        executable: false,
        deploymentExecuted: false,
        productionActivated: false,
    };
}

function recomputeChecksum(release) {
    return snapshotHash({
        releaseNumber: release.releaseNumber,
        sourceEnvironment: release.sourceEnvironment,
        targetEnvironment: release.targetEnvironment,
        includedModules: release.includedModules,
        includedConfigurationVersionIds: (release.includedConfigurationVersionIds || []).map(String).sort(),
        implementationSpecificationIds: (release.implementationSpecificationIds || []).map(String).sort(),
        sandboxEvaluationRunIds: (release.sandboxEvaluationRunIds || []).map(String).sort(),
        releaseNotes: release.releaseNotes,
    });
}

export async function listReleases(companyId, query = {}, user = null) {
    assertView(user);
    rejectTenantOverrides(query);
    if (isClientAdminOnly(user)) {
        const items = await ReleasePackage.find({
            companyId, ...notDeleted(),
            status: { $in: ['APPROVED_FOR_STAGING_PLAN', 'STAGING_VALIDATION_RECORDED', 'APPROVED_FOR_PILOT_PLAN',
                'PILOT_VALIDATION_RECORDED', 'APPROVED_FOR_FUTURE_PRODUCTION_PLAN', 'RELEASE_PACKAGE_FINALIZED'] },
        }).sort({ createdAt: -1 }).limit(50).lean();
        return {
            items: items.map((d) => forceNonExecutable({
                id: String(d._id),
                releaseNumber: d.releaseNumber,
                releaseName: d.releaseName,
                status: d.status,
                readinessStatus: d.readinessStatus,
                targetEnvironment: d.targetEnvironment,
                knownLimitations: d.knownLimitations,
                clientView: true,
            })),
        };
    }
    const q = scopeQuery(companyId, user);
    if (query.status) q.status = query.status;
    const items = await ReleasePackage.find(q).sort({ createdAt: -1 }).limit(100).lean();
    return { items: items.map((d) => forceNonExecutable({ ...d, id: String(d._id) })) };
}

export async function getRelease(companyId, id, user = null) {
    assertView(user);
    const doc = await ReleasePackage.findOne({ _id: id, ...notDeleted() }).lean();
    if (!doc) throw new ApiError(404, 'Release not found');
    if (!doc.platformScoped && String(doc.companyId) !== String(companyId)) {
        throw new ApiError(404, 'Release not found');
    }
    if (doc.platformScoped && !isPlatformAdmin(user)) throw new ApiError(403, 'Platform Admin required');
    if (isClientAdminOnly(user)) {
        return forceNonExecutable({
            id: String(doc._id),
            releaseNumber: doc.releaseNumber,
            releaseName: doc.releaseName,
            status: doc.status,
            readinessStatus: doc.readinessStatus,
            releaseNotes: doc.releaseNotes,
            knownLimitations: doc.knownLimitations,
            clientView: true,
        });
    }
    return forceNonExecutable({ ...doc, id: String(doc._id) });
}

export async function createRelease(companyId, userId, body = {}, user = null) {
    assertPerm(user, PERMS.create);
    rejectTenantOverrides(body);
    assertNoSecrets(body);
    assertPayloadSafe(body);
    if (isClientAdminOnly(user)) throw new ApiError(403, 'Client Admin cannot create release packages');

    const platformScoped = body.platformScoped === true;
    if (platformScoped && !isPlatformAdmin(user)) throw new ApiError(403, 'Platform Admin required for platform releases');

    const settings = await getSettings(companyId);
    const releaseNumber = String(body.releaseNumber || `REL-${Date.now()}`).slice(0, 80);
    if (settings.releaseNumberPattern) {
        const re = new RegExp(settings.releaseNumberPattern);
        if (!re.test(releaseNumber)) throw new ApiError(400, 'releaseNumber does not match configured pattern');
    }
    if (body.sourceEnvironment === 'PRODUCTION') {
        throw new ApiError(400, 'Production cannot be selected as a source environment');
    }

    const notes = assertSafeText(body.releaseNotes || '', 'releaseNotes');
    const payload = {
        companyId: platformScoped ? null : companyId,
        platformScoped,
        releaseNumber,
        releaseName: assertSafeText(body.releaseName || releaseNumber, 'releaseName'),
        description: assertSafeText(body.description || '', 'description'),
        releaseType: body.releaseType || 'DATA_EXTRACTOR_RELEASE',
        sourceEnvironment: body.sourceEnvironment || 'LOCALHOST',
        targetEnvironment: body.targetEnvironment || 'TESTING',
        branchReference: String(body.branchReference || '').slice(0, 120),
        plannedCommitReference: String(body.plannedCommitReference || '').slice(0, 120),
        applicationVersion: String(body.applicationVersion || '').slice(0, 80),
        frontendVersion: String(body.frontendVersion || '').slice(0, 80),
        backendVersion: String(body.backendVersion || '').slice(0, 80),
        databaseSchemaVersion: String(body.databaseSchemaVersion || '').slice(0, 80),
        includedModules: body.includedModules || [],
        excludedModules: body.excludedModules || [],
        includedConfigurationVersionIds: body.includedConfigurationVersionIds || [],
        implementationSpecificationIds: body.implementationSpecificationIds || [],
        sandboxEvaluationRunIds: body.sandboxEvaluationRunIds || [],
        releaseNotes: notes,
        knownLimitations: body.knownLimitations || ['Phase 23 plan only — non-executable'],
        risks: body.risks || [],
        status: 'DRAFT',
        readinessStatus: 'NOT_READY',
        executable: false,
        deploymentExecuted: false,
        productionActivated: false,
        createdBy: userId,
        updatedBy: userId,
    };
    payload.checksum = recomputeChecksum(payload);

    const doc = await ReleasePackage.create(payload);
    await writeHistory(companyId, doc._id, 'CREATED', '', 'DRAFT', userId, 'Release draft created');
    await writeAudit(companyId, userId, 'release_created', 'RELEASE', doc._id, {
        releaseNumber, executable: false, deploymentExecuted: false, productionActivated: false,
    }, platformScoped);
    return forceNonExecutable({ ...doc.toObject(), id: String(doc._id) });
}

export async function updateRelease(companyId, userId, id, body = {}, user = null) {
    assertPerm(user, PERMS.edit_draft);
    rejectTenantOverrides(body);
    assertNoSecrets(body);
    const doc = await ReleasePackage.findOne({ _id: id, ...notDeleted() });
    if (!doc) throw new ApiError(404, 'Release not found');
    if (!doc.platformScoped && String(doc.companyId) !== String(companyId)) throw new ApiError(404, 'Release not found');
    if (!['DRAFT', 'NEEDS_CHANGES', 'VALIDATION_FAILED'].includes(doc.status)) {
        throw new ApiError(400, 'Only draft/needs-changes releases can be edited');
    }
    if (body.releaseName != null) doc.releaseName = assertSafeText(body.releaseName, 'releaseName');
    if (body.description != null) doc.description = assertSafeText(body.description, 'description');
    if (body.releaseNotes != null) doc.releaseNotes = assertSafeText(body.releaseNotes, 'releaseNotes');
    if (body.sourceEnvironment != null) {
        if (body.sourceEnvironment === 'PRODUCTION') throw new ApiError(400, 'Production cannot be source');
        doc.sourceEnvironment = body.sourceEnvironment;
    }
    if (body.targetEnvironment != null) doc.targetEnvironment = body.targetEnvironment;
    if (body.includedModules != null) doc.includedModules = body.includedModules;
    if (body.excludedModules != null) doc.excludedModules = body.excludedModules;
    if (body.includedConfigurationVersionIds != null) doc.includedConfigurationVersionIds = body.includedConfigurationVersionIds;
    if (body.implementationSpecificationIds != null) doc.implementationSpecificationIds = body.implementationSpecificationIds;
    if (body.sandboxEvaluationRunIds != null) doc.sandboxEvaluationRunIds = body.sandboxEvaluationRunIds;
    if (body.knownLimitations != null) doc.knownLimitations = body.knownLimitations;
    if (body.risks != null) doc.risks = body.risks;
    if (body.branchReference != null) doc.branchReference = String(body.branchReference).slice(0, 120);
    if (body.plannedCommitReference != null) doc.plannedCommitReference = String(body.plannedCommitReference).slice(0, 120);
    doc.executable = false;
    doc.deploymentExecuted = false;
    doc.productionActivated = false;
    doc.checksum = recomputeChecksum(doc);
    doc.updatedBy = userId;
    await doc.save();
    await writeAudit(companyId, userId, 'release_updated', 'RELEASE', doc._id, { deploymentExecuted: false });
    return forceNonExecutable({ ...doc.toObject(), id: String(doc._id) });
}

export async function cloneRelease(companyId, userId, id, body = {}, user = null) {
    assertPerm(user, PERMS.create);
    const base = await getRelease(companyId, id, user);
    return createRelease(companyId, userId, {
        ...body,
        releaseNumber: body.releaseNumber || `${base.releaseNumber}-CLONE-${Date.now()}`,
        releaseName: body.releaseName || `${base.releaseName} (clone)`,
        releaseType: base.releaseType,
        sourceEnvironment: base.sourceEnvironment,
        targetEnvironment: base.targetEnvironment,
        includedModules: base.includedModules,
        includedConfigurationVersionIds: base.includedConfigurationVersionIds,
        implementationSpecificationIds: base.implementationSpecificationIds,
        sandboxEvaluationRunIds: base.sandboxEvaluationRunIds,
        releaseNotes: base.releaseNotes,
        knownLimitations: base.knownLimitations,
    }, user);
}

export async function validateRelease(companyId, userId, id, user = null) {
    assertPerm(user, PERMS.validate);
    const doc = await ReleasePackage.findOne({ _id: id, ...notDeleted() });
    if (!doc) throw new ApiError(404, 'Release not found');
    if (!doc.platformScoped && String(doc.companyId) !== String(companyId)) throw new ApiError(404, 'Release not found');
    assertTransition(doc.status, 'VALIDATING');
    doc.status = 'VALIDATING';
    await doc.save();

    const settings = await getSettings(companyId);
    const readiness = await calculateReadiness(companyId, doc.toObject(), settings);
    const prev = 'VALIDATING';
    if (readiness.errors.length) {
        doc.status = 'VALIDATION_FAILED';
        doc.readinessStatus = 'NOT_READY';
        doc.updatedBy = userId;
        await doc.save();
        await writeHistory(companyId, doc._id, 'VALIDATION_FAILED', prev, 'VALIDATION_FAILED', userId, readiness.errors.map((e) => e.code).join(','));
        await writeAudit(companyId, userId, 'release_validation_failed', 'RELEASE', doc._id, { errors: readiness.errors });
        throw new ApiError(400, readiness.errors.map((e) => e.code).join(', '));
    }
    doc.status = 'READY_FOR_REVIEW';
    doc.readinessStatus = readiness.readinessStatus;
    doc.executable = false;
    doc.deploymentExecuted = false;
    doc.productionActivated = false;
    doc.updatedBy = userId;
    await doc.save();
    await writeHistory(companyId, doc._id, 'VALIDATED', prev, 'READY_FOR_REVIEW', userId, 'Validation passed');
    await writeAudit(companyId, userId, 'release_validated', 'RELEASE', doc._id, { readinessStatus: readiness.readinessStatus });
    return { release: forceNonExecutable({ ...doc.toObject(), id: String(doc._id) }), readiness };
}

export async function submitReview(companyId, userId, id, body = {}, user = null) {
    assertPerm(user, PERMS.review);
    rejectTenantOverrides(body);
    const doc = await ReleasePackage.findOne({ _id: id, ...notDeleted() });
    if (!doc) throw new ApiError(404, 'Release not found');
    if (!doc.platformScoped && String(doc.companyId) !== String(companyId)) throw new ApiError(404, 'Release not found');
    const next = body.track === 'BUSINESS' ? 'UNDER_BUSINESS_REVIEW'
        : body.track === 'SECURITY' ? 'UNDER_SECURITY_REVIEW'
            : body.track === 'RELEASE' ? 'UNDER_RELEASE_REVIEW'
                : 'UNDER_TECHNICAL_REVIEW';
    assertTransition(doc.status, next);
    const prev = doc.status;
    doc.status = next;
    doc.updatedBy = userId;
    await doc.save();
    await writeHistory(companyId, doc._id, 'SUBMIT_REVIEW', prev, next, userId, body.reason || '');
    await writeAudit(companyId, userId, 'review_submitted', 'RELEASE', doc._id, { to: next });
    return forceNonExecutable({ ...doc.toObject(), id: String(doc._id) });
}

export async function reviewRelease(companyId, userId, id, body = {}, user = null) {
    rejectTenantOverrides(body);
    assertNoSecrets(body);
    if (body.reviewerId != null || body.approverId != null) {
        throw new ApiError(400, 'Forged reviewer/approver IDs are rejected');
    }
    const reviewType = body.reviewType || 'TECHNICAL_REVIEW';
    assertReviewType(user, reviewType);
    const decision = String(body.decision || '').toUpperCase();
    if (!['APPROVE', 'REJECT', 'NEEDS_CHANGES', 'NEEDS_EVIDENCE', 'APPROVE_WITH_CONDITIONS', 'ABSTAIN'].includes(decision)) {
        throw new ApiError(400, 'Invalid decision');
    }
    const doc = await ReleasePackage.findOne({ _id: id, ...notDeleted() });
    if (!doc) throw new ApiError(404, 'Release not found');
    if (!doc.platformScoped && String(doc.companyId) !== String(companyId)) throw new ApiError(404, 'Release not found');

    const settings = await getSettings(companyId);
    if (settings.requireSeparateFinalApprover
        && reviewType === 'FINAL_PRODUCTION_PLAN_REVIEW'
        && String(doc.createdBy) === String(userId)) {
        throw new ApiError(403, 'Creator cannot be the sole final production-plan approver');
    }

    const comment = assertSafeText(body.comment || '', 'comment');
    await ReleaseApproval.create({
        companyId: doc.companyId,
        releaseId: doc._id,
        reviewType,
        decision,
        comment,
        conditions: body.conditions || [],
        reviewedBy: userId,
    });

    const prev = doc.status;
    let next = doc.status;
    if (decision === 'NEEDS_CHANGES' || decision === 'REJECT') next = 'NEEDS_CHANGES';
    else if (decision === 'APPROVE' || decision === 'APPROVE_WITH_CONDITIONS') {
        if (reviewType === 'FINAL_PRODUCTION_PLAN_REVIEW') {
            assertPerm(user, PERMS.approve_production_plan);
            next = 'APPROVED_FOR_FUTURE_PRODUCTION_PLAN';
        } else if (body.approveStaging === true || reviewType === 'RELEASE_MANAGER_REVIEW') {
            if (body.approveStaging) assertPerm(user, PERMS.approve_staging_plan);
            next = 'APPROVED_FOR_STAGING_PLAN';
        } else if (body.approvePilot === true) {
            assertPerm(user, PERMS.approve_pilot_plan);
            next = 'APPROVED_FOR_PILOT_PLAN';
        } else if (['UNDER_TECHNICAL_REVIEW'].includes(doc.status)) next = 'UNDER_BUSINESS_REVIEW';
        else if (['UNDER_BUSINESS_REVIEW'].includes(doc.status)) next = 'UNDER_SECURITY_REVIEW';
        else if (['UNDER_SECURITY_REVIEW'].includes(doc.status)) next = 'UNDER_RELEASE_REVIEW';
        else if (['UNDER_RELEASE_REVIEW'].includes(doc.status)) next = 'APPROVED_FOR_STAGING_PLAN';
    }
    if (next !== doc.status) {
        assertTransition(doc.status, next);
        doc.status = next;
    }
    doc.approvalStatus = `${reviewType}:${decision}`;
    doc.executable = false;
    doc.deploymentExecuted = false;
    doc.productionActivated = false;
    doc.updatedBy = userId;
    await doc.save();
    await writeHistory(companyId, doc._id, 'REVIEW', prev, doc.status, userId, `${reviewType}:${decision}`);
    await writeAudit(companyId, userId, 'review_decision', 'RELEASE', doc._id, {
        reviewType, decision, deploymentExecuted: false,
    });
    return forceNonExecutable({ ...doc.toObject(), id: String(doc._id) });
}

export async function recordStagingValidation(companyId, userId, id, user = null) {
    assertPerm(user, PERMS.approve_staging_plan);
    const doc = await ReleasePackage.findOne({ _id: id, companyId, ...notDeleted() });
    if (!doc) throw new ApiError(404, 'Release not found');
    assertTransition(doc.status, 'STAGING_VALIDATION_RECORDED');
    const prev = doc.status;
    doc.status = 'STAGING_VALIDATION_RECORDED';
    doc.updatedBy = userId;
    await doc.save();
    await writeHistory(companyId, doc._id, 'STAGING_VALIDATION', prev, doc.status, userId, 'Recorded only');
    return forceNonExecutable({ ...doc.toObject(), id: String(doc._id) });
}

export async function recordPilotValidation(companyId, userId, id, user = null) {
    assertPerm(user, PERMS.approve_pilot_plan);
    const doc = await ReleasePackage.findOne({ _id: id, companyId, ...notDeleted() });
    if (!doc) throw new ApiError(404, 'Release not found');
    assertTransition(doc.status, 'PILOT_VALIDATION_RECORDED');
    const prev = doc.status;
    doc.status = 'PILOT_VALIDATION_RECORDED';
    doc.updatedBy = userId;
    await doc.save();
    await writeHistory(companyId, doc._id, 'PILOT_VALIDATION', prev, doc.status, userId, 'Recorded only');
    return forceNonExecutable({ ...doc.toObject(), id: String(doc._id) });
}

export async function finalizePackage(companyId, userId, id, user = null) {
    assertPerm(user, PERMS.manage);
    const doc = await ReleasePackage.findOne({ _id: id, ...notDeleted() });
    if (!doc) throw new ApiError(404, 'Release not found');
    if (!doc.platformScoped && String(doc.companyId) !== String(companyId)) throw new ApiError(404, 'Release not found');
    assertTransition(doc.status, 'RELEASE_PACKAGE_FINALIZED');
    doc.manifest = buildManifest(doc);
    assertNoSecrets(doc.manifest);
    const prev = doc.status;
    doc.status = 'RELEASE_PACKAGE_FINALIZED';
    doc.executable = false;
    doc.deploymentExecuted = false;
    doc.productionActivated = false;
    doc.checksum = recomputeChecksum(doc);
    doc.updatedBy = userId;
    await doc.save();
    await writeHistory(companyId, doc._id, 'FINALIZED', prev, doc.status, userId, 'Package finalized — not deployed');
    await writeAudit(companyId, userId, 'release_finalized', 'RELEASE', doc._id, {
        executable: false, deploymentExecuted: false, productionActivated: false,
    });
    return forceNonExecutable({ ...doc.toObject(), id: String(doc._id) });
}

export async function archiveRelease(companyId, userId, id, user = null) {
    assertPerm(user, PERMS.manage);
    const doc = await ReleasePackage.findOne({ _id: id, ...notDeleted() });
    if (!doc) throw new ApiError(404, 'Release not found');
    if (!doc.platformScoped && String(doc.companyId) !== String(companyId)) throw new ApiError(404, 'Release not found');
    assertTransition(doc.status, 'ARCHIVED');
    const prev = doc.status;
    doc.status = 'ARCHIVED';
    doc.updatedBy = userId;
    await doc.save();
    await writeHistory(companyId, doc._id, 'ARCHIVED', prev, 'ARCHIVED', userId, '');
    await writeAudit(companyId, userId, 'release_archived', 'RELEASE', doc._id, {});
    return forceNonExecutable({ ...doc.toObject(), id: String(doc._id) });
}

export async function getHistory(companyId, id, user = null) {
    assertView(user);
    await getRelease(companyId, id, user);
    const items = await ReleaseApprovalHistory.find({ releaseId: id, ...notDeleted() }).sort({ createdAt: 1 }).lean();
    return { items, appendOnly: true };
}

export async function getManifest(companyId, id, user = null) {
    const release = await getRelease(companyId, id, user);
    const manifest = release.manifest || buildManifest(release);
    assertNoSecrets(manifest);
    return forceNonExecutable(manifest);
}

export async function putManifest(companyId, userId, id, body = {}, user = null) {
    assertPerm(user, PERMS.edit_draft);
    rejectTenantOverrides(body);
    assertNoSecrets(body);
    const doc = await ReleasePackage.findOne({ _id: id, companyId, ...notDeleted() });
    if (!doc) throw new ApiError(404, 'Release not found');
    if (!['DRAFT', 'NEEDS_CHANGES', 'READY_FOR_REVIEW'].includes(doc.status)) {
        throw new ApiError(400, 'Manifest locked for current status');
    }
    doc.manifest = forceNonExecutable({ ...buildManifest(doc), ...(body.manifest || body) });
    assertNoSecrets(doc.manifest);
    doc.updatedBy = userId;
    await doc.save();
    await writeAudit(companyId, userId, 'manifest_modified', 'RELEASE', doc._id, {});
    return forceNonExecutable(doc.manifest);
}

async function putPlan(companyId, userId, id, field, body, user, perm) {
    assertPerm(user, perm);
    rejectTenantOverrides(body);
    assertNoSecrets(body);
    assertPayloadSafe(body);
    const doc = await ReleasePackage.findOne({ _id: id, companyId, ...notDeleted() });
    if (!doc) throw new ApiError(404, 'Release not found');
    if (!['DRAFT', 'NEEDS_CHANGES', 'READY_FOR_REVIEW', 'VALIDATION_FAILED'].includes(doc.status)
        && !['APPROVED_FOR_STAGING_PLAN', 'STAGING_VALIDATION_RECORDED', 'APPROVED_FOR_PILOT_PLAN'].includes(doc.status)) {
        // allow plan updates on earlier statuses mainly
    }
    let value = body.plan || body;
    if (field === 'featureFlagPlan' || field === 'companyRollout' || field === 'industryRollout' || field === 'moduleAllocation') {
        value = body.items || body.plan || body[field] || [];
        if (!Array.isArray(value)) throw new ApiError(400, `${field} must be an array`);
    }
    if (field === 'featureFlagPlan') {
        value = value.map((f) => ({ ...f, executable: false, liveChanged: false }));
    }
    if (field === 'companyRollout') {
        for (const c of value) {
            if (c.companyId && String(c.companyId) !== String(companyId) && !isPlatformAdmin(user)) {
                throw new ApiError(403, 'Cross-company rollout requires Platform Admin');
            }
            c.activationExecuted = false;
        }
    }
    if (field === 'industryRollout') {
        for (const i of value) {
            if (i.industryCode && !INDUSTRIES.includes(i.industryCode) && !i.allowCustom) {
                // allow custom with warning stored
                i.compatibilityWarning = i.compatibilityWarning || 'Custom industry code';
            }
            i.activationExecuted = false;
        }
    }
    if (['backupPlan', 'rollbackPlan', 'migrationPlan', 'healthCheckPlan', 'smokeTestPlan', 'monitoringPlan'].includes(field)) {
        value = { ...value, executable: false, executed: false };
        if (field === 'backupPlan') value.backupExecuted = false;
        if (field === 'rollbackPlan') value.rollbackExecuted = false;
        if (field === 'migrationPlan') value.migrationExecuted = false;
        if (field === 'healthCheckPlan') value.productionEndpointsCalled = false;
        if (field === 'smokeTestPlan') value.productionSmokeExecuted = false;
        if (field === 'monitoringPlan') value.productionMonitoringConnected = false;
    }
    doc[field] = value;
    doc.executable = false;
    doc.deploymentExecuted = false;
    doc.productionActivated = false;
    doc.updatedBy = userId;
    await doc.save();
    await writeAudit(companyId, userId, `${field}_modified`, 'RELEASE', doc._id, { executable: false });
    return forceNonExecutable({ field, plan: doc[field] });
}

export const getCompanyRollout = async (companyId, id, user) => {
    const r = await getRelease(companyId, id, user);
    return { items: r.companyRollout || [] };
};
export const putCompanyRollout = (companyId, userId, id, body, user) => putPlan(companyId, userId, id, 'companyRollout', body, user, PERMS.edit_draft);
export const getIndustryRollout = async (companyId, id, user) => {
    const r = await getRelease(companyId, id, user);
    return { items: r.industryRollout || [] };
};
export const putIndustryRollout = (companyId, userId, id, body, user) => putPlan(companyId, userId, id, 'industryRollout', body, user, PERMS.edit_draft);
export const getFeatureFlags = async (companyId, id, user) => {
    const r = await getRelease(companyId, id, user);
    return { items: r.featureFlagPlan || [] };
};
export const putFeatureFlags = (companyId, userId, id, body, user) => putPlan(companyId, userId, id, 'featureFlagPlan', body, user, PERMS.feature_flags);
export const getBackupPlan = async (companyId, id, user) => ({ plan: (await getRelease(companyId, id, user)).backupPlan });
export const putBackupPlan = (companyId, userId, id, body, user) => putPlan(companyId, userId, id, 'backupPlan', body, user, PERMS.backup_plan);
export const getRollbackPlan = async (companyId, id, user) => ({ plan: (await getRelease(companyId, id, user)).rollbackPlan });
export const putRollbackPlan = (companyId, userId, id, body, user) => putPlan(companyId, userId, id, 'rollbackPlan', body, user, PERMS.rollback_plan);
export const getMigrationPlan = async (companyId, id, user) => ({ plan: (await getRelease(companyId, id, user)).migrationPlan });
export const putMigrationPlan = (companyId, userId, id, body, user) => putPlan(companyId, userId, id, 'migrationPlan', body, user, PERMS.migration_plan);
export const getHealthCheckPlan = async (companyId, id, user) => ({ plan: (await getRelease(companyId, id, user)).healthCheckPlan });
export const putHealthCheckPlan = (companyId, userId, id, body, user) => putPlan(companyId, userId, id, 'healthCheckPlan', body, user, PERMS.edit_draft);
export const getSmokeTestPlan = async (companyId, id, user) => ({ plan: (await getRelease(companyId, id, user)).smokeTestPlan });
export const putSmokeTestPlan = (companyId, userId, id, body, user) => putPlan(companyId, userId, id, 'smokeTestPlan', body, user, PERMS.edit_draft);
export const getMonitoringPlan = async (companyId, id, user) => ({ plan: (await getRelease(companyId, id, user)).monitoringPlan });
export const putMonitoringPlan = (companyId, userId, id, body, user) => putPlan(companyId, userId, id, 'monitoringPlan', body, user, PERMS.edit_draft);

export async function compareReleases(companyId, id, otherId, user = null) {
    assertPerm(user, PERMS.view);
    const a = await getRelease(companyId, id, user);
    const b = await getRelease(companyId, otherId, user);
    return {
        left: { id: a.id, releaseNumber: a.releaseNumber, status: a.status, readinessStatus: a.readinessStatus },
        right: { id: b.id, releaseNumber: b.releaseNumber, status: b.status, readinessStatus: b.readinessStatus },
        moduleDiff: {
            added: (b.includedModules || []).filter((m) => !(a.includedModules || []).includes(m)),
            removed: (a.includedModules || []).filter((m) => !(b.includedModules || []).includes(m)),
        },
        executable: false,
        deploymentExecuted: false,
    };
}

export async function exportRelease(companyId, id, user = null) {
    assertPerm(user, PERMS.export);
    const release = await getRelease(companyId, id, user);
    const payload = {
        packageType: 'RELEASE_DEPLOYMENT_INSTRUCTIONS',
        exportedAt: new Date().toISOString(),
        release: forceNonExecutable(release),
        manifest: forceNonExecutable(release.manifest || buildManifest(release)),
        instructions: [
            'This package is non-executable.',
            'Do not deploy from this export in Phase 23.',
            'Future Phase 24+ may use these instructions under separate approval.',
        ],
        executable: false,
        deploymentExecuted: false,
        productionActivated: false,
    };
    assertNoSecrets(payload);
    await writeAudit(companyId, user?.id || user?._id, 'release_exported', 'RELEASE', id, {
        executable: false, deploymentExecuted: false,
    });
    return payload;
}

export { simulateRelease, sanitizeError };
