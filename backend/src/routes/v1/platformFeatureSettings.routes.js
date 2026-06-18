import express from 'express';
import * as ctrl from '../../controllers/platformFeatureSettings.controller.js';
import { protect, authorize } from '../../middlewares/auth.middleware.js';
import { requirePlatformAdmin } from '../../middlewares/platformAdmin.middleware.js';

const router = express.Router();
router.use(protect);
router.use(requirePlatformAdmin);

router.get('/', ctrl.getPlatformSettings);
router.patch('/', ctrl.updatePlatformSettings);
router.post('/apply-to-all-companies', authorize('superadmin'), ctrl.applyPlatformToAllCompanies);

export default router;
