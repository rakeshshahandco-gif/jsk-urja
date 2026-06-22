import express from 'express';
import { protect, checkPermission } from '../../middlewares/auth.middleware.js';
import { requireCompanyFeature } from '../../middlewares/featureAccess.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { emailBulkUpload, emailBulkAttachmentUpload } from '../../middlewares/emailBulkUpload.middleware.js';
import emailBulkValidation from '../../validations/emailBulk.validation.js';
import * as emailBulkController from '../../controllers/emailBulk.controller.js';

const router = express.Router();
router.use(protect);
router.use(requireCompanyFeature('communication.enableEmailBulk'));

const eb = (sub, action) => checkPermission(`email_bulk.${sub}.${action}`);

router.get('/meta', eb('campaigns', 'view'), emailBulkController.getMeta);

router.get('/settings', eb('settings', 'view'), emailBulkController.getSettings);
router.put('/settings', eb('settings', 'edit'), validate(emailBulkValidation.settings), emailBulkController.saveSettings);

router.get('/templates', eb('templates', 'view'), emailBulkController.listTemplates);
router.post('/templates', eb('templates', 'add'), validate(emailBulkValidation.template), emailBulkController.createTemplate);
router.put('/templates/:id', eb('templates', 'edit'), validate(emailBulkValidation.template), emailBulkController.updateTemplate);
router.delete('/templates/:id', eb('templates', 'delete'), emailBulkController.deleteTemplate);
router.post('/templates/upload', eb('templates', 'edit'), emailBulkAttachmentUpload.single('file'), emailBulkController.uploadAttachment);

router.get('/blacklist', eb('blacklist', 'view'), emailBulkController.listBlacklist);
router.post('/blacklist', eb('blacklist', 'add'), validate(emailBulkValidation.blacklist), emailBulkController.addBlacklist);
router.delete('/blacklist/:id', eb('blacklist', 'delete'), emailBulkController.removeBlacklist);

router.get('/campaigns', eb('campaigns', 'view'), validate(emailBulkValidation.listCampaigns), emailBulkController.listCampaigns);
router.get('/campaigns/export', eb('campaigns', 'export'), emailBulkController.exportHistory);
router.get('/campaigns/:id', eb('campaigns', 'view'), emailBulkController.getCampaign);
router.post('/campaigns', eb('campaigns', 'add'), validate(emailBulkValidation.createCampaign), emailBulkController.createCampaign);
router.put('/campaigns/:id', eb('campaigns', 'edit'), validate(emailBulkValidation.updateCampaign), emailBulkController.updateCampaign);
router.delete('/campaigns/:id', eb('campaigns', 'delete'), emailBulkController.deleteCampaign);
router.post('/campaigns/preview', eb('campaigns', 'view'), validate(emailBulkValidation.preview), emailBulkController.previewRecipients);
router.post('/campaigns/upload', eb('campaigns', 'add'), emailBulkUpload.single('file'), emailBulkController.uploadFile);
router.post('/campaigns/attachment-upload', eb('campaigns', 'add'), emailBulkAttachmentUpload.single('file'), emailBulkController.uploadAttachment);
router.post('/campaigns/:id/recipients', eb('campaigns', 'edit'), emailBulkController.saveRecipients);
router.get('/campaigns/:id/recipients', eb('campaigns', 'view'), emailBulkController.listRecipients);
router.post('/campaigns/:id/test-send', eb('campaigns', 'send'), validate(emailBulkValidation.testSend), emailBulkController.testSend);
router.post('/campaigns/:id/schedule', eb('campaigns', 'send'), emailBulkController.scheduleCampaign);
router.post('/campaigns/:id/pause', eb('campaigns', 'send'), emailBulkController.pauseCampaign);
router.post('/campaigns/:id/resume', eb('campaigns', 'send'), emailBulkController.resumeCampaign);
router.post('/campaigns/:id/stop', eb('campaigns', 'send'), emailBulkController.stopCampaign);
router.post('/campaigns/:id/retry-failed', eb('campaigns', 'send'), emailBulkController.retryFailed);

router.get('/audit-logs', eb('campaigns', 'view'), emailBulkController.listAuditLogs);

export default router;
