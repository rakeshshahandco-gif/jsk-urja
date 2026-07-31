import mongoose from 'mongoose';
import { AiLearningFeedback } from '../../../models/aiLearningFeedback.model.js';
import { AiLearningImprovementProposal } from '../../../models/aiLearningImprovementProposal.model.js';
import { ApiError } from '../../../utils/ApiError.js';
import { assertGenerateProposal, assertReviewProposal, assertView } from './permissions.util.js';
import { getLearningSettings } from './settings.service.js';
import { rejectTenantOverrides, assertNoSecrets, sampleLabel, agreementLabel } from './normalize.util.js';
import { POSITIVE, NEGATIVE, writeAudit } from './feedback.service.js';

function notDeleted(extra = {}) {
    return { isDeleted: { $ne: true }, ...extra };
}

function oid(id) {
    if (!id || !mongoose.Types.ObjectId.isValid(String(id))) return null;
    return new mongoose.Types.ObjectId(String(id));
}

function proposalTypeFor(module, feedbackTypes) {
    if (module === 'lead_scoring') return 'THRESHOLD_CHANGE_DRAFT';
    if (module === 'product_recommendation') return 'MAPPING_CHANGE_DRAFT';
    if (module === 'industry_classification') return 'RULE_CHANGE_DRAFT';
    if (module === 'sales_assistant') return 'PROMPT_CHANGE_DRAFT';
    if (module === 'knowledge_graph') return 'VALIDATION_CHANGE_DRAFT';
    if (module === 'similar_company') return 'THRESHOLD_CHANGE_DRAFT';
    if (feedbackTypes.includes('MISSING_DATA')) return 'DATA_QUALITY_RULE_DRAFT';
    return 'REVIEW_WORKFLOW_CHANGE_DRAFT';
}

function forceNonExecutable(doc) {
    return {
        ...doc,
        id: String(doc._id),
        executable: false,
        approvedForImplementation: false,
        cannotActivateRule: true,
        cannotUpdateThreshold: true,
        cannotChangeLeadScore: true,
    };
}

/**
 * Generates DRAFT proposals only. Never applies rules/thresholds/scores.
 * executable and approvedForImplementation are always forced false.
 */
