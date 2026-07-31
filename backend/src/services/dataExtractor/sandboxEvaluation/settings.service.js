import { ExtractorSettings } from '../../../models/extractorSettings.model.js';
import { DEFAULT_SETTINGS, PERMS } from './constants.js';
import { assertPerm, assertView } from './permissions.util.js';
import { rejectTenantOverrides, assertNoSecrets } from './normalize.util.js';
import { writeAudit } from './audit.util.js';

export async function getSettings(companyId, user = null) {
    if (user) assertView(user);
    const doc = await ExtractorSettings.findOne({ companyId }).lean();
    const stored = doc?.aiLeadIntelligence?.sandboxEvaluation || {};
    return { ...DEFAULT_SETTINGS, ...stored };
}

export async function saveSettings(companyId, userId, body = {}, user = null) {
    assertPerm(user, PERMS.settings);
    rejectTenantOverrides(body);
    assertNoSecrets(body);
    const next = {
        ...DEFAULT_SETTINGS,
        enabled: body.enabled !== false,
        minimumDatasetSize: Number(body.minimumDatasetSize) || DEFAULT_SETTINGS.minimumDatasetSize,
        minimumVerifiedGroundTruthRows: Number(body.minimumVerifiedGroundTruthRows) || 1,
        maximumResultRows: Math.min(Number(body.maximumResultRows) || DEFAULT_SETTINGS.maximumResultRows, 5000),
        timeoutMs: Math.min(Number(body.timeoutMs) || DEFAULT_SETTINGS.timeoutMs, 120000),
        requireRollbackTarget: body.requireRollbackTarget !== false,
        requireCandidateReadyForSandbox: body.requireCandidateReadyForSandbox !== false,
        maximumRegressionPercentage: Number(body.maximumRegressionPercentage ?? 40),
        minimumImprovementPercentage: Number(body.minimumImprovementPercentage ?? 0),
        maximumFalsePositiveIncrease: Number(body.maximumFalsePositiveIncrease ?? 25),
        maximumFalseNegativeIncrease: Number(body.maximumFalseNegativeIncrease ?? 25),
        maximumPerformanceDegradationPct: Number(body.maximumPerformanceDegradationPct ?? 200),
        requirePrivacyPass: body.requirePrivacyPass !== false,
        requireTenantIsolationPass: body.requireTenantIsolationPass !== false,
        requireSecurityPass: body.requireSecurityPass !== false,
        markSandboxTestedOnComplete: body.markSandboxTestedOnComplete !== false,
    };
    let doc = await ExtractorSettings.findOne({ companyId });
    if (!doc) {
        doc = new ExtractorSettings({ companyId, aiLeadIntelligence: { sandboxEvaluation: next } });
    } else {
        const ali = { ...(doc.aiLeadIntelligence?.toObject?.() || doc.aiLeadIntelligence || {}) };
        ali.sandboxEvaluation = next;
        doc.aiLeadIntelligence = ali;
    }
    await doc.save();
    await writeAudit(companyId, userId, 'settings_saved', 'SETTINGS', null, { version: next.version });
    return next;
}
