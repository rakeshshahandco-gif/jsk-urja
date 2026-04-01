import express from 'express';
import { register, login, getMe, updateNotificationSettings } from '../../controllers/auth.controller.js';
import { protect } from '../../middlewares/auth.middleware.js';

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.get('/me', protect, getMe);
router.put('/notification-settings', protect, updateNotificationSettings);

export default router;
