import express from 'express';
import { protect } from '../../middlewares/auth.middleware.js';
import { createRepairedStockInward, getRepairedStockInwards, getRepairedStockInward } from '../../controllers/repairedStockInward.controller.js';

const router = express.Router();
router.use(protect);

router.route('/').get(getRepairedStockInwards).post(createRepairedStockInward);
router.route('/:id').get(getRepairedStockInward);

export default router;
