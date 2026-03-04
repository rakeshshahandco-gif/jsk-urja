import express from 'express';
import * as psCtrl from '../../controllers/productionSheet.controller.js';
import { protect } from '../../middlewares/auth.middleware.js';

const router = express.Router();
router.use(protect);

router.route('/').get(psCtrl.getPSList);
router.route('/:id').get(psCtrl.getPSById).put(psCtrl.updatePS);
router.get('/by-so/:soId', psCtrl.getPSBySOId);

export default router;
