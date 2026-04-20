import express from 'express';
import * as chatController from '../../controllers/weChatChat.controller.js';
import { protect, checkPermission } from '../../middlewares/auth.middleware.js';
import { prdUpload } from '../../middlewares/prdUpload.middleware.js';

const router = express.Router();

router.use(protect);

router.route('/')
    .get(checkPermission('wechat.contacts.view'), chatController.getChats)
    .post(checkPermission('wechat.contacts.manage'), chatController.addChat);

router.delete('/:chatId',
    checkPermission('wechat.contacts.delete'),
    chatController.deleteChat
);

router.post('/:chatId/attachments',
    checkPermission('wechat.contacts.manage'),
    prdUpload.single('file'),
    chatController.uploadChatAttachment
);

export default router;
