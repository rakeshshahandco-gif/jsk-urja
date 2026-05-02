import express from 'express';
import distributorController from '../../controllers/distributor.controller.js';
import { protect, authorize } from '../../middlewares/auth.middleware.js';

const router = express.Router();

router
    .route('/')
    .post(protect, distributorController.createDistributor)
    .get(protect, distributorController.getDistributors);

router
    .route('/:distributorId')
    .get(protect, distributorController.getDistributor)
    .patch(protect, distributorController.updateDistributor)
    .delete(protect, distributorController.deleteDistributor);

export default router;
