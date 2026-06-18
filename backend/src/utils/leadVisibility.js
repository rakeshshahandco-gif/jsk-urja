import mongoose from 'mongoose';
import { checkUserPermission } from './permissionUtils.js';

const ADMIN_ROLES = new Set(['superadmin', 'admin']);

export function isLeadAdmin(user) {
    const roleName = String(user?.roleName || user?.role?.name || '').toLowerCase();
    return ADMIN_ROLES.has(roleName);
}

export function hasLeadViewAllPermission(user) {
    return checkUserPermission(user, 'crm.leads.view_all');
}

export function hasLeadReportViewAllPermission(user) {
    return (
        isLeadAdmin(user)
        || checkUserPermission(user, 'crm.leads.report_view_all')
        || hasLeadViewAllPermission(user)
    );
}

export function getLeadVisibilityMode(settings) {
    const mode = settings?.crm?.leadVisibilityMode;
    return mode === 'all' ? 'all' : 'own_only';
}

/** Whether list/detail/report should include all company leads for this user. */
export function canViewAllLeads(user, settings) {
    if (isLeadAdmin(user)) return true;
    if (hasLeadViewAllPermission(user)) return true;
    if (getLeadVisibilityMode(settings) === 'all' && checkUserPermission(user, 'crm.leads.view')) {
        return true;
    }
    return false;
}

export function buildOwnLeadsFilter(userId) {
    const uid = new mongoose.Types.ObjectId(String(userId));
    return {
        $or: [
            { createdByUserId: uid },
            { createdBy: uid },
            { ownerUserId: uid },
            { assignedTo: uid },
            { assignedToUserId: uid },
        ],
    };
}

export function buildUnassignedLeadsFilter() {
    return {
        $and: [
            {
                $or: [
                    { ownerUserId: null },
                    { ownerUserId: { $exists: false } },
                ],
            },
            {
                $or: [
                    { createdByUserId: null },
                    { createdByUserId: { $exists: false } },
                    { createdBy: null },
                    { createdBy: { $exists: false } },
                ],
            },
            {
                $or: [
                    { assignedTo: null },
                    { assignedTo: { $exists: false } },
                    { assignedToUserId: null },
                    { assignedToUserId: { $exists: false } },
                ],
            },
        ],
    };
}

export function buildLeadListQueryFilter(user, settings, filter = {}) {
    const q = {};
    const and = [];

    if (filter.status) q.status = filter.status;
    if (filter.source) q.source = filter.source;

    if (filter.search) {
        const re = new RegExp(String(filter.search).trim(), 'i');
        and.push({
            $or: [
                { customerName: re },
                { customerMobile: re },
                { customerEmail: re },
                { notes: re },
                { 'whatsapp.messageText': re },
            ],
        });
    }

    if (filter.dateFrom || filter.dateTo) {
        q.createdAt = {};
        if (filter.dateFrom) q.createdAt.$gte = new Date(filter.dateFrom);
        if (filter.dateTo) {
            const end = new Date(filter.dateTo);
            end.setHours(23, 59, 59, 999);
            q.createdAt.$lte = end;
        }
    }

    if (!canViewAllLeads(user, settings)) {
        and.push(buildOwnLeadsFilter(user._id || user.id));
    } else if (filter.scope === 'my') {
        and.push(buildOwnLeadsFilter(user._id || user.id));
    } else if (filter.ownerUserId === 'unassigned') {
        and.push(buildUnassignedLeadsFilter());
    } else if (filter.ownerUserId) {
        const oid = new mongoose.Types.ObjectId(String(filter.ownerUserId));
        and.push({
            $or: [
                { ownerUserId: oid },
                { createdByUserId: oid },
                { createdBy: oid },
                { assignedTo: oid },
                { assignedToUserId: oid },
            ],
        });
    } else if (filter.createdByUserId) {
        const oid = new mongoose.Types.ObjectId(String(filter.createdByUserId));
        and.push({
            $or: [{ createdByUserId: oid }, { createdBy: oid }],
        });
    } else if (filter.assignedTo) {
        const oid = new mongoose.Types.ObjectId(String(filter.assignedTo));
        and.push({
            $or: [{ assignedTo: oid }, { assignedToUserId: oid }],
        });
    }

    if (and.length === 1) {
        Object.assign(q, and[0]);
    } else if (and.length > 1) {
        q.$and = and;
    }

    return q;
}

export function userCanAccessLead(user, lead, settings) {
    if (!lead) return false;
    if (canViewAllLeads(user, settings)) return true;
    const uid = String(user._id || user.id);
    const ids = [
        lead.createdByUserId,
        lead.createdBy,
        lead.ownerUserId,
        lead.assignedTo,
        lead.assignedToUserId,
    ]
        .filter(Boolean)
        .map((x) => String(x._id || x));
    return ids.includes(uid);
}

export function userCanEditLead(user, lead, settings) {
    if (!userCanAccessLead(user, lead, settings)) return false;
    if (isLeadAdmin(user) || checkUserPermission(user, 'crm.leads.edit_all')) return true;
    if (checkUserPermission(user, 'crm.leads.edit')) {
        const uid = String(user._id || user.id);
        const ids = [
            lead.createdByUserId,
            lead.createdBy,
            lead.ownerUserId,
            lead.assignedTo,
            lead.assignedToUserId,
        ]
            .filter(Boolean)
            .map((x) => String(x._id || x));
        return ids.includes(uid);
    }
    return false;
}

export function userCanAssignLead(user) {
    return isLeadAdmin(user) || checkUserPermission(user, 'crm.leads.assign');
}
