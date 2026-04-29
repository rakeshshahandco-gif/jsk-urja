import express from 'express';
import * as reconCtrl from '../../controllers/gstReconciliation.controller.js';
import { protect, authorize } from '../../middlewares/auth.middleware.js';

const router = express.Router();

router.use(protect);

router.post('/import', authorize('admin', 'superadmin'), reconCtrl.importPortalData);
router.get('/gstin-summary', reconCtrl.getGstinSummary);
router.get('/bill-to-bill', reconCtrl.getBillToBillDetails);
router.get('/itc-summary', reconCtrl.getItcSummary);

export default router;
