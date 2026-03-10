import express from 'express';
import { protect } from '../../middlewares/auth.middleware.js';
import { createFaultyReceipt, getFaultyReceipts, getFaultyReceipt, deleteFaultyReceipt } from '../../controllers/faultyReceipt.controller.js';

const router = express.Router();
router.use(protect);

router.route('/').get(getFaultyReceipts).post(createFaultyReceipt);
router.route('/:id').get(getFaultyReceipt).delete(deleteFaultyReceipt);

export default router;
