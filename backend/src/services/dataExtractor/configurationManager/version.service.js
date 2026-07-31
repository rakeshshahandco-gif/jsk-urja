import { createHash } from 'node:crypto';
import { ApiError } from '../../../utils/ApiError.js';
import { IntelligenceConfigurationVersion } from '../../../models/intelligenceConfigurationVersion.model.js';
import { IntelligenceConfigurationHistory } from '../../../models/intelligenceConfigurationHistory.model.js';
import { ImplementationSpecification } from '../../../models/implementationSpecification.model.js';
import { ImprovementApprovalCase } from '../../../models/improvementApprovalCase.model.js';
import {
    ALLOWED_TRANSITIONS, EDITABLE_STATUSES, IMMUTABLE_STATUSES,
    PHASE21_BLOCKED_TRANSITIONS, PERMS, ENGINE_VERSION,
} from './constants.js';
import { assertView, assertPerm, isAggregateOnly, canSeePayload } from './permissions.util.js';
import {
    rejectTenantOverrides, assertNoSecrets, assertPayloadSafe,
    payloadChecksum, notDeleted, deepDiff, sanitizeError,
} from './normalize.util.js';
import { assertFamilyOwned, writeAudit, ensureDefaultFamilies } from './family.service.js';
import { getSettings } from './settings.service.js';
import { runValidation, assertValidationPassed } from './validation.service.js';
import { syncDefaultDependencies, analyzeDependencies, detectExplicitCircular } from './dependency.service.js';
import { checkCompatibility } from './compatibility.service.js';

async function writeHistory(companyId, versionId, action, previousStatus, newStatus, userId, reason = '', metadata = {}) {
    await IntelligenceConfigurationHistory.create({
        companyId, versionId, action, previousStatus, newStatus,
        changedBy: userId, reason, metadata,
    });
}

function assertTransition(from, to) {
    if (PHASE21_BLOCKED_TRANSITIONS.has(to) && to === 'SANDBOX_TESTED') {
        throw new ApiError(400, 'SANDBOX_TESTED may only be set by Phase 22 results — not Phase 21 APIs');
    }
    const allowed = ALLOWED_TRANSITIONS[from] || [];
    if (!allowed.includes(to)) {
        throw new ApiError(400, `Invalid status transition ${from} -> ${to}`);
    }
}

function redactVersion(doc, user) {
    const out = { ...doc, id: String(doc._id) };
    out.runtimeActive = false;
    out.phase21NonActivation = true;
    if (isAggregateOnly(user) || !canSeePayload(user)) {
        delete out.configurationPayload;
        out.payloadRedacted = true;
    }
    return out;
}

function recomputeSpecChecksum(spec) {
    return createHash('sha256').update(JSON.stringify({
        proposalId: String(spec.proposalId),
        proposalVersion: spec.proposalVersion,
        caseId: String(spec.approvalCaseId),
        target: spec.targetConfiguration,
        conditions: spec.approvedChange?.conditions,
    })).digest('hex').slice(0, 48);
}

async function nextVersionNumber(companyId, familyId) {
    const last = await IntelligenceConfigurationVersion.findOne({
        companyId, familyId, ...notDeleted(),
    }).sort({ versionNumber: -1 }).select('versionNumber').lean();
    return (last?.versionNumber || 0) + 1;
}

