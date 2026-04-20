import express from 'express';
import * as priceController from '../../controllers/weChatPriceRecord.controller.js';
import { protect, checkPermission } from '../../middlewares/auth.middleware.js';

const router = express.Router();

router.use(protect);

router.get('/trend', checkPermission('wechat.contacts.view'), priceController.getPriceTrend);

router.route('/')
    .get(checkPermission('wechat.contacts.view'), priceController.getPrices)
    .post(checkPermission('wechat.contacts.manage'), priceController.addPriceRecord);

router.delete('/:recordId',
    checkPermission('wechat.contacts.delete'),
    priceController.deletePriceRecord
);

export default router;
