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

/**
 * Sales Invoice Numbering Tools
 */
router.post('/renumber-invoice/:id', siCtrl.renumberInvoice);
router.post('/resequence-series', siCtrl.resequenceSeries);
router.post('/change-invoice-series/:id', siCtrl.changeInvoiceSeries);

export default router;
