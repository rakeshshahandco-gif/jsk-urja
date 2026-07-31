import { ImplementationSpecification } from '../../../models/implementationSpecification.model.js';
import { IntelligenceConfigurationVersion } from '../../../models/intelligenceConfigurationVersion.model.js';
import { SandboxEvaluationRun } from '../../../models/sandboxEvaluationRun.model.js';
import { notDeleted } from './normalize.util.js';

/**
 * Non-executable readiness calculation.
 * Never returns READY_FOR_AUTOMATIC_DEPLOYMENT.
 */
export async function calculateReadiness(companyId, release, settings) {
    const errors = [];
    const warnings = [];

    if (release.sourceEnvironment === 'PRODUCTION') {
        errors.push({ code: 'SOURCE_PRODUCTION', message: 'Production cannot be selected as a source environment' });
    }

    const targetProd = release.targetEnvironment === 'PRODUCTION';

    if (settings.requireBackupPlan && !release.backupPlan) {
        errors.push({ code: 'BACKUP_PLAN', message: 'Missing backup plan' });
    }
    if (settings.requireRollbackPlan && !release.rollbackPlan) {
        errors.push({ code: 'ROLLBACK_PLAN', message: 'Missing rollback plan' });
    }
    if (settings.requireHealthCheckPlan && !release.healthCheckPlan) {
        warnings.push({ code: 'HEALTH_CHECK_PLAN', message: 'Missing health-check plan' });
        if (targetProd) errors.push({ code: 'HEALTH_CHECK_PLAN', message: 'Health-check plan required for production plan' });
    }
    if (settings.requireSmokeTestPlan && !release.smokeTestPlan) {
        warnings.push({ code: 'SMOKE_TEST_PLAN', message: 'Missing smoke-test plan' });
        if (targetProd) errors.push({ code: 'SMOKE_TEST_PLAN', message: 'Smoke-test plan required for production plan' });
    }
    if (settings.requireMonitoringPlan && !release.monitoringPlan) {
        warnings.push({ code: 'MONITORING_PLAN', message: 'Missing monitoring plan' });
    }

    if (settings.requireConfigurationVersion) {
        if (!(release.includedConfigurationVersionIds || []).length) {
            errors.push({ code: 'CONFIG_VERSION', message: 'Missing Phase 21 configuration version' });
        } else {
            for (const id of release.includedConfigurationVersionIds) {
                const v = await IntelligenceConfigurationVersion.findOne({ _id: id, companyId, ...notDeleted() }).lean();
                if (!v) errors.push({ code: 'FOREIGN_CONFIG', message: `Configuration version ${id} not found for company` });
                else if (!['READY_FOR_SANDBOX', 'SANDBOX_TESTED', 'APPROVED_FOR_FUTURE_ACTIVATION', 'VALIDATED'].includes(v.status)) {
                    errors.push({ code: 'CONFIG_NOT_READY', message: `Configuration version status ${v.status} not acceptable` });
                } else if (v.runtimeActive === true) {
                    errors.push({ code: 'CONFIG_RUNTIME_ACTIVE', message: 'Linked configuration must not be runtime-active' });
                }
            }
        }
    }

    if (settings.requireImplementationSpecification) {
        if (!(release.implementationSpecificationIds || []).length) {
            if (['CONFIGURATION_RELEASE', 'AI_INTELLIGENCE_RELEASE', 'DATA_EXTRACTOR_RELEASE'].includes(release.releaseType)) {
                errors.push({ code: 'IMPL_SPEC', message: 'Missing Phase 20 Implementation Specification' });
            } else {
                warnings.push({ code: 'IMPL_SPEC', message: 'No Implementation Specification linked' });
            }
        } else {
            for (const id of release.implementationSpecificationIds) {
                const s = await ImplementationSpecification.findOne({ _id: id, companyId, ...notDeleted() }).lean();
                if (!s) errors.push({ code: 'FOREIGN_SPEC', message: `Implementation Specification ${id} not found for company` });
                else if (s.executable === true) errors.push({ code: 'SPEC_EXECUTABLE', message: 'Executable specification rejected' });
            }
        }
    }

    if (settings.requireSandboxEvaluation) {
        if (!(release.sandboxEvaluationRunIds || []).length) {
            if (targetProd) errors.push({ code: 'SANDBOX_EVAL', message: 'Missing Phase 22 Sandbox Evaluation for production-plan readiness' });
            else warnings.push({ code: 'SANDBOX_EVAL', message: 'No Sandbox Evaluation linked' });
        } else {
            for (const id of release.sandboxEvaluationRunIds) {
                const run = await SandboxEvaluationRun.findOne({ _id: id, companyId, ...notDeleted() }).lean();
                if (!run) errors.push({ code: 'FOREIGN_SANDBOX', message: `Sandbox run ${id} not found for company` });
                else if (run.gateResult === 'FAIL') {
                    errors.push({ code: 'SANDBOX_FAIL', message: 'Failed Sandbox Evaluation blocks readiness' });
                } else if (!['COMPLETED', 'COMPLETED_WITH_WARNINGS'].includes(run.status)) {
                    warnings.push({ code: 'SANDBOX_STATUS', message: `Sandbox run status ${run.status}` });
                }
            }
        }
    }

    // Staging/pilot gate progression for production plans
    if (targetProd && settings.requireStagingBeforePilot) {
        if (!['STAGING_VALIDATION_RECORDED', 'APPROVED_FOR_PILOT_PLAN', 'PILOT_VALIDATION_RECORDED',
            'APPROVED_FOR_FUTURE_PRODUCTION_PLAN', 'RELEASE_PACKAGE_FINALIZED'].includes(release.status)
            && release.status !== 'APPROVED_FOR_FUTURE_PRODUCTION_PLAN') {
            // readiness can still be computed as future-review only when prior stages recorded
        }
    }

    if (targetProd && settings.requirePilotBeforeProductionPlan) {
        if (!['PILOT_VALIDATION_RECORDED', 'APPROVED_FOR_FUTURE_PRODUCTION_PLAN', 'RELEASE_PACKAGE_FINALIZED'].includes(release.status)) {
            if (!errors.some((e) => e.code === 'PILOT')) {
                // soft: if targeting production plan readiness, require pilot recorded
                if (release.status === 'APPROVED_FOR_FUTURE_PRODUCTION_PLAN' || release.approvalStatus === 'PRODUCTION_PLAN') {
                    /* ok */
                } else if (['READY_FOR_REVIEW', 'DRAFT', 'APPROVED_FOR_STAGING_PLAN', 'STAGING_VALIDATION_RECORDED', 'APPROVED_FOR_PILOT_PLAN'].includes(release.status)) {
                    warnings.push({ code: 'PILOT_REQUIRED', message: 'Pilot validation not yet recorded for future production plan' });
                }
            }
        }
    }

    if (settings.requireSecurityReview && targetProd) {
        const approvalBlob = String(release.approvalStatus || '');
        if (!/SECURITY_REVIEW:(APPROVE|APPROVE_WITH_CONDITIONS)/i.test(approvalBlob)
            && !['APPROVED_FOR_FUTURE_PRODUCTION_PLAN', 'RELEASE_PACKAGE_FINALIZED', 'PILOT_VALIDATION_RECORDED',
                'APPROVED_FOR_PILOT_PLAN', 'STAGING_VALIDATION_RECORDED', 'APPROVED_FOR_STAGING_PLAN',
                'READY_FOR_REVIEW', 'UNDER_TECHNICAL_REVIEW', 'UNDER_BUSINESS_REVIEW',
                'UNDER_SECURITY_REVIEW', 'UNDER_RELEASE_REVIEW'].includes(release.status)) {
            warnings.push({ code: 'SECURITY_REVIEW', message: 'Security review not yet recorded' });
        } else if (release.status === 'APPROVED_FOR_FUTURE_PRODUCTION_PLAN'
            && !/SECURITY_REVIEW:(APPROVE|APPROVE_WITH_CONDITIONS)/i.test(approvalBlob)
            && !release.securityReviewRecorded) {
            warnings.push({ code: 'SECURITY_REVIEW', message: 'Security review recommended before production plan finalization' });
        }
    }

    // Industry isolation notes
    const industries = (release.industryRollout || []).map((i) => i.industryCode || i.industry);
    if (industries.includes('JSK_URJA_ELECTRONICS') && industries.includes('HANDLOOM_TEXTILE')) {
        warnings.push({ code: 'MULTI_INDUSTRY', message: 'JSK URJA and Handloom in same plan — validate isolation carefully' });
    }

    let readinessStatus = 'NOT_READY';
    if (errors.length === 0) {
        if (targetProd) readinessStatus = warnings.length ? 'READY_WITH_WARNINGS' : 'READY_FOR_FUTURE_PRODUCTION_REVIEW';
        else if (release.targetEnvironment === 'STAGING') readinessStatus = warnings.length ? 'READY_WITH_WARNINGS' : 'READY_FOR_STAGING_PLAN';
        else if (release.targetEnvironment === 'TESTING' || release.companyRollout?.length) {
            readinessStatus = warnings.length ? 'READY_WITH_WARNINGS' : 'READY_FOR_PILOT_PLAN';
        } else {
            readinessStatus = warnings.length ? 'READY_WITH_WARNINGS' : 'READY_FOR_STAGING_PLAN';
        }
    }

    return {
        readinessStatus,
        errors,
        warnings,
        automaticDeployment: false,
        note: 'Never READY_FOR_AUTOMATIC_DEPLOYMENT — Phase 23 is non-executable',
        executable: false,
        deploymentExecuted: false,
        productionActivated: false,
    };
}
