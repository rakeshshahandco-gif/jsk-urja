import { ApiError } from '../../../utils/ApiError.js';
import { PilotSavedView } from '../../../models/pilotSavedView.model.js';
import { PilotAudit } from '../../../models/pilotAudit.model.js';
import { PERMS } from './constants.js';
import { assertPerm } from './permissions.util.js';
import {
    rejectTenantOverrides, assertSafeText, assertPayloadSafe, notDeleted,
    forceSimulationOnly, stripUnsafeWriteFields, rejectUnsafeFilters,
} from './normalize.util.js';
import { writeAudit } from './audit.util.js';

export async function listSavedViews(companyId, userId, user = null) {
    assertPerm(user, PERMS.saved_views);
    const items = await PilotSavedView.find({ companyId, userId, ...notDeleted() }).sort({ updatedAt: -1 }).limit(50).lean();
    return { items: items.map((d) => forceSimulationOnly({ ...d, id: String(d._id) })) };
}

export async function createSavedView(companyId, userId, body = {}, user = null) {
    assertPerm(user, PERMS.saved_views);
    rejectTenantOverrides(body);
    assertPayloadSafe(body);
    const safe = stripUnsafeWriteFields(body);
    rejectUnsafeFilters(safe.filters || {});
    const doc = await PilotSavedView.create({
        companyId,
        userId,
        name: assertSafeText(safe.name || 'View', 'name'),
        viewKey: safe.viewKey || '',
        filters: safe.filters || {},
        sort: safe.sort || {},
        simulationOnly: true,
    });
    await writeAudit(companyId, userId, 'SAVED_VIEW_CREATE', 'PilotSavedView', doc._id, {});
    return forceSimulationOnly({ ...doc.toObject(), id: String(doc._id) });
}

export async function updateSavedView(companyId, userId, id, body = {}, user = null) {
    assertPerm(user, PERMS.saved_views);
    rejectTenantOverrides(body);
    const doc = await PilotSavedView.findOne({ _id: id, companyId, userId, ...notDeleted() });
    if (!doc) throw new ApiError(404, 'Saved view not found');
    const safe = stripUnsafeWriteFields(body);
    if (safe.name) doc.name = assertSafeText(safe.name, 'name');
    if (safe.filters) { rejectUnsafeFilters(safe.filters); doc.filters = safe.filters; }
    await doc.save();
    return forceSimulationOnly({ ...doc.toObject(), id: String(doc._id) });
}

export async function deleteSavedView(companyId, userId, id, user = null) {
    assertPerm(user, PERMS.saved_views);
    const doc = await PilotSavedView.findOne({ _id: id, companyId, userId, ...notDeleted() });
    if (!doc) throw new ApiError(404, 'Saved view not found');
    doc.isDeleted = true;
    await doc.save();
    await writeAudit(companyId, userId, 'SAVED_VIEW_DELETE', 'PilotSavedView', doc._id, {});
    return forceSimulationOnly({ id: String(doc._id), deleted: true });
}

export async function listAudit(companyId, query = {}, user = null) {
    assertPerm(user, PERMS.audit);
    rejectTenantOverrides(query);
    const q = { companyId };
    if (query.pilotProgramId) q.pilotProgramId = query.pilotProgramId;
    const items = await PilotAudit.find(q).sort({ createdAt: -1 }).limit(200).lean();
    return { items: items.map((d) => forceSimulationOnly({ ...d, id: String(d._id) })), appendOnly: true };
}

export async function assertAuditImmutable() {
    return { appendOnly: true, updateAllowed: false, deleteAllowed: false };
}