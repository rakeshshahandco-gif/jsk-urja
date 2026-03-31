import express from 'express';
import { protect, checkPermission } from '../../middlewares/auth.middleware.js';
import { calculateMRP, createPlanning, getPlannings, getPlanningById, updatePlanning, deletePlanning } from '../../controllers/productionPlanning.controller.js';

const router = express.Router();

router.use(protect);

router.route('/calculate')
    .post(checkPermission('production.production_planning.calculate'), calculateMRP);

router.route('/')
    .get(checkPermission('production.production_planning.view'), getPlannings)
    .post(checkPermission('production.production_planning.add'), createPlanning);

router.route('/:id')
    .get(checkPermission('production.production_planning.view'), getPlanningById)
    .patch(checkPermission('production.production_planning.edit'), updatePlanning)
    .delete(checkPermission('production.production_planning.delete'), deletePlanning);

export default router;
