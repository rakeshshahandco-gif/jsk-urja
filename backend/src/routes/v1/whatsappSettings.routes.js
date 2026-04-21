import express from 'express';
import { protect } from '../../middlewares/auth.middleware.js';
import * as whatsappSettingsController from '../../controllers/whatsappSettings.controller.js';

const router = express.Router();

router.use(protect);

// Settings CRUD
router.get('/', whatsappSettingsController.getSettings);
router.post('/', whatsappSettingsController.updateSettings);

// Session / Connection
router.get('/status', whatsappSettingsController.getSessionStatus);
router.get('/session-status', whatsappSettingsController.getSessionStatus); // backward compat
router.post('/connect', whatsappSettingsController.connectWhatsApp);
router.post('/disconnect', whatsappSettingsController.disconnectWhatsApp);

// Messaging
router.get('/groups', whatsappSettingsController.getGroups);
router.post('/send-message', whatsappSettingsController.sendMessage);
router.post('/send-document', whatsappSettingsController.sendDocument);

export default router;
