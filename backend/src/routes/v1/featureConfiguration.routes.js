import express from 'express';
import { protect } from '../../middlewares/auth.middleware.js';
import { requirePlatformAdmin } from '../../middlewares/platformAdmin.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import featureConfigurationValidation from '../../validations/featureConfiguration.validation.js';
import * as featureConfigurationController from '../../controllers/featureConfiguration.controller.js';

const router = express.Router();
router.use(protect);

router.get('/registry', requirePlatformAdmin, featureConfigurationController.getRegistry);
router.get('/check/:featureKey', requirePlatformAdmin, featureConfigurationController.checkFeature);
router.get('/', requirePlatformAdmin, featureConfigurationController.getConfiguration);
router.put('/', requirePlatformAdmin, validate(featureConfigurationValidation.saveConfiguration), featureConfigurationController.saveConfiguration);

export default router;
