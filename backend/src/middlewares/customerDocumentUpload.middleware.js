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

export const CUSTOMER_DOCUMENT_UPLOAD_DIR = 'uploads/customer-documents/';

function useS3Provider() {
    return String(process.env.FILE_STORAGE_PROVIDER || 'local').trim().toLowerCase() === 's3';
}

const diskStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        if (!fs.existsSync(CUSTOMER_DOCUMENT_UPLOAD_DIR)) {
            fs.mkdirSync(CUSTOMER_DOCUMENT_UPLOAD_DIR, { recursive: true });
        }
        cb(null, CUSTOMER_DOCUMENT_UPLOAD_DIR);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        const ext = path.extname(file.originalname || '') || '.bin';
        cb(null, 'cust-doc-' + uniqueSuffix + ext);
    },
});

const fileFilter = (req, file, cb) => {
    const ext = (file.originalname || '').toLowerCase();
    const okMime = allowedMimes.includes(file.mimetype);
    const okExt = /\.(pdf|jpe?g|png|webp)$/i.test(ext);
    if (okMime || okExt) cb(null, true);
    else cb(new ApiError(400, 'Only PDF, JPG, PNG, or WEBP files are allowed.'));
};

/** Memory for S3 (binary never persisted locally); disk for local provider. */
export const customerDocumentUpload = multer({
    storage: useS3Provider() ? multer.memoryStorage() : diskStorage,
    limits: { fileSize: 20 * 1024 * 1024 },
    fileFilter,
});
