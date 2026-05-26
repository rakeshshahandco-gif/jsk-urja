import httpStatus from 'http-status';
import { AccountingPeriodLock } from '../models/accountingPeriodLock.model.js';
import { ApprovalRule } from '../models/approvalRule.model.js';
import { SecuritySettings } from '../models/securitySettings.model.js';
import { LoginHistory } from '../models/loginHistory.model.js';
import { AccountingAuditLog } from '../models/accountingAuditLog.model.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import logger from '../utils/logger.js';

// ── Security Context ──────────────────────────────────────────────────────────

export const getMySecurityContext = async (req, res, next) => {
    try {
        const [settings, locks] = await Promise.all([
            SecuritySettings.findOne({ singletonKey: 'default' }).lean(),
            AccountingPeriodLock.findOne({ isActive: true }).lean(),
        ]);
        res.json(new ApiResponse(httpStatus.OK, { settings, locks }, 'Security context'));
    } catch (err) {
        next(err);
    }
};

// ── Settings ──────────────────────────────────────────────────────────────────

export const getSettings = async (req, res, next) => {
    try {
        const settings = await SecuritySettings.findOneAndUpdate(
            { singletonKey: 'default' },
            { $setOnInsert: { singletonKey: 'default' } },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        ).lean();
        res.json(new ApiResponse(httpStatus.OK, settings, 'Security settings'));
    } catch (err) {
        next(err);
    }
};

