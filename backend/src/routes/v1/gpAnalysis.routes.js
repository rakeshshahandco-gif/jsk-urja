import express from 'express';
import { protect } from '../../middlewares/auth.middleware.js';
import * as ctrl from '../../controllers/gpAnalysis.controller.js';

const router = express.Router();
router.use(protect);

router.get('/product', ctrl.getProductGp);
router.get('/customer', ctrl.getCustomerGp);
router.get('/invoice', ctrl.getInvoiceGp);
router.get('/negative', ctrl.getNegativeGp);
router.get('/export-domestic', ctrl.getExportDomesticGp);
router.get('/high-margin', ctrl.getHighMarginProducts);
router.get('/low-margin', ctrl.getLowMarginProducts);
router.get('/cost-exceptions', ctrl.getCostSourceExceptions);
router.get('/director-summary', ctrl.getDirectorSummary);
router.get('/settings', ctrl.getGpSettings);
router.patch('/settings', ctrl.patchGpSettings);
router.get('/audit-logs', ctrl.getCostingAudit);

export default router;
