import express from 'express';
import reminderController from '../../controllers/reminder.controller.js';
import { protect } from '../../middlewares/auth.middleware.js';

const router = express.Router();

router.use(protect);

router
    .route('/')
    .post(reminderController.createReminder)
    .get(reminderController.getReminders);

router
    .route('/counts')
    .get(reminderController.getReminderCounts);

router
    .route('/:id')
    .get(reminderController.getReminder);

router
    .route('/:id/close')
    .put(reminderController.closeReminder);

router
    .route('/:id/extend')
    .put(reminderController.extendReminder);

// router
//     .route('/:id/reschedule')
//     .put(reminderController.rescheduleReminder);

export default router;
