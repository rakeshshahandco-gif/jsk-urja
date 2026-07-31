import { AiLearningFeedback } from '../../../models/aiLearningFeedback.model.js';
import { AiLearningImprovementProposal } from '../../../models/aiLearningImprovementProposal.model.js';
import { assertAnalytics, isAggregateOnly } from './permissions.util.js';
import { getLearningSettings } from './settings.service.js';
import { rejectTenantOverrides, sampleLabel, agreementLabel } from './normalize.util.js';
import { POSITIVE, NEGATIVE } from './feedback.service.js';

function notDeleted(extra = {}) {
    return { isDeleted: { $ne: true }, ...extra };
}

function rate(num, den) {
    if (!den) return null;
    return Math.round((num / den) * 1000) / 10;
}

/**
 * Acceptance rate is NOT called accuracy — requires verified ground truth.
 */
export async function getAnalytics(companyId, query = {}, user = null) {
    assertAnalytics(user);
    rejectTenantOverrides(query);
    const settings = await getLearningSettings(companyId);
    const match = { companyId, ...notDeleted(), status: { $nin: ['ARCHIVED', 'DUPLICATE'] } };
    if (query.sourceModule) match.sourceModule = query.sourceModule;

    const items = await AiLearningFeedback.find(match).lean();
    const sampleSize = items.length;
    const reliability = sampleLabel(sampleSize, settings);
    const accept = items.filter((f) => POSITIVE.has(f.feedbackType)).length;
    const reject = items.filter((f) => NEGATIVE.has(f.feedbackType)).length;
    const conflicted = items.filter((f) => f.status === 'CONFLICTED').length;
    const outdated = items.filter((f) => ['SOURCE_VERSION_CHANGED', 'OUTDATED_FEEDBACK'].includes(f.status)).length;
    const missing = items.filter((f) => f.feedbackType === 'MISSING_DATA').length;
    const stale = items.filter((f) => f.feedbackType === 'STALE_DATA').length;
    const privacy = items.filter((f) => f.feedbackType === 'PRIVACY_CONCERN').length;
    const proposals = await AiLearningImprovementProposal.countDocuments({ companyId, ...notDeleted() });

    const acceptanceRate = rate(accept, accept + reject);
    const agreement = agreementLabel(accept, reject, settings);

    return {
        sampleSize,
        sampleReliability: reliability,
        note: 'Acceptance rate is not accuracy unless verified ground truth exists.',
        metrics: {
            totalFeedback: sampleSize,
            acceptedOutputs: accept,
            rejectedOutputs: reject,
            acceptanceRate,
            conflictRate: rate(conflicted, sampleSize),
            outdatedFeedbackCount: outdated,
            missingDataFeedback: missing,
            staleDataFeedback: stale,
            privacyConcernFeedback: privacy,
            proposalGenerationCount: proposals,
            reviewerAgreement: agreement,
        },
        groundTruthReminder: 'Single-user feedback is USER_OPINION, not VERIFIED_BUSINESS_FACT.',
        aggregateOnly: isAggregateOnly(user),
        preliminary: reliability !== 'RELIABLE_SAMPLE',
        label: reliability === 'LOW_SAMPLE' ? 'PRELIMINARY' : reliability,
    };
}

export async function getModuleAnalytics(companyId, user = null) {
    assertAnalytics(user);
    const settings = await getLearningSettings(companyId);
    const items = await AiLearningFeedback.find({ companyId, ...notDeleted(), status: { $nin: ['ARCHIVED'] } }).lean();
    const byModule = {};
    for (const f of items) {
        const m = f.sourceModule;
        if (!byModule[m]) byModule[m] = { module: m, total: 0, accept: 0, reject: 0, conflicted: 0, scoreDisputes: 0, productReject: 0 };
        const row = byModule[m];
        row.total += 1;
        if (POSITIVE.has(f.feedbackType)) row.accept += 1;
        if (NEGATIVE.has(f.feedbackType)) row.reject += 1;
        if (f.status === 'CONFLICTED') row.conflicted += 1;
        if (['TOO_HIGH', 'TOO_LOW', 'WRONG_SCORE'].includes(f.feedbackType)) row.scoreDisputes += 1;
        if (['WRONG_PRODUCT', 'NOT_HELPFUL'].includes(f.feedbackType) && m === 'product_recommendation') row.productReject += 1;
    }
    const modules = Object.values(byModule).map((row) => ({
        ...row,
        sampleSize: row.total,
        sampleReliability: sampleLabel(row.total, settings),
        acceptanceRate: rate(row.accept, row.accept + row.reject),
        note: 'acceptanceRate is not accuracy',
        agreement: agreementLabel(row.accept, row.reject, settings),
    }));
    return { modules, aggregateOnly: isAggregateOnly(user) };
}

export async function getReviewerAnalytics(companyId, user = null) {
    assertAnalytics(user);
    const settings = await getLearningSettings(companyId);
    if (isAggregateOnly(user) || settings.anonymizeReviewerInAnalytics) {
        const items = await AiLearningFeedback.find({ companyId, ...notDeleted() }).lean();
        const unique = new Set(items.map((i) => String(i.userId)));
        return {
            anonymized: true,
            reviewerCount: unique.size,
            totalFeedback: items.length,
            sampleSize: items.length,
            sampleReliability: sampleLabel(items.length, settings),
            note: 'Reviewer identity hidden for aggregate-only / anonymized analytics.',
        };
    }
    const items = await AiLearningFeedback.find({ companyId, ...notDeleted() }).lean();
    const byUser = {};
    for (const f of items) {
        const id = String(f.userId);
        if (!byUser[id]) byUser[id] = { userId: id, total: 0, accept: 0, reject: 0 };
        byUser[id].total += 1;
        if (POSITIVE.has(f.feedbackType)) byUser[id].accept += 1;
        if (NEGATIVE.has(f.feedbackType)) byUser[id].reject += 1;
    }
    return {
        anonymized: false,
        reviewers: Object.values(byUser),
        sampleSize: items.length,
        sampleReliability: sampleLabel(items.length, settings),
        weightingMode: settings.reviewerWeightingMode,
        note: 'Default EQUAL weighting; no sensitive personal attributes used.',
    };
}

export async function getTrends(companyId, query = {}, user = null) {
    assertAnalytics(user);
    rejectTenantOverrides(query);
    const settings = await getLearningSettings(companyId);
    const days = Math.min(Number(query.days) || 30, 90);
    const since = new Date(Date.now() - days * 86400000);
    const items = await AiLearningFeedback.find({
        companyId,
        ...notDeleted(),
        createdAt: { $gte: since },
    }).lean();
    const byDay = {};
    for (const f of items) {
        const d = new Date(f.createdAt).toISOString().slice(0, 10);
        if (!byDay[d]) byDay[d] = { date: d, total: 0, accept: 0, reject: 0 };
        byDay[d].total += 1;
        if (POSITIVE.has(f.feedbackType)) byDay[d].accept += 1;
        if (NEGATIVE.has(f.feedbackType)) byDay[d].reject += 1;
    }
    return {
        days,
        sampleSize: items.length,
        sampleReliability: sampleLabel(items.length, settings),
        series: Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date)),
        preliminary: sampleLabel(items.length, settings) !== 'RELIABLE_SAMPLE',
    };
}
