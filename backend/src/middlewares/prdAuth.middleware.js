import { ApiError } from '../utils/ApiError.js';
import { PrdAudit } from '../models/prdAudit.model.js';

export const requirePrdRole = (...allowedRoles) => {
    return (req, res, next) => {
        const userRole = req.user.roleName || (req.user.role?.name);
        
        // Super Admin always has full access
        if (userRole === 'superadmin' || userRole === 'admin') {
            return next();
        }

        if (!allowedRoles.includes(userRole)) {
            return next(new ApiError(403, `User role '${userRole}' is not authorized to access this PRD function.`));
        }

        next();
    };
};

export const requirePrdDeletePermission = (req, res, next) => {
    const userRole = req.user.roleName || (req.user.role?.name);
    
    // Only superadmin and specifically allowed roles can delete
    if (userRole !== 'superadmin') {
        return next(new ApiError(403, `Deletion of PRD records is strictly prohibited without Super Admin permission.`));
    }
    next();
};

// Generic Audit creation utility to be called in controllers
export const logPrdAudit = async (req, entityId, entityType, action, changes = [], reason = '') => {
    try {
        await PrdAudit.create({
            entityId,
            entityType,
            action,
            changedBy: req.user._id,
            ipAddress: req.ip,
            changes,
            reason
        });
    } catch (error) {
        console.error('Failed to log PRD Audit:', error);
    }
};
