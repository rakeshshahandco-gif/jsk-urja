import express from 'express';
import * as siCtrl from '../../controllers/salesInvoice.controller.js';
import { protect, authorize } from '../../middlewares/auth.middleware.js';

const router = express.Router();

// Admin-only routing
router.use(protect);
router.use(authorize('admin', 'superadmin'));

/**
 * Sales Invoice Cleanup Tools
 */
router.get('/cleanup-preview', siCtrl.cleanupPreviewDraftInvoices);
router.post('/cleanup-execute', siCtrl.executeCleanupDraftInvoices);
router.delete('/force-cleanup/:id', siCtrl.forceCleanupInvoice);

export default router;
