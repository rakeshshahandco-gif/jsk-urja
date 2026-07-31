import { ApiError } from '../../../utils/ApiError.js';
import { IntelligenceConfigurationDependency } from '../../../models/intelligenceConfigurationDependency.model.js';
import { IntelligenceConfigurationFamily } from '../../../models/intelligenceConfigurationFamily.model.js';
import { IntelligenceConfigurationVersion } from '../../../models/intelligenceConfigurationVersion.model.js';
import { DEFAULT_FAMILY_DEPENDENCIES, PERMS } from './constants.js';
import { assertPerm, assertView } from './permissions.util.js';
import { notDeleted } from './normalize.util.js';

export async function syncDefaultDependencies(companyId, versionDoc, familyCode) {
    const required = DEFAULT_FAMILY_DEPENDENCIES[familyCode] || [];
    for (const code of required) {
        const exists = await IntelligenceConfigurationDependency.findOne({
            companyId, versionId: versionDoc._id, dependsOnFamilyCode: code, ...notDeleted(),
        });
        if (!exists) {
            await IntelligenceConfigurationDependency.create({
                companyId,
                versionId: versionDoc._id,
                familyId: versionDoc.familyId,
                dependsOnFamilyCode: code,
                dependencyType: 'CONFIGURATION_FAMILY',
                required: true,
                notes: 'Default Phase 21 dependency (metadata only; not auto-modified)',
            });
        }
    }
}

export async function analyzeDependencies(companyId, versionId, user = null) {
    assertView(user);
    assertPerm(user, PERMS.dependencies);
    const version = await IntelligenceConfigurationVersion.findOne({ _id: versionId, companyId, ...notDeleted() }).lean();
    if (!version) throw new ApiError(404, 'Version not found');
    const family = await IntelligenceConfigurationFamily.findOne({ _id: version.familyId, companyId, ...notDeleted() }).lean();
    await syncDefaultDependencies(companyId, version, family?.code);

    const deps = await IntelligenceConfigurationDependency.find({
        companyId, versionId: version._id, ...notDeleted(),
    }).lean();

    const missing = [];
    const available = [];
    const incompatible = [];
    for (const dep of deps) {
        const depFamily = await IntelligenceConfigurationFamily.findOne({
            companyId, code: dep.dependsOnFamilyCode, ...notDeleted(),
        }).lean();
        if (!depFamily) {
            missing.push({ code: dep.dependsOnFamilyCode, reason: 'FAMILY_MISSING' });
            continue;
        }
        const depVersion = await IntelligenceConfigurationVersion.findOne({
            companyId, familyId: depFamily._id, ...notDeleted(),
            status: { $in: ['VALIDATED', 'READY_FOR_SANDBOX', 'SANDBOX_TESTED', 'APPROVED_FOR_FUTURE_ACTIVATION'] },
        }).sort({ versionNumber: -1 }).lean();
        if (!depVersion) {
            missing.push({ code: dep.dependsOnFamilyCode, reason: 'NO_VALIDATED_VERSION' });
        } else if (dep.dependsOnMinimumVersion != null && depVersion.versionNumber < dep.dependsOnMinimumVersion) {
            incompatible.push({
                code: dep.dependsOnFamilyCode,
                reason: 'MINIMUM_VERSION',
                found: depVersion.versionNumber,
                required: dep.dependsOnMinimumVersion,
            });
        } else {
            available.push({ code: dep.dependsOnFamilyCode, versionNumber: depVersion.versionNumber });
        }
    }

    const circular = detectCircular(family?.code, deps.map((d) => d.dependsOnFamilyCode));
    const status = circular.length || missing.length || incompatible.length
        ? (circular.length ? 'CIRCULAR' : 'MISSING')
        : 'OK';

    return {
        versionId: String(version._id),
        familyCode: family?.code,
        requiredConfigurationFamilies: deps.map((d) => d.dependsOnFamilyCode),
        requiredMinimumVersions: deps.filter((d) => d.dependsOnMinimumVersion != null)
            .map((d) => ({ code: d.dependsOnFamilyCode, min: d.dependsOnMinimumVersion })),
        missingDependencies: missing,
        incompatibleVersions: incompatible,
        availableDependencies: available,
        circularDependency: circular,
        sourceMasterDependencies: version.configurationPayload?.productIds ? ['Product Master'] : [],
        runtimeEngineDependency: family?.module || '',
        rollbackDependency: version.rollbackTargetVersionId || null,
        dependencyStatus: status,
        note: 'Dependencies are tracked only; Phase 21 does not modify them automatically.',
    };
}

function detectCircular(startCode, dependsOn) {
    if (!startCode) return [];
    // Simple: if any declared dependency lists this family as depending back via defaults
    const cycles = [];
    for (const code of dependsOn) {
        const reverse = DEFAULT_FAMILY_DEPENDENCIES[code] || [];
        if (reverse.includes(startCode)) cycles.push([startCode, code, startCode]);
        if (code === startCode) cycles.push([startCode, startCode]);
    }
    // Explicit payload circular flag
    return cycles;
}

export async function detectExplicitCircular(companyId, versionDoc, declaredDeps = []) {
    const family = await IntelligenceConfigurationFamily.findOne({ _id: versionDoc.familyId, companyId }).lean();
    const codes = declaredDeps.length
        ? declaredDeps
        : (DEFAULT_FAMILY_DEPENDENCIES[family?.code] || []);
    // If payload declares dependsOn including itself
    const payloadDeps = versionDoc.configurationPayload?.dependsOnFamilyCodes || [];
    const all = [...new Set([...codes, ...payloadDeps])];
    if (all.includes(family?.code)) {
        return [{ cycle: [family.code, family.code], reason: 'SELF_DEPENDENCY' }];
    }
    return detectCircular(family?.code, all);
}
