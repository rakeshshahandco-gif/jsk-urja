import express from 'express';
import * as gstCtrl from '../../controllers/gstReport.controller.js';
import { protect, authorize } from '../../middlewares/auth.middleware.js';

const router = express.Router();
router.use(protect);

router.get('/preview',  gstCtrl.getGSTR1Preview);
router.get('/validate', gstCtrl.getGSTR1Validation);
router.get('/download', gstCtrl.downloadGSTR1Excel);

// Admin Utility for Missing Place of Supply
router.get('/missing-pos-preview', authorize('superadmin', 'admin'), gstCtrl.getMissingPosPreview);
router.post('/sync-missing-pos', authorize('superadmin', 'admin'), gstCtrl.syncMissingPos);

export default router;
