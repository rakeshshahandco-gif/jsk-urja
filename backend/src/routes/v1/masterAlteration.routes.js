import express from 'express';
import { protect, checkPermission } from '../../middlewares/auth.middleware.js';
import * as ctrl from '../../controllers/masterAlteration.controller.js';
import { MASTER_ALTERATION_PERMISSIONS } from '../../services/masterAlteration/permissions.js';
import { checkUserPermission } from '../../utils/permissionUtils.js';
import { ApiError } from '../../utils/ApiError.js';

const router = express.Router();

router.use(protect);

function isAdmin(user) {
    const role = String(user?.role?.name || user?.roleName || user?.role || '').toLowerCase();
    return role === 'admin' || role === 'superadmin';
}

/** Allow preview/usage for admin or any master-alteration / classic master edit permission */
function allowPreviewOrUsage(req, res, next) {
    if (isAdmin(req.user)) return next();
    const keys = [
        MASTER_ALTERATION_PERMISSIONS.VIEW_USAGE,
        MASTER_ALTERATION_PERMISSIONS.ALTER_CUSTOMER,
        MASTER_ALTERATION_PERMISSIONS.ALTER_SUPPLIER,
        MASTER_ALTERATION_PERMISSIONS.ALTER_LEDGER,
        MASTER_ALTERATION_PERMISSIONS.ALTER_ITEM,
        'customers.customer_master.edit',
        'purchase.suppliers.edit',
        'accounts.ledger_master.edit',
        'inventory.item_master.edit',
    ];
    if (keys.some((k) => checkUserPermission(req.user, k))) return next();
    return next(new ApiError(403, 'Permission denied: Master alteration preview/usage'));
}

/** Apply requires admin or an explicit alter_* key (field-level still enforced in service) */
function allowApply(req, res, next) {
    if (isAdmin(req.user)) return next();
    const keys = [
        MASTER_ALTERATION_PERMISSIONS.ALTER_CUSTOMER,
        MASTER_ALTERATION_PERMISSIONS.ALTER_SUPPLIER,
        MASTER_ALTERATION_PERMISSIONS.ALTER_LEDGER,
        MASTER_ALTERATION_PERMISSIONS.ALTER_ITEM,
        MASTER_ALTERATION_PERMISSIONS.ALTER_LEDGER_GROUP,
        MASTER_ALTERATION_PERMISSIONS.ALTER_GSTIN,
        MASTER_ALTERATION_PERMISSIONS.ALTER_HSN,
        MASTER_ALTERATION_PERMISSIONS.ALTER_NAME,
    ];
    if (keys.some((k) => checkUserPermission(req.user, k))) return next();
    return next(new ApiError(403, 'Permission denied: Master alteration apply'));
}

function allowRollback(req, res, next) {
    if (isAdmin(req.user)) return next();
    if (checkUserPermission(req.user, MASTER_ALTERATION_PERMISSIONS.ROLLBACK)) return next();
    return next(new ApiError(403, 'Permission denied: Rollback Master Alteration'));
}

router.post('/preview', allowPreviewOrUsage, ctrl.previewAlteration);
router.post('/apply', allowApply, ctrl.applyAlteration);
router.get('/usage/:masterType/:masterId', allowPreviewOrUsage, ctrl.viewUsage);
router.post('/rollback', allowRollback, ctrl.rollbackAlteration);

export default router;
