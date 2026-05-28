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
        fileSize: 500 * 1024 * 1024, // 500MB — prod DB backups often exceed 50MB
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
router.post('/upload', (req, res, next) => {
    upload.single('file')(req, res, (err) => {
        if (err?.code === 'LIMIT_FILE_SIZE') {
            return next(new Error('Backup ZIP is too large (max 500MB). Download and copy the file into backend/backups/ instead.'));
        }
        next(err);
    });
}, backupCtrl.uploadBackup);

export default router;
