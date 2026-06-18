import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { ApiError } from '../utils/ApiError.js';

const allowedMimes = [
    'application/pdf',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
];

export const WORKFLOW_PRODUCTION_UPLOAD_DIR = 'uploads/workflow-production-lots/';

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        if (!fs.existsSync(WORKFLOW_PRODUCTION_UPLOAD_DIR)) {
            fs.mkdirSync(WORKFLOW_PRODUCTION_UPLOAD_DIR, { recursive: true });
        }
        cb(null, WORKFLOW_PRODUCTION_UPLOAD_DIR);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        const ext = path.extname(file.originalname || '') || '.bin';
        cb(null, 'wfp-' + uniqueSuffix + ext);
    },
});

const fileFilter = (req, file, cb) => {
    const ext = (file.originalname || '').toLowerCase();
    const okMime = allowedMimes.includes(file.mimetype);
    const okExt = /\.(pdf|jpe?g|png|webp)$/i.test(ext);
    if (okMime || okExt) cb(null, true);
    else cb(new ApiError(400, 'Only PDF, JPG, PNG, or WEBP files are allowed.'));
};

export const workflowProductionLotUpload = multer({
    storage,
    limits: { fileSize: 20 * 1024 * 1024 },
    fileFilter,
});
