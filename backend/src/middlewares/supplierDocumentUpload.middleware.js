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

export const SUPPLIER_DOCUMENT_UPLOAD_DIR = 'uploads/supplier-documents/';

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        if (!fs.existsSync(SUPPLIER_DOCUMENT_UPLOAD_DIR)) {
            fs.mkdirSync(SUPPLIER_DOCUMENT_UPLOAD_DIR, { recursive: true });
        }
        cb(null, SUPPLIER_DOCUMENT_UPLOAD_DIR);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        const ext = path.extname(file.originalname || '') || '.bin';
        cb(null, 'supp-doc-' + uniqueSuffix + ext);
    },
});

const fileFilter = (req, file, cb) => {
    const ext = (file.originalname || '').toLowerCase();
    const okMime = allowedMimes.includes(file.mimetype);
    const okExt = /\.(pdf|jpe?g|png|webp)$/i.test(ext);
    if (okMime || okExt) cb(null, true);
    else cb(new ApiError(400, 'Only PDF, JPG, PNG, or WEBP files are allowed.'));
};

export const supplierDocumentUpload = multer({
    storage,
    limits: { fileSize: 20 * 1024 * 1024 },
    fileFilter,
});
