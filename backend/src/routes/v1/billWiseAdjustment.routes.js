import express from 'express';
import {
    getBillWiseWorkspace,
    fifoPreview,
    applyBillWiseAdjustments,
    reverseBillWiseAdjustment,
    getBillWiseHistory,
    getAdjustmentsForBill,
} from '../../controllers/billWiseAdjustment.controller.js';
import { protect, authorize } from '../../middlewares/auth.middleware.js';

const router = express.Router();

router.use(protect);

router.get('/workspace', getBillWiseWorkspace);
router.post('/fifo-preview', fifoPreview);
router.post('/apply', applyBillWiseAdjustments);
router.get('/history', getBillWiseHistory);
router.get('/for-bill', getAdjustmentsForBill);
router.post('/:id/reverse', authorize('admin', 'superadmin'), reverseBillWiseAdjustment);

export default router;