export async function generateProposals(companyId, userId, body = {}, user = null) {
    assertGenerateProposal(user);
    rejectTenantOverrides(body);
    assertNoSecrets(body);
    const settings = await getLearningSettings(companyId);
    const sourceModule = body.sourceModule ? String(body.sourceModule) : null;
    const match = {
        companyId,
        ...notDeleted(),
        status: { $in: ['VALIDATED', 'ACCEPTED', 'INCLUDED_IN_ANALYSIS', 'CONFLICTED', 'SUBMITTED'] },
        isLatestRevision: true,
    };
    if (sourceModule) match.sourceModule = sourceModule;

    const items = await AiLearningFeedback.find(match).lean();
    const byModule = {};
    for (const f of items) {
        if (!byModule[f.sourceModule]) byModule[f.sourceModule] = [];
        byModule[f.sourceModule].push(f);
    }

    const created = [];
    for (const [mod, list] of Object.entries(byModule)) {
        const sampleSize = list.length;
        if (sampleSize < settings.proposalMinimumSample) continue;

        const accept = list.filter((f) => POSITIVE.has(f.feedbackType)).length;
        const reject = list.filter((f) => NEGATIVE.has(f.feedbackType)).length;
        const agreement = agreementLabel(accept, reject, settings);
        if (agreement === 'LOW_SAMPLE') continue;
        const types = [...new Set(list.map((f) => f.feedbackType))];
        const pType = proposalTypeFor(mod, types);
        const rejectRate = reject / Math.max(1, accept + reject);

        if (rejectRate < 0.15) {
            const noChange = await AiLearningImprovementProposal.create({
                companyId,
                proposalType: 'NO_CHANGE_RECOMMENDED',
                sourceModule: mod,
                title: `No change recommended for ${mod}`,
                description: 'Feedback is predominantly positive; no configuration change proposed.',
                problemStatement: 'Acceptance signals dominate for this module.',
                supportingFeedbackIds: list.slice(0, 50).map((f) => f._id),
                sampleSize,
                reviewerAgreement: agreement,
                groundTruthCategory: sampleSize >= settings.minimumReviewers * 2 ? 'REVIEWER_CONSENSUS' : 'USER_OPINION',
                confidence: Math.min(90, Math.round((1 - rejectRate) * 80)),
                impactEstimate: 'None',
                riskLevel: 'LOW',
                currentConfigurationReference: { module: mod, note: 'Read-only reference only' },
                proposedConfiguration: { change: 'NONE', note: 'No active change' },
                expectedBenefit: 'Avoid unnecessary churn',
                potentialRisk: 'May miss emerging issues if sample is biased',
                affectedRecordsEstimate: 0,
                evaluationPlan: 'Continue collecting feedback',
                rollbackPlan: 'N/A — no change applied',
                evaluationMetrics: { accept, reject, rejectRate, sampleReliability: sampleLabel(sampleSize, settings) },
                limitations: [
                    'Based on user opinion / reviewer consensus, not verified ground truth unless labelled otherwise',
                    'Proposal is non-executable and not applied',
                ],
                status: 'DRAFT',
                version: 1,
                generatedBy: userId,
                approvedForImplementation: false,
                executable: false,
                createdBy: userId,
                updatedBy: userId,
            });
            created.push(forceNonExecutable(noChange.toObject()));
            continue;
        }

        const doc = await AiLearningImprovementProposal.create({
            companyId,
            proposalType: pType,
            sourceModule: mod,
            title: `Draft improvement for ${mod}`,
            description: `Draft proposal based on ${sampleSize} feedback rows (rejectRate=${Math.round(rejectRate * 100)}%).`,
            problemStatement: `Reviewers reported issues for ${mod}: ${types.slice(0, 8).join(', ')}`,
            supportingFeedbackIds: list.slice(0, 100).map((f) => f._id),
            sampleSize,
            reviewerAgreement: agreement,
            groundTruthCategory: (agreement === 'STRONG_AGREEMENT' || agreement === 'MAJORITY_AGREEMENT')
                ? 'REVIEWER_CONSENSUS'
                : 'USER_OPINION',
            confidence: Math.min(85, Math.round(rejectRate * 70 + (sampleSize >= settings.moderateSampleThreshold ? 15 : 0))),
            impactEstimate: 'Requires offline evaluation before any future implementation',
            riskLevel: rejectRate > 0.5 ? 'HIGH' : 'MEDIUM',
            currentConfigurationReference: { module: mod, note: 'Snapshot reference only — not mutated' },
            proposedConfiguration: {
                changeType: pType,
                draftOnly: true,
                executable: false,
                suggestion: pType === 'THRESHOLD_CHANGE_DRAFT'
                    ? 'Review thresholds using offline evaluation dataset'
                    : pType === 'MAPPING_CHANGE_DRAFT'
                        ? 'Review product mapping synonyms / exclusions'
                        : pType === 'PROMPT_CHANGE_DRAFT'
                            ? 'Draft prompt clarification for Sales Assistant templates'
                            : 'Review rules / validation offline',
            },
            expectedBenefit: 'Improved acceptance / reduced dispute rate after future controlled implementation',
            potentialRisk: 'Incorrect draft change could harm scoring or recommendations if applied without review',
            affectedRecordsEstimate: sampleSize,
            evaluationPlan: 'Prepare redacted offline evaluation dataset; compare before/after offline only',
            rollbackPlan: 'N/A in Phase 19 — proposal is never applied; future phase must include rollback',
            evaluationMetrics: {
                accept,
                reject,
                rejectRate,
                sampleReliability: sampleLabel(sampleSize, settings),
                acceptanceRateNote: 'Not accuracy',
            },
            limitations: [
                'Draft only — executable:false, approvedForImplementation:false',
                'Does not retrain models or rewrite active rules',
                'Does not recalculate scores or regenerate classifications',
                'Ground truth may be USER_OPINION unless consensus thresholds met',
                'Requires separate future controlled phase for implementation',
            ],
            status: 'DRAFT',
            version: 1,
            generatedBy: userId,
            approvedForImplementation: false,
            executable: false,
            createdBy: userId,
            updatedBy: userId,
        });

        await AiLearningFeedback.updateMany(
            { _id: { $in: list.map((f) => f._id) }, companyId },
            { $set: { status: 'PROPOSAL_GENERATED' } },
        );
        created.push(forceNonExecutable(doc.toObject()));
        await writeAudit(companyId, userId, 'proposal_generated', 'PROPOSAL', doc._id, {
            sourceModule: mod,
            sampleSize,
            executable: false,
        });
    }

    if (!created.length) {
        throw new ApiError(400, `Insufficient sample for proposals (minimum ${settings.proposalMinimumSample} per module)`);
    }
    return {
        proposals: created,
        note: 'All proposals remain DRAFT, non-executable, and are not applied to production configuration.',
    };
}

