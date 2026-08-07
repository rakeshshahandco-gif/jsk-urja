/**
 * Admin-only rollback of eligible Master alterations using AuditLog.rollbackReference.
 * Never reverses statutory filings. Never deletes original audit.
 */
import httpStatus from 'http-status';
import { ApiError } from '../../utils/ApiError.js';
import { AuditLog } from '../../models/auditLog.model.js';
import { checkUserPermission } from '../../utils/permissionUtils.js';
import { MASTER_ALTERATION_PERMISSIONS } from './permissions.js';
import { applyMasterAlteration } from './applyAlteration.service.js';

export async function rollbackMasterAlteration({
    auditLogId,
    companyId,
    user,
    reason,
    ipAddress,
    userAgent,
}) {
    const role = String(user?.role?.name || user?.role || '').toLowerCase();
    const allowed =
        role === 'admin' ||
        role === 'superadmin' ||
        checkUserPermission(user, MASTER_ALTERATION_PERMISSIONS.ROLLBACK);
    if (!allowed) {
        throw new ApiError(httpStatus.FORBIDDEN, 'Rollback Master Alteration requires admin permission');
    }

    const original = await AuditLog.findById(auditLogId);
    if (!original || original.module !== 'MasterAlteration') {
        throw new ApiError(httpStatus.NOT_FOUND, 'Master alteration audit record not found');
    }

    const details = original.details || {};
    const restore = details.rollbackReference?.restoreValues;
    const masterType = details.masterType || details.rollbackReference?.masterType;
    const masterId = details.masterId || details.rollbackReference?.masterId;

    if (!restore || !masterType || !masterId) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'This audit record is not eligible for rollback');
    }

    if (details.companyId && companyId && String(details.companyId) !== String(companyId)) {
        throw new ApiError(httpStatus.FORBIDDEN, 'Cross-company rollback blocked');
    }

    const result = await applyMasterAlteration({
        masterType,
        masterId,
        proposedChanges: restore,
        companyId: companyId || details.companyId,
        user,
        reason: reason || `Rollback of alteration ${auditLogId}`,
        effectiveFrom: details.rollbackReference?.effectiveFrom || new Date(),
        confirmApply: true,
        ipAddress,
        userAgent,
    });

    await AuditLog.create({
        user: user._id || user.id,
        action: 'OTHER',
        module: 'MasterAlteration.Rollback',
        resourceId: original.resourceId,
        description: `Rollback of Master alteration ${auditLogId}`,
        details: {
            originalAuditId: String(auditLogId),
            restoredValues: restore,
            reason: reason || '',
            companyId: String(companyId || details.companyId || ''),
            newAuditId: result.auditId ? String(result.auditId) : null,
            summary: result.summary,
        },
        ipAddress,
        userAgent,
    });

    return {
        message: 'Rollback applied for open data; filed statutory history untouched',
        originalAuditId: String(auditLogId),
        result,
    };
}
