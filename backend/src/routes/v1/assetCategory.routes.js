import express from 'express';
import * as categoryController from '../../controllers/assetCategory.controller.js';
import { protect } from '../../middlewares/auth.middleware.js';

const router = express.Router();
router.use(protect);

router.route('/')
    .get(categoryController.getCategories)
    .post(categoryController.createCategory);

router.route('/:id')
    .put(categoryController.updateCategory)
    .delete(categoryController.deleteCategory);

export default router;