async function verifyLinkedSpecification(companyId, specId, expectedChecksum = null) {
    const spec = await ImplementationSpecification.findOne({
        _id: specId, companyId, ...notDeleted(),
    }).lean();
    if (!spec) throw new ApiError(404, 'Implementation specification not found for this company');
    if (spec.executable === true) {
        throw new ApiError(400, 'Executable specifications cannot create Draft versions');
    }
    if (spec.implementationRequired !== true) {
        throw new ApiError(400, 'Specification must have implementationRequired:true');
    }
    if (!['FINALIZED', 'DRAFT'].includes(spec.status)) {
        throw new ApiError(400, `Specification status ${spec.status} cannot create Draft`);
    }
    const approvalCase = await ImprovementApprovalCase.findOne({
        _id: spec.approvalCaseId, companyId, ...notDeleted(),
    }).lean();
    if (!approvalCase) throw new ApiError(400, 'Linked approval case missing');
    const approvedStatuses = ['APPROVED_FOR_IMPLEMENTATION_SPEC', 'IMPLEMENTATION_SPEC_GENERATED'];
    if (!approvedStatuses.includes(approvalCase.status)) {
        throw new ApiError(400, 'Unapproved specification cannot create Draft — approval case not approved for implementation spec');
    }
    const checksum = recomputeSpecChecksum(spec);
    if (spec.checksum && spec.checksum !== checksum) {
        throw new ApiError(400, 'Specification checksum mismatch');
    }
    if (expectedChecksum && expectedChecksum !== checksum) {
        throw new ApiError(400, 'Specification checksum mismatch (client provided)');
    }
    return { spec, approvalCase, checksum };
}

export async function listVersions(companyId, query = {}, user = null) {
    assertView(user);
    rejectTenantOverrides(query);
    const q = { companyId, ...notDeleted() };
    if (query.familyId) q.familyId = query.familyId;
    if (query.status) q.status = query.status;
    const items = await IntelligenceConfigurationVersion.find(q).sort({ createdAt: -1 }).limit(200).lean();
    return { items: items.map((d) => redactVersion(d, user)), runtimeActiveCount: 0 };
}

export async function getVersion(companyId, id, user = null) {
    assertView(user);
    const doc = await IntelligenceConfigurationVersion.findOne({ _id: id, companyId, ...notDeleted() }).lean();
    if (!doc) throw new ApiError(404, 'Configuration version not found');
    return redactVersion(doc, user);
}

