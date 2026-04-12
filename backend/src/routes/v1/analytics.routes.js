import express from 'express';
import { protect, checkPermission } from '../../middlewares/auth.middleware.js';
import analyticsController from '../../controllers/analytics.controller.js';

const router = express.Router();

router.get('/sales-marketing-dashboard', protect, checkPermission('getSalesMarketingAnalytics'), analyticsController.getSalesMarketingAnalytics);
router.get('/lead-report', protect, checkPermission('queryLeadReport'), analyticsController.queryLeadReport);
router.get('/export-sales-marketing', protect, checkPermission('getSalesMarketingAnalytics'), analyticsController.exportSalesMarketingAnalytics);

export default router;
