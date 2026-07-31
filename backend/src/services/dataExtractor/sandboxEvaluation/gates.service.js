import { RECOMMENDATION_CODES } from './constants.js';

export function evaluateGates(metrics, settings, validationReport = {}) {
    const issues = [];
    let gateResult = 'PASS';

    const sample = metrics.sampleSize || 0;
    if (sample < (settings.minimumDatasetSize || 3)) {
        issues.push({ severity: 'ERROR', code: 'MIN_SAMPLE', message: 'Sample size below minimum' });
        gateResult = 'FAIL';
    }
    if ((metrics.verifiedGroundTruthRows || 0) < (settings.minimumVerifiedGroundTruthRows || 1)) {
        issues.push({ severity: 'WARNING', code: 'MIN_GROUND_TRUTH', message: 'Verified ground-truth rows below minimum' });
        if (gateResult === 'PASS') gateResult = 'PASS_WITH_WARNINGS';
    }

    const regPct = sample ? (100 * (metrics.regressionCount || 0) / sample) : 0;
    const impPct = sample ? (100 * (metrics.improvementCount || 0) / sample) : 0;
    if (regPct > (settings.maximumRegressionPercentage ?? 40)) {
        issues.push({ severity: 'ERROR', code: 'MAX_REGRESSION', message: `Regression ${regPct.toFixed(1)}% exceeds gate` });
        gateResult = 'FAIL';
    }
    if (impPct < (settings.minimumImprovementPercentage ?? 0) && metrics.verifiedGroundTruthRows > 0) {
        issues.push({ severity: 'WARNING', code: 'MIN_IMPROVEMENT', message: 'Improvement below configured minimum' });
        if (gateResult === 'PASS') gateResult = 'PASS_WITH_WARNINGS';
    }

    if (metrics.falsePositiveRate != null && (metrics.falsePositiveRate * 100) > (settings.maximumFalsePositiveIncrease ?? 25)) {
        issues.push({ severity: 'ERROR', code: 'FP_INCREASE', message: 'False-positive rate exceeds gate' });
        gateResult = 'FAIL';
    }
    if (metrics.falseNegativeRate != null && (metrics.falseNegativeRate * 100) > (settings.maximumFalseNegativeIncrease ?? 25)) {
        issues.push({ severity: 'ERROR', code: 'FN_INCREASE', message: 'False-negative rate exceeds gate' });
        gateResult = 'FAIL';
    }

    if (validationReport.privacyPass === false && settings.requirePrivacyPass) {
        issues.push({ severity: 'ERROR', code: 'PRIVACY', message: 'Privacy validation failed' });
        gateResult = 'FAIL';
    }
    if (validationReport.tenantIsolationPass === false && settings.requireTenantIsolationPass) {
        issues.push({ severity: 'ERROR', code: 'TENANT_ISOLATION', message: 'Tenant isolation validation failed' });
        gateResult = 'FAIL';
    }
    if (validationReport.securityPass === false && settings.requireSecurityPass) {
        issues.push({ severity: 'ERROR', code: 'SECURITY', message: 'Security validation failed' });
        gateResult = 'FAIL';
    }

    if (!metrics.verifiedGroundTruthRows && gateResult !== 'FAIL') {
        gateResult = 'INCONCLUSIVE';
        issues.push({ severity: 'WARNING', code: 'NO_VERIFIED_TRUTH', message: 'Insufficient verified ground truth for conclusive gate' });
    }

    return { gateResult, issues, activatesConfiguration: false };
}

export function buildRecommendation(gateResult, metrics, validationReport = {}) {
    let code = 'INCONCLUSIVE';
    const rationale = [];

    if (validationReport.securityPass === false) {
        code = 'SECURITY_RISK';
        rationale.push('Security validation failed');
    } else if (validationReport.privacyPass === false) {
        code = 'PRIVACY_RISK';
        rationale.push('Privacy validation failed');
    } else if (gateResult === 'FAIL' && (metrics.regressionCount || 0) > (metrics.improvementCount || 0)) {
        code = 'HIGH_REGRESSION_RISK';
        rationale.push('Regressions exceed improvements under gate thresholds');
    } else if ((metrics.verifiedGroundTruthRows || 0) < 1) {
        code = 'NEEDS_MORE_GROUND_TRUTH';
        rationale.push('Verified ground truth insufficient');
    } else if ((metrics.sampleSize || 0) < 3) {
        code = 'NEEDS_MORE_DATA';
        rationale.push('Sample size too small');
    } else if (gateResult === 'FAIL') {
        code = 'NOT_RECOMMENDED';
        rationale.push('One or more regression gates failed');
    } else if (gateResult === 'PASS' || gateResult === 'PASS_WITH_WARNINGS') {
        code = 'READY_FOR_FURTHER_REVIEW';
        rationale.push('Sandbox evaluation completed without activation');
        rationale.push('Gate PASS does not mean production-ready');
    } else {
        code = 'INCONCLUSIVE';
        rationale.push('Unable to form a strong recommendation');
    }

    if (!RECOMMENDATION_CODES.includes(code)) code = 'INCONCLUSIVE';

    return {
        code,
        summary: `Advisory recommendation: ${code}`,
        rationale,
        gateResult,
        productionReady: false,
        advisoryOnly: true,
        activatesConfiguration: false,
    };
}