export async function createDraft(companyId, userId, body = {}, user = null) {
    assertPerm(user, PERMS.create_draft);
    rejectTenantOverrides(body);
    assertNoSecrets(body);
    await ensureDefaultFamilies(companyId, userId);
    const settings = await getSettings(companyId);

    let familyId = body.familyId;
    let payload = body.configurationPayload || {};
    let linkedSpecId = body.linkedImplementationSpecificationId || null;
    let linkedProposalId = null;
    let linkedApprovalCaseId = null;
    let changeSummary = body.changeSummary || '';
    let reason = body.reason || '';
    let baseVersionId = body.baseVersionId || null;

    if (linkedSpecId) {
        const { spec, approvalCase, checksum } = await verifyLinkedSpecification(
            companyId, linkedSpecId, body.specificationChecksum || null,
        );
        if (settings.requireChecksumMatchForSpec && spec.checksum && spec.checksum !== checksum) {
            throw new ApiError(400, 'Specification checksum mismatch');
        }
        // Copy only approved target configuration fields — never trust request-body proposal payload
        payload = {
            ...(typeof spec.targetConfiguration === 'object' && spec.targetConfiguration ? spec.targetConfiguration : {}),
            _specMeta: {
                configurationFamily: spec.configurationFamily,
                scope: spec.scope,
                affectedModules: spec.affectedModules,
                fromSpecificationId: String(spec._id),
                specificationChecksum: checksum,
                executable: false,
            },
        };
        linkedProposalId = spec.proposalId;
        linkedApprovalCaseId = spec.approvalCaseId;
        changeSummary = changeSummary || `Draft from Implementation Spec ${spec._id}`;
        reason = reason || 'Linked to approved Phase 20 Implementation Specification';
        if (!familyId && spec.configurationFamily) {
            const { IntelligenceConfigurationFamily } = await import('../../../models/intelligenceConfigurationFamily.model.js');
            const fam = await IntelligenceConfigurationFamily.findOne({
                companyId, code: spec.configurationFamily, ...notDeleted(),
            });
            if (fam) familyId = fam._id;
        }
    } else if (baseVersionId) {
        const base = await IntelligenceConfigurationVersion.findOne({
            _id: baseVersionId, companyId, ...notDeleted(),
        }).lean();
        if (!base) throw new ApiError(404, 'Base version not found');
        familyId = familyId || base.familyId;
        if (!body.configurationPayload) payload = base.configurationPayload || {};
        changeSummary = changeSummary || `Draft from version ${base.versionNumber}`;
    } else if (!settings.allowManualDraftWithoutSpec) {
        throw new ApiError(403, 'Manual Draft without specification is disabled by company policy');
    }

    if (!familyId) throw new ApiError(400, 'familyId is required');
    const family = await assertFamilyOwned(companyId, familyId);
    assertPayloadSafe(payload);
    const versionNumber = await nextVersionNumber(companyId, familyId);
    const clash = await IntelligenceConfigurationVersion.findOne({ companyId, familyId: family._id, versionNumber, isDeleted: false });
    if (clash) throw new ApiError(409, 'Version number already exists for this family');
    const checksum = payloadChecksum(payload);

    const doc = await IntelligenceConfigurationVersion.create({
        companyId,
        familyId: family._id,
        versionNumber,
        baseVersionId,
        linkedProposalId,
        linkedApprovalCaseId,
        linkedImplementationSpecificationId: linkedSpecId,
        configurationPayload: payload,
        payloadChecksum: checksum,
        changeSummary,
        reason,
        scope: body.scope || {},
        companyScope: 'OWN_COMPANY',
        industryScope: body.industryScope || [],
        status: 'DRAFT',
        validationStatus: 'NOT_RUN',
        compatibilityStatus: 'UNKNOWN',
        dependencyStatus: 'UNKNOWN',
        effectiveDateRecommendation: body.effectiveDateRecommendation || '',
        immutableAfterPublish: false,
        runtimeActive: false,
        createdBy: userId,
        updatedBy: userId,
    });

    await syncDefaultDependencies(companyId, doc, family.code);
    await writeHistory(companyId, doc._id, 'CREATED', '', 'DRAFT', userId, reason);
    await writeAudit(companyId, userId, 'draft_created', 'VERSION', doc._id, {
        versionNumber, familyCode: family.code, linkedSpecId: linkedSpecId ? String(linkedSpecId) : null,
        runtimeActive: false,
    });
    return redactVersion(doc.toObject(), user);
}

