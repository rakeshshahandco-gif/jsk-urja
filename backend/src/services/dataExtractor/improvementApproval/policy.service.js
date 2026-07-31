import { ExtractorSettings } from '../../../models/extractorSettings.model.js';
import { DEFAULT_POLICY, SETTINGS_VERSION, ENGINE_VERSION, PERMS } from './constants.js';
import { assertNoSecrets } from './normalize.util.js';
import { assertSettings, assertView, hasApproval } from './permissions.util.js';
import { ApiError } from '../../../utils/ApiError.js';

function clone(o) {
    return JSON.parse(JSON.stringify(o));
}

export function normalizePolicy(raw = {}) {
    const base = clone(DEFAULT_POLICY);
    const incoming = raw && typeof raw === 'object' ? raw : {};
    return {
        ...base,
        ...incoming,
        version: String(incoming.version || SETTINGS_VERSION),
        engineVersion: ENGINE_VERSION,
        enabled: incoming.enabled !== false,
        minimumSampleSize: Math.max(1, Number(incoming.minimumSampleSize ?? base.minimumSampleSize) || 5),
        minimumAgreementLabels: Array.isArray(incoming.minimumAgreementLabels) && incoming.minimumAgreementLabels.length
            ? incoming.minimumAgreementLabels.map(String)
            : base.minimumAgreementLabels,
        blockOnUnresolvedConflict: incoming.blockOnUnresolvedConflict !== false,
        blockOnOutdatedFeedback: incoming.blockOnOutdatedFeedback !== false,
        requireGroundTruthBeyondUserOpinion: incoming.requireGroundTruthBeyondUserOpinion === true,
        allowUserOpinionWithConsensus: incoming.allowUserOpinionWithConsensus !== false,
        creatorCannotFinalApprove: incoming.creatorCannotFinalApprove !== false,
        requireDistinctBusinessAndTechnicalReviewers: incoming.requireDistinctBusinessAndTechnicalReviewers !== false,
        requireRiskReviewForHighOrCritical: incoming.requireRiskReviewForHighOrCritical !== false,
        requirePrivacyReviewForContactModules: incoming.requirePrivacyReviewForContactModules !== false,
        requireSecurityReviewForCritical: incoming.requireSecurityReviewForCritical !== false,
        minimumApprovalsForSpec: Math.max(1, Number(incoming.minimumApprovalsForSpec ?? base.minimumApprovalsForSpec) || 2),
        requireTwoDistinctFinalApprovers: incoming.requireTwoDistinctFinalApprovers === true,
        allowedProposalStatuses: Array.isArray(incoming.allowedProposalStatuses) && incoming.allowedProposalStatuses.length
            ? incoming.allowedProposalStatuses.map(String)
            : base.allowedProposalStatuses,
        commentMaximumLength: Math.max(50, Number(incoming.commentMaximumLength ?? base.commentMaximumLength) || 2000),
        conditionsMaximumCount: Math.max(1, Number(incoming.conditionsMaximumCount ?? base.conditionsMaximumCount) || 20),
    };
}

export async function getApprovalPolicy(companyId) {
    const doc = await ExtractorSettings.findOne({ companyId }).lean();
    return normalizePolicy(doc?.aiLeadIntelligence?.improvementApproval || {});
}

export async function saveApprovalPolicy(companyId, userId, payload = {}, user = null) {
    if (user) assertSettings(user);
    assertNoSecrets(payload);
    const normalized = normalizePolicy(payload);
    assertNoSecrets(normalized);
    const existing = await ExtractorSettings.findOne({ companyId });
    if (!existing) {
        await ExtractorSettings.create({
            companyId,
            aiLeadIntelligence: { improvementApproval: normalized },
            updatedBy: userId || null,
        });
        return normalized;
    }
    const ali = { ...(existing.aiLeadIntelligence?.toObject?.() || existing.aiLeadIntelligence || {}) };
    ali.improvementApproval = normalized;
    existing.aiLeadIntelligence = ali;
    existing.updatedBy = userId || null;
    await existing.save();
    return normalized;
}

export async function getPolicyForUser(companyId, user) {
    assertView(user);
    return getApprovalPolicy(companyId);
}
