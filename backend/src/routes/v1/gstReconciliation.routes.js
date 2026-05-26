import express from 'express';
import multer from 'multer';
import * as reconCtrl from '../../controllers/gstReconciliation.controller.js';
import { protect, checkPermission } from '../../middlewares/auth.middleware.js';

const router = express.Router();
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 },
});

router.use(protect);

router.post('/import', checkPermission('gst.gst_reconciliation.import'), reconCtrl.importPortalData);
router.post('/import-file', upload.single('file'), checkPermission('gst.gst_reconciliation.import'), reconCtrl.importPortalFile);
router.get('/import-batches', checkPermission('gst.gst_reconciliation.view'), reconCtrl.listImportBatches);
router.get('/gstin-summary', checkPermission('gst.gst_reconciliation.view'), reconCtrl.getGstinSummary);
router.get('/bill-to-bill', checkPermission('gst.gst_reconciliation.view'), reconCtrl.getBillToBillDetails);
router.get('/itc-summary', checkPermission('gst.gst_reconciliation.view'), reconCtrl.getItcSummary);
router.get('/rcm-summary', checkPermission('gst.gst_reconciliation.view'), reconCtrl.getRcmSummary);
router.post('/manual-override', checkPermission('gst.gst_reconciliation.import'), reconCtrl.manualOverride);

export default router;
