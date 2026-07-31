import mongoose from 'mongoose';
import { createHash } from 'node:crypto';
import { ImprovementApprovalCase } from '../../../models/improvementApprovalCase.model.js';
import { ImplementationSpecification } from '../../../models/implementationSpecification.model.js';
import { ImplementationSpecificationHistory } from '../../../models/implementationSpecificationHistory.model.js';
import { AiLearningImprovementProposal } from '../../../models/aiLearningImprovementProposal.model.js';
import { ApiError } from '../../../utils/ApiError.js';
import {
    assertNoSecrets, rejectTenantOverrides, proposalChecksum,
} from './normalize.util.js';
import {
    assertView, assertGenerateSpec, isAggregateOnly, hasApproval,
} from './permissions.util.js';
import { PERMS } from './constants.js';
import { writeAudit, writeHistory, assertTransition } from './case.service.js';
import { evaluateProposalEligibility } from './eligibility.service.js';

function notDeleted(extra = {}) {
    return { isDeleted: { $ne: true }, ...extra };
}

function oid(id) {
    if (!id || !mongoose.Types.ObjectId.isValid(String(id))) return null;
    return new mongoose.Types.ObjectId(String(id));
}

function forceNonExecutable(doc) {
    return {
        ...doc,
        id: String(doc._id),
        executable: false,
        implementationRequired: true,
        cannotActivate: true,
        cannotApply: true,
        cannotDeploy: true,
        cannotUpdateScore: true,
        cannotModifyCrm: true,
    };
}

async function writeSpecHistory(companyId, specificationId, action, previousStatus, newStatus, userId, reason = '', metadata = {}) {
    assertNoSecrets(metadata);
    await ImplementationSpecificationHistory.create({
        companyId, specificationId, action, previousStatus, newStatus,
        changedBy: userId || null, reason: String(reason || '').slice(0, 500), metadata,
    });
}

/**
 * Generate Implementation Specification after required approvals.
 * Documentation/metadata only — never executes or changes active configuration.
 */
