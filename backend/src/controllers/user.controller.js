import httpStatus from 'http-status';
import { User } from '../models/user.model.js';
import { Role } from '../models/role.model.js';
import { Department } from '../models/department.model.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { syncPermissionsWithRegistry } from '../utils/permission.utils.js';
import {
    mongooseFilterUsersForCompany,
    normalizeUserCompanyAssignment,
    assertActingUserCanManageTargetUser,
    assertRoleAssignmentAllowed,
} from '../services/companyUserAccess.service.js';

// --- ROLE CONTROLLERS ---

export const createRole = asyncHandler(async (req, res) => {
    // Sync permissions with registry to ensure all modules are present even if not sent by UI
    const isFullAccess = req.body.name?.toLowerCase().includes('admin') || req.body.isSystemRole;
    const syncedPermissions = syncPermissionsWithRegistry(req.body.permissions || {}, isFullAccess);
    
    const role = await Role.create({ 
        ...req.body, 
        permissions: syncedPermissions,
        createdBy: req.user.id 
    });
    res.status(httpStatus.CREATED).send(new ApiResponse(httpStatus.CREATED, role, 'Role created successfully'));
});

export const getRoles = asyncHandler(async (req, res) => {
    const roles = await Role.find({ isActive: true });
    const isSuperadmin = String(req.user?.roleName || '').toLowerCase() === 'superadmin';
    
    // Sync each role's permissions with the current registry
    const syncedRoles = roles
        .filter((role) => isSuperadmin || String(role.name || '').toLowerCase() !== 'superadmin')
        .map(role => {
        const roleObj = role.toObject();
        const isFullAccess = roleObj.name?.toLowerCase().includes('admin') || roleObj.isSystemRole;
        roleObj.permissions = syncPermissionsWithRegistry(roleObj.permissions || {}, isFullAccess);
        return roleObj;
    });

    res.send(new ApiResponse(httpStatus.OK, syncedRoles));
});

export const updateRole = asyncHandler(async (req, res) => {
    // Sync permissions before update to ensure data consistency
    if (req.body.permissions) {
        const isFullAccess = req.body.name?.toLowerCase().includes('admin') || req.body.isSystemRole;
        req.body.permissions = syncPermissionsWithRegistry(req.body.permissions, isFullAccess);
    }

    const role = await Role.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!role) throw new ApiError(httpStatus.NOT_FOUND, 'Role not found');
    res.send(new ApiResponse(httpStatus.OK, role, 'Role updated successfully'));
});

// --- DEPARTMENT CONTROLLERS ---

export const createDepartment = asyncHandler(async (req, res) => {
    const dept = await Department.create({ ...req.body, createdBy: req.user.id });
    res.status(httpStatus.CREATED).send(new ApiResponse(httpStatus.CREATED, dept, 'Department created successfully'));
});

export const getDepartments = asyncHandler(async (req, res) => {
    const depts = await Department.find({ isActive: true });
    res.send(new ApiResponse(httpStatus.OK, depts));
});

// --- USER CONTROLLERS ---

export const getUsers = asyncHandler(async (req, res) => {
    const companyId = req.companyId || req.query?.companyId;
    const filter = companyId ? mongooseFilterUsersForCompany(companyId) : {};

    const users = await User.find(filter)
        .populate('role')
        .populate('department', 'name')
        .populate('assignedCompanyIds', 'companyName')
        .select('-password');
    
    // Sync permissions for each user's role and additionalPermissions
    const syncedUsers = users.map(user => {
        const userObj = user.toObject();
        if (userObj.role) {
            const isFullAccess = userObj.role.name?.toLowerCase().includes('admin') || userObj.role.isSystemRole;
            userObj.role.permissions = syncPermissionsWithRegistry(userObj.role.permissions || {}, isFullAccess);
        }
        // Also sync user-level additionalPermissions if any
        userObj.additionalPermissions = syncPermissionsWithRegistry(userObj.additionalPermissions || {}, false);
        return userObj;
    });

    res.send(new ApiResponse(httpStatus.OK, syncedUsers));
});

export const createUser = asyncHandler(async (req, res) => {
    const { role } = req.body;
    if (role) {
        const roleDoc = await Role.findById(role);
        if (roleDoc) {
            req.body.roleName = roleDoc.name;
        }
    }
    await assertRoleAssignmentAllowed(req.user, { roleName: req.body.roleName, roleId: role });
    const payload = normalizeUserCompanyAssignment(req.body, {
        activeCompanyId: req.companyId,
        actingUser: req.user,
    });
    const user = await User.create(payload);
    const userResponse = await User.findById(user._id)
        .select('-password')
        .populate('role', 'name')
        .populate('assignedCompanyIds', 'companyName');
    res.status(httpStatus.CREATED).send(new ApiResponse(httpStatus.CREATED, userResponse, 'User created successfully'));
});

export const getUser = asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id)
        .populate('role')
        .populate('department')
        .populate('reportingManager', 'name')
        .populate('assignedCompanyIds', 'companyName')
        .select('-password');
    if (!user) throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
    await assertActingUserCanManageTargetUser(req.user, user, req.companyId);
    res.send(new ApiResponse(httpStatus.OK, user));
});

export const updateUser = asyncHandler(async (req, res) => {
    const existing = await User.findById(req.params.id);
    if (!existing) throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
    if (String(existing.roleName || '').toLowerCase() === 'superadmin'
        && String(req.user?.roleName || '').toLowerCase() !== 'superadmin') {
        throw new ApiError(httpStatus.FORBIDDEN, 'Only Platform Admin can manage superadmin users');
    }
    await assertActingUserCanManageTargetUser(req.user, existing, req.companyId);

    const { role } = req.body;
    if (role) {
        const roleDoc = await Role.findById(role);
        if (roleDoc) {
            req.body.roleName = roleDoc.name;
        }
    }
    await assertRoleAssignmentAllowed(req.user, { roleName: req.body.roleName, roleId: role });
    const payload = normalizeUserCompanyAssignment(req.body, {
        activeCompanyId: req.companyId,
        actingUser: req.user,
    });
    const user = await User.findByIdAndUpdate(req.params.id, payload, { new: true })
        .populate('role', 'name')
        .populate('department', 'name')
        .populate('assignedCompanyIds', 'companyName')
        .select('-password');
    if (!user) throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
    res.send(new ApiResponse(httpStatus.OK, user, 'User updated successfully'));
});

export const deleteUser = asyncHandler(async (req, res) => {
    const existing = await User.findById(req.params.id);
    if (!existing) throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
    if (String(existing.roleName || '').toLowerCase() === 'superadmin'
        && String(req.user?.roleName || '').toLowerCase() !== 'superadmin') {
        throw new ApiError(httpStatus.FORBIDDEN, 'Only Platform Admin can manage superadmin users');
    }
    await assertActingUserCanManageTargetUser(req.user, existing, req.companyId);
    if (req.companyId && existing.companyAccessConfigured === true) {
        const assigned = (existing.assignedCompanyIds || []).map(String);
        if (!assigned.includes(String(req.companyId)) && String(req.user?._id) !== String(existing._id)) {
            throw new ApiError(httpStatus.FORBIDDEN, 'User is not assigned to the active company');
        }
    }
    const user = await User.findByIdAndDelete(req.params.id);
    res.send(new ApiResponse(httpStatus.OK, null, 'User deleted successfully'));
});
