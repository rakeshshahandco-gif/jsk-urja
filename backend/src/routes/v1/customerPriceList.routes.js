import express from 'express';
import * as ctrl from '../../controllers/customerPriceList.controller.js';
import { protect, checkPermission } from '../../middlewares/auth.middleware.js';

const router = express.Router();
router.use(protect);

const view = checkPermission('sales.sales_orders.view');
const add = checkPermission('sales.sales_orders.add');
const edit = checkPermission('sales.sales_orders.edit');

router.get('/', view, ctrl.listPriceLists);
router.get('/suggest', view, ctrl.suggestPrice);
router.get('/history', view, ctrl.priceHistory);
router.get('/possible-customers', view, ctrl.findPossibleCustomers);
router.get('/product-defaults', view, ctrl.getProductDefault);
router.put('/product-defaults', edit, ctrl.saveProductDefault);
router.get('/last-for-item', view, ctrl.getLastPriceForItem);
router.post('/', add, ctrl.createPriceList);
router.get('/:id/print-payload', view, ctrl.getPrintPayload);
router.get('/:id/excel', view, ctrl.downloadExcel);
router.get('/:id', view, ctrl.getPriceList);
router.put('/:id', edit, ctrl.updatePriceList);
router.post('/:id/approve', edit, ctrl.approvePriceList);
router.post('/:id/expire', edit, ctrl.expirePriceList);
router.post('/:id/revise', add, ctrl.revisePriceList);
router.post('/:id/mark-sent', edit, ctrl.markPriceListSent);
router.post('/:id/link-customer', edit, ctrl.linkCustomer);

export default router;