export async function updateDraft(companyId, userId, id, body = {}, user = null) {
    assertPerm(user, PERMS.edit_draft);
    rejectTenantOverrides(body);
    assertNoSecrets(body);
    const doc = await IntelligenceConfigurationVersion.findOne({ _id: id, companyId, ...notDeleted() });
    if (!doc) throw new ApiError(404, 'Configuration version not found');

    if (!EDITABLE_STATUSES.includes(doc.status) || doc.immutableAfterPublish) {
        // Editing immutable version creates a new Draft
        assertPerm(user, PERMS.create_draft);
        const family = await assertFamilyOwned(companyId, doc.familyId);
        const payload = body.configurationPayload != null ? body.configurationPayload : doc.configurationPayload;
        assertPayloadSafe(payload);
        const versionNumber = await nextVersionNumber(companyId, doc.familyId);
        const created = await IntelligenceConfigurationVersion.create({
            companyId,
            familyId: doc.familyId,
            versionNumber,
            baseVersionId: doc._id,
            linkedProposalId: doc.linkedProposalId,
            linkedApprovalCaseId: doc.linkedApprovalCaseId,
            linkedImplementationSpecificationId: doc.linkedImplementationSpecificationId,
            configurationPayload: payload,
            payloadChecksum: payloadChecksum(payload),
            changeSummary: body.changeSummary || `Edit of immutable v${doc.versionNumber} created new Draft`,
            reason: body.reason || 'Immutable version cannot be overwritten',
            scope: body.scope || doc.scope,
            companyScope: 'OWN_COMPANY',
            industryScope: body.industryScope || doc.industryScope,
            status: 'DRAFT',
            validationStatus: 'NOT_RUN',
            compatibilityStatus: 'UNKNOWN',
            dependencyStatus: 'UNKNOWN',
            rollbackTargetVersionId: doc.rollbackTargetVersionId,
            immutableAfterPublish: false,
            runtimeActive: false,
            createdBy: userId,
            updatedBy: userId,
        });
        await syncDefaultDependencies(companyId, created, family.code);
        await writeHistory(companyId, created._id, 'CREATED_FROM_IMMUTABLE', doc.status, 'DRAFT', userId, 'New draft from immutable');
        await writeAudit(companyId, userId, 'draft_from_immutable', 'VERSION', created._id, {
            baseVersionId: String(doc._id), runtimeActive: false,
        });
        return redactVersion(created.toObject(), user);
    }

    if (body.configurationPayload != null) {
        assertPayloadSafe(body.configurationPayload);
        doc.configurationPayload = body.configurationPayload;
        doc.payloadChecksum = payloadChecksum(body.configurationPayload);
        doc.validationStatus = 'NOT_RUN';
        doc.compatibilityStatus = 'UNKNOWN';
    }
    if (body.changeSummary != null) doc.changeSummary = String(body.changeSummary).slice(0, 2000);
    if (body.reason != null) doc.reason = String(body.reason).slice(0, 2000);
    if (body.scope != null) doc.scope = body.scope;
    if (body.industryScope != null) doc.industryScope = body.industryScope;
    if (body.effectiveDateRecommendation != null) {
        doc.effectiveDateRecommendation = String(body.effectiveDateRecommendation).slice(0, 200);
    }
    doc.runtimeActive = false;
    doc.updatedBy = userId;
    await doc.save();
    await writeHistory(companyId, doc._id, 'DRAFT_EDITED', 'DRAFT', 'DRAFT', userId, body.reason || 'Draft edited');
    await writeAudit(companyId, userId, 'draft_edited', 'VERSION', doc._id, { runtimeActive: false });
    return redactVersion(doc.toObject(), user);
}

export async function cloneVersion(companyId, userId, id, body = {}, user = null) {
    assertPerm(user, PERMS.clone);
    rejectTenantOverrides(body);
    const base = await IntelligenceConfigurationVersion.findOne({ _id: id, companyId, ...notDeleted() }).lean();
    if (!base) throw new ApiError(404, 'Version not found');
    return createDraft(companyId, userId, {
        familyId: base.familyId,
        baseVersionId: base._id,
        configurationPayload: body.configurationPayload || base.configurationPayload,
        changeSummary: body.changeSummary || `Clone of v${base.versionNumber}`,
        reason: body.reason || 'Cloned version',
        scope: body.scope || base.scope,
        industryScope: body.industryScope || base.industryScope,
        linkedImplementationSpecificationId: body.linkedImplementationSpecificationId || null,
    }, user);
}

export async function validateVersion(companyId, userId, id, user = null) {
    assertPerm(user, PERMS.validate);
    const doc = await IntelligenceConfigurationVersion.findOne({ _id: id, companyId, ...notDeleted() });
    if (!doc) throw new ApiError(404, 'Version not found');
    const family = await assertFamilyOwned(companyId, doc.familyId);
    const circular = await detectExplicitCircular(companyId, doc);
    const result = await runValidation(companyId, doc, userId, family.code);
    if (circular.length) {
        result.errors = [...(result.errors || []), { code: 'CIRCULAR_DEPENDENCY', message: 'Circular dependency detected' }];
        result.status = 'FAIL';
    }
    doc.validationStatus = result.status;
    doc.updatedBy = userId;
    await doc.save();
    const deps = await analyzeDependencies(companyId, doc._id, user);
    doc.dependencyStatus = deps.dependencyStatus;
    await doc.save();
    await writeHistory(companyId, doc._id, 'VALIDATED_RUN', doc.status, doc.status, userId, result.status);
    await writeAudit(companyId, userId, 'version_validated', 'VERSION', doc._id, {
        validationStatus: result.status, runtimeActive: false,
    });
    return { version: redactVersion(doc.toObject(), user), validation: result, dependencies: deps };
}

