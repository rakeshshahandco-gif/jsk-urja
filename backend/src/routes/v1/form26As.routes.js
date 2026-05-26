import express from 'express';
import { protect } from '../../middlewares/auth.middleware.js';
import * as ctrl from '../../controllers/form26As.controller.js';

const router = express.Router();
router.use(protect);

router.get('/', ctrl.getImports);
router.post('/import', ctrl.importData);
router.get('/summary', ctrl.getReconciliationSummary);
router.get('/:id', ctrl.getLines);
router.post('/:id/reconcile', ctrl.reconcile);
router.post('/:id/manual-link', ctrl.manualLink);

export default router;
