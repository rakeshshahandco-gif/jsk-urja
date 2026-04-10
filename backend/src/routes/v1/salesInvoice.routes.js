import express from 'express';
import * as siCtrl from '../../controllers/salesInvoice.controller.js';
import { protect, authorize } from '../../middlewares/auth.middleware.js';

const router = express.Router();
router.use(protect);

router.use((req, res, next) => {
    console.log(`[SalesInvoiceRoute] ${req.method} ${req.path} matched`);
    next();
});

// Standard Invoice Routes
router.route('/').get(siCtrl.getSalesInvoices).post(siCtrl.createSalesInvoice);

router.route('/:id')
    .get(siCtrl.getSalesInvoiceById)
    .delete(authorize('admin', 'superadmin'), siCtrl.deleteSalesInvoice);

router.post('/:id/cancel', authorize('admin', 'superadmin'), siCtrl.cancelSalesInvoice);
router.post('/:id/restore', authorize('admin', 'superadmin'), siCtrl.restoreSalesInvoice);
router.post('/:id/record-payment', siCtrl.recordPayment);

export default router;