export async function reviewVersion(companyId, userId, id, body = {}, user = null) {
    assertPerm(user, PERMS.review);
    rejectTenantOverrides(body);
    const doc = await IntelligenceConfigurationVersion.findOne({ _id: id, companyId, ...notDeleted() });
    if (!doc) throw new ApiError(404, 'Version not found');
    const decision = String(body.decision || '').toUpperCase();
    let next;
    if (decision === 'SUBMIT') next = 'IN_REVIEW';
    else if (decision === 'VALIDATE' || decision === 'APPROVE_VALIDATION') next = 'VALIDATED';
    else if (decision === 'REJECT') next = 'REJECTED';
    else if (decision === 'RETURN') next = 'DRAFT';
    else throw new ApiError(400, 'decision must be SUBMIT|VALIDATE|REJECT|RETURN');

    if (next === 'VALIDATED') {
        if (doc.validationStatus === 'NOT_RUN' || doc.validationStatus === 'FAIL') {
            throw new ApiError(400, 'Version must pass validation before VALIDATED status');
        }
        doc.immutableAfterPublish = true;
    }
    if (next === 'IN_REVIEW') doc.immutableAfterPublish = true;

    assertTransition(doc.status, next);
    const prev = doc.status;
    doc.status = next;
    doc.reviewedBy = userId;
    doc.updatedBy = userId;
    doc.runtimeActive = false;
    await doc.save();
    await writeHistory(companyId, doc._id, 'REVIEW', prev, next, userId, body.reason || decision);
    await writeAudit(companyId, userId, 'version_reviewed', 'VERSION', doc._id, {
        from: prev, to: next, runtimeActive: false,
    });
    return redactVersion(doc.toObject(), user);
}

export async function readyForSandbox(companyId, userId, id, body = {}, user = null) {
    assertPerm(user, PERMS.ready_for_sandbox);
    rejectTenantOverrides(body);
    const doc = await IntelligenceConfigurationVersion.findOne({ _id: id, companyId, ...notDeleted() });
    if (!doc) throw new ApiError(404, 'Version not found');
    if (doc.status !== 'VALIDATED') {
        throw new ApiError(400, 'Only VALIDATED versions can be marked READY_FOR_SANDBOX');
    }
    assertTransition(doc.status, 'READY_FOR_SANDBOX');
    const prev = doc.status;
    doc.status = 'READY_FOR_SANDBOX';
    doc.immutableAfterPublish = true;
    doc.runtimeActive = false;
    doc.updatedBy = userId;
    await doc.save();
    await writeHistory(companyId, doc._id, 'READY_FOR_SANDBOX', prev, 'READY_FOR_SANDBOX', userId,
        body.reason || 'Ready for Phase 22 sandbox evaluation only — not active');
    await writeAudit(companyId, userId, 'ready_for_sandbox', 'VERSION', doc._id, {
        runtimeActive: false,
        productionActivation: false,
        means: 'Phase 22 may evaluate; does not activate runtime',
    });
    return {
        ...redactVersion(doc.toObject(), user),
        message: 'READY_FOR_SANDBOX means Phase 22 may evaluate it. It does NOT activate runtime or production.',
        runtimeActive: false,
        productionActivation: false,
    };
}

export async function archiveVersion(companyId, userId, id, user = null) {
    assertPerm(user, PERMS.manage);
    const doc = await IntelligenceConfigurationVersion.findOne({ _id: id, companyId, ...notDeleted() });
    if (!doc) throw new ApiError(404, 'Version not found');
    assertTransition(doc.status, 'ARCHIVED');
    const prev = doc.status;
    doc.status = 'ARCHIVED';
    doc.immutableAfterPublish = true;
    doc.runtimeActive = false;
    doc.updatedBy = userId;
    await doc.save();
    await writeHistory(companyId, doc._id, 'ARCHIVED', prev, 'ARCHIVED', userId, 'Archived (no hard delete)');
    await writeAudit(companyId, userId, 'version_archived', 'VERSION', doc._id, { runtimeActive: false });
    return redactVersion(doc.toObject(), user);
}

