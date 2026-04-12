import express from 'express';
import * as ewayBillController from '../../controllers/ewayBill.controller.js';
import { protect, checkPermission } from '../../middlewares/auth.middleware.js';

const router = express.Router();

router.use(protect);

router
    .route('/')
    .post(checkPermission('sales'), ewayBillController.createEwayBillDraft)
    .get(ewayBillController.getEwayBills);

router
    .route('/:id')
    .get(ewayBillController.getEwayBillById)
    .patch(checkPermission('sales'), ewayBillController.updateEwayBill)
    .delete(checkPermission('sales'), ewayBillController.deleteEwayBill);

router.post('/:id/sync-master', checkPermission('sales'), ewayBillController.syncWithCustomerMaster);

router.get('/:id/export-json', checkPermission('sales'), ewayBillController.exportEwayBillJson);


export default router;
