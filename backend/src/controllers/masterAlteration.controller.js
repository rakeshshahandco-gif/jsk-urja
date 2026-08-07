import httpStatus from 'http-status';
import { catchAsync } from '../utils/catchAsync.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import {
    buildImpactPreview,
    applyMasterAlteration,
    discoverDependencies,
    rollbackMasterAlteration,
    MASTER_TYPES,
} from '../services/masterAlteration/index.js';

const VALID = new Set(Object.values(MASTER_TYPES));

export const previewAlteration = catchAsync(async (req, res) => {
    const { masterType, masterId, proposedChanges, effectiveFrom } = req.body || {};
    if (!VALID.has(masterType) || !masterId) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'masterType and masterId are required');
    }
    const preview = await buildImpactPreview({
        masterType,
        masterId,
        proposedChanges: proposedChanges || {},
        companyId: req.companyId,
        effectiveFrom: effectiveFrom || null,
    });
    res.status(200).send(new ApiResponse(200, preview, 'Impact preview generated'));
});

export const applyAlteration = catchAsync(async (req, res) => {
    const {
        masterType,
        masterId,
        proposedChanges,
        reason,
        effectiveFrom,
        confirmApply,
    } = req.body || {};
    if (!VALID.has(masterType) || !masterId) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'masterType and masterId are required');
    }
    const result = await applyMasterAlteration({
        masterType,
        masterId,
        proposedChanges: proposedChanges || {},
        companyId: req.companyId,
        user: req.user,
        reason,
        effectiveFrom: effectiveFrom || null,
        confirmApply: Boolean(confirmApply),
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
    });
    res.status(200).send(new ApiResponse(200, result, result.message || 'Master Updated'));
});

export const viewUsage = catchAsync(async (req, res) => {
    const { masterType, masterId } = req.params;
    if (!VALID.has(masterType) || !masterId) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'masterType and masterId are required');
    }
    const deps = await discoverDependencies(masterType, masterId, req.companyId);
    res.status(200).send(new ApiResponse(200, deps, 'Usage / dependencies'));
});

export const rollbackAlteration = catchAsync(async (req, res) => {
    const { auditLogId, reason } = req.body || {};
    if (!auditLogId) throw new ApiError(httpStatus.BAD_REQUEST, 'auditLogId is required');
    const result = await rollbackMasterAlteration({
        auditLogId,
        companyId: req.companyId,
        user: req.user,
        reason,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
    });
    res.status(200).send(new ApiResponse(200, result, result.message));
});
