import { ApiError } from '../../../utils/ApiError.js';
import { IntelligenceConfigurationFamily } from '../../../models/intelligenceConfigurationFamily.model.js';
import { IntelligenceConfigurationVersion } from '../../../models/intelligenceConfigurationVersion.model.js';
import { AiLearningEvaluationDataset } from '../../../models/aiLearningEvaluationDataset.model.js';
import { isFamilySupported } from './adapters.service.js';
import { assertConfigSafe, notDeleted, snapshotHash } from './normalize.util.js';
import { getSettings } from './settings.service.js';

export async function validateRunInputs(companyId, runLike, user = null) {
    const settings = await getSettings(companyId);
    const errors = [];
    const warnings = [];

    const family = await IntelligenceConfigurationFamily.findOne({
        _id: runLike.familyId, companyId, ...notDeleted(),
    }).lean();
    if (!family) errors.push({ code: 'FAMILY_SCOPE', message: 'Family not found for company' });

    const baseline = await IntelligenceConfigurationVersion.findOne({
        _id: runLike.baselineVersionId, companyId, ...notDeleted(),
    }).lean();
    const candidate = await IntelligenceConfigurationVersion.findOne({
        _id: runLike.candidateVersionId, companyId, ...notDeleted(),
    }).lean();

    if (!baseline) errors.push({ code: 'BASELINE_MISSING', message: 'Baseline version not found for company' });
    if (!candidate) errors.push({ code: 'CANDIDATE_MISSING', message: 'Candidate version not found for company' });

    if (baseline && candidate) {
        if (String(baseline.familyId) !== String(candidate.familyId)) {
            errors.push({ code: 'FAMILY_MISMATCH', message: 'Baseline and candidate must share family' });
        }
        if (family && String(baseline.familyId) !== String(family._id)) {
            errors.push({ code: 'FAMILY_MISMATCH', message: 'Versions do not match selected family' });
        }
    }

    if (candidate && settings.requireCandidateReadyForSandbox && candidate.status !== 'READY_FOR_SANDBOX') {
        errors.push({ code: 'CANDIDATE_NOT_READY', message: 'Candidate must be READY_FOR_SANDBOX' });
    }
    if (candidate?.runtimeActive === true) {
        errors.push({ code: 'CANDIDATE_RUNTIME_ACTIVE', message: 'Candidate must not be active in runtime' });
    }
    if (baseline && !['VALIDATED', 'READY_FOR_SANDBOX', 'SANDBOX_TESTED', 'APPROVED_FOR_FUTURE_ACTIVATION', 'IN_REVIEW'].includes(baseline.status) && baseline.status === 'DRAFT') {
        warnings.push({ code: 'BASELINE_DRAFT', message: 'Baseline is DRAFT — acceptable only as explicit reference snapshot' });
    }
    if (settings.requireRollbackTarget && candidate && !candidate.rollbackTargetVersionId) {
        errors.push({ code: 'ROLLBACK_REQUIRED', message: 'Rollback target required on candidate version' });
    }

    const familyCode = family?.code || runLike.familyCode;
    if (familyCode && !isFamilySupported(familyCode)) {
        errors.push({ code: 'EVALUATION_NOT_SUPPORTED', message: `Family ${familyCode} has no safe deterministic adapter` });
    }

    try {
        if (baseline) assertConfigSafe(baseline.configurationPayload);
        if (candidate) assertConfigSafe(candidate.configurationPayload);
    } catch (err) {
        errors.push({ code: 'UNSAFE_CONFIGURATION', message: err.message });
    }

    let dataset = null;
    if (runLike.datasetId) {
        dataset = await AiLearningEvaluationDataset.findOne({
            _id: runLike.datasetId, companyId, ...notDeleted(),
        }).lean();
        if (!dataset) errors.push({ code: 'DATASET_SCOPE', message: 'Dataset not found for company' });
        else {
            if (runLike.expectedDatasetChecksum && dataset.checksum && runLike.expectedDatasetChecksum !== dataset.checksum) {
                errors.push({ code: 'DATASET_CHECKSUM', message: 'Dataset checksum mismatch' });
            }
            if (!dataset.redactionLevel) warnings.push({ code: 'REDACTION', message: 'Dataset missing redaction level' });
        }
    }

    const privacyPass = true;
    const tenantIsolationPass = !!(baseline && candidate && family);
    const securityPass = errors.every((e) => e.code !== 'UNSAFE_CONFIGURATION');

    const report = {
        ok: errors.length === 0,
        errors,
        warnings,
        familyCode,
        baselineStatus: baseline?.status,
        candidateStatus: candidate?.status,
        candidateRuntimeActive: candidate?.runtimeActive === true,
        privacyPass,
        tenantIsolationPass,
        securityPass,
        adapterSupported: familyCode ? isFamilySupported(familyCode) : false,
        configurationSnapshotHashes: {
            baseline: baseline ? snapshotHash(baseline.configurationPayload || {}) : null,
            candidate: candidate ? snapshotHash(candidate.configurationPayload || {}) : null,
        },
        settingsSnapshot: {
            timeoutMs: settings.timeoutMs,
            maximumResultRows: settings.maximumResultRows,
            minimumDatasetSize: settings.minimumDatasetSize,
        },
        activatesConfiguration: false,
    };

    if (!report.ok) {
        const err = new ApiError(400, errors.map((e) => e.code).join(', ') || 'Validation failed');
        err.validationReport = report;
        // callers may catch and store report
        throw Object.assign(err, { validationReport: report });
    }
    return { report, family, baseline, candidate, dataset, settings };
}
