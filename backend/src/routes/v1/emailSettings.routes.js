import express from 'express';
import { protect, checkPermission } from '../../middlewares/auth.middleware.js';
import { requireCompanyFeature } from '../../middlewares/featureAccess.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import emailSettingsValidation from '../../validations/emailSettings.validation.js';
import * as emailSettingsController from '../../controllers/emailSettings.controller.js';

const router = express.Router();
router.use(protect);
router.use(requireCompanyFeature('communication.enableEmail'));

const em = (sub, action) => checkPermission(`email.${sub}.${action}`);

router.get('/providers', em('settings', 'view'), emailSettingsController.getProviders);
router.get('/', em('settings', 'view'), emailSettingsController.getSettings);
router.put('/', em('settings', 'edit'), validate(emailSettingsValidation.settings), emailSettingsController.saveSettings);
router.post('/test', em('settings', 'test'), validate(emailSettingsValidation.testConnection), emailSettingsController.testConnection);

export default router;
