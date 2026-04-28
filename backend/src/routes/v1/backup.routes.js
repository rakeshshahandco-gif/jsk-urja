import express from 'express';
import * as backupCtrl from '../../controllers/backup.controller.js';
import { protect, authorize } from '../../middlewares/auth.middleware.js';

const router = express.Router();

// All backup routes are admin/superadmin only
router.use(protect);
router.use(authorize('admin', 'superadmin'));

router.get('/', backupCtrl.getBackups);
router.post('/trigger', backupCtrl.triggerBackup);
router.get('/download/:id', backupCtrl.downloadBackup);
router.post('/restore/:id', backupCtrl.restoreFromBackup);

export default router;
