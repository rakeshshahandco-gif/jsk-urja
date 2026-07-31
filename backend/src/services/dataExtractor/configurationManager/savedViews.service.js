import { ApiError } from '../../../utils/ApiError.js';
import { IntelligenceConfigurationSavedView } from '../../../models/intelligenceConfigurationSavedView.model.js';
import { IntelligenceConfigurationAudit } from '../../../models/intelligenceConfigurationAudit.model.js';
import { PERMS } from './constants.js';
import { assertPerm, assertView, hasManage } from './permissions.util.js';
import { rejectTenantOverrides, rejectUnsafeFilters, assertNoSecrets, notDeleted } from './normalize.util.js';
import { writeAudit } from './family.service.js';

export async function listSavedViews(companyId, userId, user = null) {
    assertPerm(user, PERMS.saved_views);
    const items = await IntelligenceConfigurationSavedView.find({
        companyId,
        ...notDeleted(),
        $or: [
            { scope: 'PERSONAL', ownerUserId: userId },
            { scope: 'COMPANY' },
        ],
    }).sort({ updatedAt: -1 }).lean();
    return { items };
}

export async function createSavedView(companyId, userId, body = {}, user = null) {
    assertPerm(user, PERMS.saved_views);
    rejectTenantOverrides(body);
    rejectUnsafeFilters(body.filters || {});
    assertNoSecrets(body);
    const scope = body.scope === 'COMPANY' ? 'COMPANY' : 'PERSONAL';
    if (scope === 'COMPANY' && !hasManage(user)) {
        throw new ApiError(403, 'Shared/company views require manage permission');
    }
    const doc = await IntelligenceConfigurationSavedView.create({
        companyId,
        name: String(body.name || 'View').slice(0, 120),
        ownerUserId: userId,
        scope,
        filters: body.filters || {},
        createdBy: userId,
        updatedBy: userId,
    });
    await writeAudit(companyId, userId, 'saved_view_created', 'SAVED_VIEW', doc._id, { scope });
    return doc.toObject();
}

export async function updateSavedView(companyId, userId, id, body = {}, user = null) {
    assertPerm(user, PERMS.saved_views);
    rejectTenantOverrides(body);
    const doc = await IntelligenceConfigurationSavedView.findOne({ _id: id, companyId, ...notDeleted() });
    if (!doc) throw new ApiError(404, 'Saved view not found');
    if (doc.scope === 'PERSONAL' && String(doc.ownerUserId) !== String(userId) && !hasManage(user)) {
        throw new ApiError(403, 'Personal saved view is user-scoped');
    }
    if (doc.scope === 'COMPANY' && !hasManage(user)) {
        throw new ApiError(403, 'Shared view requires manage permission');
    }
    if (body.name != null) doc.name = String(body.name).slice(0, 120);
    if (body.filters != null) {
        rejectUnsafeFilters(body.filters);
        doc.filters = body.filters;
    }
    doc.updatedBy = userId;
    await doc.save();
    return doc.toObject();
}

export async function deleteSavedView(companyId, userId, id, user = null) {
    assertPerm(user, PERMS.saved_views);
    const doc = await IntelligenceConfigurationSavedView.findOne({ _id: id, companyId, ...notDeleted() });
    if (!doc) throw new ApiError(404, 'Saved view not found');
    if (doc.scope === 'PERSONAL' && String(doc.ownerUserId) !== String(userId) && !hasManage(user)) {
        throw new ApiError(403, 'Personal saved view is user-scoped');
    }
    if (doc.scope === 'COMPANY' && !hasManage(user)) {
        throw new ApiError(403, 'Shared view requires manage permission');
    }
    doc.isDeleted = true;
    doc.updatedBy = userId;
    await doc.save();
    return { deleted: true, hardDelete: false };
}

export async function listAudit(companyId, query = {}, user = null) {
    assertPerm(user, PERMS.audit);
    assertView(user);
    rejectTenantOverrides(query);
    const items = await IntelligenceConfigurationAudit.find({
        companyId, ...notDeleted(),
    }).sort({ createdAt: -1 }).limit(200).lean();
    return { items, appendOnly: true };
}
