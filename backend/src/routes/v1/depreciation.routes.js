import express from 'express';
import { protect, authorize } from '../../middlewares/auth.middleware.js';
import * as ctrl from '../../controllers/depreciation.controller.js';

const router = express.Router();
router.use(protect);

router.get('/preview', ctrl.preview);
router.post('/run', authorize('admin', 'superadmin'), ctrl.run);
router.get('/history', ctrl.getHistory);
router.get('/schedule', ctrl.getSchedule);

export default router;
