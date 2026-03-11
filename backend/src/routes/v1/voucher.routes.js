import express from 'express';
import * as controller from '../../controllers/voucher.controller.js';
import { protect } from '../../middlewares/auth.middleware.js';

const router = express.Router();

router.use(protect);

router.route('/')
    .post(controller.createVoucher)
    .get(controller.getVouchers);

router.route('/:id')
    .get(controller.getVoucher);

router.post('/:id/cancel', controller.cancelVoucher);

export default router;
