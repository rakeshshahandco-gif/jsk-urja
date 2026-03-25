import express from 'express';
import * as piController from '../../controllers/purchaseInvoice.controller.js';
import { protect } from '../../middlewares/auth.middleware.js';

const router = express.Router();
router.use(protect);

router.route('/')
    .get(piController.getPurchaseInvoices)
    .post(piController.createPurchaseInvoice);

router.get('/:id', piController.getPurchaseInvoiceById);
router.patch('/:id/payment', piController.updatePaymentStatus);
router.patch('/:id/cancel', piController.cancelPurchaseInvoice);

router.route('/:id')
    .delete(piController.deletePurchaseInvoice);


export default router;
