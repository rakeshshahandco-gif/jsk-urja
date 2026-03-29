import express from 'express';
import * as poController from '../../controllers/purchaseOrder.controller.js';
import { protect } from '../../middlewares/auth.middleware.js';

const router = express.Router();
router.use(protect);

router.route('/').get(poController.getPOs).post(poController.createPO);
router.route('/:id')
    .get(poController.getPOById)
    .put(poController.updatePO)
    .delete(poController.deletePO);
router.post('/:id/restore', poController.restorePO);
router.patch('/:id/status', poController.updatePOStatus);

export default router;
