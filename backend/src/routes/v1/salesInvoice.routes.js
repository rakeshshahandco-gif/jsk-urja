import express from 'express';
import * as siCtrl from '../../controllers/salesInvoice.controller.js';
import * as ibCtrl from '../../controllers/invoiceBarcode.controller.js';
import { protect, authorize } from '../../middlewares/auth.middleware.js';

const router = express.Router();
router.use(protect);

router.use((req, res, next) => {
    console.log(`[SalesInvoiceRoute] ${req.method} ${req.path} matched`);
    next();
});

// Standard Invoice Routes
router.route('/').get(siCtrl.getSalesInvoices).post(siCtrl.createSalesInvoice);

router.get('/incentive-report', siCtrl.getIncentiveReport);

// QR / Barcode (must be before /:id)
router.get('/barcode-settings', ibCtrl.getBarcodeSettings);
router.put('/barcode-settings', ibCtrl.updateBarcodeSettings);
router.get('/lookup', ibCtrl.lookupInvoiceScan);
router.get('/:id/barcode-data', ibCtrl.getInvoiceBarcodeData);

// Administrative & Numbering Tools (Placed before /:id to avoid collisions)
router.post('/resequence', authorize('admin', 'superadmin'), siCtrl.resequenceSeries);
router.post('/renumber/:id', authorize('admin', 'superadmin'), siCtrl.renumberInvoice);
router.post('/change-series/:id', authorize('admin', 'superadmin'), siCtrl.changeInvoiceSeries);
router.post('/bulk-renumber', authorize('admin', 'superadmin'), siCtrl.bulkRenumberInvoices);
router.post('/bulk-lock', authorize('admin', 'superadmin'), siCtrl.bulkLockInvoices);
router.get('/cleanup-preview', authorize('admin', 'superadmin'), siCtrl.cleanupPreviewDraftInvoices);
router.post('/cleanup-execute', authorize('admin', 'superadmin'), siCtrl.executeCleanupDraftInvoices);
router.delete('/force-cleanup/:id', authorize('admin', 'superadmin'), siCtrl.forceCleanupInvoice);

router.route('/:id')
    .get(siCtrl.getSalesInvoiceById)
    .delete(siCtrl.deleteSalesInvoice);

router.post('/:id/cancel', siCtrl.cancelSalesInvoice);
router.post('/:id/restore', authorize('admin', 'superadmin'), siCtrl.restoreSalesInvoice);
router.post('/:id/gst-correction', authorize('admin', 'superadmin'), siCtrl.updateGstDetails);
router.post('/:id/record-payment', siCtrl.recordPayment);
router.post('/:id/incentive-status', siCtrl.updateIncentiveStatus);

export default router;
