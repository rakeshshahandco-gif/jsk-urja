import express from 'express';
import { validate } from '../../middlewares/validate.middleware.js';
import { protect, authorize } from '../../middlewares/auth.middleware.js';
import groupValidation from '../../validations/group.validation.js';
import * as groupController from '../../controllers/group.controller.js';

const router = express.Router();

// Publicly available group endpoints (protected)
router
    .route('/')
    .post(protect, validate(groupValidation.createGroup), groupController.createGroup)
    .get(protect, validate(groupValidation.getGroups), groupController.getGroups);

router.get('/assignable', protect, groupController.getAssignableGroups);

router
    .route('/:groupId')
    .get(protect, validate(groupValidation.getGroup), groupController.getGroup)
    .patch(protect, validate(groupValidation.updateGroup), groupController.updateGroup)
    .delete(protect, validate(groupValidation.deleteGroup), groupController.deleteGroup);

router
    .route('/:groupId/members')
    .post(protect, validate(groupValidation.addMember), groupController.addMember);

router
    .route('/:groupId/members/:userId')
    .delete(protect, validate(groupValidation.removeMember), groupController.removeMember);

export default router;
