import mongoose from 'mongoose';
import { ImprovementApprovalSavedView } from '../../../models/improvementApprovalSavedView.model.js';
import { ImprovementApprovalAudit } from '../../../models/improvementApprovalAudit.model.js';
import { ApiError } from '../../../utils/ApiError.js';
import { assertView, assertAudit, hasApproval, hasManage } from './permissions.util.js';
import { PERMS } from './constants.js';
import { rejectTenantOverrides, assertNoSecrets, rejectUnsafeFilters } from './normalize.util.js';
import { writeAudit } from './case.service.js';

function notDeleted(extra = {}) {
    return { isDeleted: { $ne: true }, ...extra };
}

function oid(id) {
    if (!id || !mongoose.Types.ObjectId.isValid(String(id))) return null;
    return new mongoose.Types.ObjectId(String(id));
}

export async function listSavedViews(companyId, userId, user = null) {
    assertView(user);
    const items = await ImprovementApprovalSavedView.find({
        companyId,
        ...notDeleted(),
        $or: [
            { scope: 'PERSONAL', ownerUserId: userId },
            { scope: 'COMPANY' },
        ],
    }).sort({ updatedAt: -1 }).limit(100).lean();
    return { items };
}

export async function createSavedView(companyId, userId, body = {}, user = null) {
    assertView(user);
    rejectTenantOverrides(body);
    rejectUnsafeFilters(body.filters || {});
    assertNoSecrets(body);
    if (!hasApproval(user, PERMS.saved_views) && !hasManage(user)) {
        throw new ApiError(403, `Missing permission: ${PERMS.saved_views}`);
    }
    const scope = body.scope === 'COMPANY' ? 'COMPANY' : 'PERSONAL';
    if (scope === 'COMPANY' && !hasManage(user)) {
        throw new ApiError(403, `Sharing company views requires ${PERMS.manage}`);
    }
    const doc = await ImprovementApprovalSavedView.create({
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
    if (!hasApproval(user, PERMS.saved_views) && !hasManage(user)) {
        throw new ApiError(403, `Missing permission: ${PERMS.saved_views}`);
    }
    rejectTenantOverrides(body);
    const doc = await ImprovementApprovalSavedView.findOne({ _id: oid(id), companyId, ...notDeleted() });
    if (!doc) throw new ApiError(404, 'Saved view not found');
    if (doc.scope === 'PERSONAL' && String(doc.ownerUserId) !== String(userId) && !hasManage(user)) {
        throw new ApiError(403, 'Cannot edit another user personal view');
    }
    if (body.scope === 'COMPANY' && !hasManage(user)) {
        throw new ApiError(403, `Sharing company views requires ${PERMS.manage}`);
    }
    if (body.name) doc.name = String(body.name).slice(0, 120);
    if (body.filters) {
        rejectUnsafeFilters(body.filters);
        doc.filters = body.filters;
    }
    if (body.scope) doc.scope = body.scope === 'COMPANY' ? 'COMPANY' : 'PERSONAL';
    doc.updatedBy = userId;
    await doc.save();
    return doc.toObject();
}

export async function deleteSavedView(companyId, userId, id, user = null) {
    if (!hasApproval(user, PERMS.saved_views) && !hasManage(user)) {
        throw new ApiError(403, `Missing permission: ${PERMS.saved_views}`);
    }
    const doc = await ImprovementApprovalSavedView.findOne({ _id: oid(id), companyId, ...notDeleted() });
    if (!doc) throw new ApiError(404, 'Saved view not found');
    if (doc.scope === 'PERSONAL' && String(doc.ownerUserId) !== String(userId) && !hasManage(user)) {
        throw new ApiError(403, 'Cannot delete another user personal view');
    }
    doc.isDeleted = true;
    doc.updatedBy = userId;
    await doc.save();
    return { deleted: true };
}

export async function listAudit(companyId, query = {}, user = null) {
    assertAudit(user);
    rejectTenantOverrides(query);
    const q = { companyId, ...notDeleted() };
    if (query.action) q.action = query.action;
    const items = await ImprovementApprovalAudit.find(q).sort({ createdAt: -1 }).limit(200).lean();
    return { items, appendOnly: true };
}

export async function exportCases(companyId, query = {}, user = null) {
    if (!hasApproval(user, PERMS.export)) throw new ApiError(403, `Missing permission: ${PERMS.export}`);
    const { listCases } = await import('./case.service.js');
    const data = await listCases(companyId, query, user);
    await writeAudit(companyId, user?.id || user?._id, 'cases_exported', 'EXPORT', null, {
        count: data.items?.length || 0,
    });
    return { ...data, note: 'Export respects approval + source permissions' };
}
