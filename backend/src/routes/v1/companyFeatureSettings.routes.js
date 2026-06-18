import express from 'express';
import * as ctrl from '../../controllers/companyFeatureSettings.controller.js';
import { protect, authorize } from '../../middlewares/auth.middleware.js';
import { requirePlatformAdmin } from '../../middlewares/platformAdmin.middleware.js';

const router = express.Router();
router.use(protect);

router.get('/defaults', ctrl.getFeatureSettingsDefaults);
router.get('/industry-templates', requirePlatformAdmin, ctrl.getIndustryTemplates);
router.get('/', ctrl.getFeatureSettings);
router.patch('/', authorize('superadmin', 'admin'), ctrl.updateFeatureSettings);

export default router;
