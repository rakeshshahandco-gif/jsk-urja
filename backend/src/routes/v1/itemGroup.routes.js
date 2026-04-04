import express from 'express';
import { validate } from '../../middlewares/validate.middleware.js';
import itemGroupValidation from '../../validations/itemGroup.validation.js';
import * as itemGroupController from '../../controllers/itemGroup.controller.js';
import { protect, authorize } from '../../middlewares/auth.middleware.js';

const router = express.Router();

router.use(protect);

router
    .route('/')
    .post(authorize('superadmin', 'admin'), validate(itemGroupValidation.createItemGroup), itemGroupController.createItemGroup)
    .get(validate(itemGroupValidation.getItemGroups), itemGroupController.getItemGroups);

router
    .route('/:id')
    .patch(authorize('superadmin', 'admin'), validate(itemGroupValidation.updateItemGroup), itemGroupController.updateItemGroup)
    .delete(authorize('superadmin', 'admin'), validate(itemGroupValidation.deleteItemGroup), itemGroupController.deleteItemGroup);

export default router;
