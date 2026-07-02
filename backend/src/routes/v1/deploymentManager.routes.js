import express from 'express';
import { protect } from '../../middlewares/auth.middleware.js';
import { requirePlatformAdmin } from '../../middlewares/platformAdmin.middleware.js';
import {
    getOverview,
    getChecklist,
    getReport,
    getLocalGit,
    getCompanyHistory,
    addCompanyHistory,
    applyReferenceDefaults,
    updateCompanyDeploymentTracking,
} from '../../controllers/deploymentManager.controller.js';

const router = express.Router();

router.use(protect);
router.use(requirePlatformAdmin);

router.get('/overview', getOverview);
router.get('/report', getReport);
router.get('/git/local', getLocalGit);
router.get('/checklist/:clientKey', getChecklist);
router.get('/company/:companyId/history', getCompanyHistory);
router.post('/company/:companyId/history', addCompanyHistory);
router.post('/company/:companyId/apply-reference', applyReferenceDefaults);
router.patch('/company/:companyId/tracking', updateCompanyDeploymentTracking);

export default router;
