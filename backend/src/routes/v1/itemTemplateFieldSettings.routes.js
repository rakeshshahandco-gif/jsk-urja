import express from 'express';
import { protect } from '../../middlewares/auth.middleware.js';
import { requirePlatformAdmin } from '../../middlewares/platformAdmin.middleware.js';
import * as ctrl from '../../controllers/itemTemplateFieldSettings.controller.js';

const router = express.Router();

router.use(protect);

router.get('/effective', ctrl.getEffectiveItemFieldSettings);
router.get('/registry', ctrl.getItemFieldRegistry);

router.use(requirePlatformAdmin);
router.get('/preview', ctrl.previewItemFieldSettings);
router.patch('/templates/:id/item-fields', ctrl.updateTemplateItemFieldSettings);
router.get('/company-overrides/:companyId', ctrl.getCompanyItemFieldOverride);
router.put('/company-overrides/:companyId', ctrl.upsertCompanyItemFieldOverride);

export default router;
