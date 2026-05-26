import express from 'express';
import { protect } from '../../middlewares/auth.middleware.js';
import whatsappChatController from '../../controllers/whatsappChat.controller.js';

const router = express.Router();

router.use(protect);

router.get('/chats', whatsappChatController.listChats);
router.get('/chats/:jid/messages', whatsappChatController.listMessages);
router.post('/chats/:jid/read', whatsappChatController.markRead);
router.post('/chats/:jid/send', whatsappChatController.sendChatMessage);

export default router;
