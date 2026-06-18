import express from 'express';
import { protect } from '../../middlewares/auth.middleware.js';
import * as importCenterController from '../../controllers/importCenter.controller.js';
import { requireImportCenter } from '../../middlewares/importCenter.middleware.js';
import { checkImportPermission } from '../../middlewares/aiSmartImport.middleware.js';

const router = express.Router();
router.use(protect);
const ic = (action) => [requireImportCenter, checkImportPermission(action)];

router.get('/history', ...ic('view'), importCenterController.getHistory);
router.get('/history/:id/errors', ...ic('view'), importCenterController.downloadHistoryErrors);
router.get('/learning', ...ic('view'), importCenterController.getLearning);
router.post('/learning', ...ic('review'), importCenterController.saveLearning);

export default router;
