import express from 'express';
import { validate } from '../../middlewares/validate.middleware.js';
import { protect } from '../../middlewares/auth.middleware.js';
import taskValidation from '../../validations/task.validation.js';
import * as taskController from '../../controllers/task.controller.js';

const router = express.Router();

// ── TASK MASTER ROUTES ─────────────────────────────────────────────────────

router
    .route('/masters')
    .post(protect, validate(taskValidation.createTaskMaster), taskController.createTaskMaster)
    .get(protect, validate(taskValidation.getTaskMasters), taskController.getTaskMasters);

router
    .route('/masters/:id')
    .get(protect, taskController.getTaskMaster)
    .patch(protect, validate(taskValidation.updateTaskMaster), taskController.updateTaskMaster)
    .delete(protect, taskController.deleteTaskMaster);

// ── TASK INSTANCE ROUTES ────────────────────────────────────────────────────

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
router.post('/:taskId/close', protect, validate(taskValidation.closeTask), taskController.closeTask);
router.post('/:taskId/updates', protect, taskController.addTaskUpdate);

export default router;
