import express from 'express';
// import auth from '../../middlewares/auth.js'; // Assuming auth middleware exists if needed, but not specified in prompt
import reminderController from '../../controllers/reminder.controller.js';

const router = express.Router();

router
    .route('/')
    .post(reminderController.createReminder)
    .get(reminderController.getReminders);

router
    .route('/:id')
    .get(reminderController.getReminder);

router
    .route('/:id/close')
    .put(reminderController.closeReminder);

router
    .route('/:id/extend')
    .put(reminderController.extendReminder);

router
    .route('/:id/reschedule')
    .put(reminderController.rescheduleReminder);

export default router;
