import express from 'express';
import { checkPermission } from '../../middlewares/auth.middleware.js';
import { checkUserPermission } from '../../utils/permissionUtils.js';
import { ApiError } from '../../utils/ApiError.js';
import * as extractorOpsController from '../../controllers/extractorOps.controller.js';

function checkAnyPermission(...keys) {
    return (req, res, next) => {
        if (keys.some((k) => checkUserPermission(req.user, k))) return next();
        throw new ApiError(403, `Permission denied: ${keys[0]} required`);
    };
}

const router = express.Router();

router.get('/ops/dashboard', checkAnyPermission('data_extractor.analytics.view', 'data_extractor.extractor.view'), extractorOpsController.dashboard);
router.get('/ops/campaigns', checkAnyPermission('data_extractor.analytics.view', 'data_extractor.extractor.view'), extractorOpsController.campaigns);
router.get('/ops/source-health', checkAnyPermission('data_extractor.analytics.view', 'data_extractor.extractor.view', 'data_extractor.assisted_capture.view'), extractorOpsController.sourceHealth);

router.post('/ops/consolidate', checkAnyPermission('data_extractor.discovery.run', 'data_extractor.extractor.search'), extractorOpsController.consolidate);
router.get('/ops/companies', checkAnyPermission('data_extractor.company_intelligence.view', 'data_extractor.extractor.view', 'data_extractor.discovery.view'), extractorOpsController.listCompanies);
router.get('/ops/companies/export', checkAnyPermission('data_extractor.extractor.export', 'data_extractor.discovery.view', 'data_extractor.analytics.export'), extractorOpsController.exportCompanies);
router.get('/ops/companies/:id', checkAnyPermission('data_extractor.company_intelligence.view', 'data_extractor.extractor.view'), extractorOpsController.getCompany);
router.post('/ops/companies/:id/reevaluate', checkAnyPermission('data_extractor.discovery.run', 'data_extractor.extractor.search'), extractorOpsController.reevaluate);
router.post('/ops/companies/merge', checkAnyPermission('data_extractor.discovery.approve', 'data_extractor.extractor.search'), extractorOpsController.mergeCompanies);
router.post('/ops/companies/:id/unmerge', checkAnyPermission('data_extractor.discovery.approve', 'data_extractor.extractor.search'), extractorOpsController.unmergeCompany);
router.post('/ops/companies/keep-separate', checkAnyPermission('data_extractor.discovery.approve', 'data_extractor.extractor.search'), extractorOpsController.keepSeparate);
router.post('/ops/companies/:id/remove-source', checkAnyPermission('data_extractor.discovery.approve', 'data_extractor.extractor.search'), extractorOpsController.removeSource);

router.get('/ops/saved-searches', checkAnyPermission('data_extractor.extractor.search', 'data_extractor.extractor.view'), extractorOpsController.savedList);
router.post('/ops/saved-searches', checkAnyPermission('data_extractor.extractor.search', 'data_extractor.discovery.create'), extractorOpsController.savedCreate);
router.put('/ops/saved-searches/:id', checkAnyPermission('data_extractor.extractor.search', 'data_extractor.discovery.create'), extractorOpsController.savedUpdate);
router.post('/ops/saved-searches/:id/archive', checkPermission('data_extractor.extractor.settings'), extractorOpsController.savedArchive);
router.post('/ops/saved-searches/:id/run', checkAnyPermission('data_extractor.extractor.search', 'data_extractor.discovery.run'), extractorOpsController.savedRun);

router.post('/ops/bulk-convert/preview', checkAnyPermission('data_extractor.extractor.convert_lead', 'data_extractor.discovery.convert_lead'), extractorOpsController.bulkPreview);
router.post('/ops/bulk-convert', checkAnyPermission('data_extractor.extractor.convert_lead', 'data_extractor.discovery.convert_lead'), extractorOpsController.bulkConvert);

router.get('/ops/test-data/preview', checkPermission('data_extractor.extractor.settings'), extractorOpsController.testCleanupPreview);
router.post('/ops/test-data/cleanup', checkPermission('data_extractor.extractor.settings'), extractorOpsController.testCleanup);

export default router;
