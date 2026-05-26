import express from 'express';
import * as eInvoiceCtrl from '../../controllers/eInvoice.controller.js';
import { protect, checkPermission } from '../../middlewares/auth.middleware.js';

const router = express.Router();
router.use(protect);

router
    .route('/')
    .post(checkPermission('sales'), eInvoiceCtrl.createEInvoiceDraft)
    .get(eInvoiceCtrl.getEInvoices);

router
    .route('/:id')
    .get(eInvoiceCtrl.getEInvoiceById)
    .patch(checkPermission('sales'), eInvoiceCtrl.updateEInvoiceDraft)
    .delete(checkPermission('sales'), eInvoiceCtrl.deleteEInvoiceDraft);

router.post('/:id/refresh-invoice', checkPermission('sales'), eInvoiceCtrl.refreshFromInvoice);
router.get('/:id/export-json', checkPermission('sales'), eInvoiceCtrl.exportEInvoiceJson);
router.get('/:id/validate', checkPermission('sales'), eInvoiceCtrl.getEInvoiceValidation);
router.post('/:id/generate-irn', checkPermission('sales'), eInvoiceCtrl.generateEInvoiceIrn);
router.post('/:id/record-irn', checkPermission('sales'), eInvoiceCtrl.recordEInvoiceIrnManual);

export default router;
