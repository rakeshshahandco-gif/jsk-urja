import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { ApiError } from '../utils/ApiError.js';

const maxMb = Number(process.env.SMART_IMPORT_MAX_FILE_MB) || 15;
const uploadDir = 'uploads/smart-import/';

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        const ext = path.extname(file.originalname || '') || '.xlsx';
        cb(null, 'import-' + uniqueSuffix + ext);
    },
});

const fileFilter = (req, file, cb) => {
    const ext = (file.originalname || '').toLowerCase();
    const ok = /\.(xlsx|xls|csv|json)$/i.test(ext)
        || ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', 'text/csv', 'application/json'].includes(file.mimetype);
    if (ok) cb(null, true);
    else cb(new ApiError(400, 'Only Excel, CSV, or JSON files are allowed for Smart Import.'));
};

export const smartImportUpload = multer({
    storage,
    fileFilter,
    limits: { fileSize: maxMb * 1024 * 1024 },
});
