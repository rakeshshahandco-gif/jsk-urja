import express from 'express';
import * as soCtrl from '../../controllers/salesOrder.controller.js';
import { protect, checkPermission } from '../../middlewares/auth.middleware.js';

const router = express.Router();
router.use(protect);

router.route('/').get(checkPermission('sales.sales_orders.view'), soCtrl.getSOs).post(checkPermission('sales.sales_orders.add'), soCtrl.createSO);
router.post('/:id/create-tax-invoice', checkPermission('sales.sales_invoices.add'), soCtrl.createTaxInvoiceFromSalesOrder);
router.route('/:id').get(checkPermission('sales.sales_orders.view'), soCtrl.getSOById).put(checkPermission('sales.sales_orders.edit'), soCtrl.updateSO).delete(checkPermission('sales.sales_orders.delete'), soCtrl.deleteSO);
router.post('/:id/cancel', checkPermission('sales.sales_orders.cancel'), soCtrl.cancelSO);
router.post('/:id/restore', checkPermission('sales.sales_orders.edit'), soCtrl.restoreSO);
router.post('/:id/generate-production-sheet', checkPermission('sales.sales_orders.edit'), soCtrl.generateProductionSheet);

export default router;
