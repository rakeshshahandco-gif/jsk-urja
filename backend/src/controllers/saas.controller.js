/**
 * SAAS Super Admin Controller
 * All endpoints here require roleName === 'superadmin'.
 * They operate across all companies (no companyId scope).
 */

import httpStatus from 'http-status';
import mongoose from 'mongoose';
import { Company } from '../models/company.model.js';
import { Subscription, PLANS, STATUSES } from '../models/subscription.model.js';
import { UserActivityLog } from '../models/userActivityLog.model.js';
import { User } from '../models/user.model.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { generateToken, logActivity } from './auth.controller.js';

// ─── Companies ─────────────────────────────────────────────────────────────

export const listAllCompanies = asyncHandler(async (req, res) => {
    const companies = await Company.find({}).lean();

    // Attach subscription status for each company
    const ids = companies.map((c) => c._id);
    const subs = await Subscription.find({ companyId: { $in: ids } }).lean();
    const subMap = Object.fromEntries(subs.map((s) => [String(s.companyId), s]));

    const result = companies.map((c) => ({
        ...c,
        subscription: subMap[String(c._id)] || null,
    }));

    res.send(new ApiResponse(httpStatus.OK, result));
});

export const getCompanyDetails = asyncHandler(async (req, res) => {
    const { companyId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(companyId)) throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid companyId');

    const company = await Company.findById(companyId).lean();
    if (!company) throw new ApiError(httpStatus.NOT_FOUND, 'Company not found');

    const subscription = await Subscription.findOne({ companyId }).lean();
    const userCount = await User.countDocuments({ isActive: true });

    res.send(new ApiResponse(httpStatus.OK, { company, subscription, userCount }));
});

export const toggleCompanyActive = asyncHandler(async (req, res) => {
    const { companyId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(companyId)) throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid companyId');

    const company = await Company.findById(companyId);
    if (!company) throw new ApiError(httpStatus.NOT_FOUND, 'Company not found');

    company.isActive = !company.isActive;
    await company.save();

    await logActivity({
        userId: req.user._id,
        username: req.user.username,
        action: 'update',
        module: 'saas',
        description: `Company ${company.companyName} ${company.isActive ? 'activated' : 'deactivated'}`,
        req,
    });

    res.send(new ApiResponse(httpStatus.OK, { isActive: company.isActive }, 'Company status updated'));
});

// ─── Enabled Modules ────────────────────────────────────────────────────────

export const updateEnabledModules = asyncHandler(async (req, res) => {
    const { companyId } = req.params;
    const { enabledModules } = req.body;

    if (!Array.isArray(enabledModules)) throw new ApiError(httpStatus.BAD_REQUEST, 'enabledModules must be an array');
    if (!mongoose.Types.ObjectId.isValid(companyId)) throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid companyId');

    const company = await Company.findByIdAndUpdate(
        companyId,
        { enabledModules },
        { new: true, select: '_id companyName enabledModules' },
    );
    if (!company) throw new ApiError(httpStatus.NOT_FOUND, 'Company not found');

    await logActivity({
        userId: req.user._id,
        username: req.user.username,
        action: 'update',
        module: 'saas',
        description: `Modules updated for ${company.companyName}: ${enabledModules.join(', ')}`,
        req,
    });

    res.send(new ApiResponse(httpStatus.OK, company, 'Enabled modules updated'));
});

// ─── Subscriptions ──────────────────────────────────────────────────────────

export const getSubscription = asyncHandler(async (req, res) => {
    const { companyId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(companyId)) throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid companyId');

    const sub = await Subscription.findOne({ companyId }).lean();
    res.send(new ApiResponse(httpStatus.OK, sub || {}));
});

