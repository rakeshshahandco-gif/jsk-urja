import multer from 'multer';
import { ApiError } from '../utils/ApiError.js';

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
    const ok =
        file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        file.mimetype === 'application/vnd.ms-excel' ||
        file.originalname?.toLowerCase().endsWith('.xlsx') ||
        file.originalname?.toLowerCase().endsWith('.xls');
    if (ok) cb(null, true);
    else cb(new ApiError(400, 'Only Excel (.xlsx / .xls) files are allowed'));
};

export const pettyCashImportUpload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter,
});
