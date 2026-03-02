import express from 'express';
import * as woController from '../../controllers/workOrder.controller.js';
import { protect } from '../../middlewares/auth.middleware.js';

const router = express.Router();

router.use(protect);

// Dashboard stats
router.get('/dashboard-stats', woController.getDashboardStats);

// CRUD
router.route('/')
    .post(woController.createWorkOrder)
    .get(woController.getWorkOrders);

router.route('/:id')
    .get(woController.getWorkOrderById)
    .put(woController.updateWorkOrder)
    .delete(woController.deleteWorkOrder);

// WO actions
router.patch('/:id/release', woController.releaseWorkOrder);
router.patch('/:id/refresh-stock', woController.refreshMaterialStock);
router.patch('/:id/stages/:seq', woController.updateStage);
router.patch('/:id/material-status', woController.updateMaterialStatus);

// Production Logs
router.post('/:id/stages/:seq/production-logs', woController.addProductionLog);
router.delete('/:id/stages/:seq/production-logs/:logId', woController.deleteProductionLog);

export default router;
