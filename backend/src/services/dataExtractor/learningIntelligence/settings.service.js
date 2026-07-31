import { ExtractorSettings } from '../../../models/extractorSettings.model.js';
import { DEFAULT_SETTINGS, SETTINGS_VERSION, ENGINE_VERSION } from './constants.js';
import { assertNoSecrets } from './normalize.util.js';
import { assertView, hasLearning } from './permissions.util.js';
import { PERMS } from './constants.js';
import { ApiError } from '../../../utils/ApiError.js';

function clone(o) {
    return JSON.parse(JSON.stringify(o));
}

export function normalizeLearningSettings(raw = {}) {
    const base = clone(DEFAULT_SETTINGS);
    const incoming = raw && typeof raw === 'object' ? raw : {};
    return {
        ...base,
        ...incoming,
        version: String(incoming.version || SETTINGS_VERSION),
        engineVersion: ENGINE_VERSION,
        enabled: incoming.enabled !== false,
        feedbackEnabledModules: Array.isArray(incoming.feedbackEnabledModules) && incoming.feedbackEnabledModules.length
            ? incoming.feedbackEnabledModules.map(String)
            : base.feedbackEnabledModules,
        requireCommentForReject: incoming.requireCommentForReject !== false,
        allowCorrectionValue: incoming.allowCorrectionValue !== false,
        minimumReviewers: Math.max(1, Number(incoming.minimumReviewers ?? base.minimumReviewers) || 2),
        conflictThreshold: Math.min(0.5, Math.max(0, Number(incoming.conflictThreshold ?? base.conflictThreshold) || 0.4)),
        proposalMinimumSample: Math.max(1, Number(incoming.proposalMinimumSample ?? base.proposalMinimumSample) || 5),
        proposalMinimumAgreement: Math.min(1, Math.max(0, Number(incoming.proposalMinimumAgreement ?? base.proposalMinimumAgreement) || 0.6)),
        lowSampleThreshold: Math.max(1, Number(incoming.lowSampleThreshold ?? base.lowSampleThreshold) || 5),
        moderateSampleThreshold: Math.max(1, Number(incoming.moderateSampleThreshold ?? base.moderateSampleThreshold) || 20),
        reviewerWeightingMode: ['EQUAL', 'ROLE_BASED'].includes(incoming.reviewerWeightingMode)
            ? incoming.reviewerWeightingMode : 'EQUAL',
        allowOutcomeSignals: incoming.allowOutcomeSignals !== false,
        allowDatasetPreparation: incoming.allowDatasetPreparation !== false,
        maximumDatasetRows: Math.max(1, Number(incoming.maximumDatasetRows ?? base.maximumDatasetRows) || 2000),
        maximumExportRows: Math.max(1, Number(incoming.maximumExportRows ?? base.maximumExportRows) || 5000),
        commentMaximumLength: Math.max(50, Number(incoming.commentMaximumLength ?? base.commentMaximumLength) || 1000),
        evidenceMaximumCount: Math.max(1, Number(incoming.evidenceMaximumCount ?? base.evidenceMaximumCount) || 20),
        feedbackRevisionAllowed: incoming.feedbackRevisionAllowed !== false,
        feedbackRevisionWindowDays: Math.max(1, Number(incoming.feedbackRevisionWindowDays ?? base.feedbackRevisionWindowDays) || 30),
        retentionDays: Math.max(1, Number(incoming.retentionDays ?? base.retentionDays) || 365),
        anonymizeReviewerInAnalytics: incoming.anonymizeReviewerInAnalytics !== false,
        showReviewerIdentityToManagers: incoming.showReviewerIdentityToManagers !== false,
    };
}

export async function getLearningSettings(companyId) {
    const doc = await ExtractorSettings.findOne({ companyId }).lean();
    return normalizeLearningSettings(doc?.aiLeadIntelligence?.learningIntelligence || {});
}

export async function saveLearningSettings(companyId, userId, payload = {}, user = null) {
    if (user && !hasLearning(user, PERMS.settings) && !hasLearning(user, PERMS.manage)) {
        throw new ApiError(403, `Missing permission: ${PERMS.settings}`);
    }
    assertNoSecrets(payload);
    const normalized = normalizeLearningSettings(payload);
    assertNoSecrets(normalized);
    const existing = await ExtractorSettings.findOne({ companyId });
    if (!existing) {
        await ExtractorSettings.create({
            companyId,
            aiLeadIntelligence: { learningIntelligence: normalized },
            updatedBy: userId || null,
        });
        return normalized;
    }
    const ali = { ...(existing.aiLeadIntelligence?.toObject?.() || existing.aiLeadIntelligence || {}) };
    ali.learningIntelligence = normalized;
    existing.aiLeadIntelligence = ali;
    existing.updatedBy = userId || null;
    await existing.save();
    return normalized;
}

export async function getSettingsForUser(companyId, user) {
    assertView(user);
    return getLearningSettings(companyId);
}
