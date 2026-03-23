import express from 'express';
import * as soCtrl from '../../controllers/salesOrder.controller.js';
import { protect } from '../../middlewares/auth.middleware.js';

const router = express.Router();
router.use(protect);

router.route('/').get(soCtrl.getSOs).post(soCtrl.createSO);
router.route('/:id').get(soCtrl.getSOById).put(soCtrl.updateSO).delete(soCtrl.deleteSO);
router.post('/:id/cancel', soCtrl.cancelSO);
router.post('/:id/generate-production-sheet', soCtrl.generateProductionSheet);

export default router;
