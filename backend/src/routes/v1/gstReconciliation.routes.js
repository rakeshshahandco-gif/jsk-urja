import express from 'express';
import * as reconCtrl from '../../controllers/gstReconciliation.controller.js';
import { protect, authorize, checkPermission } from '../../middlewares/auth.middleware.js';

const router = express.Router();

router.use(protect);

router.post('/import', checkPermission('gst.gst_reconciliation.import'), reconCtrl.importPortalData);
router.get('/gstin-summary', checkPermission('gst.gst_reconciliation.view'), reconCtrl.getGstinSummary);
router.get('/bill-to-bill', checkPermission('gst.gst_reconciliation.view'), reconCtrl.getBillToBillDetails);
router.get('/itc-summary', checkPermission('gst.gst_reconciliation.view'), reconCtrl.getItcSummary);

export default router;