export async function getHistory(companyId, id, user = null) {
    assertView(user);
    const doc = await IntelligenceConfigurationVersion.findOne({ _id: id, companyId, ...notDeleted() }).lean();
    if (!doc) throw new ApiError(404, 'Version not found');
    const items = await IntelligenceConfigurationHistory.find({
        companyId, versionId: doc._id, ...notDeleted(),
    }).sort({ createdAt: 1 }).lean();
    return { items, appendOnly: true };
}

export async function compareVersions(companyId, id, otherId, user = null) {
    assertPerm(user, PERMS.compare);
    const a = await IntelligenceConfigurationVersion.findOne({ _id: id, companyId, ...notDeleted() }).lean();
    const b = await IntelligenceConfigurationVersion.findOne({ _id: otherId, companyId, ...notDeleted() }).lean();
    if (!a || !b) throw new ApiError(404, 'One or both versions not found');
    const diff = deepDiff(a.configurationPayload || {}, b.configurationPayload || {});
    return {
        leftVersionId: String(a._id),
        rightVersionId: String(b._id),
        leftVersionNumber: a.versionNumber,
        rightVersionNumber: b.versionNumber,
        addedFields: diff.added,
        removedFields: diff.removed,
        changedValues: diff.changed.filter((c) => !/threshold|weight|mapping|template|exclusion/i.test(c.path)),
        changedThresholds: diff.changed.filter((c) => /threshold|min|max|low|high|band/i.test(c.path)),
        changedWeights: diff.changed.filter((c) => /weight/i.test(c.path)),
        changedMappings: diff.changed.filter((c) => /mapping|map/i.test(c.path)),
        changedTemplates: diff.changed.filter((c) => /template/i.test(c.path)),
        changedExclusions: diff.changed.filter((c) => /exclusion|exclude/i.test(c.path)),
        scopeChanges: deepDiff(a.scope || {}, b.scope || {}),
        permissionChanges: [],
        riskChanges: [],
        executed: false,
        note: 'Comparison is structural only — neither version was executed.',
    };
}

export async function impactPreview(companyId, id, user = null) {
    assertView(user);
    const doc = await IntelligenceConfigurationVersion.findOne({ _id: id, companyId, ...notDeleted() }).lean();
    if (!doc) throw new ApiError(404, 'Version not found');
    const family = await assertFamilyOwned(companyId, doc.familyId);
    return {
        configurationFamily: family.code,
        modulesPotentiallyAffected: [family.module].filter(Boolean),
        companiesPotentiallyAffected: ['OWN_COMPANY_ONLY'],
        industriesPotentiallyAffected: doc.industryScope || [],
        expectedRecordCategoriesAffected: ['METADATA_ONLY_NO_EXECUTION'],
        riskLevel: doc.validationStatus === 'FAIL' ? 'HIGH' : 'MEDIUM',
        requiredSandboxScenarios: [
            'Schema validation',
            'Dependency resolution',
            'Compatibility check',
            'Engine non-consumption of Draft',
        ],
        requiredRegressionSuites: [
            'Data Extractor full suite',
            'Phase 14+16.5', 'Phase 17', 'Phase 18', 'Phase 19', 'Phase 20', 'Phase 21',
        ],
        requiredRollbackTarget: doc.rollbackTargetVersionId || null,
        executedConfiguration: false,
        historicalABEvaluation: false,
        note: 'Phase 21 impact preview is metadata-based only. Historical A/B belongs to Phase 22.',
    };
}

