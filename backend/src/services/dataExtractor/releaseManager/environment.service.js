import { ApiError } from '../../../utils/ApiError.js';
import { DeploymentEnvironment, ENVIRONMENT_CODES } from '../../../models/deploymentEnvironment.model.js';
import { PERMS } from './constants.js';
import { assertView, assertPerm, assertPlatformAdmin, isPlatformAdmin, isClientAdminOnly } from './permissions.util.js';
import {
    rejectTenantOverrides, assertNoSecrets, assertSafeText, notDeleted, assertPayloadSafe,
} from './normalize.util.js';
import { writeAudit } from './audit.util.js';

function forceSafe(doc) {
    const out = { ...doc, id: String(doc._id) };
    delete out.password;
    delete out.apiKey;
    delete out.token;
    return out;
}

export async function listEnvironments(companyId, query = {}, user = null) {
    assertView(user);
    rejectTenantOverrides(query);
    const q = { ...notDeleted() };
    if (isPlatformAdmin(user) && query.platformScoped === 'true') {
        q.platformScoped = true;
    } else {
        q.companyId = companyId;
        q.platformScoped = false;
    }
    if (query.environmentCode) q.environmentCode = query.environmentCode;
    const items = await DeploymentEnvironment.find(q).sort({ environmentCode: 1 }).lean();
    return { items: items.map(forceSafe) };
}

export async function getEnvironment(companyId, id, user = null) {
    assertView(user);
    const q = { _id: id, ...notDeleted() };
    if (!isPlatformAdmin(user)) {
        q.companyId = companyId;
        q.platformScoped = false;
    }
    const doc = await DeploymentEnvironment.findOne(q).lean();
    if (!doc) throw new ApiError(404, 'Environment not found');
    if (!doc.platformScoped && String(doc.companyId) !== String(companyId) && !isPlatformAdmin(user)) {
        throw new ApiError(404, 'Environment not found');
    }
    return forceSafe(doc);
}

export async function createEnvironment(companyId, userId, body = {}, user = null) {
    rejectTenantOverrides(body);
    assertNoSecrets(body);
    assertPayloadSafe(body);
    const platformScoped = body.platformScoped === true;
    if (platformScoped) assertPlatformAdmin(user);
    else assertPerm(user, PERMS.manage);
    if (isClientAdminOnly(user)) throw new ApiError(403, 'Client Admin cannot create environments');

    if (!ENVIRONMENT_CODES.includes(body.environmentCode)) {
        throw new ApiError(400, `Invalid environmentCode: ${body.environmentCode}`);
    }
    const protectedEnvironment = body.environmentCode === 'PRODUCTION' || !!body.protectedEnvironment;
    const productionLike = body.environmentCode === 'PRODUCTION' || body.environmentCode === 'STAGING' || !!body.productionLike;

    const doc = await DeploymentEnvironment.create({
        companyId: platformScoped ? null : companyId,
        platformScoped,
        environmentCode: body.environmentCode,
        environmentName: assertSafeText(body.environmentName || body.environmentCode, 'environmentName'),
        environmentType: String(body.environmentType || body.environmentCode).slice(0, 80),
        description: assertSafeText(body.description || '', 'description'),
        frontendServiceReference: String(body.frontendServiceReference || '').slice(0, 120),
        backendServiceReference: String(body.backendServiceReference || '').slice(0, 120),
        databaseReferenceAlias: String(body.databaseReferenceAlias || 'crm_test_alias').slice(0, 120),
        branchReference: String(body.branchReference || '').slice(0, 120),
        deploymentMethod: 'MANUAL_FUTURE',
        healthCheckDefinition: body.healthCheckDefinition || { endpointAlias: '/api/v1/health' },
        backupRequired: body.backupRequired !== false,
        rollbackRequired: body.rollbackRequired !== false,
        approvalPolicy: body.approvalPolicy || {},
        protectedEnvironment,
        productionLike,
        allowedSourceEnvironment: body.allowedSourceEnvironment || ['LOCALHOST', 'DEVELOPMENT', 'TESTING', 'STAGING'].filter((e) => e !== 'PRODUCTION'),
        allowedTargetEnvironment: body.allowedTargetEnvironment || [body.environmentCode],
        active: body.active !== false,
        createdBy: userId,
        updatedBy: userId,
    });
    await writeAudit(companyId, userId, 'environment_created', 'ENVIRONMENT', doc._id, {
        environmentCode: doc.environmentCode, platformScoped, deploymentExecuted: false,
    }, platformScoped);
    return forceSafe(doc.toObject());
}

export async function updateEnvironment(companyId, userId, id, body = {}, user = null) {
    rejectTenantOverrides(body);
    assertNoSecrets(body);
    const doc = await DeploymentEnvironment.findOne({ _id: id, ...notDeleted() });
    if (!doc) throw new ApiError(404, 'Environment not found');
    if (doc.platformScoped) assertPlatformAdmin(user);
    else {
        assertPerm(user, PERMS.manage);
        if (String(doc.companyId) !== String(companyId)) throw new ApiError(404, 'Environment not found');
    }
    if (body.environmentName != null) doc.environmentName = assertSafeText(body.environmentName, 'environmentName');
    if (body.description != null) doc.description = assertSafeText(body.description, 'description');
    if (body.frontendServiceReference != null) doc.frontendServiceReference = String(body.frontendServiceReference).slice(0, 120);
    if (body.backendServiceReference != null) doc.backendServiceReference = String(body.backendServiceReference).slice(0, 120);
    if (body.databaseReferenceAlias != null) doc.databaseReferenceAlias = String(body.databaseReferenceAlias).slice(0, 120);
    if (body.branchReference != null) doc.branchReference = String(body.branchReference).slice(0, 120);
    if (body.active != null) doc.active = !!body.active;
    if (body.healthCheckDefinition != null) doc.healthCheckDefinition = body.healthCheckDefinition;
    doc.deploymentMethod = 'MANUAL_FUTURE';
    doc.updatedBy = userId;
    await doc.save();
    await writeAudit(companyId, userId, 'environment_updated', 'ENVIRONMENT', doc._id, {
        environmentCode: doc.environmentCode, deploymentExecuted: false,
    }, doc.platformScoped);
    return forceSafe(doc.toObject());
}

export async function archiveEnvironment(companyId, userId, id, user = null) {
    const doc = await DeploymentEnvironment.findOne({ _id: id, ...notDeleted() });
    if (!doc) throw new ApiError(404, 'Environment not found');
    if (doc.platformScoped) assertPlatformAdmin(user);
    else {
        assertPerm(user, PERMS.manage);
        if (String(doc.companyId) !== String(companyId)) throw new ApiError(404, 'Environment not found');
    }
    doc.active = false;
    doc.isDeleted = true;
    doc.updatedBy = userId;
    await doc.save();
    await writeAudit(companyId, userId, 'environment_archived', 'ENVIRONMENT', doc._id, {
        environmentCode: doc.environmentCode,
    }, doc.platformScoped);
    return { archived: true, hardDelete: false };
}
