import express from 'express';
import { protect } from '../../middlewares/auth.middleware.js';
import {
    createThread,
    getMyThreads,
    getThread,
    getMessages,
    sendMessage,
    markThreadRead,
    deleteMessage,
    searchMessages,
    getUnreadSummary,
} from '../../controllers/messenger.controller.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

// Thread management
router.post('/threads', createThread);
router.get('/threads', getMyThreads);
router.get('/threads/:id', getThread);

// Messages within a thread
router.get('/threads/:id/messages', getMessages);
router.post('/threads/:id/messages', sendMessage);
router.patch('/threads/:id/read', markThreadRead);

// Message operations
router.delete('/messages/:msgId', deleteMessage);

// Search
router.get('/search', searchMessages);

// Unread count summary
router.get('/unread', getUnreadSummary);

export default router;
