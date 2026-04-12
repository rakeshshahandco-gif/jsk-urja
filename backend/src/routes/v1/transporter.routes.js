import express from 'express';
import * as transporterController from '../../controllers/transporter.controller.js';
import { protect, checkPermission } from '../../middlewares/auth.middleware.js';

const router = express.Router();

router.use(protect);

router
    .route('/')
    .post(checkPermission('purchase'), transporterController.createTransporter) // Reuse purchase permission or create new
    .get(transporterController.getTransporters);

router
    .route('/:id')
    .get(transporterController.getTransporterById)
    .patch(checkPermission('purchase'), transporterController.updateTransporter)
    .delete(checkPermission('purchase'), transporterController.deleteTransporter);

export default router;
