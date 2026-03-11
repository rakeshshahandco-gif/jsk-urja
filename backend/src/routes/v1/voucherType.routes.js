import express from 'express';
import * as controller from '../../controllers/voucherType.controller.js';
import { protect } from '../../middlewares/auth.middleware.js';

const router = express.Router();

router.use(protect);

router.route('/')
    .post(controller.createVoucherType)
    .get(controller.getVoucherTypes);

router.route('/:id')
    .put(controller.updateVoucherType)
    .delete(controller.deleteVoucherType);

export default router;
