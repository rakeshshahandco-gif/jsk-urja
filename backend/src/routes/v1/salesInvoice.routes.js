import express from 'express';
import * as siCtrl from '../../controllers/salesInvoice.controller.js';
import { protect } from '../../middlewares/auth.middleware.js';

const router = express.Router();
router.use(protect);

router.route('/').get(siCtrl.getSalesInvoices).post(siCtrl.createSalesInvoice);
router.route('/:id').get(siCtrl.getSalesInvoiceById);
router.post('/:id/cancel', siCtrl.cancelSalesInvoice);
router.post('/:id/record-payment', siCtrl.recordPayment);

export default router;
