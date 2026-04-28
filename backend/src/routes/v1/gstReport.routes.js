import express from 'express';
import * as gstCtrl from '../../controllers/gstReport.controller.js';
import { protect, authorize } from '../../middlewares/auth.middleware.js';

const router = express.Router();
router.use(protect);

router.get('/preview',  gstCtrl.getGSTR1Preview);
router.get('/validate', gstCtrl.getGSTR1Validation);
router.get('/download', gstCtrl.downloadGSTR1Excel);
router.get('/gstr3b-summary', gstCtrl.getGSTR3BSummary);
router.get('/gstr3b-adjustment', authorize('superadmin', 'admin'), gstCtrl.getGSTR3BAdjustment);
router.post('/gstr3b-adjustment', authorize('superadmin', 'admin'), gstCtrl.saveGSTR3BAdjustment);

// Admin Utility for Missing Place of Supply
router.get('/missing-pos-preview', authorize('superadmin', 'admin'), gstCtrl.getMissingPosPreview);
router.post('/sync-missing-pos', authorize('superadmin', 'admin'), gstCtrl.syncMissingPos);

export default router;