export async function generateSpecification(companyId, userId, caseId, body = {}, user = null) {
    assertGenerateSpec(user);
    rejectTenantOverrides(body);
    assertNoSecrets(body);

    const approvalCase = await ImprovementApprovalCase.findOne({ _id: oid(caseId), companyId, ...notDeleted() });
    if (!approvalCase) throw new ApiError(404, 'Approval case not found');

    if (approvalCase.status !== 'APPROVED_FOR_IMPLEMENTATION_SPEC' && approvalCase.status !== 'IMPLEMENTATION_SPEC_GENERATED') {
        throw new ApiError(400, 'Implementation Specification cannot be generated before APPROVED_FOR_IMPLEMENTATION_SPEC');
    }

    const eligibility = await evaluateProposalEligibility(companyId, approvalCase.proposalId, user, {
        expectedVersion: approvalCase.proposalVersion,
        expectedChecksum: approvalCase.sourceProposalChecksum,
    });
    if (eligibility.reasons.includes('PROPOSAL_VERSION_CHANGED') || eligibility.reasons.includes('CHECKSUM_MISMATCH')) {
        throw new ApiError(400, `Proposal not eligible: ${eligibility.reasons.filter((r) => ['PROPOSAL_VERSION_CHANGED', 'CHECKSUM_MISMATCH'].includes(r)).join(', ')}`);
    }
    const proposal = eligibility.proposal;
    if (!proposal) throw new ApiError(404, 'Proposal not found');
    if (proposal.executable !== false) throw new ApiError(400, 'Proposal must remain executable:false');

    const existing = await ImplementationSpecification.findOne({
        companyId, approvalCaseId: approvalCase._id, status: { $ne: 'ARCHIVED' }, ...notDeleted(),
    });
    if (existing) {
        return forceNonExecutable(existing.toObject());
    }

    const payload = {
        companyId,
        approvalCaseId: approvalCase._id,
        proposalId: proposal._id,
        proposalVersion: approvalCase.proposalVersion,
        specificationVersion: 1,
        title: `Implementation Spec: ${proposal.title}`,
        problemStatement: proposal.problemStatement || proposal.description || '',
        approvedChange: {
            proposalType: proposal.proposalType,
            proposedConfiguration: proposal.proposedConfiguration,
            conditions: approvalCase.conditions || [],
        },
        currentConfigurationReference: proposal.currentConfigurationReference,
        targetConfiguration: proposal.proposedConfiguration,
        configurationFamily: proposal.proposalType,
        scope: [
            `Module: ${proposal.sourceModule}`,
            `Proposal type: ${proposal.proposalType}`,
            'Documentation and handoff only',
        ],
        outOfScope: [
            'Immediate activation',
            'Live threshold/rule/prompt changes',
            'Lead Score recalculation',
            'Classification / recommendation regeneration',
            'CRM mutation',
            'Task / follow-up creation',
            'Email / WhatsApp / campaign execution',
            'Model training / fine-tuning',
            'Historical simulation (Phase 22)',
        ],
        affectedModules: [proposal.sourceModule, ...((approvalCase.impactSummary?.modulesDependingOnConfiguration) || [])],
        affectedCompaniesEstimate: approvalCase.impactSummary?.estimatedAffectedCompanies || 1,
        affectedIndustries: [],
        dependencies: approvalCase.impactSummary?.modulesDependingOnConfiguration || [],
        acceptanceCriteria: [
            'Specification reviewed by implementers',
            'Offline evaluation dataset prepared where applicable',
            'Regression suite green before any future activation phase',
            'executable remains false until future controlled activation',
        ],
        testScenarios: [
            'Tenant isolation',
            'Permission gates',
            'No active configuration mutation from this specification',
            ...(proposal.evaluationPlan ? [String(proposal.evaluationPlan).slice(0, 300)] : []),
        ],
        regressionRequirements: [
            'Phase 14 + 16.5',
            'Phase 17',
            'Phase 18',
            'Phase 19',
            'Full Data Extractor suite',
            'Protected Phase 14 fingerprints unchanged',
        ],
        securityRequirements: [
            'req.companyId only',
            'No body/query companyId/tenantId',
            'assertNoSecrets on configuration payloads',
            'Source permission checks preserved',
        ],
        permissionRequirements: [
            'Future implementers need module manage permissions',
            'Activation (future phase) requires separate explicit approval',
        ],
        tenantIsolationRequirements: [
            'All queries company-scoped',
            'No cross-company configuration bleed',
        ],
        dataMigrationRequirements: 'None in Phase 20 — specification only',
        rollbackPlan: proposal.rollbackPlan || 'Future implementation phase must define rollback before activation',
        deploymentRestrictions: [
            'Do not deploy from this specification',
            'Do not apply to production configuration',
            'Requires future controlled implementation + activation phases',
        ],
        effectiveDateRecommendation: 'TBD after future implementation phase approval',
        limitations: [
            ...(proposal.limitations || []),
            'Phase 20 approval means APPROVED FOR IMPLEMENTATION SPECIFICATION only',
            'executable:false always',
            'Does not change active scores, classifications, recommendations, KG, or CRM',
        ],
        requiredApprovers: ['business', 'technical', ...(approvalCase.riskReviewRequired ? ['risk'] : [])],
        requiredFutureImplementationPhase: 'Phase 21+',
        requiredFutureActivationPhase: 'Future controlled activation phase (not Phase 20)',
        executable: false,
        implementationRequired: true,
        status: 'DRAFT',
        createdBy: userId,
        updatedBy: userId,
    };
    payload.checksum = createHash('sha256').update(JSON.stringify({
        proposalId: String(proposal._id),
        proposalVersion: approvalCase.proposalVersion,
        caseId: String(approvalCase._id),
        target: payload.targetConfiguration,
        conditions: payload.approvedChange.conditions,
    })).digest('hex').slice(0, 48);

    assertNoSecrets(payload);
    const doc = await ImplementationSpecification.create(payload);

    const previous = approvalCase.status;
    if (approvalCase.status === 'APPROVED_FOR_IMPLEMENTATION_SPEC') {
        assertTransition(approvalCase.status, 'IMPLEMENTATION_SPEC_GENERATED');
        approvalCase.status = 'IMPLEMENTATION_SPEC_GENERATED';
        approvalCase.updatedBy = userId;
        await approvalCase.save();
        await writeHistory(companyId, approvalCase._id, 'SPEC_GENERATED', previous, 'IMPLEMENTATION_SPEC_GENERATED', userId, 'Implementation specification generated');
    }

    await writeSpecHistory(companyId, doc._id, 'CREATED', '', 'DRAFT', userId, 'Specification created');
    await writeAudit(companyId, userId, 'specification_generated', 'IMPLEMENTATION_SPEC', doc._id, {
        executable: false,
        implementationRequired: true,
        proposalVersion: approvalCase.proposalVersion,
        activeConfigurationChanged: false,
    });

    return forceNonExecutable(doc.toObject());
}

export async function listSpecifications(companyId, query = {}, user = null) {
    assertView(user);
    rejectTenantOverrides(query);
    const q = { companyId, ...notDeleted() };
    if (query.status) q.status = query.status;
    const items = await ImplementationSpecification.find(q).sort({ createdAt: -1 }).limit(100).lean();
    return { items: items.map(forceNonExecutable) };
}

