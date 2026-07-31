import { ApiError } from '../../../utils/ApiError.js';
import { PilotCompanyPlan } from '../../../models/pilotCompanyPlan.model.js';
import { PilotCohort } from '../../../models/pilotCohort.model.js';
import { MODULE_PLAN_ACTIONS, ALLOWED_FLAG_STATES, PERMS, INDUSTRIES } from './constants.js';
import { assertView, assertPerm, isClientAdminOnly } from './permissions.util.js';
import {
    rejectTenantOverrides, assertSafeText, assertPayloadSafe, notDeleted,
    forceSimulationOnly, assertSafeFlagState, stripUnsafeWriteFields,
} from './normalize.util.js';
import { writeAudit } from './audit.util.js';
import { loadScopedProgram } from './pilotProgram.service.js';

export async function listCompanies(companyId, query = {}, user = null) {
    assertView(user);
    rejectTenantOverrides(query);
    const q = { ...notDeleted(), companyId };
    if (query.pilotProgramId) q.pilotProgramId = query.pilotProgramId;
    const items = await PilotCompanyPlan.find(q).sort({ createdAt: -1 }).limit(100).lean();
    return { items: items.map((d) => forceSimulationOnly({ ...d, id: String(d._id), activationExecuted: false })) };
}

export async function createCompanyPlan(companyId, userId, body = {}, user = null) {
    assertPerm(user, PERMS.company_selection);
    rejectTenantOverrides(body);
    assertPayloadSafe(body);
    const safe = stripUnsafeWriteFields(body);
    const program = await loadScopedProgram(companyId, safe.pilotProgramId);
    if (isClientAdminOnly(user) && String(safe.plannedCompanyId) !== String(companyId)) {
        throw new ApiError(403, 'Client Admin cannot approve another company pilot plan');
    }
    const plannedCompanyId = safe.plannedCompanyId || companyId;
    const existing = await PilotCompanyPlan.findOne({ pilotProgramId: program._id, plannedCompanyId, ...notDeleted() });
    if (existing) throw new ApiError(400, 'Duplicate company plan prevented');
    const doc = await PilotCompanyPlan.create({
        companyId,
        pilotProgramId: program._id,
        plannedCompanyId,
        companyCode: String(safe.companyCode || '').slice(0, 40),
        companyNameSnapshot: assertSafeText(safe.companyNameSnapshot || 'Planned company', 'companyNameSnapshot'),
        industryTemplate: String(safe.industryTemplate || '').slice(0, 80),
        currentEnabledModulesSnapshot: safe.currentEnabledModulesSnapshot || [],
        proposedPilotModules: safe.proposedPilotModules || [],
        proposedPilotFeatures: safe.proposedPilotFeatures || [],
        plannedPilotUsers: safe.plannedPilotUsers || [],
        eligibilityStatus: safe.eligibilityStatus || 'PENDING',
        readinessConcerns: safe.readinessConcerns || [],
        riskLevel: safe.riskLevel || 'MEDIUM',
        isolationVerified: !!safe.isolationVerified,
        approvalStatus: 'PENDING',
        activationExecuted: false,
        simulationOnly: true,
        createdBy: userId,
        updatedBy: userId,
    });
    await writeAudit(companyId, userId, 'COMPANY_PLAN_CREATE', 'PilotCompanyPlan', doc._id, {}, { pilotProgramId: program._id });
    return forceSimulationOnly({ ...doc.toObject(), id: String(doc._id) });
}

export async function listIndustries(companyId, query = {}, user = null) {
    assertView(user);
    rejectTenantOverrides(query);
    let scope = INDUSTRIES;
    if (query.pilotProgramId) {
        const program = await loadScopedProgram(companyId, query.pilotProgramId);
        scope = program.industryScope?.length ? program.industryScope : INDUSTRIES;
    }
    return forceSimulationOnly({
        items: scope.map((name) => ({ industry: name, planningOnly: true, configurationAltered: false })),
        note: 'Industry references are planning metadata only',
    });
}

export async function setIndustryScope(companyId, userId, body = {}, user = null) {
    assertPerm(user, PERMS.industry_selection);
    rejectTenantOverrides(body);
    const safe = stripUnsafeWriteFields(body);
    const program = await loadScopedProgram(companyId, safe.pilotProgramId);
    const industries = (safe.industries || []).map(String);
    for (const ind of industries) {
        if (!INDUSTRIES.includes(ind) && !/^[\w-]+$/.test(ind)) {
            throw new ApiError(400, `Invalid industry: ${ind}`);
        }
    }
    program.industryScope = industries;
    program.updatedBy = userId;
    await program.save();
    await writeAudit(companyId, userId, 'INDUSTRY_SCOPE_UPDATE', 'PilotProgram', program._id, { industries }, { pilotProgramId: program._id });
    return forceSimulationOnly({ id: String(program._id), industryScope: program.industryScope, configurationAltered: false });
}

export async function listCohorts(companyId, query = {}, user = null) {
    assertView(user);
    rejectTenantOverrides(query);
    const q = { ...notDeleted(), companyId };
    if (query.pilotProgramId) q.pilotProgramId = query.pilotProgramId;
    const items = await PilotCohort.find(q).sort({ createdAt: -1 }).limit(100).lean();
    return { items: items.map((d) => forceSimulationOnly({ ...d, id: String(d._id), runtimePermissionsGranted: false })) };
}

