import express from 'express';
import * as isCtrl from '../../controllers/invoiceSeries.controller.js';
import { protect } from '../../middlewares/auth.middleware.js';

const router = express.Router();
router.use(protect);

router.route('/').get(isCtrl.getSeries).post(isCtrl.createSeries);
router.route('/:id').get(isCtrl.getSeriesById).put(isCtrl.updateSeries).delete(isCtrl.deleteSeries);

export default router;
