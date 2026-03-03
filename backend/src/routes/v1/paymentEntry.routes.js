import express from 'express';
import { protect } from '../middleware/auth.middleware.js';
import * as pe from '../controllers/paymentEntry.controller.js';

const router = express.Router();
router.use(protect);

router.post('/', pe.createPaymentEntry);
router.get('/cash-book', pe.getCashBook);
router.get('/bank-book', pe.getBankBook);
router.get('/by-invoice/:invoiceId', pe.getPaymentsByInvoice);

export default router;
