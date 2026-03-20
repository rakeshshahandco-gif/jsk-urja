import jwt from 'jsonwebtoken';
import { User } from '../models/user.model.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const protect = asyncHandler(async (req, res, next) => {
    let token;

    if (
        req.headers.authorization &&
        req.headers.authorization.startsWith('Bearer')
    ) {
        try {
            token = req.headers.authorization.split(' ')[1];

            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret123');

            req.user = await User.findById(decoded.id)
                .populate('role')
                .populate('department')
                .select('-password');

            if (!req.user) {
                throw new ApiError(401, 'Not authorized, user not found');
            }

            if (!req.user.isActive) {
                throw new ApiError(403, 'User account is deactivated');
            }

            next();
        } catch (error) {
            console.error(error);
            throw new ApiError(401, 'Not authorized, token failed');
        }
    }

    if (!token) {
        throw new ApiError(401, 'Not authorized, no token');
    }
});

export const authorize = (...roles) => {
    return (req, res, next) => {
        const roleName = req.user.role?.name || req.user.roleName;
        if (!roles.includes(roleName)) {
            throw new ApiError(403, `User role ${roleName} is not authorized to access this route`);
        }
        next();
    };
};

export const checkPermission = (requiredPermission) => {
    return (req, res, next) => {
        // Admin has all permissions (convention: '*' or just role check usually, but let's be explicit)
        if (req.user.role === 'admin' || (req.user.permissions && req.user.permissions.includes('*'))) {
            return next();
        }

        if (!req.user.permissions || !req.user.permissions.includes(requiredPermission)) {
            throw new ApiError(403, `Permission denied: ${requiredPermission} required`);
        }
        next();
    };
};
