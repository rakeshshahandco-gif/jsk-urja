import express from 'express';
import { validate } from '../../middlewares/validate.middleware.js';
import { protect } from '../../middlewares/auth.middleware.js';
import taskGroupValidation from '../../validations/taskGroup.validation.js';
import taskGroupController from '../../controllers/taskGroup.controller.js';

const router = express.Router();

router.use(protect);

router
    .route('/')
    .post(validate(taskGroupValidation.createGroup), taskGroupController.createGroup)
    .get(validate(taskGroupValidation.getGroups), taskGroupController.getGroups);

// ── My accessible groups (filtered by user) ──────────────────────────────
router.get('/my', taskGroupController.getMyGroups);

router
    .route('/:groupId')
    .get(validate(taskGroupValidation.getGroup), taskGroupController.getGroup)
    .patch(validate(taskGroupValidation.updateGroup), taskGroupController.updateGroup)
    .delete(taskGroupController.deleteGroup);

export default router;