export const patchSettings = async (req, res, next) => {
    try {
        const allowed = [
            'sessionTimeoutMinutes', 'maxFailedLogins', 'lockoutMinutes',
            'requirePasswordChangeDays', 'enforceCompanyRestriction',
            'defaultPostingMode', 'enableFieldPermissions', 'enableApprovalWorkflow',
        ];
        const update = {};
        allowed.forEach(k => { if (req.body[k] !== undefined) update[k] = req.body[k]; });
        update.updatedBy = req.user._id;

        const settings = await SecuritySettings.findOneAndUpdate(
            { singletonKey: 'default' },
            { $set: update },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        res.json(new ApiResponse(httpStatus.OK, settings, 'Settings updated'));
    } catch (err) {
        next(err);
    }
};

// ── Permissions ───────────────────────────────────────────────────────────────

export const getPermissionMatrix = async (req, res, next) => {
    try {
        // Returns the static permission registry for the UI to render
        const { PERMISSION_REGISTRY } = await import('../config/permissionRegistry.js');
        res.json(new ApiResponse(httpStatus.OK, PERMISSION_REGISTRY, 'Permission matrix'));
    } catch (err) {
        next(err);
    }
};

// ── Period Locks ──────────────────────────────────────────────────────────────

export const getLocks = async (req, res, next) => {
    try {
        const locks = await AccountingPeriodLock.find()
            .sort({ financialYear: -1 })
            .lean();
        res.json(new ApiResponse(httpStatus.OK, locks, 'Period locks'));
    } catch (err) {
        next(err);
    }
};

export const updateLocks = async (req, res, next) => {
    try {
        const { financialYear, booksLockedTill, gstLockedTill, tdsLockedTill, remarks } = req.body;
        if (!financialYear) throw new ApiError(httpStatus.BAD_REQUEST, 'financialYear is required');

        const lock = await AccountingPeriodLock.findOneAndUpdate(
            { financialYear },
            {
                $set: {
                    booksLockedTill: booksLockedTill || null,
                    gstLockedTill: gstLockedTill || null,
                    tdsLockedTill: tdsLockedTill || null,
                    remarks: remarks || '',
                    isActive: true,
                    updatedBy: req.user._id,
                }
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        logger.info(`[PeriodLock] Updated by ${req.user._id} for FY ${financialYear}`);
        res.json(new ApiResponse(httpStatus.OK, lock, 'Period lock updated'));
    } catch (err) {
        next(err);
    }
};

export const overrideLock = async (req, res, next) => {
    try {
        const { financialYear, unlockedTill, unlockReason } = req.body;
        if (!financialYear) throw new ApiError(httpStatus.BAD_REQUEST, 'financialYear is required');
        if (!unlockedTill) throw new ApiError(httpStatus.BAD_REQUEST, 'unlockedTill is required');
        if (!unlockReason?.trim()) throw new ApiError(httpStatus.BAD_REQUEST, 'Unlock reason is required');

        const lock = await AccountingPeriodLock.findOneAndUpdate(
            { financialYear },
            {
                $set: {
                    unlockedTill,
                    unlockReason: unlockReason.trim(),
                    unlockedBy: req.user._id,
                    updatedBy: req.user._id,
                }
            },
            { upsert: true, new: true }
        );
        logger.warn(`[PeriodLock] Override by ${req.user._id} for FY ${financialYear} till ${unlockedTill}`);
        res.json(new ApiResponse(httpStatus.OK, lock, 'Lock overridden'));
    } catch (err) {
        next(err);
    }
};

// ── Approval Rules ────────────────────────────────────────────────────────────

export const listApprovalRules = async (req, res, next) => {
    try {
        const rules = await ApprovalRule.find()
            .sort({ priority: 1, module: 1 })
            .populate('approverRoleIds', 'name')
            .populate('approverUserIds', 'name email')
            .lean();
        res.json(new ApiResponse(httpStatus.OK, rules, 'Approval rules'));
    } catch (err) {
        next(err);
    }
};

export const createApprovalRule = async (req, res, next) => {
    try {
        const rule = await ApprovalRule.create({ ...req.body, createdBy: req.user._id });
        res.status(httpStatus.CREATED).json(new ApiResponse(httpStatus.CREATED, rule, 'Rule created'));
    } catch (err) {
        next(err);
    }
};

export const updateApprovalRule = async (req, res, next) => {
    try {
        const rule = await ApprovalRule.findByIdAndUpdate(
            req.params.id,
            { $set: req.body },
            { new: true, runValidators: true }
        );
        if (!rule) throw new ApiError(httpStatus.NOT_FOUND, 'Approval rule not found');
        res.json(new ApiResponse(httpStatus.OK, rule, 'Rule updated'));
    } catch (err) {
        next(err);
    }
};

export const deleteApprovalRule = async (req, res, next) => {
    try {
        const rule = await ApprovalRule.findByIdAndDelete(req.params.id);
        if (!rule) throw new ApiError(httpStatus.NOT_FOUND, 'Approval rule not found');
        res.json(new ApiResponse(httpStatus.OK, {}, 'Rule deleted'));
    } catch (err) {
        next(err);
    }
};

// ── Approval Queue (stubs — extend when workflow engine is built) ──────────────

export const getApprovalQueue = async (req, res, next) => {
    res.json(new ApiResponse(httpStatus.OK, [], 'Approval queue (not yet implemented)'));
};

export const submitApprovalRequest = async (req, res, next) => {
    res.json(new ApiResponse(httpStatus.OK, {}, 'Approval request submitted (not yet implemented)'));
};

export const approveRequest = async (req, res, next) => {
    res.json(new ApiResponse(httpStatus.OK, {}, 'Approved (not yet implemented)'));
};

export const rejectRequest = async (req, res, next) => {
    res.json(new ApiResponse(httpStatus.OK, {}, 'Rejected (not yet implemented)'));
};

export const evaluateApproval = async (req, res, next) => {
    res.json(new ApiResponse(httpStatus.OK, { required: false }, 'Evaluate (not yet implemented)'));
};

// ── Audit Logs ────────────────────────────────────────────────────────────────

export const getAuditLogs = async (req, res, next) => {
    try {
        const { resourceType, financialYear, action, page = 1, limit = 50 } = req.query;
        const filter = {};
        if (resourceType) filter.resourceType = resourceType;
        if (financialYear) filter.financialYear = financialYear;
        if (action) filter.action = action;

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const [logs, total] = await Promise.all([
            AccountingAuditLog.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit))
                .populate('userId', 'name email')
                .lean(),
            AccountingAuditLog.countDocuments(filter),
        ]);
        res.json(new ApiResponse(httpStatus.OK, { logs, total, page: parseInt(page), limit: parseInt(limit) }, 'Audit logs'));
    } catch (err) {
        next(err);
    }
};

// ── Notification Rules (stub) ─────────────────────────────────────────────────

export const getNotificationRules = async (req, res, next) => {
    res.json(new ApiResponse(httpStatus.OK, [], 'Notification rules (not yet implemented)'));
};

export const patchNotificationRule = async (req, res, next) => {
    res.json(new ApiResponse(httpStatus.OK, {}, 'Updated (not yet implemented)'));
};

// ── Login History & Force Logout ──────────────────────────────────────────────

export const getLoginHistory = async (req, res, next) => {
    try {
        const { page = 1, limit = 50 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const [logs, total] = await Promise.all([
            LoginHistory.find()
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit))
                .populate('userId', 'name email')
                .lean(),
            LoginHistory.countDocuments(),
        ]);
        res.json(new ApiResponse(httpStatus.OK, { logs, total }, 'Login history'));
    } catch (err) {
        next(err);
    }
};

export const forceLogoutUser = async (req, res, next) => {
    res.json(new ApiResponse(httpStatus.OK, {}, 'Force logout sent (not yet implemented)'));
};

export const forceLogoutAll = async (req, res, next) => {
    res.json(new ApiResponse(httpStatus.OK, {}, 'Force logout all sent (not yet implemented)'));
};

// ── Security Reports ──────────────────────────────────────────────────────────

export const getSecurityReports = async (req, res, next) => {
    try {
        const [totalLocks, activeRules, recentAudit] = await Promise.all([
            AccountingPeriodLock.countDocuments(),
            ApprovalRule.countDocuments({ isActive: true }),
            AccountingAuditLog.countDocuments({
                createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
            }),
        ]);
        res.json(new ApiResponse(httpStatus.OK, { totalLocks, activeApprovalRules: activeRules, auditLogsLast30Days: recentAudit }, 'Security reports'));
    } catch (err) {
        next(err);
    }
};