export async function listProposals(companyId, query = {}, user = null) {
    assertView(user);
    rejectTenantOverrides(query);
    const q = { companyId, ...notDeleted() };
    if (query.status) q.status = query.status;
    if (query.sourceModule) q.sourceModule = query.sourceModule;
    const items = await AiLearningImprovementProposal.find(q).sort({ createdAt: -1 }).limit(100).lean();
    return { items: items.map(forceNonExecutable) };
}

export async function getProposal(companyId, id, user = null) {
    assertView(user);
    const doc = await AiLearningImprovementProposal.findOne({ _id: oid(id), companyId, ...notDeleted() }).lean();
    if (!doc) throw new ApiError(404, 'Proposal not found');
    return forceNonExecutable(doc);
}

export async function updateProposal(companyId, userId, id, body = {}, user = null) {
    assertReviewProposal(user);
    rejectTenantOverrides(body);
    assertNoSecrets(body);
    const doc = await AiLearningImprovementProposal.findOne({ _id: oid(id), companyId, ...notDeleted() });
    if (!doc) throw new ApiError(404, 'Proposal not found');
    if (body.title) doc.title = String(body.title).slice(0, 200);
    if (body.description) doc.description = String(body.description).slice(0, 4000);
    doc.executable = false;
    doc.approvedForImplementation = false;
    doc.updatedBy = userId;
    await doc.save();
    return forceNonExecutable(doc.toObject());
}

export async function reviewProposal(companyId, userId, id, body = {}, user = null) {
    assertReviewProposal(user);
    rejectTenantOverrides(body);
    const doc = await AiLearningImprovementProposal.findOne({ _id: oid(id), companyId, ...notDeleted() });
    if (!doc) throw new ApiError(404, 'Proposal not found');
    const decision = String(body.decision || '').toUpperCase();
    const allowed = ['UNDER_REVIEW', 'NEEDS_MORE_EVIDENCE', 'RECOMMENDED', 'REJECTED', 'APPROVED_FOR_FUTURE_IMPLEMENTATION'];
    if (!allowed.includes(decision)) throw new ApiError(400, 'Invalid proposal review decision');
    doc.status = decision;
    doc.executable = false;
    doc.approvedForImplementation = false;
    if (decision === 'APPROVED_FOR_FUTURE_IMPLEMENTATION') {
        doc.limitations = [
            ...(doc.limitations || []),
            'APPROVED_FOR_FUTURE_IMPLEMENTATION does not activate or deploy anything in Phase 19',
        ];
    }
    doc.updatedBy = userId;
    await doc.save();
    await writeAudit(companyId, userId, 'proposal_status_changed', 'PROPOSAL', doc._id, {
        status: decision,
        executable: false,
        approvedForImplementation: false,
    });
    return forceNonExecutable(doc.toObject());
}

export async function archiveProposal(companyId, userId, id, user = null) {
    assertReviewProposal(user);
    const doc = await AiLearningImprovementProposal.findOne({ _id: oid(id), companyId, ...notDeleted() });
    if (!doc) throw new ApiError(404, 'Proposal not found');
    doc.status = 'ARCHIVED';
    doc.executable = false;
    doc.approvedForImplementation = false;
    doc.updatedBy = userId;
    await doc.save();
    await writeAudit(companyId, userId, 'proposal_status_changed', 'PROPOSAL', doc._id, { status: 'ARCHIVED' });
    return forceNonExecutable(doc.toObject());
}

export async function applyProposal() {
    throw new ApiError(400, 'Applying proposals is forbidden in Phase 19. Proposals are draft-only.');
}
export async function activateRule() {
    throw new ApiError(400, 'Activating rules from learning proposals is forbidden.');
}
export async function updateThreshold() {
    throw new ApiError(400, 'Updating thresholds from learning proposals is forbidden.');
}
export async function changeLeadScore() {
    throw new ApiError(400, 'Changing lead scores from learning proposals is forbidden.');
}
