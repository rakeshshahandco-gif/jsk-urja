import express from 'express';
import { protect, checkPermission } from '../../middlewares/auth.middleware.js';
import { extractorUpload } from '../../middlewares/extractorUpload.middleware.js';
import * as extractorController from '../../controllers/extractor.controller.js';

const publicRouter = express.Router();
publicRouter.all('/webhooks/justdial/:token', extractorController.justdialWebhook);

const router = express.Router();

router.use(protect);

router.get('/settings', checkPermission('data_extractor.extractor.view'), extractorController.getSettings);
router.get('/provider-status', checkPermission('data_extractor.extractor.view'), extractorController.getProviderStatusHandler);
router.post('/provider/test', checkPermission('data_extractor.extractor.search'), extractorController.testWebSearchProvider);
router.put('/settings', checkPermission('data_extractor.extractor.settings'), extractorController.putSettings);

router.post(
    '/jobs/manual-url',
    checkPermission('data_extractor.extractor.search'),
    extractorController.createManualUrlJob,
);

router.post(
    '/jobs/keyword-search',
    checkPermission('data_extractor.extractor.search'),
    extractorController.createKeywordSearchJob,
);

router.get('/jobs', checkPermission('data_extractor.extractor.view'), extractorController.listJobs);
router.get('/jobs/:id', checkPermission('data_extractor.extractor.view'), extractorController.getJob);
router.post(
    '/jobs/:id/save-drafts',
    checkPermission('data_extractor.extractor.search'),
    extractorController.saveDrafts,
);
router.post(
    '/jobs/:id/rerun',
    checkPermission('data_extractor.extractor.search'),
    extractorController.rerunJob,
);
router.post(
    '/jobs/:id/enhance-ai',
    checkPermission('data_extractor.extractor.search'),
    extractorController.enhanceJobAi,
);

router.get('/sources', checkPermission('data_extractor.extractor.view'), extractorController.listSources);
router.get('/adapters', checkPermission('data_extractor.extractor.view'), extractorController.listSources);
router.post('/adapters/:adapterId/test', checkPermission('data_extractor.extractor.search'), extractorController.testAdapter);

router.post(
    '/import/excel',
    checkPermission('data_extractor.extractor.import'),
    extractorUpload.single('file'),
    extractorController.uploadExcelImport,
);

router.get('/records', checkPermission('data_extractor.extractor.view'), extractorController.listRecords);
router.get('/records/export', checkPermission('data_extractor.extractor.export'), extractorController.exportExtractedRecords);
router.post('/records/bulk', checkPermission('data_extractor.extractor.approve'), extractorController.bulkRecordsAction);
router.get('/records/:id/duplicates', checkPermission('data_extractor.extractor.view'), extractorController.getRecordDuplicatesHandler);
router.post('/records/:id/followup', checkPermission('data_extractor.extractor.convert_lead'), extractorController.scheduleRecordFollowupHandler);
router.get('/records/:id', checkPermission('data_extractor.extractor.view'), extractorController.getRecord);
router.delete('/records/:id', checkPermission('data_extractor.extractor.delete'), extractorController.removeDraft);
router.post('/records/:id/approve', checkPermission('data_extractor.extractor.approve'), extractorController.approveExtractedRecord);
router.post('/records/:id/reject', checkPermission('data_extractor.extractor.approve'), extractorController.rejectExtractedRecord);
router.post('/records/:id/convert/lead', checkPermission('data_extractor.extractor.convert_lead'), extractorController.convertToLead);
router.post('/records/:id/convert/customer', checkPermission('data_extractor.extractor.convert_customer'), extractorController.convertToCustomer);
router.post('/records/:id/convert/supplier', checkPermission('data_extractor.extractor.convert_supplier'), extractorController.convertToSupplier);

export { publicRouter as dataExtractorPublicRoute };
export default router;
