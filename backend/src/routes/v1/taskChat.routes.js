import express from 'express';
import taskChatController from '../../controllers/taskChat.controller.js';
import { protect } from '../../middlewares/auth.middleware.js';

const router = express.Router();

// Apply protect middleware to all chat routes
router.use(protect);

router.get('/rooms', taskChatController.getChatRooms);
router.get('/:taskId/messages', taskChatController.getMessages);
router.post('/:taskId/messages', taskChatController.sendMessage);

export default router;
