import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { ApiError } from '../utils/ApiError.js';

const maxMb = Number(process.env.SCAN_ENTRY_MAX_FILE_MB) || 15;
const uploadDir = 'uploads/scan-entry/';
const allowedMimes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        const ext = path.extname(file.originalname || '') || '.bin';
        cb(null, 'scan-' + uniqueSuffix + ext);
    },
});

const fileFilter = (req, file, cb) => {
    const ext = (file.originalname || '').toLowerCase();
    const okMime = allowedMimes.includes(file.mimetype);
    const okExt = /\.(pdf|jpe?g|png|webp)$/i.test(ext);
    if (okMime || okExt) cb(null, true);
    else cb(new ApiError(400, 'Only PDF, JPG, PNG, or WEBP files are allowed for Scan Entry.'));
};

export const scanEntryUpload = multer({
    storage,
    limits: { fileSize: maxMb * 1024 * 1024 },
    fileFilter,
});

export const SCAN_ENTRY_UPLOAD_DIR = uploadDir;

