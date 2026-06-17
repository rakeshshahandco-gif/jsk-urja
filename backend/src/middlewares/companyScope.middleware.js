import mongoose from 'mongoose';
import httpStatus from 'http-status';
import jwt from 'jsonwebtoken';
import { Company } from '../models/company.model.js';
import { Subscription } from '../models/subscription.model.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { companyScopeAls } from '../utils/companyScopeContext.js';
import { isCompanyScopeExempt } from '../utils/companyScopeExempt.js';
import { User } from '../models/user.model.js';
import { canUserAccessCompany } from '../services/companyUserAccess.service.js';

/**
 * Extract roleName from Bearer JWT without full DB lookup.
 * Used only to identify superadmin for subscription bypass.
 */
function extractRoleFromToken(req) {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) return null;
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret123');
        return decoded.roleName || null;
    } catch {
        return null;
    }
}

function extractUserIdFromToken(req) {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) return null;
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret123');
        return decoded.id || decoded._id || null;
    } catch {
        return null;
    }
}

/**
 * Resolves active company from X-Company-Id and stores it on req + AsyncLocalStorage
 * so tenant Mongoose plugin can filter reads/writes.
 * Also attaches subscription and enforces status (suspended/expired).
 */
export const resolveCompanyScope = asyncHandler(async (req, res, next) => {
    if (isCompanyScopeExempt(req)) {
        delete req.companyId;
        delete req.company;
        return companyScopeAls.run({}, () => next());
    }

    const raw = req.headers['x-company-id'] || req.headers['X-Company-Id'];
    if (!raw || typeof raw !== 'string') {
        throw new ApiError(httpStatus.BAD_REQUEST, 'X-Company-Id header is required');
    }
    const trimmed = raw.trim();
    if (!mongoose.Types.ObjectId.isValid(trimmed)) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid X-Company-Id');
    }

    const company = await Company.findOne({ _id: trimmed, isActive: true })
        .select('_id companyName enabledModules disabledModules moduleGuardEnabled moduleAllocationConfigured subscriptionRef');
    if (!company) {
        throw new ApiError(httpStatus.FORBIDDEN, 'Company not found or inactive');
    }

    req.companyId = company._id;
    req.company = company;

    const roleName = extractRoleFromToken(req);
    const userId = extractUserIdFromToken(req);
    if (userId && roleName !== 'superadmin') {
        const user = await User.findById(userId)
            .select('assignedCompanyIds companyAccessConfigured roleName')
            .lean();
        if (user && !canUserAccessCompany(user, company._id)) {
            throw new ApiError(httpStatus.FORBIDDEN, 'You do not have access to this company');
        }
    }

    // --- Subscription enforcement ---
    // Superadmin always bypasses subscription checks
    if (roleName !== 'superadmin') {
        const sub = await Subscription.findOne({ companyId: company._id }).lean();
        req.subscription = sub || null;
        if (sub) {
            if (sub.status === 'suspended') {
                throw new ApiError(httpStatus.FORBIDDEN, 'Your account has been suspended. Please contact support.');
            }
            if (sub.status === 'expired') {
                throw new ApiError(402, 'Subscription expired. Please renew to continue.');
            }
        }
    }

    return companyScopeAls.run({ companyId: company._id }, () => next());
});