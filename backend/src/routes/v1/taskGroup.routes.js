import express from 'express';
import { protect } from '../../middlewares/auth.middleware.js';
import taskGroupController from '../../controllers/taskGroup.controller.js';

const router = express.Router();

router.use(protect);

router
    .route('/')
    .post(taskGroupController.createTemplate)
    .get(taskGroupController.getGroups);

router
    .route('/:groupId')
    .get(taskGroupController.getGroup);

router
    .route('/templates')
    .post(taskGroupController.createTemplate);

router
    .route('/:templateId/generate')
    .post(taskGroupController.generateInstance);

export default router;
