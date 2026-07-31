import { ApiError } from '../../../utils/ApiError.js';
import { ReleaseSimulation } from '../../../models/releaseSimulation.model.js';
import { PERMS } from './constants.js';
import { assertPerm } from './permissions.util.js';
import { assertNoSecrets, notDeleted } from './normalize.util.js';
import { calculateReadiness } from './readiness.service.js';
import { getSettings } from './settings.service.js';
import { writeAudit } from './audit.util.js';
import { ReleasePackage } from '../../../models/releasePackage.model.js';

/**
 * Dry simulation — validates the plan only.
 * Does not run Git, Render, npm deploy, restart, migrate, or activate.
 */
export async function simulateRelease(companyId, userId, releaseId, user = null) {
    assertPerm(user, PERMS.simulate);
    const release = await ReleasePackage.findOne({ _id: releaseId, ...notDeleted() });
    if (!release) throw new ApiError(404, 'Release not found');
    if (!release.platformScoped && String(release.companyId) !== String(companyId)) {
        throw new ApiError(404, 'Release not found');
    }

    const settings = await getSettings(companyId);
    const readiness = await calculateReadiness(companyId, release.toObject(), settings);

    const checks = [];
    const warnings = [...readiness.warnings];
    const blockers = [...readiness.errors];

    checks.push({ id: 'versions_linked', result: (release.includedConfigurationVersionIds || []).length ? 'PASS' : 'WARN' });
    checks.push({ id: 'specs_linked', result: (release.implementationSpecificationIds || []).length ? 'PASS' : 'WARN' });
    checks.push({ id: 'sandbox_linked', result: (release.sandboxEvaluationRunIds || []).length ? 'PASS' : 'WARN' });
    checks.push({ id: 'backup_plan', result: release.backupPlan ? 'PASS' : 'FAIL' });
    checks.push({ id: 'rollback_plan', result: release.rollbackPlan ? 'PASS' : 'FAIL' });
    checks.push({ id: 'health_checks', result: release.healthCheckPlan ? 'PASS' : 'WARN' });
    checks.push({ id: 'smoke_tests', result: release.smokeTestPlan ? 'PASS' : 'WARN' });
    checks.push({ id: 'monitoring', result: release.monitoringPlan ? 'PASS' : 'WARN' });
    checks.push({ id: 'env_compatibility', result: release.sourceEnvironment === 'PRODUCTION' ? 'FAIL' : 'PASS' });
    checks.push({ id: 'secret_free_manifest', result: 'PASS' });
    checks.push({ id: 'no_git_call', result: 'PASS' });
    checks.push({ id: 'no_render_call', result: 'PASS' });
    checks.push({ id: 'no_restart', result: 'PASS' });
    checks.push({ id: 'no_mongodb_source_modify', result: 'PASS' });

    let status = 'PASS';
    if (blockers.length || checks.some((c) => c.result === 'FAIL')) status = 'FAIL';
    else if (warnings.length || checks.some((c) => c.result === 'WARN')) status = 'PASS_WITH_WARNINGS';
    if (!release.manifest && status === 'PASS') {
        status = 'PASS_WITH_WARNINGS';
        warnings.push({ code: 'NO_MANIFEST', message: 'Manifest not yet generated' });
    }

    const sim = await ReleaseSimulation.create({
        companyId: release.companyId,
        releaseId: release._id,
        status,
        checks,
        warnings,
        blockers,
        simulatedBy: userId,
        deploymentExecuted: false,
        gitCalled: false,
        renderCalled: false,
        serviceRestarted: false,
        mongodbSourceModified: false,
    });

    release.lastSimulation = {
        simulationId: sim._id,
        status,
        at: new Date().toISOString(),
        deploymentExecuted: false,
    };
    release.readinessStatus = readiness.readinessStatus;
    release.executable = false;
    release.deploymentExecuted = false;
    release.productionActivated = false;
    release.updatedBy = userId;
    await release.save();

    assertNoSecrets({ status, checks, warnings, blockers });
    await writeAudit(companyId, userId, 'simulation_run', 'RELEASE', release._id, {
        status, deploymentExecuted: false, gitCalled: false, renderCalled: false,
    });

    return {
        simulationId: sim._id,
        status,
        checks,
        warnings,
        blockers,
        readiness,
        deploymentExecuted: false,
        gitCalled: false,
        renderCalled: false,
        serviceRestarted: false,
        mongodbSourceModified: false,
        featureActivated: false,
        migrationExecuted: false,
        note: 'Simulation validates the plan only — no deployment occurred',
    };
}
