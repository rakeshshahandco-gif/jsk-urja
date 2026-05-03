import express from 'express';
import * as gstCtrl from '../../controllers/gstReport.controller.js';
import { protect, authorize, checkPermission } from '../../middlewares/auth.middleware.js';

const router = express.Router();
router.use(protect);

router.get('/preview',  checkPermission('gst.gstr1.view'), gstCtrl.getGSTR1Preview);
router.get('/validate', checkPermission('gst.gstr1.view'), gstCtrl.getGSTR1Validation);
router.get('/download', checkPermission('gst.gstr1.export'), gstCtrl.downloadGSTR1Excel);
router.get('/gstr3b-summary', checkPermission('gst.gstr3b.view'), gstCtrl.getGSTR3BSummary);
router.get('/gstr3b-adjustment', checkPermission('gst.gstr3b.view'), gstCtrl.getGSTR3BAdjustment);
router.post('/gstr3b-adjustment', checkPermission('gst.gstr3b.view'), gstCtrl.saveGSTR3BAdjustment);

// New Reports
router.get('/itc-register', checkPermission('admin.company_profile.view'), gstCtrl.getItcRegister);
router.get('/payable-summary', checkPermission('admin.company_profile.view'), gstCtrl.getGstPayableSummary);
router.get('/hsn-summary', checkPermission('admin.company_profile.view'), gstCtrl.getHsnSummary);
router.get('/ledger', checkPermission('admin.company_profile.view'), gstCtrl.getGstLedger);

// Admin Utility for Missing Place of Supply
router.get('/missing-pos-preview', authorize('superadmin', 'admin'), gstCtrl.getMissingPosPreview);
router.post('/sync-missing-pos', authorize('superadmin', 'admin'), gstCtrl.syncMissingPos);

export default router;
