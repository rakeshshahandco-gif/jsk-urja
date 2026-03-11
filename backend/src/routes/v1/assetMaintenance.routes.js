import express from 'express';
import * as maintenanceController from '../../controllers/assetMaintenance.controller.js';
import { protect } from '../../middlewares/auth.middleware.js';

const router = express.Router();
router.use(protect);

router.post('/', maintenanceController.createMaintenance);
router.get('/asset/:assetId', maintenanceController.getMaintenanceHistory);

export default router;
