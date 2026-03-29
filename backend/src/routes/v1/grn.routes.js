import express from 'express';
import * as grnController from '../../controllers/grn.controller.js';
import { protect } from '../../middlewares/auth.middleware.js';

const router = express.Router();
router.use(protect);

router.route('/').get(grnController.getGRNs).post(grnController.createGRN);
router.get('/by-supplier/:supplierId', grnController.getGRNsBySupplier);
router.get('/by-po/:poId', grnController.getGRNsByPO);
router.route('/:id')
    .get(grnController.getGRNById)
    .put(grnController.updateGRN)
    .delete(grnController.deleteGRN);

router.post('/:id/restore', grnController.restoreGRN);

export default router;
