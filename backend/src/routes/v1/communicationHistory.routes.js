import express from 'express';
import { protect, checkPermission } from '../../middlewares/auth.middleware.js';
import { requireCompanyFeature } from '../../middlewares/featureAccess.middleware.js';
import * as communicationHistoryController from '../../controllers/communicationHistory.controller.js';

const router = express.Router();
router.use(protect);
router.use(requireCompanyFeature('communication.enableEmail'));

const ch = (action) => checkPermission(`email.communication_history.${action}`);

router.get('/', ch('view'), communicationHistoryController.listHistory);
router.get('/:id', ch('view'), communicationHistoryController.getHistoryEntry);

export default router;
