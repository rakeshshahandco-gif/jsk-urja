import { ApiError } from '../../../utils/ApiError.js';
import { IntelligenceConfigurationFamily, FAMILY_CODES } from '../../../models/intelligenceConfigurationFamily.model.js';
import { IntelligenceConfigurationAudit } from '../../../models/intelligenceConfigurationAudit.model.js';
import { FAMILY_DEFAULTS } from './constants.js';
import { assertView, assertPerm, hasManage } from './permissions.util.js';
import { rejectTenantOverrides, notDeleted, assertNoSecrets } from './normalize.util.js';
import { PERMS } from './constants.js';

async function writeAudit(companyId, userId, action, entityType, entityId, details = {}) {
    assertNoSecrets(details);
    await IntelligenceConfigurationAudit.create({
        companyId, userId, action, entityType, entityId, details,
    });
}

export async function ensureDefaultFamilies(companyId, userId = null) {
    for (const def of FAMILY_DEFAULTS) {
        const existing = await IntelligenceConfigurationFamily.findOne({
            companyId, code: def.code, ...notDeleted(),
        });
        if (!existing) {
            await IntelligenceConfigurationFamily.create({
                companyId,
                code: def.code,
                name: def.name,
                module: def.module,
                description: `${def.name} configuration family (Phase 21 version metadata only)`,
                schemaVersion: '1.0.0',
                companyScoped: true,
                industryScoped: false,
                activeBaselineReference: 'EXISTING_RUNTIME_BASELINE',
                status: 'ACTIVE_FAMILY',
                createdBy: userId,
                updatedBy: userId,
            });
        }
    }
}

export async function listFamilies(companyId, query = {}, user = null) {
    assertView(user);
    rejectTenantOverrides(query);
    await ensureDefaultFamilies(companyId);
    const q = { companyId, ...notDeleted() };
    if (query.code) q.code = query.code;
    if (query.status) q.status = query.status;
    const items = await IntelligenceConfigurationFamily.find(q).sort({ code: 1 }).lean();
    return { items, companyScoped: true };
}

export async function getFamily(companyId, id, user = null) {
    assertView(user);
    const doc = await IntelligenceConfigurationFamily.findOne({ _id: id, companyId, ...notDeleted() }).lean();
    if (!doc) throw new ApiError(404, 'Configuration family not found');
    return doc;
}

export async function createFamily(companyId, userId, body = {}, user = null) {
    assertPerm(user, PERMS.manage);
    rejectTenantOverrides(body);
    assertNoSecrets(body);
    if (!FAMILY_CODES.includes(body.code)) {
        throw new ApiError(400, `Unsupported family code: ${body.code}`);
    }
    const doc = await IntelligenceConfigurationFamily.create({
        companyId,
        code: body.code,
        name: body.name || body.code,
        module: body.module || '',
        description: body.description || '',
        schemaVersion: body.schemaVersion || '1.0.0',
        companyScoped: true,
        industryScoped: !!body.industryScoped,
        sourcePermissionRequirements: body.sourcePermissionRequirements || [],
        validationRules: body.validationRules || {},
        activeBaselineReference: 'EXISTING_RUNTIME_BASELINE',
        status: 'ACTIVE_FAMILY',
        createdBy: userId,
        updatedBy: userId,
    });
    await writeAudit(companyId, userId, 'family_created', 'FAMILY', doc._id, { code: doc.code });
    return doc.toObject();
}

export async function updateFamily(companyId, userId, id, body = {}, user = null) {
    assertPerm(user, PERMS.manage);
    rejectTenantOverrides(body);
    assertNoSecrets(body);
    const doc = await IntelligenceConfigurationFamily.findOne({ _id: id, companyId, ...notDeleted() });
    if (!doc) throw new ApiError(404, 'Configuration family not found');
    if (body.name != null) doc.name = String(body.name).slice(0, 200);
    if (body.description != null) doc.description = String(body.description).slice(0, 2000);
    if (body.module != null) doc.module = String(body.module).slice(0, 100);
    if (body.industryScoped != null) doc.industryScoped = !!body.industryScoped;
    if (body.status != null && ['ACTIVE_FAMILY', 'DISABLED'].includes(body.status)) doc.status = body.status;
    if (body.validationRules != null) doc.validationRules = body.validationRules;
    doc.companyScoped = true;
    doc.updatedBy = userId;
    await doc.save();
    await writeAudit(companyId, userId, 'family_updated', 'FAMILY', doc._id, { code: doc.code });
    return doc.toObject();
}

export async function assertFamilyOwned(companyId, familyId) {
    const fam = await IntelligenceConfigurationFamily.findOne({ _id: familyId, companyId, ...notDeleted() });
    if (!fam) throw new ApiError(404, 'Configuration family not found for this company');
    return fam;
}

export { writeAudit, hasManage };
