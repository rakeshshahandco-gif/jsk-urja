import express from 'express';
import { protect } from '../../middlewares/auth.middleware.js';
import { requirePlatformAdmin } from '../../middlewares/platformAdmin.middleware.js';
import * as industryTemplateController from '../../controllers/industryTemplate.controller.js';

const router = express.Router();

router.use(protect);
router.use(requirePlatformAdmin);

router.get('/', industryTemplateController.listTemplates);
router.get('/default', industryTemplateController.getDefaultTemplate);
router.get('/resolve/company/:companyId', industryTemplateController.resolveForCompany);
router.get('/:id', industryTemplateController.getTemplate);
router.post('/', industryTemplateController.createTemplate);
router.put('/:id', industryTemplateController.updateTemplate);
router.patch('/:id', industryTemplateController.updateTemplate);
router.patch('/:id/toggle-active', industryTemplateController.toggleTemplateActive);

export default router;
