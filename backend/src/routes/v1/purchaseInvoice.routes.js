import express from 'express';
import * as piController from '../../controllers/purchaseInvoice.controller.js';
import { protect } from '../../middlewares/auth.middleware.js';

const router = express.Router();
router.use(protect);

router.route('/').get(piController.getPurchaseInvoices).post(piController.createPurchaseInvoice);
router.get('/by-po/:poId', piController.getInvoicesByPO);
router.get('/by-grn/:grnId', piController.getInvoicesByGRN);
router.get('/:id', piController.getPurchaseInvoiceById);
router.patch('/:id/payment', piController.updatePaymentStatus);
router.patch('/:id/cancel', piController.cancelPurchaseInvoice);
router.patch('/:id/confirm', piController.confirmPurchaseInvoice);
router.route('/:id')
    .put(piController.updatePurchaseInvoice)
    .delete(piController.deletePurchaseInvoice);

export default router;
