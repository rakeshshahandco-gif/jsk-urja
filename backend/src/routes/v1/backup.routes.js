import express from 'express';
import multer from 'multer';
import * as backupCtrl from '../../controllers/backup.controller.js';
import { protect, authorize } from '../../middlewares/auth.middleware.js';

const router = express.Router();

// Configure multer for backup ZIP uploads
const storage = multer.memoryStorage();
const upload = multer({
    storage,
    limits: {
        fileSize: 50 * 1024 * 1024, // 50MB limit for backups
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/zip' || file.mimetype === 'application/x-zip-compressed' || file.originalname.endsWith('.zip')) {
            cb(null, true);
        } else {
            cb(new Error('Only ZIP files are allowed'));
        }
    },
});

// All backup routes are admin/superadmin only
router.use(protect);
router.use(authorize('admin', 'superadmin'));

router.get('/', backupCtrl.getBackups);
router.post('/trigger', backupCtrl.triggerBackup);
router.get('/download/:id', backupCtrl.downloadBackup);
router.post('/restore/:id', backupCtrl.restoreFromBackup);
router.post('/upload', upload.single('file'), backupCtrl.uploadBackup);

export default router;
