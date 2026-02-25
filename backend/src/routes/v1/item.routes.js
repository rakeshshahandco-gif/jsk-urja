import express from 'express';
import { protect } from '../../middlewares/auth.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import itemValidation from '../../validations/item.validation.js';
import * as itemController from '../../controllers/item.controller.js';

const router = express.Router();

router.get('/generate-code', protect, itemController.generateCode);

router
    .route('/')
    .get(protect, validate(itemValidation.getItems), itemController.getItems)
    .post(protect, validate(itemValidation.createItem), itemController.createItem);

router
    .route('/:id')
    .get(protect, validate(itemValidation.getItem), itemController.getItem)
    .patch(protect, validate(itemValidation.updateItem), itemController.updateItem)
    .delete(protect, validate(itemValidation.deleteItem), itemController.deleteItem);

export default router;
