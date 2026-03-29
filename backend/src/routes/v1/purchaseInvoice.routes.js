import express from 'express';
import * as piController from '../../controllers/purchaseInvoice.controller.js';
import { protect } from '../../middlewares/auth.middleware.js';

const router = express.Router();
router.use(protect);

router.route('/')
    .get(piController.getPurchaseInvoices)
    .post(piController.createPurchaseInvoice);

router.route('/:id')
    .get(piController.getPurchaseInvoiceById)
    .put(piController.updatePurchaseInvoice)
    .delete(piController.deletePurchaseInvoice);

router.post('/:id/restore', piController.restorePurchaseInvoice);
router.patch('/:id/payment', piController.updatePaymentStatus);
router.patch('/:id/cancel', piController.cancelPurchaseInvoice);

export default router;
