import express from 'express';
import { protect } from '../../middlewares/auth.middleware.js';
import * as whatsappSettingsController from '../../controllers/whatsappSettings.controller.js';

const router = express.Router();

router.use(protect);

router.get('/', whatsappSettingsController.getSettings);
router.post('/', whatsappSettingsController.updateSettings);
router.get('/session-status', whatsappSettingsController.getSessionStatus);
router.post('/connect', whatsappSettingsController.connectWhatsApp);
router.post('/disconnect', whatsappSettingsController.disconnectWhatsApp);
router.get('/groups', whatsappSettingsController.getGroups);
router.post('/send-message', whatsappSettingsController.sendMessage);

export default router;