export async function createCohort(companyId, userId, body = {}, user = null) {
    assertPerm(user, PERMS.cohort_manage);
    rejectTenantOverrides(body);
    assertPayloadSafe(body);
    const safe = stripUnsafeWriteFields(body);
    const program = await loadScopedProgram(companyId, safe.pilotProgramId);
    const doc = await PilotCohort.create({
        companyId,
        pilotProgramId: program._id,
        cohortName: assertSafeText(safe.cohortName || 'Cohort', 'cohortName'),
        cohortType: safe.cohortType || 'UAT_TESTERS',
        industry: safe.industry || '',
        includedUsers: safe.includedUsers || [],
        excludedUsers: safe.excludedUsers || [],
        plannedModuleAccess: safe.plannedModuleAccess || [],
        plannedPermissions: safe.plannedPermissions || [],
        startWindow: safe.startWindow || null,
        endWindow: safe.endWindow || null,
        trainingRequired: safe.trainingRequired !== false,
        uatResponsibilities: safe.uatResponsibilities || [],
        feedbackResponsibilities: safe.feedbackResponsibilities || [],
        riskClassification: safe.riskClassification || 'MEDIUM',
        activeSimulationStatus: 'PLANNED',
        runtimePermissionsGranted: false,
        simulationOnly: true,
        createdBy: userId,
        updatedBy: userId,
    });
    await writeAudit(companyId, userId, 'COHORT_CREATE', 'PilotCohort', doc._id, {}, { pilotProgramId: program._id });
    return forceSimulationOnly({ ...doc.toObject(), id: String(doc._id), runtimePermissionsGranted: false });
}

export async function upsertModulePlan(companyId, userId, body = {}, user = null) {
    assertPerm(user, PERMS.module_plan);
    rejectTenantOverrides(body);
    assertPayloadSafe(body);
    const safe = stripUnsafeWriteFields(body);
    const program = await loadScopedProgram(companyId, safe.pilotProgramId);
    if (!MODULE_PLAN_ACTIONS.includes(safe.proposedAction || safe.proposedPilotState)) {
        if (!MODULE_PLAN_ACTIONS.includes(safe.action)) throw new ApiError(400, 'Invalid module plan action');
    }
    const action = safe.action || safe.proposedAction || safe.proposedPilotState;
    const plan = {
        moduleKey: String(safe.moduleKey || '').slice(0, 80),
        moduleName: assertSafeText(safe.moduleName || safe.moduleKey || '', 'moduleName'),
        currentStateSnapshot: safe.currentStateSnapshot || 'UNKNOWN',
        proposedPilotState: action,
        dependencyModules: safe.dependencyModules || [],
        permissionDependencies: safe.permissionDependencies || [],
        dataDependencies: safe.dataDependencies || [],
        rolloutOrder: Number(safe.rolloutOrder || 1),
        rollbackImpact: safe.rollbackImpact || 'LOW',
        risk: safe.risk || 'MEDIUM',
        approval: 'PENDING',
        reason: assertSafeText(safe.reason || '', 'reason'),
        executed: false,
    };
    if (!plan.moduleKey) throw new ApiError(400, 'moduleKey required');
    program.modulePlans = [...(program.modulePlans || []).filter((p) => p.moduleKey !== plan.moduleKey), plan];
    program.updatedBy = userId;
    await program.save();
    await writeAudit(companyId, userId, 'MODULE_PLAN_UPDATE', 'PilotProgram', program._id, { moduleKey: plan.moduleKey }, { pilotProgramId: program._id });
    return forceSimulationOnly({ pilotProgramId: String(program._id), modulePlans: program.modulePlans, platformSettingsChanged: false });
}

export async function upsertFeatureFlagPlan(companyId, userId, body = {}, user = null) {
    assertPerm(user, PERMS.feature_flag_plan);
    rejectTenantOverrides(body);
    assertPayloadSafe(body);
    const safe = stripUnsafeWriteFields(body);
    const program = await loadScopedProgram(companyId, safe.pilotProgramId);
    const proposed = assertSafeFlagState(safe.proposedPilotState || 'OFF');
    if (!ALLOWED_FLAG_STATES.includes(proposed)) throw new ApiError(400, `Flag state not allowed: ${proposed}`);
    const plan = {
        featureKey: String(safe.featureKey || '').slice(0, 80),
        releaseVersion: safe.releaseVersion || '',
        industry: safe.industry || '',
        module: safe.module || '',
        cohort: safe.cohort || '',
        currentStateSnapshot: safe.currentStateSnapshot || 'OFF',
        proposedPilotState: proposed,
        rolloutPercentagePlan: Number(safe.rolloutPercentagePlan || 0),
        rolloutSequence: Number(safe.rolloutSequence || 1),
        riskLevel: safe.riskLevel || 'MEDIUM',
        rollbackCondition: safe.rollbackCondition || '',
        approvalStatus: 'PENDING',
        activated: false,
    };
    if (!plan.featureKey) throw new ApiError(400, 'featureKey required');
    program.featureFlagPlans = [...(program.featureFlagPlans || []).filter((p) => p.featureKey !== plan.featureKey), plan];
    program.updatedBy = userId;
    await program.save();
    await writeAudit(companyId, userId, 'FEATURE_FLAG_PLAN_UPDATE', 'PilotProgram', program._id, { featureKey: plan.featureKey }, { pilotProgramId: program._id });
    return forceSimulationOnly({ pilotProgramId: String(program._id), featureFlagPlans: program.featureFlagPlans, runtimeFlagActivated: false });
}

export async function listModulePlans(companyId, query = {}, user = null) {
    assertView(user);
    const program = await loadScopedProgram(companyId, query.pilotProgramId);
    return forceSimulationOnly({ items: program.modulePlans || [], platformSettingsChanged: false });
}

export async function listFeatureFlagPlans(companyId, query = {}, user = null) {
    assertView(user);
    const program = await loadScopedProgram(companyId, query.pilotProgramId);
    return forceSimulationOnly({ items: program.featureFlagPlans || [], runtimeFlagActivated: false });
}