import { AiAnalyticsSavedView } from '../../../models/aiAnalyticsSavedView.model.js';
import { ApiError } from '../../../utils/ApiError.js';
import { getAnalyticsSettings } from './settings.service.js';
import { assertCanManageViews, assertCanSavePersonalView } from './permissions.util.js';
import { assertNoSecrets } from './filters.util.js';

function rejectTenantOverrides(payload = {}) {
    if (payload.companyId != null || payload.tenantId != null) {
        throw new ApiError(400, 'companyId/tenantId overrides are rejected');
    }
}

export async function listSavedViews(companyId, userId, user) {
    const q = {
        companyId,
        isDeleted: { $ne: true },
        $or: [
            { scope: 'PERSONAL', ownerUserId: userId },
            { scope: 'COMPANY' },
        ],
    };
    const rows = await AiAnalyticsSavedView.find(q).sort({ updatedAt: -1 }).limit(100).lean();
    return { results: rows };
}

export async function createSavedView(companyId, userId, payload = {}, user = null) {
    rejectTenantOverrides(payload);
    assertNoSecrets(payload);
    assertCanSavePersonalView(user);
    const scope = payload.scope === 'COMPANY' ? 'COMPANY' : 'PERSONAL';
    if (scope === 'COMPANY') {
        assertCanManageViews(user);
        const settings = await getAnalyticsSettings(companyId);
        if (!settings.allowCompanySavedViews) throw new ApiError(403, 'Company saved views disabled');
    }
    if (!payload.name) throw new ApiError(400, 'name is required');
    const doc = await AiAnalyticsSavedView.create({
        companyId,
        name: String(payload.name).slice(0, 120),
        ownerUserId: userId,
        scope,
        filters: payload.filters || {},
        visibleWidgets: payload.visibleWidgets || [],
        widgetOrder: payload.widgetOrder || [],
        isDefault: payload.isDefault === true,
        createdBy: userId,
        updatedBy: userId,
    });
    return doc.toObject();
}

export async function updateSavedView(companyId, userId, id, payload = {}, user = null) {
    rejectTenantOverrides(payload);
    assertNoSecrets(payload);
    const doc = await AiAnalyticsSavedView.findOne({ _id: id, companyId, isDeleted: { $ne: true } });
    if (!doc) throw new ApiError(404, 'Saved view not found');
    if (String(doc.companyId) !== String(companyId)) throw new ApiError(404, 'Saved view not found');
    if (doc.scope === 'COMPANY') assertCanManageViews(user);
    else if (String(doc.ownerUserId) !== String(userId)) throw new ApiError(403, 'Not owner of personal view');
    else assertCanSavePersonalView(user);
    if (payload.name != null) doc.name = String(payload.name).slice(0, 120);
    if (payload.filters != null) doc.filters = payload.filters;
    if (payload.visibleWidgets != null) doc.visibleWidgets = payload.visibleWidgets;
    if (payload.widgetOrder != null) doc.widgetOrder = payload.widgetOrder;
    if (payload.isDefault != null) doc.isDefault = !!payload.isDefault;
    doc.updatedBy = userId;
    await doc.save();
    return doc.toObject();
}

export async function deleteSavedView(companyId, userId, id, user = null) {
    const doc = await AiAnalyticsSavedView.findOne({ _id: id, companyId, isDeleted: { $ne: true } });
    if (!doc) throw new ApiError(404, 'Saved view not found');
    if (doc.scope === 'COMPANY') assertCanManageViews(user);
    else if (String(doc.ownerUserId) !== String(userId)) throw new ApiError(403, 'Not owner of personal view');
    doc.isDeleted = true;
    doc.updatedBy = userId;
    await doc.save();
    return { deleted: true, id: doc._id };
}