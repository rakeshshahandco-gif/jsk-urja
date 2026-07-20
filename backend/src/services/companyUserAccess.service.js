import mongoose from 'mongoose';

/**
 * JSK / legacy: users without companyAccessConfigured keep access to all active companies.
 * Superadmin always has full access.
 */

export function hasLegacyCompanyAccess(user) {
    if (!user) return true;
    const role = String(user.roleName || '').toLowerCase();
    if (role === 'superadmin') return true;
    if (user.companyAccessConfigured !== true) return true;
    const ids = user.assignedCompanyIds || [];
    if (!ids.length) return true;
    return false;
}

export function canUserAccessCompany(user, companyId) {
    if (!companyId) return true;
    if (hasLegacyCompanyAccess(user)) return true;
    const target = String(companyId);
    return (user.assignedCompanyIds || []).some((id) => String(id) === target);
}

/**
 * Whether the UI may offer company switching.
 * Missing/undefined canSwitchCompany → preserve legacy multi-company behaviour.
 */
export function userCanSwitchCompany(user) {
    if (!user) return true;
    if (user.canSwitchCompany === false) return false;
    return true;
}

/**
 * Resolve the company the client should auto-open after login.
 * Returns company id string or null (null → keep existing FE fallback).
 */
export function resolvePreferredCompanyId(user) {
    if (!user) return null;

    const assigned = (user.assignedCompanyIds || []).map((id) => String(id)).filter(Boolean);
    const configured = user.companyAccessConfigured === true;
    const defaultId = user.defaultCompanyId ? String(user.defaultCompanyId) : null;
    const legacy = hasLegacyCompanyAccess(user);

    if (defaultId) {
        const allowed =
            legacy
            || !configured
            || assigned.length === 0
            || assigned.includes(defaultId);
        if (allowed) {
            return defaultId;
        }
        console.warn(
            `[companyUserAccess] defaultCompanyId ${defaultId} not in assignedCompanyIds for user ${user.username || user._id}`
        );
    }

    if (configured && assigned.length === 1) {
        return assigned[0];
    }

    return null;
}

export function mongooseFilterCompaniesForUser(user) {
    if (hasLegacyCompanyAccess(user)) {
        return {};
    }
    const ids = (user.assignedCompanyIds || []).filter(Boolean);
    if (!ids.length) {
        return { _id: null };
    }
    return { _id: { $in: ids } };
}

export function mongooseFilterActiveCompaniesForUser(user) {
    return { ...mongooseFilterCompaniesForUser(user), isActive: true };
}

/** Users visible on User Management for the active company. */
export function mongooseFilterUsersForCompany(companyId) {
    if (!companyId || !mongoose.Types.ObjectId.isValid(String(companyId))) {
        return {};
    }
    const cid = new mongoose.Types.ObjectId(String(companyId));
    return {
        $or: [
            { companyAccessConfigured: { $ne: true } },
            { roleName: 'superadmin' },
            { assignedCompanyIds: cid },
        ],
    };
}

export function normalizeUserCompanyAssignment(body = {}, { activeCompanyId, actingUser } = {}) {
    const next = { ...body };
    const isSuperadmin = String(actingUser?.roleName || '').toLowerCase() === 'superadmin';

    if (Array.isArray(next.assignedCompanyIds)) {
        next.assignedCompanyIds = [...new Set(
            next.assignedCompanyIds
                .map((id) => String(id).trim())
                .filter((id) => mongoose.Types.ObjectId.isValid(id)),
        )].map((id) => new mongoose.Types.ObjectId(id));
        if (next.assignedCompanyIds.length > 0) {
            next.companyAccessConfigured = true;
        }
    }

    if (next.companyAccessConfigured === true && (!next.assignedCompanyIds || !next.assignedCompanyIds.length)) {
        if (activeCompanyId && mongoose.Types.ObjectId.isValid(String(activeCompanyId))) {
            next.assignedCompanyIds = [new mongoose.Types.ObjectId(String(activeCompanyId))];
        }
    }

    // Non-superadmin creating user without explicit assignment → lock to active company
    if (!isSuperadmin && activeCompanyId && !next.assignedCompanyIds?.length) {
        next.assignedCompanyIds = [new mongoose.Types.ObjectId(String(activeCompanyId))];
        next.companyAccessConfigured = true;
    }

    if (!isSuperadmin && next.assignedCompanyIds?.length && actingUser && !hasLegacyCompanyAccess(actingUser)) {
        const allowed = new Set((actingUser.assignedCompanyIds || []).map(String));
        next.assignedCompanyIds = next.assignedCompanyIds.filter((id) => allowed.has(String(id)));
        if (!next.assignedCompanyIds.length && activeCompanyId) {
            next.assignedCompanyIds = [new mongoose.Types.ObjectId(String(activeCompanyId))];
        }
    }

    return next;
}

export async function assertActingUserCanManageTargetUser(actingUser, targetUser, companyId) {
    if (!actingUser) return;
    const role = String(actingUser.roleName || '').toLowerCase();
    if (role === 'superadmin') return;
    if (hasLegacyCompanyAccess(actingUser)) return;

    if (companyId && !canUserAccessCompany(actingUser, companyId)) {
        const err = new Error('You do not have access to manage users for this company');
        err.statusCode = 403;
        throw err;
    }

    if (targetUser && targetUser.companyAccessConfigured === true && companyId) {
        const assigned = (targetUser.assignedCompanyIds || []).map(String);
        if (!assigned.includes(String(companyId))) {
            const err = new Error('User is not assigned to the active company');
            err.statusCode = 403;
            throw err;
        }
    }
}

/** Client admins cannot assign or elevate users to superadmin. */
export async function assertRoleAssignmentAllowed(actingUser, { roleName, roleId } = {}) {
    if (isPlatformAdminUser(actingUser)) return;
    const name = String(roleName || '').trim().toLowerCase();
    if (name === 'superadmin') {
        const err = new Error('Only Platform Admin can assign the superadmin role');
        err.statusCode = 403;
        throw err;
    }
    if (roleId) {
        const { Role } = await import('../models/role.model.js');
        const roleDoc = await Role.findById(roleId).select('name').lean();
        if (String(roleDoc?.name || '').trim().toLowerCase() === 'superadmin') {
            const err = new Error('Only Platform Admin can assign the superadmin role');
            err.statusCode = 403;
            throw err;
        }
    }
}

function isPlatformAdminUser(user) {
    return String(user?.roleName || '').trim().toLowerCase() === 'superadmin';
}
