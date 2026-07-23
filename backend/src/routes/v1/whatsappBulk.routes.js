import express from 'express';
import { protect, checkPermission } from '../../middlewares/auth.middleware.js';
import { requireCompanyFeature } from '../../middlewares/featureAccess.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { whatsappBulkUpload, whatsappBulkImageUpload } from '../../middlewares/whatsappBulkUpload.middleware.js';
import whatsappBulkValidation from '../../validations/whatsappBulk.validation.js';
import * as whatsappBulkController from '../../controllers/whatsappBulk.controller.js';

const router = express.Router();
router.use(protect);
router.use(requireCompanyFeature('communication.enableWhatsappBulk'));

const wb = (sub, action) => checkPermission(`whatsapp_bulk.${sub}.${action}`);

router.get('/meta', wb('campaigns', 'view'), whatsappBulkController.getMeta);

router.get('/settings', wb('settings', 'view'), whatsappBulkController.getSettings);
router.put('/settings', wb('settings', 'edit'), validate(whatsappBulkValidation.settings), whatsappBulkController.saveSettings);

router.get('/matters', wb('matter_master', 'view'), whatsappBulkController.listMatters);
router.post('/matters', wb('matter_master', 'add'), validate(whatsappBulkValidation.matter), whatsappBulkController.createMatter);
router.put('/matters/:id', wb('matter_master', 'edit'), validate(whatsappBulkValidation.matter), whatsappBulkController.updateMatter);
router.delete('/matters/:id', wb('matter_master', 'delete'), whatsappBulkController.deleteMatter);
router.post('/matters/upload', wb('matter_master', 'edit'), whatsappBulkImageUpload.single('file'), whatsappBulkController.uploadMatterAttachment);

router.get('/blacklist', wb('blacklist', 'view'), whatsappBulkController.listBlacklist);
router.post('/blacklist', wb('blacklist', 'add'), validate(whatsappBulkValidation.blacklist), whatsappBulkController.addBlacklist);
router.delete('/blacklist/:id', wb('blacklist', 'delete'), whatsappBulkController.removeBlacklist);

router.get('/campaigns', wb('campaigns', 'view'), validate(whatsappBulkValidation.listCampaigns), whatsappBulkController.listCampaigns);
router.get('/campaigns/export', wb('campaigns', 'export'), whatsappBulkController.exportHistory);
router.get('/campaigns/:id', wb('campaigns', 'view'), whatsappBulkController.getCampaign);
router.post('/campaigns', wb('campaigns', 'add'), validate(whatsappBulkValidation.createCampaign), whatsappBulkController.createCampaign);
router.put('/campaigns/:id', wb('campaigns', 'edit'), validate(whatsappBulkValidation.updateCampaign), whatsappBulkController.updateCampaign);
router.delete('/campaigns/:id', wb('campaigns', 'delete'), whatsappBulkController.deleteCampaign);
router.post('/campaigns/preview', wb('campaigns', 'view'), validate(whatsappBulkValidation.preview), whatsappBulkController.previewRecipients);
router.post('/campaigns/parse-numbers', wb('campaigns', 'add'), whatsappBulkUpload.single('file'), whatsappBulkController.parseNumbersUpload);
router.post('/campaigns/upload', wb('campaigns', 'add'), whatsappBulkUpload.single('file'), whatsappBulkController.uploadFile);
router.post('/campaigns/image-upload', wb('campaigns', 'add'), whatsappBulkImageUpload.single('file'), whatsappBulkController.uploadCampaignImage);
router.post('/campaigns/:id/recipients', wb('campaigns', 'edit'), whatsappBulkController.saveRecipients);
router.get('/campaigns/:id/recipients', wb('campaigns', 'view'), whatsappBulkController.listRecipients);
router.post('/campaigns/:id/test-send', wb('campaigns', 'send'), validate(whatsappBulkValidation.testSend), whatsappBulkController.testSend);
router.post('/campaigns/:id/schedule', wb('campaigns', 'send'), whatsappBulkController.scheduleCampaign);
router.post('/campaigns/:id/approve', wb('campaigns', 'send'), whatsappBulkController.approveCampaign);
router.post('/ai-assist', wb('campaigns', 'edit'), validate(whatsappBulkValidation.aiAssist), whatsappBulkController.aiAssist);
router.post('/campaigns/:id/pause', wb('campaigns', 'send'), whatsappBulkController.pauseCampaign);
router.post('/campaigns/:id/resume', wb('campaigns', 'send'), whatsappBulkController.resumeCampaign);
router.post('/campaigns/:id/stop', wb('campaigns', 'send'), whatsappBulkController.stopCampaign);
router.post('/campaigns/:id/retry-failed', wb('campaigns', 'send'), whatsappBulkController.retryFailed);
router.post('/campaigns/:id/revoke-sent', wb('campaigns', 'send'), whatsappBulkController.revokeSent);

router.get('/audit-logs', wb('campaigns', 'view'), whatsappBulkController.listAuditLogs);

export default router;
