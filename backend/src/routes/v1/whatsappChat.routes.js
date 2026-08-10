import express from 'express';
import { protect } from '../../middlewares/auth.middleware.js';
import whatsappChatController from '../../controllers/whatsappChat.controller.js';

const router = express.Router();

router.use(protect);

router.get('/chats', whatsappChatController.listChats);
router.post('/archive', whatsappChatController.createChatArchive);
router.get('/archive/download', whatsappChatController.downloadChatArchive);
router.get('/archive/backfill-dry-run', whatsappChatController.archiveBackfillDryRun);
router.get('/chats/:jid/messages', whatsappChatController.listMessages);
router.post('/chats/:jid/read', whatsappChatController.markRead);
router.post('/chats/:jid/send', whatsappChatController.sendChatMessage);
router.post('/sync', whatsappChatController.syncChats);
router.post('/chats/new', whatsappChatController.startChat);
router.get('/messages/:id/media', whatsappChatController.downloadMedia);

export default router;
