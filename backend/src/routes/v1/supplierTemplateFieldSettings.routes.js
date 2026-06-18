import express from 'express';
import { protect } from '../../middlewares/auth.middleware.js';
import { requirePlatformAdmin } from '../../middlewares/platformAdmin.middleware.js';
import * as ctrl from '../../controllers/supplierTemplateFieldSettings.controller.js';

const router = express.Router();

router.use(protect);

router.get('/effective', ctrl.getEffectiveSupplierFieldSettings);
router.get('/registry', ctrl.getSupplierFieldRegistry);

router.use(requirePlatformAdmin);
router.get('/preview', ctrl.previewSupplierFieldSettings);
router.patch('/templates/:id/supplier-fields', ctrl.updateTemplateSupplierFieldSettings);
router.get('/company-overrides/:companyId', ctrl.getCompanySupplierFieldOverride);
router.put('/company-overrides/:companyId', ctrl.upsertCompanySupplierFieldOverride);

export default router;
