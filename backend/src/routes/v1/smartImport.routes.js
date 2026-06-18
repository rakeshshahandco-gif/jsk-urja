import express from 'express';
import { protect } from '../../middlewares/auth.middleware.js';
import { requireAiSmartImport, checkImportPermission } from '../../middlewares/aiSmartImport.middleware.js';
import { smartImportUpload } from '../../middlewares/smartImportUpload.middleware.js';
import * as smartImportController from '../../controllers/smartImport.controller.js';

const router = express.Router();

router.use(protect);
router.use(requireAiSmartImport);

router.post('/upload', checkImportPermission('upload'), smartImportUpload.single('file'), smartImportController.uploadImport);
router.get('/batches', checkImportPermission('view'), smartImportController.listBatches);
router.get('/batches/:batchId', checkImportPermission('view'), smartImportController.getBatch);
router.post('/batches/:batchId/approve', checkImportPermission('approve_post'), smartImportController.approveBatch);

export default router;
