import express from 'express';
import { protect, checkPermission } from '../../middlewares/auth.middleware.js';
import { createFY, getFYs, getFYById, updateFY, deleteFY, getCurrentFY, setCurrentFY } from '../../controllers/fy.controller.js';

const router = express.Router();

router.route('/current')
    .get(protect, getCurrentFY);

router.route('/')
    .get(protect, getFYs)
    .post(protect, checkPermission('admin.financial_year.manage'), createFY);

router.route('/:id')
    .get(protect, getFYById)
    .patch(protect, checkPermission('admin.financial_year.manage'), updateFY)
    .delete(protect, checkPermission('admin.financial_year.manage'), deleteFY);

router.route('/:id/current')
    .post(protect, checkPermission('admin.financial_year.manage'), setCurrentFY);

export default router;
