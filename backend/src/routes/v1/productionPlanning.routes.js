import express from 'express';
import { protect, checkPermission } from '../../middlewares/auth.middleware.js';
import {
    calculateMRP,
    calculateMultiMRP,
    exportShortage,
    convertToPO,
    createPlanning,
    getPlannings,
    getPlanningById,
    updatePlanning,
    deletePlanning
} from '../../controllers/productionPlanning.controller.js';

const router = express.Router();

router.use(protect);

// MRP Calculation
router.post('/calculate', checkPermission('production.production_planning.calculate'), calculateMRP);
router.post('/calculate-multi', checkPermission('production.production_planning.calculate'), calculateMultiMRP);
router.post('/export-shortage', checkPermission('production.production_planning.view'), exportShortage);

// CRUD
router.route('/')
    .get(checkPermission('production.production_planning.view'), getPlannings)
    .post(checkPermission('production.production_planning.add'), createPlanning);

router.route('/:id')
    .get(checkPermission('production.production_planning.view'), getPlanningById)
    .patch(checkPermission('production.production_planning.edit'), updatePlanning)
    .delete(checkPermission('production.production_planning.delete'), deletePlanning);

// Convert to PO
router.post('/:id/convert-to-po', checkPermission('production.production_planning.edit'), convertToPO);

export default router;
