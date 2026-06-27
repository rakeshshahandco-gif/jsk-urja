import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { ApiError } from '../utils/ApiError.js';

const maxMb = Number(process.env.EXTRACTOR_MAX_FILE_MB) || 10;
const uploadDir = 'uploads/data-extractor/';

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        const ext = path.extname(file.originalname || '') || '.xlsx';
        cb(null, 'extractor-' + uniqueSuffix + ext);
    },
});

const fileFilter = (req, file, cb) => {
    const ext = (file.originalname || '').toLowerCase();
    const ok = /\.(xlsx|xls|csv)$/i.test(ext)
        || ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', 'text/csv'].includes(file.mimetype);
    if (ok) cb(null, true);
    else cb(new ApiError(400, 'Only Excel (.xlsx, .xls) or CSV files are allowed.'));
};

export const extractorUpload = multer({
    storage,
    fileFilter,
    limits: { fileSize: maxMb * 1024 * 1024 },
});
