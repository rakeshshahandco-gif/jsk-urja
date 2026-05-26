import express from 'express';
import { protect } from '../../middlewares/auth.middleware.js';
import {
    getDashboard,
    getAccessLogs,
    requireDirectorMisAccess,
} from '../../controllers/directorMis.controller.js';

const router = express.Router();

router.use(protect);
router.use(requireDirectorMisAccess);

router.get('/dashboard', getDashboard);
router.get('/access-logs', getAccessLogs);

export default router;
