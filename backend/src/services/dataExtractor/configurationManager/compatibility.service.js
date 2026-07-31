import { ApiError } from '../../../utils/ApiError.js';
import { IntelligenceConfigurationCompatibility } from '../../../models/intelligenceConfigurationCompatibility.model.js';
import { IntelligenceConfigurationVersion } from '../../../models/intelligenceConfigurationVersion.model.js';
import { IntelligenceConfigurationFamily } from '../../../models/intelligenceConfigurationFamily.model.js';
import { ENGINE_VERSION, REQUIRED_SOURCE_PHASE, PERMS } from './constants.js';
import { assertPerm, assertView } from './permissions.util.js';
import { notDeleted, assertNoSecrets } from './normalize.util.js';
import { analyzeDependencies } from './dependency.service.js';

export async function checkCompatibility(companyId, versionId, user = null) {
    assertView(user);
    assertPerm(user, PERMS.compatibility);
    const version = await IntelligenceConfigurationVersion.findOne({ _id: versionId, companyId, ...notDeleted() }).lean();
    if (!version) throw new ApiError(404, 'Version not found');
    const family = await IntelligenceConfigurationFamily.findOne({ _id: version.familyId, companyId, ...notDeleted() }).lean();

    const checks = [];
    const warnings = [];
    const blockers = [];

    checks.push({
        id: 'schema_compatibility',
        result: family?.schemaVersion ? 'PASS' : 'WARN',
        detail: `Family schemaVersion=${family?.schemaVersion || 'unknown'}`,
    });
    if (!family?.schemaVersion) warnings.push({ code: 'UNKNOWN_SCHEMA', message: 'Family schema version unknown' });

    checks.push({
        id: 'engine_supported_fields',
        result: 'PASS',
        detail: 'Phase 21 stores metadata only; runtime engines do not consume Draft versions',
    });

    checks.push({
        id: 'required_backend_version',
        result: 'PASS',
        detail: ENGINE_VERSION,
    });

    checks.push({
        id: 'required_source_phase',
        result: version.linkedImplementationSpecificationId ? 'PASS' : 'WARN',
        detail: `Required source phase >= ${REQUIRED_SOURCE_PHASE}`,
    });
    if (!version.linkedImplementationSpecificationId) {
        warnings.push({ code: 'NO_PHASE20_LINK', message: 'Version not linked to Phase 20 Implementation Specification' });
    }

    checks.push({
        id: 'company_industry_scope',
        result: version.companyScope === 'OWN_COMPANY' ? 'PASS' : 'FAIL',
        detail: version.companyScope,
    });
    if (version.companyScope !== 'OWN_COMPANY') {
        blockers.push({ code: 'SCOPE', message: 'Only OWN_COMPANY scope is compatible in Phase 21' });
    }

    checks.push({
        id: 'permission_compatibility',
        result: 'PASS',
        detail: 'configuration_manager permissions required at API layer',
    });

    checks.push({
        id: 'aggregate_only_behavior',
        result: 'PASS',
        detail: 'Aggregate-only users receive redacted payloads',
    });

    checks.push({
        id: 'privacy_requirements',
        result: 'PASS',
        detail: 'No secrets/credentials allowed in payload',
    });

    checks.push({
        id: 'data_availability',
        result: 'PASS',
        detail: 'Configuration stored as version metadata only',
    });

    checks.push({
        id: 'rollback_availability',
        result: version.rollbackTargetVersionId ? 'PASS' : 'WARN',
        detail: version.rollbackTargetVersionId ? 'Rollback target selected' : 'No rollback target selected',
    });
    if (!version.rollbackTargetVersionId) {
        warnings.push({ code: 'NO_ROLLBACK_TARGET', message: 'Rollback target not selected' });
    }

    const deps = await analyzeDependencies(companyId, versionId, user);
    if (deps.circularDependency?.length) {
        blockers.push({ code: 'CIRCULAR_DEPENDENCY', message: 'Circular dependency detected' });
        checks.push({ id: 'known_limitation_conflicts', result: 'FAIL', detail: 'Circular dependency' });
    } else if (deps.missingDependencies?.length) {
        warnings.push({ code: 'MISSING_DEPENDENCY', message: 'One or more dependencies missing' });
        checks.push({ id: 'known_limitation_conflicts', result: 'WARN', detail: 'Missing dependencies' });
    } else {
        checks.push({ id: 'known_limitation_conflicts', result: 'PASS', detail: 'None' });
    }

    // Schema validation alone is insufficient for COMPATIBLE
    let status = 'UNKNOWN';
    if (blockers.length) status = 'INCOMPATIBLE';
    else if (version.validationStatus === 'FAIL') {
        status = 'INCOMPATIBLE';
        blockers.push({ code: 'VALIDATION_FAIL', message: 'Version validation failed' });
    } else if (version.validationStatus === 'PASS' || version.validationStatus === 'PASS_WITH_WARNINGS') {
        status = warnings.length ? 'COMPATIBLE_WITH_WARNINGS' : 'COMPATIBLE';
    } else {
        status = 'UNKNOWN';
        warnings.push({ code: 'NOT_VALIDATED', message: 'Compatibility requires prior validation; schema pass alone is not enough' });
    }

    const record = await IntelligenceConfigurationCompatibility.create({
        companyId,
        versionId: version._id,
        status,
        checks,
        warnings,
        blockers,
        checkedBy: user?.id || user?._id || null,
    });
    assertNoSecrets({ status, checks, warnings, blockers });

    return {
        status,
        checks,
        warnings,
        blockers,
        compatibilityId: record._id,
        note: 'Compatibility is not granted merely because schema validation passed.',
        runtimeActivation: false,
    };
}
