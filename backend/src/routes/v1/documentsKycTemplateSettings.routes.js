import express from 'express';
import { protect } from '../../middlewares/auth.middleware.js';
import { requirePlatformAdmin } from '../../middlewares/platformAdmin.middleware.js';
import * as ctrl from '../../controllers/documentsKycTemplateSettings.controller.js';

const router = express.Router();

router.use(protect);

router.get('/effective', ctrl.getEffectiveDocumentsKycSettings);
router.get('/registry', ctrl.getDocumentsKycRegistry);

router.use(requirePlatformAdmin);
router.get('/preview', ctrl.previewDocumentsKycSettings);
router.patch('/templates/:id/document-rules', ctrl.updateTemplateDocumentsKycSettings);
router.get('/company-overrides/:companyId', ctrl.getCompanyDocumentsKycOverride);
router.put('/company-overrides/:companyId', ctrl.upsertCompanyDocumentsKycOverride);

export default router;
