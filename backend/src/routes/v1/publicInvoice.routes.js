import express from 'express';
import { getPublicInvoice } from '../../controllers/invoiceBarcode.controller.js';

const router = express.Router();

router.get('/invoices/:token', getPublicInvoice);

export default router;