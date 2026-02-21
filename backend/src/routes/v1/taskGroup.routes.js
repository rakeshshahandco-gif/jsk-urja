import express from 'express';
import { validate } from '../../middlewares/validate.middleware.js';
import taskGroupValidation from '../../validations/taskGroup.validation.js';
import taskGroupController from '../../controllers/taskGroup.controller.js';

const router = express.Router();

router.use(protect);

router
    .route('/')
    .post(validate(taskGroupValidation.createGroup), taskGroupController.createTemplate)
    .get(validate(taskGroupValidation.getGroups), taskGroupController.getGroups);

router
    .route('/:groupId')
    .get(validate(taskGroupValidation.getGroup), taskGroupController.getGroup);

router
    .route('/templates')
    .post(validate(taskGroupValidation.createGroup), taskGroupController.createTemplate);

router
    .route('/:templateId/generate')
    .post(taskGroupController.generateInstance);

export default router;