export const upsertSubscription = asyncHandler(async (req, res) => {
    const { companyId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(companyId)) throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid companyId');

    const company = await Company.findById(companyId);
    if (!company) throw new ApiError(httpStatus.NOT_FOUND, 'Company not found');

    const {
        plan = 'trial',
        status = 'trial',
        userLimit = 5,
        storageGb = 2,
        moduleAccess = [],
        startDate,
        trialEndsAt,
        expiresAt,
        notes = '',
        invoiceRef = '',
    } = req.body;

    if (!PLANS.includes(plan)) throw new ApiError(httpStatus.BAD_REQUEST, `Invalid plan. Valid: ${PLANS.join(', ')}`);
    if (!STATUSES.includes(status)) throw new ApiError(httpStatus.BAD_REQUEST, `Invalid status. Valid: ${STATUSES.join(', ')}`);

    const sub = await Subscription.findOneAndUpdate(
        { companyId },
        {
            $set: {
                companyId,
                plan,
                status,
                userLimit,
                storageGb,
                moduleAccess,
                startDate: startDate ? new Date(startDate) : undefined,
                trialEndsAt: trialEndsAt ? new Date(trialEndsAt) : null,
                expiresAt: expiresAt ? new Date(expiresAt) : null,
                notes,
                invoiceRef,
                updatedBy: req.user._id,
            },
            $setOnInsert: { createdBy: req.user._id },
        },
        { upsert: true, new: true },
    );

    // Link subscription ref on company
    await Company.findByIdAndUpdate(companyId, { subscriptionRef: sub._id });

    await logActivity({
        userId: req.user._id,
        username: req.user.username,
        action: 'update',
        module: 'saas',
        description: `Subscription upserted for ${company.companyName}: plan=${plan}, status=${status}`,
        req,
    });

    res.send(new ApiResponse(httpStatus.OK, sub, 'Subscription saved'));
});

// ─── Impersonation ──────────────────────────────────────────────────────────

export const impersonateCompanyAdmin = asyncHandler(async (req, res) => {
    const { companyId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(companyId)) throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid companyId');

    const company = await Company.findById(companyId);
    if (!company) throw new ApiError(httpStatus.NOT_FOUND, 'Company not found');

    // Find the first admin user (no companyId scope since users are global)
    // We issue a token for the requesting superadmin but embed the target companyId as a hint
    // The frontend will switch company context accordingly
    const targetUser = await User.findOne({ isActive: true, roleName: { $in: ['admin', 'superadmin'] } })
        .select('_id username roleName')
        .lean();

    // Create a short-lived impersonation token (2 hours)
    const impersonationToken = generateToken(req.user._id, req.user.roleName || 'superadmin');

    await logActivity({
        userId: req.user._id,
        username: req.user.username,
        action: 'impersonate',
        module: 'saas',
        description: `Superadmin impersonated company ${company.companyName} (${companyId})`,
        meta: { targetCompanyId: companyId, targetCompanyName: company.companyName },
        req,
    });

    res.send(
        new ApiResponse(httpStatus.OK, {
            token: impersonationToken,
            companyId,
            companyName: company.companyName,
            note: 'Switch to this company in the frontend using the Company Selector.',
        }, 'Impersonation token issued'),
    );
});

// ─── Activity Logs ──────────────────────────────────────────────────────────

export const listActivityLogs = asyncHandler(async (req, res) => {
    const { companyId, userId, action, limit = 50, page = 1 } = req.query;

    const filter = {};
    if (companyId && mongoose.Types.ObjectId.isValid(companyId)) filter.companyId = companyId;
    if (userId && mongoose.Types.ObjectId.isValid(userId)) filter.userId = userId;
    if (action) filter.action = action;

    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const [logs, total] = await Promise.all([
        UserActivityLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit, 10)).lean(),
        UserActivityLog.countDocuments(filter),
    ]);

    res.send(new ApiResponse(httpStatus.OK, { logs, total, page: parseInt(page, 10), limit: parseInt(limit, 10) }));
});

// ─── Dashboard Summary ──────────────────────────────────────────────────────

export const getSaasDashboard = asyncHandler(async (req, res) => {
    const [totalCompanies, activeCompanies, subs, recentActivity] = await Promise.all([
        Company.countDocuments({}),
        Company.countDocuments({ isActive: true }),
        Subscription.aggregate([
            { $group: { _id: '$status', count: { $sum: 1 } } },
        ]),
        UserActivityLog.find({}).sort({ createdAt: -1 }).limit(10).lean(),
    ]);

    const subStats = Object.fromEntries(subs.map((s) => [s._id, s.count]));

    res.send(
        new ApiResponse(httpStatus.OK, {
            totalCompanies,
            activeCompanies,
            inactiveCompanies: totalCompanies - activeCompanies,
            subscriptions: subStats,
            recentActivity,
        }),
    );
});
