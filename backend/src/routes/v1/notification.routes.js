import express from 'express';
import * as notificationController from '../../controllers/notification.controller.js';
import { protect } from '../../middlewares/auth.middleware.js';

const router = express.Router();

router.use(protect); // All notification routes require authentication

router.get('/', notificationController.getMyNotifications);
router.patch('/mark-all-read', notificationController.markAllAsRead);
router.patch('/:notificationId/read', notificationController.markAsRead);

export default router;
