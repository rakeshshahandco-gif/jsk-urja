import express from 'express';
import { protect, checkPermission } from '../../middlewares/auth.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { checkUserPermission } from '../../utils/permissionUtils.js';
import { ApiError } from '../../utils/ApiError.js';
import sundryDebtorSettingsValidation from '../../validations/sundryDebtorSettings.validation.js';
import * as sundryDebtorSettingsController from '../../controllers/sundryDebtorSettings.controller.js';

const router = express.Router();
router.use(protect);

const canReadSundryDebtorSettings = (req, res, next) => {
    if (
        checkUserPermission(req.user, 'admin')
        || checkUserPermission(req.user, 'customers.customers.view')
    ) {
        return next();
    }
    throw new ApiError(403, 'Permission denied');
};

router.get('/settings', canReadSundryDebtorSettings, sundryDebtorSettingsController.getSettings);
router.put('/settings', checkPermission('admin'), validate(sundryDebtorSettingsValidation.saveSettings), sundryDebtorSettingsController.saveSettings);

router.get('/customer-types', checkPermission('customers.customers.view'), sundryDebtorSettingsController.listCustomerTypes);
router.post(
    '/customer-types',
    checkPermission('customers.customers.add'),
    validate(sundryDebtorSettingsValidation.createCustomerType),
    sundryDebtorSettingsController.createCustomerType,
);

export default router;
