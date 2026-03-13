import express from 'express';
import { protect, authorize } from '../../middlewares/auth.middleware.js';
import * as whatsappSettingsController from '../../controllers/whatsappSettings.controller.js';

const router = express.Router();

router.use(protect);

router.get('/', authorize('admin'), whatsappSettingsController.getSettings);
router.post('/', authorize('admin'), whatsappSettingsController.updateSettings);

export default router;
