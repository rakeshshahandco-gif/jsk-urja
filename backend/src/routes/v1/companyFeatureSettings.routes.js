import express from 'express';
import * as ctrl from '../../controllers/companyFeatureSettings.controller.js';
import { protect, checkPermission } from '../../middlewares/auth.middleware.js';

const router = express.Router();
router.use(protect);

router.get('/defaults', ctrl.getFeatureSettingsDefaults);
router.get('/industry-templates', ctrl.getIndustryTemplates);
router.get('/', ctrl.getFeatureSettings);
router.patch('/', checkPermission('admin'), ctrl.updateFeatureSettings);

export default router;
