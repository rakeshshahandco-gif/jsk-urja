import express from 'express';
import { protect } from '../../middlewares/auth.middleware.js';
import { requirePlatformAdmin } from '../../middlewares/platformAdmin.middleware.js';
import * as ctrl from '../../controllers/customerTemplateFieldSettings.controller.js';

const router = express.Router();

router.use(protect);

/** Customer form — any authenticated user */
router.get('/effective', ctrl.getEffectiveCustomerFieldSettings);
router.get('/registry', ctrl.getCustomerFieldRegistry);

/** Admin — template + override management + preview */
router.use(requirePlatformAdmin);
router.get('/preview', ctrl.previewCustomerFieldSettings);
router.patch('/templates/:id/customer-fields', ctrl.updateTemplateCustomerFieldSettings);
router.get('/company-overrides/:companyId', ctrl.getCompanyCustomerFieldOverride);
router.put('/company-overrides/:companyId', ctrl.upsertCompanyCustomerFieldOverride);

export default router;