export async function getSpecification(companyId, id, user = null) {
    assertView(user);
    const doc = await ImplementationSpecification.findOne({ _id: oid(id), companyId, ...notDeleted() }).lean();
    if (!doc) throw new ApiError(404, 'Specification not found');
    if (isAggregateOnly(user)) {
        return {
            id: String(doc._id),
            title: doc.title,
            status: doc.status,
            executable: false,
            implementationRequired: true,
            restricted: true,
        };
    }
    return forceNonExecutable(doc);
}

export async function updateSpecification(companyId, userId, id, body = {}, user = null) {
    assertGenerateSpec(user);
    rejectTenantOverrides(body);
    assertNoSecrets(body);
    const doc = await ImplementationSpecification.findOne({ _id: oid(id), companyId, ...notDeleted() });
    if (!doc) throw new ApiError(404, 'Specification not found');
    if (doc.status === 'ARCHIVED') throw new ApiError(400, 'Cannot edit archived specification');
    if (body.title) doc.title = String(body.title).slice(0, 200);
    if (body.acceptanceCriteria) doc.acceptanceCriteria = body.acceptanceCriteria.map(String).slice(0, 50);
    if (body.testScenarios) doc.testScenarios = body.testScenarios.map(String).slice(0, 50);
    doc.executable = false;
    doc.implementationRequired = true;
    doc.updatedBy = userId;
    await doc.save();
    await writeSpecHistory(companyId, doc._id, 'UPDATED', doc.status, doc.status, userId, 'Specification updated');
    return forceNonExecutable(doc.toObject());
}

export async function finalizeSpecification(companyId, userId, id, user = null) {
    assertGenerateSpec(user);
    const doc = await ImplementationSpecification.findOne({ _id: oid(id), companyId, ...notDeleted() });
    if (!doc) throw new ApiError(404, 'Specification not found');
    const previous = doc.status;
    doc.status = 'FINALIZED';
    doc.executable = false;
    doc.implementationRequired = true;
    doc.updatedBy = userId;
    await doc.save();
    await writeSpecHistory(companyId, doc._id, 'FINALIZED', previous, 'FINALIZED', userId, 'Specification finalized (still non-executable)');
    await writeAudit(companyId, userId, 'specification_finalized', 'IMPLEMENTATION_SPEC', doc._id, { executable: false });
    return forceNonExecutable(doc.toObject());
}

export async function archiveSpecification(companyId, userId, id, user = null) {
    if (!hasApproval(user, PERMS.manage) && !hasApproval(user, PERMS.generate_spec)) {
        throw new ApiError(403, `Missing permission: ${PERMS.generate_spec}`);
    }
    const doc = await ImplementationSpecification.findOne({ _id: oid(id), companyId, ...notDeleted() });
    if (!doc) throw new ApiError(404, 'Specification not found');
    const previous = doc.status;
    doc.status = 'ARCHIVED';
    doc.executable = false;
    doc.updatedBy = userId;
    await doc.save();
    await writeSpecHistory(companyId, doc._id, 'ARCHIVED', previous, 'ARCHIVED', userId, 'Archived');
    return forceNonExecutable(doc.toObject());
}

export async function exportSpecification(companyId, id, user = null) {
    if (!hasApproval(user, PERMS.export) && !hasApproval(user, PERMS.generate_spec)) {
        throw new ApiError(403, `Missing permission: ${PERMS.export}`);
    }
    const doc = await getSpecification(companyId, id, user);
    await writeAudit(companyId, user?.id || user?._id, 'specification_exported', 'IMPLEMENTATION_SPEC', oid(id), {
        executable: false,
    });
    return {
        format: 'json',
        specification: doc,
        note: 'Developer handoff package — non-executable documentation only',
        trainingTriggered: false,
        configurationApplied: false,
    };
}

export async function getSpecificationHistory(companyId, id, user = null) {
    assertView(user);
    const items = await ImplementationSpecificationHistory.find({
        companyId, specificationId: oid(id), ...notDeleted(),
    }).sort({ createdAt: 1 }).limit(200).lean();
    return { items, appendOnly: true };
}

export async function activateSpecification() {
    throw new ApiError(400, 'Activating specifications is forbidden in Phase 20');
}
export async function applySpecification() {
    throw new ApiError(400, 'Applying specifications is forbidden in Phase 20');
}
export async function deploySpecification() {
    throw new ApiError(400, 'Deploying specifications is forbidden in Phase 20');
}
