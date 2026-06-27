import httpStatus from 'http-status';
import { getEffectivePermissionRegistry } from '../utils/permissionRegistryEnricher.js';
import { Role } from '../models/role.model.js';
import { syncPermissionsWithRegistry } from '../utils/permission.utils.js';
import { catchAsync } from '../utils/catchAsync.js';
import { ApiResponse } from '../utils/ApiResponse.js';

export const getPermissionMetadata = catchAsync(async (req, res) => {
    res.status(httpStatus.OK).json({
        success: true,
        data: getEffectivePermissionRegistry()
    });
});

export const syncPermissions = catchAsync(async (req, res) => {
    const roles = await Role.find();
    let updatedCount = 0;
    const newPermissionsFound = [];

    // Simple diff logic to find what's new (optional but nice for summary)
    const allCurrentKeys = [];
    const registry = getEffectivePermissionRegistry();
    registry.forEach(m => {
        m.submodules.forEach(s => {
            s.actions.forEach(a => {
                allCurrentKeys.push(`${m.id}.${s.id}.${typeof a === 'string' ? a : a.id}`);
            });
        });
    });

    for (const role of roles) {
        const isFullAccess = role.name?.toLowerCase().includes('admin') || role.isSystemRole;
        const oldPermissions = JSON.stringify(role.permissions);
        const syncedPermissions = syncPermissionsWithRegistry(role.permissions || {}, isFullAccess);
        
        if (JSON.stringify(syncedPermissions) !== oldPermissions) {
            role.permissions = syncedPermissions;
            await role.save();
            updatedCount++;
        }
    }

    res.status(httpStatus.OK).json(new ApiResponse(httpStatus.OK, {
        updatedRoles: updatedCount,
        totalRoles: roles.length,
        registryModuleCount: registry.length
    }, 'Permissions synchronized successfully'));
});
