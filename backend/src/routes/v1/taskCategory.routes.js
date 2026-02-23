import express from 'express';
import { validate } from '../../middlewares/validate.middleware.js';
import { protect } from '../../middlewares/auth.middleware.js';
import taskValidation from '../../validations/task.validation.js';
import * as taskCategoryController from '../../controllers/taskCategory.controller.js';

const router = express.Router();

router
    .route('/')
    .post(protect, validate(taskValidation.createCategory), taskCategoryController.createCategory)
    .get(protect, validate(taskValidation.getCategories), taskCategoryController.getCategories);

router
    .route('/:categoryId')
    .get(protect, taskCategoryController.getCategory)
    .patch(protect, validate(taskValidation.createCategory), taskCategoryController.updateCategory) // Reusing createCategory schema for simplicity
    .delete(protect, taskCategoryController.deleteCategory);

export default router;
