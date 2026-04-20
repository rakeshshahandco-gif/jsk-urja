import express from 'express';
import * as productController from '../../controllers/weChatProduct.controller.js';
import { protect, checkPermission } from '../../middlewares/auth.middleware.js';
import { prdUpload } from '../../middlewares/prdUpload.middleware.js';

const router = express.Router();

router.use(protect);

// IMPORTANT: /compare must come BEFORE /:productId to avoid route conflict
router.get('/compare', checkPermission('wechat.contacts.view'), productController.compareByPartNumber);

router.route('/')
    .get(checkPermission('wechat.contacts.view'), productController.getProducts)
    .post(checkPermission('wechat.contacts.manage'), productController.createProduct);

router.route('/:productId')
    .get(checkPermission('wechat.contacts.view'), productController.getProduct)
    .patch(checkPermission('wechat.contacts.manage'), productController.updateProduct)
    .delete(checkPermission('wechat.contacts.delete'), productController.deleteProduct);

router.post('/:productId/attachments',
    checkPermission('wechat.contacts.manage'),
    prdUpload.single('file'),
    productController.uploadProductAttachment
);

export default router;