export async function setRollbackTarget(companyId, userId, id, body = {}, user = null) {
    assertPerm(user, PERMS.review);
    rejectTenantOverrides(body);
    const doc = await IntelligenceConfigurationVersion.findOne({ _id: id, companyId, ...notDeleted() });
    if (!doc) throw new ApiError(404, 'Version not found');
    const targetId = body.rollbackTargetVersionId;
    if (!targetId) throw new ApiError(400, 'rollbackTargetVersionId required');
    const target = await IntelligenceConfigurationVersion.findOne({
        _id: targetId, companyId, ...notDeleted(),
    }).lean();
    if (!target) throw new ApiError(404, 'Rollback target not found');
    if (String(target.familyId) !== String(doc.familyId)) {
        throw new ApiError(400, 'Rollback target must be same configuration family');
    }
    if (target.status === 'DRAFT') {
        throw new ApiError(400, 'Rollback target must be an immutable (non-draft) version');
    }
    if (!target.immutableAfterPublish && !IMMUTABLE_STATUSES.includes(target.status)) {
        throw new ApiError(400, 'Rollback target must be an existing immutable version');
    }
    doc.rollbackTargetVersionId = target._id;
    doc.updatedBy = userId;
    doc.runtimeActive = false;
    await doc.save();
    await writeAudit(companyId, userId, 'rollback_target_selected', 'VERSION', doc._id, {
        rollbackTargetVersionId: String(target._id),
        rollbackPerformed: false,
        note: 'Selecting a rollback target does not perform a rollback',
    });
    return {
        ...redactVersion(doc.toObject(), user),
        rollbackPerformed: false,
        message: 'Rollback target selected — no rollback was performed',
    };
}

export async function exportVersion(companyId, id, user = null) {
    assertPerm(user, PERMS.export);
    const doc = await IntelligenceConfigurationVersion.findOne({ _id: id, companyId, ...notDeleted() }).lean();
    if (!doc) throw new ApiError(404, 'Version not found');
    const family = await assertFamilyOwned(companyId, doc.familyId);
    const deps = await analyzeDependencies(companyId, id, user);
    const packagePayload = {
        packageType: 'SANDBOX_PACKAGE',
        engineVersion: ENGINE_VERSION,
        exportedAt: new Date().toISOString(),
        family: { code: family.code, name: family.name, module: family.module, schemaVersion: family.schemaVersion },
        version: {
            id: String(doc._id),
            versionNumber: doc.versionNumber,
            status: doc.status,
            payloadChecksum: doc.payloadChecksum,
            configurationPayload: canSeePayload(user) ? doc.configurationPayload : undefined,
            linkedImplementationSpecificationId: doc.linkedImplementationSpecificationId
                ? String(doc.linkedImplementationSpecificationId) : null,
            rollbackTargetVersionId: doc.rollbackTargetVersionId ? String(doc.rollbackTargetVersionId) : null,
        },
        dependencies: deps,
        sandboxReady: doc.status === 'READY_FOR_SANDBOX',
        runtimeActive: false,
        productionActivation: false,
        note: 'Sandbox package for Phase 22 evaluation only. Does not activate runtime.',
    };
    assertNoSecrets(packagePayload);
    await writeAudit(companyId, user?.id || user?._id, 'version_exported', 'VERSION', doc._id, {
        sandboxReady: packagePayload.sandboxReady, runtimeActive: false,
    });
    return packagePayload;
}

export async function getDependencies(companyId, id, user = null) {
    return analyzeDependencies(companyId, id, user);
}

export async function getCompatibility(companyId, id, user = null) {
    return checkCompatibility(companyId, id, user);
}

/** Explicit non-activation: engines must never read Draft via this module. */
export function resolveRuntimeConfiguration() {
    return {
        used: false,
        source: 'EXISTING_RUNTIME_BASELINE',
        phase21VersionsIgnored: true,
        message: 'Phase 21 does not supply runtime configuration to engines',
    };
}

export { sanitizeError, verifyLinkedSpecification, recomputeSpecChecksum };
