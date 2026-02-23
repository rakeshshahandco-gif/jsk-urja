import express from 'express';
import { validate } from '../../middlewares/validate.middleware.js';
import { protect } from '../../middlewares/auth.middleware.js';
import taskValidation from '../../validations/task.validation.js';
import * as taskController from '../../controllers/task.controller.js';

const router = express.Router();

router
    .route('/')
    .post(protect, validate(taskValidation.createTask), taskController.createTask)
    .get(protect, validate(taskValidation.getTasks), taskController.getTasks);

router
    .route('/:taskId')
    .get(protect, validate(taskValidation.getTask), taskController.getTask)
    .patch(protect, validate(taskValidation.updateTask), taskController.updateTask)
    .delete(protect, validate(taskValidation.deleteTask), taskController.deleteTask);

router.patch('/:taskId/status', protect, validate(taskValidation.updateTaskStatus), taskController.updateTaskStatus);
router.post('/:taskId/extend', protect, validate(taskValidation.extendTask), taskController.extendTask);
router.post('/:taskId/close', protect, validate(taskValidation.updateTaskStatus), taskController.closeTask);

export default router;
